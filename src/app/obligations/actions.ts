'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { getActor, actorCan, recordAudit } from '@/lib/audit'
import { extractDocument } from '@/lib/doc-extract'
import { readObligations, nextRef, refSeries, type Candidate } from '@/lib/obligations'
import { loadObligationRefs, loadObligationKeys, dedupeKey } from '@/data/obligations'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

function refresh() {
  revalidatePath('/obligations')
  revalidatePath('/documents')
  revalidatePath('/doc-control')
  revalidatePath('/dashboard')
  revalidatePath('/audit')
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

// ── Reading a contract, a specification or a procedure ───────────────────

/**
 * Read a Word or PDF document and file every duty it places on somebody.
 *
 * Deliberately not a preview-then-confirm flow. On a real specification the
 * reader finds eighty clauses, and asking an engineer to tick eighty boxes
 * before anything is saved means he closes the tab. Instead everything found
 * is written straight into the register marked `origin = 'rule'`, filtered to
 * that one document on the screen he lands on, where deleting the twelve that
 * are boilerplate takes a minute. Nothing is hidden and nothing is guessed
 * silently — a clause whose party could not be read is filed as unassigned
 * and counted as such by the verdict.
 */
export async function readDocument(formData: FormData) {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) redirect('/obligations?read=nofile')

  const project = await getCurrentProject()
  if (!project) redirect('/obligations?read=noproject')
  if (!(await actorCan('manage', project.id))) redirect('/obligations?read=denied')

  const extraction = await extractDocument(await file.arrayBuffer(), file.name)

  if (!extraction.ok) {
    await recordAudit({
      projectId: project.id,
      action: 'document could not be read',
      entity: 'obligation',
      entityLabel: file.name,
      comment: extraction.reason ?? 'Unknown reason.',
    })
    redirect(`/obligations?read=failed&detail=${encodeURIComponent((extraction.reason ?? '').slice(0, 400))}`)
  }

  const candidates: Candidate[] = readObligations(extraction.paragraphs)
  const documentId = str(formData, 'document_id')
  const defaultParty = str(formData, 'default_party')

  if (candidates.length === 0) {
    await recordAudit({
      projectId: project.id,
      action: 'document read, no obligations found',
      entity: 'obligation',
      entityLabel: file.name,
      comment: `${extraction.paragraphs.length} paragraphs read, none of them placing a duty on anybody.`,
    })
    redirect(`/obligations?read=none&paras=${extraction.paragraphs.length}`)
  }

  // A document read twice must not double the register.
  const known = await loadObligationKeys(project.id)
  const fresh = candidates.filter((c) => !known.has(dedupeKey(documentId, c.clause, c.statement)))
  const duplicates = candidates.length - fresh.length

  const actor = await getActor(project.id)
  const series = refSeries(await loadObligationRefs(project.id), fresh.length)

  const rows = fresh.map((c, i) => ({
    project_id: project.id,
    ref: series[i],
    document_id: documentId,
    source_name: file.name,
    // The page is part of the citation on a PDF; on a Word file there is no
    // page to cite, so the clause number carries it alone.
    clause: c.clause ?? (c.page ? `p.${c.page}` : null),
    statement: c.statement,
    party: c.party ?? defaultParty,
    obligation_type: c.obligation_type,
    status: 'open',
    notes: c.context ? `Under heading: ${c.context}` : null,
    origin: 'rule',
    created_by_name: actor.name ?? null,
  }))

  for (const part of chunk(rows, 500)) {
    await supabase.from('obligations').insert(part)
  }

  const unassigned = rows.filter((r) => !r.party).length

  await recordAudit({
    projectId: project.id,
    action: 'read obligations from a document',
    entity: 'obligation',
    entityLabel: file.name,
    newValue: `${rows.length} obligations filed`,
    comment:
      `${extraction.format?.toUpperCase()} · ${extraction.paragraphs.length} paragraphs · ` +
      `${candidates.length} clauses placing a duty on somebody · ${duplicates} already on the register · ` +
      `${unassigned} with no party identified.`,
  })

  refresh()
  redirect(
    `/obligations?read=ok&added=${rows.length}&found=${candidates.length}&dupes=${duplicates}` +
      `&unassigned=${unassigned}&paras=${extraction.paragraphs.length}&format=${extraction.format}` +
      (documentId ? `&document=${documentId}` : '')
  )
}

// ── The register ─────────────────────────────────────────────────────────

