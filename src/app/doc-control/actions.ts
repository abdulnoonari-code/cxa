'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { redirect } from 'next/navigation'
import { actorCan, recordAudit, getActor } from '@/lib/audit'
import { extractDocument, paragraphsFromText } from '@/lib/doc-extract'
import { readObligations, refSeries } from '@/lib/obligations'
import { readRequirements, requirementRefSeries } from '@/lib/requirement-reader'
import { loadObligationKeys, loadObligationRefs, dedupeKey } from '@/data/obligations'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

function subjectRef(formData: FormData): { type: string | null; id: string | null } {
  const raw = str(formData, 'subject')
  if (!raw || !raw.includes(':')) return { type: null, id: null }
  const [type, id] = raw.split(':')
  return { type: type || null, id: id || null }
}

function refresh() {
  revalidatePath('/doc-control')
  revalidatePath('/requirements')
  revalidatePath('/audit')
}

export async function addDocument(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('review', project.id))) return

  const number = str(formData, 'doc_number')
  if (!number) return

  const subject = subjectRef(formData)

  const { data } = await supabase
    .from('controlled_documents')
    .insert({
      project_id: project.id,
      doc_number: number,
      title: str(formData, 'title'),
      doc_type: str(formData, 'doc_type') ?? 'specification',
      discipline: str(formData, 'discipline'),
      owner: str(formData, 'owner'),
      subject_type: subject.type,
      subject_id: subject.id,
    })
    .select('id')
    .single()

  const documentId = (data as { id: string } | null)?.id

  // A document with no revision cannot be cited, so the first revision is
  // created with it rather than as a second step somebody forgets.
  const firstRev = str(formData, 'first_rev')
  if (documentId && firstRev) {
    await supabase.from('document_revisions').insert({
      document_id: documentId,
      rev: firstRev,
      status: str(formData, 'first_status') ?? 'issued',
      issued_date: str(formData, 'first_issued'),
    })
  }

  await recordAudit({
    projectId: project.id,
    action: 'registered controlled document',
    entity: 'controlled_document',
    entityId: documentId,
    entityLabel: number,
    newValue: firstRev,
  })

  refresh()
}

// Issuing a revision supersedes whatever was effective before it. This is the
// action that makes every requirement citing the old revision light up as
// needing review — which is the §7 impact question, answered by the data
// rather than by somebody remembering.
export async function addRevision(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('review', project.id))) return

  const documentId = str(formData, 'document_id')
  const rev = str(formData, 'rev')
  if (!documentId || !rev) return

  const status = str(formData, 'status') ?? 'issued'

  const { data } = await supabase
    .from('document_revisions')
    .insert({
      document_id: documentId,
      rev,
      status,
      issued_date: str(formData, 'issued_date'),
      notes: str(formData, 'notes'),
    })
    .select('id')
    .single()

  const newId = (data as { id: string } | null)?.id

  // Only a revision that is actually in force supersedes the previous ones. A
  // draft sitting alongside an approved revision changes nothing.
  if (newId && (status === 'approved' || status === 'issued')) {
    const { data: others } = await supabase
      .from('document_revisions')
      .select('id')
      .eq('document_id', documentId)
      .neq('id', newId)

    const ids = ((others ?? []) as { id: string }[]).map((o) => o.id)
    if (ids.length > 0) {
      await supabase
        .from('document_revisions')
        .update({ status: 'superseded', superseded_by: newId })
        .in('id', ids)
        .neq('status', 'draft')
    }
  }

  await recordAudit({
    projectId: project.id,
    action: 'issued document revision',
    entity: 'controlled_document',
    entityId: documentId,
    entityLabel: str(formData, 'label'),
    oldValue: str(formData, 'previous_rev'),
    newValue: rev,
    comment: str(formData, 'notes'),
  })

  refresh()
}

export async function deleteDocument(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) return

  const id = str(formData, 'id')
  if (!id) return

  // Requirements citing it keep their revision text; they simply stop showing
  // a linked document. Nothing silently loses its stated source.
  await supabase.from('requirements').update({ document_id: null }).eq('document_id', id)
  await supabase.from('controlled_documents').delete().eq('id', id)

  await recordAudit({
    projectId: project.id,
    action: 'removed controlled document',
    entity: 'controlled_document',
    entityId: id,
    entityLabel: str(formData, 'label'),
  })

  refresh()
}

