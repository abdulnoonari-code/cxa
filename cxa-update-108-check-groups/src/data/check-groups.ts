import { supabase } from '@/lib/supabase'
import { groupChecks, ungroupedCount, type CheckGroup, type GroupedCheck } from '@/lib/check-groups'

export type GroupSummary = {
  groups: CheckGroup[]
  /** Checks typed in by hand, which belong to no import and no group delete. */
  typedIn: number
  total: number
}

/**
 * Every import on the project, and how big each one is.
 *
 * ── Why this is its own query ──────────────────────────────────────────
 *
 * The checklist register is paginated by tag — twenty tags a page — so the
 * checks it has in hand are the checks on THAT page. Counting imports from
 * them would say "48 checks" about a file that put in two thousand, and the
 * Delete button beside that number would remove all two thousand. A count
 * that disagrees with what the button does is worse than no count.
 *
 * So the whole project is asked for, in one query of four small columns,
 * ordered oldest first so the groups come back in the order they arrived.
 */
export async function loadCheckGroups(projectId: string | null): Promise<GroupSummary> {
  if (!projectId) return { groups: [], typedIn: 0, total: 0 }

  const { data, error } = await supabase
    .from('checklist_items')
    .select('id, source_ref, status, level')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  // An error is NOT an empty project. Returning zero groups here would hide
  // every import behind a screen that says there are none, and somebody
  // would import the same file again to fix it.
  if (error) return { groups: [], typedIn: 0, total: 0 }

  const rows = ((data ?? []) as { id: string; source_ref: string | null; status: string | null; level: string | null }[])
    .map<GroupedCheck>((r) => ({ id: r.id, sourceRef: r.source_ref, status: r.status, level: r.level }))

  return { groups: groupChecks(rows), typedIn: ungroupedCount(rows), total: rows.length }
}
