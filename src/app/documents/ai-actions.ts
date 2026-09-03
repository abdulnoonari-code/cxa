'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ask } from '@/lib/ai'
import { getActor, recordAudit } from '@/lib/audit'
import { getCurrentProject } from '@/lib/project'
import { extractDocument, formatOf } from '@/lib/doc-extract'
import {
  DOCUMENT_SYSTEM,
  documentPrompt,
  readDocumentReview,
  claimsApproval,
  tooLittleText,
} from '@/lib/document-review'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

const back = (q: string) => `/documents?${q}`

/**
 * Read an uploaded document and say whether it is usable as evidence.
 *
 * The text is pulled out of the file first, locally. Nothing is sent to a
 * model until there is something worth sending — a scanned page with no text
 * layer yields nothing, and asking "what is this document" with nothing but a
 * file name attached invites exactly the guess the system prompt forbids.
 *
 * That refusal is also a finding worth recording on its own: a scan nothing
 * can read is a scan nothing downstream can search, check, or cite.
 */
export async function assessAttachment(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

  const project = await getCurrentProject()
  if (!project) redirect(back('assess=noproject'))

  const { data } = await supabase
    .from('attachments')
    .select('id, file_name, file_path, file_url, checklist_item_id, review_status')
    .eq('id', id)
    .single()

  const row = data as {
    id: string
    file_name: string | null
    file_path: string | null
    file_url: string | null
    checklist_item_id: string | null
    review_status: string | null
  } | null

  if (!row) redirect(back('assess=gone'))

  const fileName = row.file_name ?? 'the file'

  // What it is filed against, in the words the model should see. A tag is the
  // whole point of the mismatch check — without it there is nothing to
  // compare the document against.
  let filedAgainst = 'a checklist item'
  if (row.checklist_item_id) {
    const { data: item } = await supabase
      .from('checklist_items')
      .select('item, equipment_id')
      .eq('id', row.checklist_item_id)
      .single()
    const check = item as { item: string; equipment_id: string | null } | null
    if (check) {
      let tag = ''
      if (check.equipment_id) {
        const { data: eq } = await supabase
          .from('equipment')
          .select('tag_id')
          .eq('id', check.equipment_id)
          .single()
        tag = (eq as { tag_id: string } | null)?.tag_id ?? ''
      }
      filedAgainst = tag ? `${tag} — "${check.item}"` : `the check "${check.item}"`
    }
  }

  // A format this application cannot read at all is worth saying so about
  // rather than spending a call on.
  if (!formatOf(fileName)) {
    await supabase
      .from('attachments')
      .update({
        ai_reviewed_at: new Date().toISOString(),
        ai_confidence: 'cannot_tell',
        ai_appears_to_be: '',
        ai_matches_filing: 'cannot_tell',
        ai_problem: `This application cannot read inside a ${fileName.split('.').pop() ?? 'file'} file, so nothing can be assessed. The file is still attached and still downloadable.`,
        ai_recommendation: 'Attach a PDF or Word version if this needs to be checkable.',
        ai_values: null,
        ai_raw: null,
      })
      .eq('id', id)
    revalidatePath('/documents')
    redirect(back('assess=unsupported'))
  }

  // Fetch the bytes. Storage path first, the same reasoning as photographs:
  // it works whether the bucket is public or private.
  let bytes: ArrayBuffer | null = null
  if (row.file_path) {
    const { data: blob } = await supabase.storage.from('documents').download(row.file_path)
    if (blob) bytes = await blob.arrayBuffer()
  }
  if (!bytes && row.file_url) {
    try {
      const res = await fetch(row.file_url, { cache: 'no-store' })
      if (res.ok) bytes = await res.arrayBuffer()
    } catch {
      bytes = null
    }
  }
  if (!bytes) redirect(back('assess=nofile'))

  const extraction = await extractDocument(bytes, fileName)
  const thin = tooLittleText(extraction.text)

  if (thin) {
    await supabase
      .from('attachments')
      .update({
        ai_reviewed_at: new Date().toISOString(),
        ai_confidence: 'cannot_tell',
        ai_appears_to_be: '',
        ai_matches_filing: 'cannot_tell',
        ai_problem: thin,
        ai_recommendation:
          'If this is the only copy, it is worth knowing that it cannot be searched or checked by anything — including by whoever receives the handover pack.',
        ai_values: null,
        ai_raw: null,
      })
      .eq('id', id)

    await recordAudit({
      projectId: project.id,
      action: 'document unreadable',
      entity: 'attachment',
      entityId: id,
      entityLabel: fileName,
      comment: 'No text layer — almost certainly a scan. Not sent to a model.',
    })

    revalidatePath('/documents')
    redirect(back('assess=noText'))
  }

  const outcome = await ask({
    system: DOCUMENT_SYSTEM,
    prompt: documentPrompt({
      fileName,
      filedAgainst,
      filedAs: row.review_status,
      text: extraction.text,
    }),
    maxTokens: 1400,
  })

  if (!outcome.ok) {
    await recordAudit({
      projectId: project.id,
      action: 'document assessment failed',
      entity: 'attachment',
      entityId: id,
      entityLabel: fileName,
      comment: `${outcome.reason}${outcome.hint ? ` — ${outcome.hint}` : ''}`,
    })
    redirect(back(`assess=failed&reason=${encodeURIComponent(outcome.reason.slice(0, 200))}`))
  }

  const reading = readDocumentReview(outcome.value)
  if (!reading) {
    await recordAudit({
      projectId: project.id,
      action: 'document assessment unreadable',
      entity: 'attachment',
      entityId: id,
      entityLabel: fileName,
      comment: `The model replied but not in a form this app could read. First 200 characters: ${outcome.value.slice(0, 200)}`,
    })
    redirect(back('assess=unreadable'))
  }

  const actor = await getActor(project.id)
  const judged = claimsApproval(reading)

  await supabase
    .from('attachments')
    .update({
      ai_model: outcome.model,
      ai_reviewed_at: new Date().toISOString(),
      ai_reviewed_by_name: actor.name,
      ai_confidence: reading.confidence,
      ai_appears_to_be: reading.appearsToBe,
      ai_matches_filing: reading.matchesFiling,
      ai_mismatch: reading.mismatch,
      ai_problem: reading.problem,
      ai_recommendation: reading.recommendation,
      ai_values: reading.values.length > 0 ? reading.values : null,
      ai_raw: outcome.value.slice(0, 8000),
    })
    .eq('id', id)

  await recordAudit({
    projectId: project.id,
    action:
      reading.matchesFiling === 'no'
        ? 'document assessed — MISMATCH'
        : judged
          ? 'document assessed — flagged'
          : 'document assessed',
    entity: 'attachment',
    entityId: id,
    entityLabel: fileName,
    newValue: reading.confidence,
    comment: [
      `Model: ${outcome.model}.`,
      `Filed against ${filedAgainst}.`,
      reading.matchesFiling === 'no'
        ? `MISMATCH: ${reading.mismatch || 'the model does not think this document is about what it is filed against.'}`
        : '',
      judged ? 'FLAGGED: judged the document acceptable, which is the signer\'s decision.' : '',
      reading.values.length > 0 ? `${reading.values.length} values read off the page.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  })

  revalidatePath('/documents')
  redirect(back(`assess=ok${reading.matchesFiling === 'no' ? '&mismatch=1' : ''}`))
}

/** Clear a reading. */
export async function clearAttachmentAssessment(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

  await supabase
    .from('attachments')
    .update({
      ai_model: null,
      ai_reviewed_at: null,
      ai_reviewed_by_name: null,
      ai_confidence: null,
      ai_appears_to_be: null,
      ai_matches_filing: null,
      ai_mismatch: null,
      ai_problem: null,
      ai_recommendation: null,
      ai_values: null,
      ai_raw: null,
    })
    .eq('id', id)

  revalidatePath('/documents')
}
