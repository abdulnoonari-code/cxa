// Data access for the punch list.

import { supabase } from '@/lib/supabase'

export type PunchRow = {
  id: string
  ref: string | null
  project_id: string | null
  equipment_id: string | null
  subject_type: string | null
  subject_id: string | null
  checklist_item_id: string | null
  title: string
  description: string | null
  severity: string
  category: string | null
  status: string
  level: string | null
  raised_by: string | null
  responsible_party: string | null
  discipline: string | null
  location: string | null
  due_date: string | null
  closed_at: string | null
  closed_by: string | null
  verified_at: string | null
  verified_by: string | null
  ai_comment: string | null
  created_at: string | null
}

const COLUMNS =
  'id, ref, project_id, equipment_id, subject_type, subject_id, checklist_item_id, title, description, severity, ' +
  'category, status, level, raised_by, responsible_party, discipline, location, due_date, closed_at, closed_by, ' +
  'verified_at, verified_by, ai_comment, created_at'

export type PunchFilter = {
  status?: string | null
  category?: string | null
  severity?: string | null
  level?: string | null
  party?: string | null
  /** open items only, whatever their status name */
  openOnly?: boolean
}

function applyFilter<T>(query: T, filter: PunchFilter): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any
  if (filter.status) q = q.eq('status', filter.status)
  if (filter.category === 'none') q = q.is('category', null)
  else if (filter.category) q = q.eq('category', filter.category)
  if (filter.severity) q = q.eq('severity', filter.severity)
  if (filter.level) q = q.eq('level', filter.level)
  if (filter.party) q = q.eq('responsible_party', filter.party)
  if (filter.openOnly) q = q.not('status', 'in', '("verified","closed")')
  return q as T
}

/**
 * One page of punch items.
 *
 * A punch list on a real substation runs to a few thousand rows, so this is
 * paginated like everything else — but the figures at the top of the screen
 * describe the whole project and come from `loadPunchTotals`, not from the
 * page in front of you.
 */
export async function loadPunchPage(
  projectId: string | null,
  filter: PunchFilter,
  page: number,
  perPage: number
): Promise<{ rows: PunchRow[]; total: number }> {
  if (!projectId) return { rows: [], total: 0 }

  const from = (page - 1) * perPage
  let query = supabase
    .from('issues')
    .select(COLUMNS, { count: 'exact' })
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .range(from, from + perPage - 1)

  query = applyFilter(query, filter)

  const { data, count } = await query
  return { rows: (data ?? []) as unknown as PunchRow[], total: count ?? 0 }
}

/**
 * Just enough of every item on the project to add it up — no titles, no
 * descriptions. Four columns across a few thousand rows is a small query;
 * the whole row across a few thousand rows is not.
 */
export async function loadPunchTotals(projectId: string | null): Promise<
  { status: string; category: string | null; due_date: string | null; created_at: string | null; level: string | null }[]
> {
  if (!projectId) return []
  const { data } = await supabase
    .from('issues')
    .select('status, category, due_date, created_at, level')
    .eq('project_id', projectId)
  return (data ?? []) as { status: string; category: string | null; due_date: string | null; created_at: string | null; level: string | null }[]
}

/** Every punch item on the project, for the export. */
export async function loadAllPunch(projectId: string | null): Promise<PunchRow[]> {
  if (!projectId) return []
  const { data } = await supabase
    .from('issues')
    .select(COLUMNS)
    .eq('project_id', projectId)
    .order('ref', { ascending: true })
  return (data ?? []) as unknown as PunchRow[]
}

/** The punch numbers already issued, so a new item can take the next one. */
export async function loadPunchRefs(projectId: string | null): Promise<(string | null)[]> {
  if (!projectId) return []
  const { data } = await supabase.from('issues').select('ref').eq('project_id', projectId)
  return (data ?? []).map((r: { ref: string | null }) => r.ref)
}

/** The responsible parties actually in use, for the filter dropdown. */
export function partiesIn(rows: { responsible_party: string | null }[]): string[] {
  const seen = new Set<string>()
  for (const r of rows) {
    const p = (r.responsible_party ?? '').trim()
    if (p) seen.add(p)
  }
  return [...seen].sort((a, b) => a.localeCompare(b))
}
