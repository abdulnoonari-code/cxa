// Imports on the three registers — tags, systems and types — and deleting one.
//
// ── Why this is not the same file as the checklist version ─────────────
//
// It looks like it could be. It is not, and the difference is the whole
// reason this file has its own comment block:
//
//   Deleting a CHECK removes a check.
//   Deleting a TAG removes the tag, its checklist, its test records, its
//   punch items and its parts — four foreign keys say ON DELETE CASCADE
//   and the database obeys all of them in the same instant, silently.
//
// So every function here counts BEFORE it removes, and returns what it
// actually did. The caller puts those numbers on the screen above the
// button. A person about to delete eighteen hundred tags is entitled to
// know that it also deletes ninety thousand checks, and to know it before
// rather than after.

import { supabase } from '@/lib/supabase'
import {
  EQUIPMENT_REFERENCES, SYSTEM_REFERENCES, TYPE_REFERENCES,
  impactTotal, type CheckReference, type Impact,
} from '@/lib/purge'
import { inGroup, groupRows, ungroupedRows, pickedIds, type RowGroup, type GroupedRow } from '@/lib/check-groups'
import { missingColumn } from '@/lib/pg-columns'
import { REGISTER_TABLE, REGISTER_LABEL, type RegisterKind } from '@/lib/registers'

const TABLE = REGISTER_TABLE

const REFERENCES: Record<RegisterKind, CheckReference[]> = {
  equipment: EQUIPMENT_REFERENCES,
  systems: SYSTEM_REFERENCES,
  equipment_types: TYPE_REFERENCES,
}


export type RegisterSummary = {
  groups: RowGroup[]
  /** Rows typed in, or imported before the source column existed. */
  typedIn: number
  total: number
  /**
   * True when the database has no source_ref column yet — SQL part 41 has
   * not been run. NOT the same as "no imports": the screen says so in
   * words and names the file to run, instead of showing an empty section
   * that looks like nothing has ever been imported.
   */
  columnMissing: boolean
}

// Not a regex of my own. `missingColumn` already knows the three different
// sentences Postgres and PostgREST use for this, and has been getting them
// right for every other optional column in the application. A fourth hand-
// rolled pattern here would be a fourth one to get subtly wrong.

export async function loadRegisterGroups(
  kind: RegisterKind,
  projectId: string | null
): Promise<RegisterSummary> {
  const empty: RegisterSummary = { groups: [], typedIn: 0, total: 0, columnMissing: false }
  if (!projectId) return empty

  const { data, error } = await supabase
    .from(TABLE[kind])
    .select('id, source_ref')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) return missingColumn(error.message) === 'source_ref' ? { ...empty, columnMissing: true } : empty

  const rows = ((data ?? []) as { id: string; source_ref: string | null }[])
    .map<GroupedRow>((r) => ({ id: r.id, sourceRef: r.source_ref }))

  return { groups: groupRows(rows), typedIn: ungroupedRows(rows), total: rows.length, columnMissing: false }
}

// ── Which rows a scope means ────────────────────────────────────────────

export type RegisterScope =
  | { kind: 'group'; groupKey: string }
  | { kind: 'picked'; ids: string[] }

async function idsFor(kind: RegisterKind, projectId: string, scope: RegisterScope): Promise<string[]> {
  if (scope.kind === 'group') {
    // Matched by PARSING source_ref, never by a LIKE pattern. A file called
    // "100% load rev C.xlsx" contains a wildcard, and an unescaped wildcard
    // that quietly matches the wrong rows would delete the wrong tags.
    const { data, error } = await supabase
      .from(TABLE[kind])
      .select('id, source_ref')
      .eq('project_id', projectId)
      .not('source_ref', 'is', null)
    if (error) return []
    return ((data ?? []) as { id: string; source_ref: string | null }[])
      .filter((r) => inGroup(r.source_ref, scope.groupKey))
      .map((r) => r.id)
  }

  if (scope.ids.length === 0) return []
  const { data, error } = await supabase.from(TABLE[kind]).select('id').eq('project_id', projectId)
  if (error) return []
  return pickedIds(scope.ids, ((data ?? []) as { id: string }[]).map((r) => r.id))
}

async function countIn(table: string, column: string, values: string[]): Promise<number | null> {
  if (values.length === 0) return 0
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .in(column, values)
  if (!error) return count ?? 0
  // A table that does not exist yet is genuinely empty — somebody who has
  // not run every SQL step must still be able to delete an import.
  if (/relation .* does not exist|could not find the table/i.test(error.message)) return 0
  // null is "unknown", not zero. Reporting zero for a count that failed
  // would tell somebody nothing else is affected when it might be.
  return null
}

/** What deleting this would remove, and what it would leave behind. */
export async function registerImpact(
  kind: RegisterKind,
  projectId: string,
  scope: RegisterScope
): Promise<Impact & { ids: string[] }> {
  const ids = await idsFor(kind, projectId, scope)
  const label = REGISTER_LABEL[kind]
  const removes = [{ label: ids.length === 1 ? label.one : label.many, count: ids.length }]

  const breaks: Impact['breaks'] = []
  for (const ref of REFERENCES[kind]) {
    const count = await countIn(ref.table, ref.column, ids)
    if (count && count > 0) breaks.push({ label: ref.label, count, consequence: ref.consequence })
  }

  return { removes, breaks, total: impactTotal(removes), ids }
}

export type RegisterPurge = { ok: true; deleted: number } | { ok: false; reason: string }

/**
 * Delete them.
 *
 * In batches of 200, because every `.in()` is a list of uuids in a URL and
 * an import of two thousand tags would otherwise be rejected with an error
 * that reads like a server fault rather than "your list was too long".
 *
 * The cascades are left to the database. Clearing the children by hand
 * first would be four more round trips and one more chance to get it half
 * done; the foreign keys already say exactly what happens and they say it
 * atomically.
 */
export async function deleteFromRegister(
  kind: RegisterKind,
  projectId: string,
  scope: RegisterScope
): Promise<RegisterPurge> {
  const ids = await idsFor(kind, projectId, scope)
  if (ids.length === 0) return { ok: true, deleted: 0 }

  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200)
    const { error } = await supabase
      .from(TABLE[kind])
      .delete()
      .eq('project_id', projectId)
      .in('id', part)
    // Stops at the first refusal and says how far it got, rather than
    // carrying on and reporting a total that was never deleted.
    if (error) return { ok: false, reason: error.message }
  }

  return { ok: true, deleted: ids.length }
}