// ── Reading a revision ───────────────────────────────────────────────────

/**
 * Attach the actual document to a revision and read its text.
 *
 * The text is stored against the **revision**, not the document, because rev C
 * and rev D say different things and that difference is the entire point of
 * document control. A register built from rev C must still be able to say it
 * was built from rev C after rev D lands.
 *
 * Nothing is interpreted here. Extracting the text and deciding what the text
 * means are separate steps, so a document can be filed today and read for
 * obligations or requirements whenever somebody gets to it.
 */
export async function attachRevisionFile(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) redirect('/doc-control?read=noproject')
  if (!(await actorCan('review', project.id))) redirect('/doc-control?read=denied')

  const revisionId = str(formData, 'revision_id')
  const file = formData.get('file')
  if (!revisionId || !(file instanceof File) || file.size === 0) redirect('/doc-control?read=nofile')

  const buffer = await file.arrayBuffer()
  const extraction = await extractDocument(buffer, file.name)

  // The file is kept whether or not its text could be read — a scanned PDF is
  // still the controlled document, and refusing to file it because CxSentinel
  // cannot read it would be absurd.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `revisions/${revisionId}/${Date.now()}-${safeName}`
  const { error: uploadError } = await supabase.storage.from('documents').upload(path, file)
  const publicUrl = uploadError ? null : supabase.storage.from('documents').getPublicUrl(path).data.publicUrl

  await supabase
    .from('document_revisions')
    .update({
      file_name: file.name,
      file_path: uploadError ? null : path,
      file_url: publicUrl,
      extracted_text: extraction.ok ? extraction.text : null,
      extracted_at: extraction.ok ? new Date().toISOString() : null,
      page_count: extraction.pageCount,
      word_count: extraction.ok ? extraction.wordCount : null,
      source_format: extraction.format,
    })
    .eq('id', revisionId)

  await recordAudit({
    projectId: project.id,
    action: extraction.ok ? 'attached and read a document revision' : 'attached a document revision that could not be read',
    entity: 'document_revision',
    entityId: revisionId,
    entityLabel: file.name,
    newValue: extraction.ok ? `${extraction.wordCount} words, ${extraction.paragraphs.length} paragraphs` : null,
    comment: extraction.ok ? null : (extraction.reason ?? 'Unknown reason.'),
  })

  refresh()
  redirect(
    extraction.ok
      ? `/doc-control?read=ok&words=${extraction.wordCount}&paras=${extraction.paragraphs.length}&format=${extraction.format}`
      : `/doc-control?read=failed&detail=${encodeURIComponent((extraction.reason ?? '').slice(0, 400))}`
  )
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

async function revisionText(revisionId: string): Promise<{
  text: string
  fileName: string | null
  rev: string | null
  documentId: string | null
} | null> {
  const { data } = await supabase
    .from('document_revisions')
    .select('extracted_text, file_name, rev, document_id')
    .eq('id', revisionId)
    .single()
  const row = data as { extracted_text: string | null; file_name: string | null; rev: string | null; document_id: string | null } | null
  if (!row?.extracted_text) return null
  return { text: row.extracted_text, fileName: row.file_name, rev: row.rev, documentId: row.document_id }
}

