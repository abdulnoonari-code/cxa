// Data access for the punch list.
//
// ── Why every read here has a fallback ──────────────────────────────────
//
// Three of these columns arrive with SQL part 42, and until somebody runs it
// they do not exist. Selecting a column PostgREST has never heard of does not
// return it as null — it FAILS THE WHOLE QUERY, and every other column with
// it. A punch list of four hundred items becomes an empty screen that looks
// exactly like a project nobody has raised anything on.
//
// So the read asks for everything, and if the database says it has never
// heard of a column, asks again without it and reports which. The cost is one
// extra round trip on a database that is behind, and none at all on one that
// is not.

import { supabase } from '@/lib/supabase'
import { selectWithFallback } from '@/lib/pg-columns'

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
  /** What must be done about it — SQL part 42. Absent on a database behind that. */
  required_action?: string | null
  action_set_by?: string | null
  action_set_at?: string | null
}

const COLUMNS = [
  'id', 'ref', 'project_id', 'equipment_id', 'subject_type', 'subject_id', 'checklist_item_id', 'title',
  'description', 'severity', 'category', 'status', 'level', 'raised_by', 'responsible_party', 'discipline',
  'location', 'due_date', 'closed_at', 'closed_by', 'verified_at', 'verified_by', 'ai_comment', 'created_at',
  // Part 42. Dropped and reported if this database does not have them yet.
  'required_action', 'action_set_by', 'action_set_at',
]

/** The SQL step to name on screen when the remedy columns are not there. */
export const ACTION_SQL = 'week5-part42-what-must-be-done.sql'

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
): Promise<{ rows: PunchRow[]; total: number; missing: string[] }> {
  if (!projectId) return { rows: [], total: 0, missing: [] }

  const from = (page - 1) * perPage
  // The count comes back on the same reply as the rows, so it is caught here
  // rather than asked for separately — a second count query against a few
  // thousand rows to learn a number the first one already returned.
  let total = 0

  const outcome = await selectWithFallback<PunchRow>(COLUMNS, async (columns) => {
    let query = supabase
      .from('issues')
      .select(columns.join(', '), { count: 'exact' })
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .range(from, from + perPage - 1)

    query = applyFilter(query, filter)

    const { data, error, count } = await query
    if (!error) total = count ?? 0
    return { data: (data ?? []) as unknown as PunchRow[], error }
  })

  return { rows: outcome.rows, total, missing: outcome.missing }
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

/** Every punch item on the project, for the exports and the documents. */
export async function loadAllPunch(projectId: string | null): Promise<PunchRow[]> {
  return (await loadAllPunchWithNotes(projectId)).rows
}

/**
 * The same, and which columns this database does not have.
 *
 * A defect report generated against a database where part 42 has not been run
 * would otherwise say "no action has been agreed" against every single item —
 * true in the sense that there is nowhere to write one, and deeply misleading
 * as a thing to send to a contractor. The screen that offers the button says
 * so instead.
 */
export async function loadAllPunchWithNotes(
  projectId: string | null
): Promise<{ rows: PunchRow[]; missing: string[] }> {
  if (!projectId) return { rows: [], missing: [] }

  const outcome = await selectWithFallback<PunchRow>(COLUMNS, async (columns) => {
    const { data, error } = await supabase
      .from('issues')
      .select(columns.join(', '))
      .eq('project_id', projectId)
      .order('ref', { ascending: true })
    return { data: (data ?? []) as unknown as PunchRow[], error }
  })

  return { rows: outcome.rows, missing: outcome.missing }
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
