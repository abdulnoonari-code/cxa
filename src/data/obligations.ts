// Data access for the obligations register.

import { supabase } from '@/lib/supabase'

export type ObligationRow = {
  id: string
  ref: string | null
  project_id: string | null
  document_id: string | null
  revision_id: string | null
  source_name: string | null
  clause: string | null
  statement: string
  party: string | null
  obligation_type: string | null
  level: string | null
  stage_key: string | null
  status: string
  owner: string | null
  due_date: string | null
  evidence: string | null
  notes: string | null
  subject_type: string | null
  subject_id: string | null
  origin: string | null
  closed_at: string | null
  closed_by: string | null
  accepted_at: string | null
  accepted_by: string | null
  created_at: string | null
  created_by_name: string | null
}

const COLUMNS =
  'id, ref, project_id, document_id, revision_id, source_name, clause, statement, party, obligation_type, ' +
  'level, stage_key, status, owner, due_date, evidence, notes, subject_type, subject_id, origin, ' +
  'closed_at, closed_by, accepted_at, accepted_by, created_at, created_by_name'

export type ObligationFilter = {
  party?: string | null
  status?: string | null
  type?: string | null
  document?: string | null
  outstandingOnly?: boolean
}

function applyFilter<T>(query: T, filter: ObligationFilter): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any
  if (filter.party === 'none') q = q.is('party', null)
  else if (filter.party) q = q.eq('party', filter.party)
  if (filter.status) q = q.eq('status', filter.status)
  if (filter.type) q = q.eq('obligation_type', filter.type)
  if (filter.document) q = q.eq('document_id', filter.document)
  if (filter.outstandingOnly) q = q.not('status', 'in', '("accepted","waived","not_applicable")')
  return q as T
}

/** One page of the register. A contract can carry several hundred clauses. */
export async function loadObligationPage(
  projectId: string | null,
  filter: ObligationFilter,
  page: number,
  perPage: number
): Promise<{ rows: ObligationRow[]; total: number }> {
  if (!projectId) return { rows: [], total: 0 }

  const from = (page - 1) * perPage
  let query = supabase
    .from('obligations')
    .select(COLUMNS, { count: 'exact' })
    .eq('project_id', projectId)
    .order('ref', { ascending: true })
    .range(from, from + perPage - 1)

  query = applyFilter(query, filter)

  const { data, count } = await query
  return { rows: (data ?? []) as unknown as ObligationRow[], total: count ?? 0 }
}

/**
 * Just enough of every obligation to add the register up. Three columns
 * across a few hundred rows, so the figures at the top of the screen can
 * describe the whole project while the table shows one page.
 */
export async function loadObligationTotals(
  projectId: string | null
): Promise<{ status: string; party: string | null; due_date: string | null }[]> {
  if (!projectId) return []
  const { data } = await supabase
    .from('obligations')
    .select('status, party, due_date')
    .eq('project_id', projectId)
  return (data ?? []) as { status: string; party: string | null; due_date: string | null }[]
}

/** Everything, for the exports. */
export async function loadAllObligations(projectId: string | null): Promise<ObligationRow[]> {
  if (!projectId) return []
  const { data } = await supabase
    .from('obligations')
    .select(COLUMNS)
    .eq('project_id', projectId)
    .order('ref', { ascending: true })
  return (data ?? []) as unknown as ObligationRow[]
}

export async function loadObligationRefs(projectId: string | null): Promise<(string | null)[]> {
  if (!projectId) return []
  const { data } = await supabase.from('obligations').select('ref').eq('project_id', projectId)
  return (data ?? []).map((r: { ref: string | null }) => r.ref)
}

/** The statements already on record, so an import cannot file the same clause twice. */
export async function loadObligationKeys(
  projectId: string | null
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!projectId) return map
  const { data } = await supabase
    .from('obligations')
    .select('id, clause, statement, document_id')
    .eq('project_id', projectId)
  for (const row of (data ?? []) as { id: string; clause: string | null; statement: string; document_id: string | null }[]) {
    map.set(dedupeKey(row.document_id, row.clause, row.statement), row.id)
  }
  return map
}

/**
 * What makes two obligations the same one.
 *
 * The clause number alone is not enough — two documents both have a clause
 * 7.1 — and the statement alone is not enough either, because boilerplate
 * repeats. Document plus clause plus the opening of the sentence is what
 * stops a second read of the same specification duplicating the register.
 */
export function dedupeKey(documentId: string | null, clause: string | null, statement: string): string {
  const opening = statement.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80)
  return `${documentId ?? '-'}|${(clause ?? '').toLowerCase().trim()}|${opening}`
}

export type DocumentChoice = {
  id: string
  doc_number: string
  title: string | null
  doc_type: string | null
}

export async function loadDocumentChoices(projectId: string | null): Promise<DocumentChoice[]> {
  if (!projectId) return []
  const { data } = await supabase
    .from('controlled_documents')
    .select('id, doc_number, title, doc_type')
    .eq('project_id', projectId)
    .order('doc_number')
  return (data ?? []) as DocumentChoice[]
}