/** Read the stored text of a revision for duties, and file them as obligations. */
export async function readRevisionObligations(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) redirect('/doc-control?read=denied')

  const revisionId = str(formData, 'revision_id')
  if (!revisionId) return

  const source = await revisionText(revisionId)
  if (!source) redirect('/doc-control?read=notext')

  const paragraphs = paragraphsFromText(source.text)
  const candidates = readObligations(paragraphs)
  if (candidates.length === 0) redirect(`/doc-control?read=noobligations&paras=${paragraphs.length}`)

  const known = await loadObligationKeys(project.id)
  const fresh = candidates.filter((c) => !known.has(dedupeKey(source.documentId, c.clause, c.statement)))
  const actor = await getActor(project.id)
  const series = refSeries(await loadObligationRefs(project.id), fresh.length)

  const rows = fresh.map((c, i) => ({
    project_id: project.id,
    ref: series[i],
    document_id: source.documentId,
    revision_id: revisionId,
    source_name: source.fileName ?? `Rev ${source.rev ?? '?'}`,
    clause: c.clause ?? (c.page ? `p.${c.page}` : null),
    statement: c.statement,
    party: c.party,
    obligation_type: c.obligation_type,
    status: 'open',
    notes: c.context ? `Under heading: ${c.context}` : null,
    origin: 'rule',
    created_by_name: actor.name ?? null,
  }))

  for (const part of chunk(rows, 500)) {
    await supabase.from('obligations').insert(part)
  }

  await recordAudit({
    projectId: project.id,
    action: 'read obligations from a controlled revision',
    entity: 'document_revision',
    entityId: revisionId,
    entityLabel: `Rev ${source.rev ?? '?'} — ${source.fileName ?? ''}`.trim(),
    newValue: `${rows.length} obligations filed`,
    comment: `${candidates.length} clauses place a duty on somebody; ${candidates.length - fresh.length} were already on the register.`,
  })

  revalidatePath('/obligations')
  refresh()
  redirect(`/obligations?read=ok&added=${rows.length}&found=${candidates.length}&dupes=${candidates.length - fresh.length}&unassigned=${rows.filter((r) => !r.party).length}&paras=${paragraphs.length}&format=stored`)
}

/** Read the stored text of a revision for acceptance criteria, and file them as requirements. */
export async function readRevisionRequirements(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) redirect('/doc-control?read=denied')

  const revisionId = str(formData, 'revision_id')
  if (!revisionId) return

  const source = await revisionText(revisionId)
  if (!source) redirect('/doc-control?read=notext')

  const paragraphs = paragraphsFromText(source.text)
  const candidates = readRequirements(paragraphs)
  if (candidates.length === 0) redirect(`/doc-control?read=norequirements&paras=${paragraphs.length}`)

  // A requirement already on the register from the same document and clause is
  // the same requirement. Same rule as the obligations reader.
  const { data: existing } = await supabase
    .from('requirements')
    .select('clause, statement, document_id')
    .eq('project_id', project.id)
  const known = new Set(
    ((existing ?? []) as { clause: string | null; statement: string; document_id: string | null }[]).map((r) =>
      `${r.document_id ?? '-'}|${(r.clause ?? '').toLowerCase().trim()}|${r.statement.toLowerCase().replace(/\s+/g, ' ').slice(0, 80)}`
    )
  )
  const fresh = candidates.filter(
    (c) =>
      !known.has(
        `${source.documentId ?? '-'}|${(c.clause ?? '').toLowerCase().trim()}|${c.statement.toLowerCase().replace(/\s+/g, ' ').slice(0, 80)}`
      )
  )

  const { data: refRows } = await supabase.from('requirements').select('ref').eq('project_id', project.id)
  const series = requirementRefSeries(((refRows ?? []) as { ref: string | null }[]).map((r) => r.ref), fresh.length)

  const rows = fresh.map((c, i) => ({
    project_id: project.id,
    ref: series[i],
    statement: c.statement,
    document_id: source.documentId,
    source_revision: source.rev,
    source_kind: 'specification',
    clause: c.clause ?? (c.page ? `p.${c.page}` : null),
    verification_method: c.verification_method,
    criticality: c.criticality,
    acceptance: c.acceptance,
    notes: c.context ? `Under heading: ${c.context}` : null,
  }))

  for (const part of chunk(rows, 500)) {
    await supabase.from('requirements').insert(part)
  }

  await recordAudit({
    projectId: project.id,
    action: 'read requirements from a controlled revision',
    entity: 'document_revision',
    entityId: revisionId,
    entityLabel: `Rev ${source.rev ?? '?'} — ${source.fileName ?? ''}`.trim(),
    newValue: `${rows.length} requirements filed`,
    comment: `${candidates.length} clauses state an acceptance criterion; ${candidates.length - fresh.length} were already on the register.`,
  })

  revalidatePath('/requirements')
  refresh()
  redirect(`/requirements?read=ok&added=${rows.length}&found=${candidates.length}&dupes=${candidates.length - fresh.length}&rev=${encodeURIComponent(source.rev ?? '')}`)
}
