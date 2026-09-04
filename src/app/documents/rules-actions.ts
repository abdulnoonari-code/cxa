'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { recordAudit } from '@/lib/audit'
import { getCurrentProject } from '@/lib/project'
import { extractDocument, formatOf } from '@/lib/doc-extract'
import { reviewByRules, verdictOf } from '@/lib/doc-rules'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

/**
 * Run the free rule checks over one attachment.
 *
 * No key, no model, no network beyond fetching the file itself. It can be run
 * on every document in a project without anybody thinking about cost, which
 * is the entire point — the check that catches a certificate filed against
 * the wrong tag should not be something you ration.
 */
export async function runRulesOnAttachment(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

  const project = await getCurrentProject()
  if (!project) redirect('/documents?rules=noproject')

  const { data } = await supabase
    .from('attachments')
    .select('id, file_name, file_path, file_url, checklist_item_id')
    .eq('id', id)
    .single()

  const row = data as {
    id: string
    file_name: string | null
    file_path: string | null
    file_url: string | null
    checklist_item_id: string | null
  } | null
  if (!row) redirect('/documents?rules=gone')

  const fileName = row.file_name ?? 'the file'

  // The tag it is filed against. Without this the mismatch check — the only
  // reason this feature is worth having — cannot run, so it is worth the
  // extra two queries.
  let expectedTag: string | null = null
  if (row.checklist_item_id) {
    const { data: item } = await supabase
      .from('checklist_items')
      .select('equipment_id')
      .eq('id', row.checklist_item_id)
      .single()
    const eqId = (item as { equipment_id: string | null } | null)?.equipment_id
    if (eqId) {
      const { data: eq } = await supabase.from('equipment').select('tag_id').eq('id', eqId).single()
      expectedTag = (eq as { tag_id: string } | null)?.tag_id ?? null
    }
  }

  if (!formatOf(fileName)) {
    await supabase
      .from('attachments')
      .update({
        rules_run_at: new Date().toISOString(),
        rules_verdict: 'warning',
        rules_findings: [
          {
            level: 'warning',
            title: 'This file type cannot be read',
            detail: `Nothing can look inside a ${fileName.split('.').pop() ?? 'file'} file here. It is still attached and still downloadable.`,
            rule: 'file-type',
          },
        ],
        rules_measurements: null,
        rules_citations: null,
        rules_tag_found: null,
      })
      .eq('id', id)
    revalidatePath('/documents')
    redirect('/documents?rules=unsupported')
  }

  // Storage path first, the same reasoning as photographs: it works whether
  // the bucket is public or private.
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
  if (!bytes) redirect('/documents?rules=nofile')

  const extraction = await extractDocument(bytes, fileName)
  const reading = reviewByRules({ text: extraction.text, fileName, expectedTag })
  const verdict = verdictOf(reading)

  await supabase
    .from('attachments')
    .update({
      rules_run_at: new Date().toISOString(),
      rules_verdict: verdict,
      rules_findings: reading.findings,
      rules_measurements: reading.measurements.length > 0 ? reading.measurements : null,
      rules_citations: reading.citations.length > 0 ? reading.citations : null,
      rules_tag_found: reading.tagFound,
    })
    .eq('id', id)

  // Only a blocking result is worth an audit entry. A rule that runs cleanly
  // on two hundred documents would otherwise bury the trail in noise, and the
  // trail is only useful while somebody can still read it.
  if (verdict === 'blocking') {
    await recordAudit({
      projectId: project.id,
      action: 'document failed a rule check',
      entity: 'attachment',
      entityId: id,
      entityLabel: fileName,
      newValue: verdict,
      comment: reading.findings
        .filter((f) => f.level === 'blocking')
        .map((f) => f.title)
        .join('; '),
    })
  }

  revalidatePath('/documents')
  redirect(`/documents?rules=ok&verdict=${verdict}`)
}

/**
 * Run them over every document in the project at once.
 *
 * Offered because it is free. There is no version of this that makes sense to
 * ration, and a project that has been running for months has a backlog of
 * attachments nobody has ever checked.
 */
export async function runRulesOnAll(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) redirect('/documents?rules=noproject')

  const limit = Number(str(formData, 'limit') ?? '40') || 40

  const { data } = await supabase
    .from('attachments')
    .select('id, file_name, file_path, file_url, checklist_item_id')
    .eq('project_id', project.id)
    .is('rules_run_at', null)
    .limit(limit)

  const rows = (data ?? []) as {
    id: string
    file_name: string | null
    file_path: string | null
    file_url: string | null
    checklist_item_id: string | null
  }[]

  let done = 0
  let blocking = 0

  for (const row of rows) {
    const fileName = row.file_name ?? 'the file'
    if (!formatOf(fileName)) continue

    let expectedTag: string | null = null
    if (row.checklist_item_id) {
      const { data: item } = await supabase
        .from('checklist_items')
        .select('equipment_id')
        .eq('id', row.checklist_item_id)
        .single()
      const eqId = (item as { equipment_id: string | null } | null)?.equipment_id
      if (eqId) {
        const { data: eq } = await supabase.from('equipment').select('tag_id').eq('id', eqId).single()
        expectedTag = (eq as { tag_id: string } | null)?.tag_id ?? null
      }
    }

    let bytes: ArrayBuffer | null = null
    try {
      if (row.file_path) {
        const { data: blob } = await supabase.storage.from('documents').download(row.file_path)
        if (blob) bytes = await blob.arrayBuffer()
      }
    } catch {
      bytes = null
    }
    if (!bytes) continue

    const extraction = await extractDocument(bytes, fileName)
    const reading = reviewByRules({ text: extraction.text, fileName, expectedTag })
    const verdict = verdictOf(reading)
    if (verdict === 'blocking') blocking += 1

    await supabase
      .from('attachments')
      .update({
        rules_run_at: new Date().toISOString(),
        rules_verdict: verdict,
        rules_findings: reading.findings,
        rules_measurements: reading.measurements.length > 0 ? reading.measurements : null,
        rules_citations: reading.citations.length > 0 ? reading.citations : null,
        rules_tag_found: reading.tagFound,
      })
      .eq('id', row.id)

    done += 1
  }

  await recordAudit({
    projectId: project.id,
    action: 'rule checks run across documents',
    entity: 'attachment',
    entityLabel: `${done} documents`,
    newValue: `${blocking} blocking`,
    comment:
      blocking > 0
        ? `${blocking} document${blocking === 1 ? '' : 's'} do not mention the tag they are filed against.`
        : 'No document failed the tag check.',
  })

  revalidatePath('/documents')
  redirect(`/documents?rules=batch&n=${done}&blocking=${blocking}`)
}