function stamps(status: string, actorName: string, previous: { closed_at: string | null; closed_by: string | null; accepted_at: string | null }) {
  const now = new Date().toISOString()
  // Submitted is the owing party saying it is done. Accepted is the other
  // party agreeing. Reopening an obligation clears both, because a stamp that
  // outlives a reopen claims somebody accepted something that is sitting open.
  const submitted = status === 'submitted' || status === 'accepted'
  const settled = status === 'accepted' || status === 'waived' || status === 'not_applicable'
  return {
    closed_at: submitted ? previous.closed_at ?? now : null,
    closed_by: submitted ? previous.closed_by ?? actorName : null,
    accepted_at: settled ? previous.accepted_at ?? now : null,
    accepted_by: settled ? actorName : null,
  }
}

export async function addObligation(formData: FormData) {
  const project = await getCurrentProject()
  const statement = str(formData, 'statement')
  if (!project || !statement) return
  if (!(await actorCan('manage', project.id))) return

  const actor = await getActor(project.id)
  const ref = nextRef(await loadObligationRefs(project.id))

  await supabase.from('obligations').insert({
    project_id: project.id,
    ref,
    document_id: str(formData, 'document_id'),
    source_name: str(formData, 'source_name'),
    clause: str(formData, 'clause'),
    statement,
    party: str(formData, 'party'),
    obligation_type: str(formData, 'obligation_type') ?? 'other',
    level: str(formData, 'level'),
    status: 'open',
    owner: str(formData, 'owner'),
    due_date: str(formData, 'due_date'),
    notes: str(formData, 'notes'),
    origin: 'manual',
    created_by_name: actor.name ?? null,
  })

  await recordAudit({
    projectId: project.id,
    action: 'added an obligation',
    entity: 'obligation',
    entityLabel: `${ref} — ${statement.slice(0, 60)}`,
    newValue: str(formData, 'party') ?? 'unassigned',
  })

  refresh()
}

export async function updateObligation(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('review', project.id))) return

  const actor = await getActor(project.id)
  const { data: before } = await supabase
    .from('obligations')
    .select('ref, statement, status, party, closed_at, closed_by, accepted_at')
    .eq('id', id)
    .single()

  const previous = (before ?? { closed_at: null, closed_by: null, accepted_at: null }) as {
    ref?: string | null
    statement?: string
    status?: string
    party?: string | null
    closed_at: string | null
    closed_by: string | null
    accepted_at: string | null
  }

  const status = str(formData, 'status') ?? 'open'
  const mark = stamps(status, actor.name ?? 'Unknown', previous)

  await supabase
    .from('obligations')
    .update({
      party: str(formData, 'party'),
      obligation_type: str(formData, 'obligation_type'),
      level: str(formData, 'level'),
      status,
      owner: str(formData, 'owner'),
      due_date: str(formData, 'due_date'),
      evidence: str(formData, 'evidence'),
      notes: str(formData, 'notes'),
      ...mark,
    })
    .eq('id', id)

  if (previous.status !== status || previous.party !== str(formData, 'party')) {
    await recordAudit({
      projectId: project.id,
      action: 'changed an obligation',
      entity: 'obligation',
      entityLabel: `${previous.ref ?? ''} — ${(previous.statement ?? '').slice(0, 60)}`.trim(),
      oldValue: `${previous.status ?? 'open'} · ${previous.party ?? 'unassigned'}`,
      newValue: `${status} · ${str(formData, 'party') ?? 'unassigned'}`,
    })
  }

  refresh()
}

export async function deleteObligation(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) return

  const { data: before } = await supabase.from('obligations').select('ref, statement').eq('id', id).single()
  await supabase.from('obligations').delete().eq('id', id)

  const row = before as { ref: string | null; statement: string } | null
  await recordAudit({
    projectId: project.id,
    action: 'deleted an obligation',
    entity: 'obligation',
    entityLabel: row ? `${row.ref ?? ''} — ${row.statement.slice(0, 60)}`.trim() : id,
    comment: 'The reference is not reused.',
  })

  refresh()
}

/**
 * Delete every obligation that came from one read of one document.
 *
 * The escape hatch for a document that turned out to be the wrong revision,
 * or a read that pulled in a page of definitions. Only rows the reader
 * created are removed — anything typed by hand or already edited into a real
 * obligation is left alone, because those represent somebody's work.
 */
export async function discardRead(formData: FormData) {
  const source = str(formData, 'source_name')
  const project = await getCurrentProject()
  if (!project || !source) return
  if (!(await actorCan('manage', project.id))) return

  const { data } = await supabase
    .from('obligations')
    .select('id')
    .eq('project_id', project.id)
    .eq('source_name', source)
    .eq('origin', 'rule')
    .eq('status', 'open')

  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id)
  for (const part of chunk(ids, 200)) {
    await supabase.from('obligations').delete().in('id', part)
  }

  await recordAudit({
    projectId: project.id,
    action: 'discarded a document read',
    entity: 'obligation',
    entityLabel: source,
    newValue: `${ids.length} removed`,
    comment: 'Only untouched rows the reader created were removed. Anything edited or assigned was kept.',
  })

  refresh()
}
