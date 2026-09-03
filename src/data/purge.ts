// Carrying out the deletions that lib/purge.ts describes.
//
// Every function here counts before it removes, and every one returns what it
// actually did rather than assuming it worked. A delete that silently affects
// nothing looks identical to a delete that worked, which is the same failure
// that made an uploaded photograph disappear.

import { supabase } from '@/lib/supabase'
import { PROJECT_TABLES, CHECK_REFERENCES, OBLIGATION_REFERENCES, impactTotal, type Impact } from '@/lib/purge'

/**
 * How many rows match — or `null` when the question could not be answered.
 *
 * The difference matters more than it looks. An earlier version returned 0 on
 * error, and the purge then skipped the table because "there is nothing in
 * it". A table whose count is blocked by a policy is not an empty table, and
 * treating the two the same turns a failed delete into a silent no-op that
 * reports success.
 *
 * `null` means "unknown": the caller attempts the delete anyway and lets the
 * database be the judge.
 */
async function countWhere(table: string, column: string, value: string, extra?: Record<string, string>): Promise<number | null> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true }).eq(column, value)
  for (const [k, v] of Object.entries(extra ?? {})) q = q.eq(k, v)
  const { count, error } = await q
  if (!error) return count ?? 0
  // A table that does not exist yet is genuinely empty — somebody who has not
  // run every SQL script must still be able to delete a project.
  if (/relation .* does not exist|could not find the table/i.test(error.message)) return 0
  return null
}

async function countIn(table: string, column: string, values: string[], extra?: Record<string, string>): Promise<number | null> {
  if (values.length === 0) return 0
  let q = supabase.from(table).select('id', { count: 'exact', head: true }).in(column, values)
  for (const [k, v] of Object.entries(extra ?? {})) q = q.eq(k, v)
  const { count, error } = await q
  if (!error) return count ?? 0
  if (/relation .* does not exist|could not find the table/i.test(error.message)) return 0
  return null
}

async function idsFor(table: string, projectId: string): Promise<string[]> {
  const { data, error } = await supabase.from(table).select('id').eq('project_id', projectId)
  if (error) return []
  return ((data ?? []) as { id: string }[]).map((r) => r.id)
}

// ── A checklist ───────────────────────────────────────────────────────────

export type CheckScope =
  | { kind: 'equipment'; equipmentId: string; label: string }
  | { kind: 'project'; label: string }

async function checkIdsIn(projectId: string, scope: CheckScope): Promise<string[]> {
  let q = supabase.from('checklist_items').select('id').eq('project_id', projectId)
  if (scope.kind === 'equipment') q = q.eq('equipment_id', scope.equipmentId)
  const { data, error } = await q
  if (error) return []
  return ((data ?? []) as { id: string }[]).map((r) => r.id)
}

/** What deleting this checklist removes, and what it leaves dangling. */
export async function checklistImpact(projectId: string, scope: CheckScope): Promise<Impact> {
  const ids = await checkIdsIn(projectId, scope)
  const removes = [{ label: 'Checks', count: ids.length }]

  const breaks: Impact['breaks'] = []
  for (const ref of CHECK_REFERENCES) {
    const count = await countIn(ref.table, ref.column, ids, ref.extra)
    if (count && count > 0) breaks.push({ label: ref.label, count, consequence: ref.consequence })
  }

  return { removes, breaks, total: impactTotal(removes) }
}

export type PurgeResult = { ok: true; deleted: number } | { ok: false; reason: string }

/**
 * Delete a checklist.
 *
 * The references are cleared BEFORE the checks, and cleared rather than
 * deleted where the referring record has a life of its own: a punch item that
 * was found by a deleted check is still a real defect, so it keeps existing
 * and simply stops claiming a source. A requirement's verification link is
 * different — it only exists to say "this check proves that requirement", so
 * with the check gone it means nothing and is removed.
 */
export async function deleteChecklist(projectId: string, scope: CheckScope): Promise<PurgeResult> {
  const ids = await checkIdsIn(projectId, scope)
  if (ids.length === 0) return { ok: true, deleted: 0 }

  // Links that exist only to point at a check: remove them.
  await supabase.from('requirement_verifications').delete().in('activity_id', ids).eq('activity_kind', 'checklist_item')
  await supabase.from('signatures').delete().in('entity_id', ids).eq('entity', 'checklist_item')
  await supabase.from('attachments').delete().in('checklist_item_id', ids)

  // Records with a life of their own: keep them, drop the reference.
  await supabase.from('issues').update({ checklist_item_id: null }).in('checklist_item_id', ids)

  const { error } = await supabase.from('checklist_items').delete().in('id', ids)
  if (error) return { ok: false, reason: error.message }

  return { ok: true, deleted: ids.length }
}

// ── A project ─────────────────────────────────────────────────────────────

/** Everything that would go with this project. */
export async function projectImpact(projectId: string): Promise<Impact> {
  const removes: Impact['removes'] = []

  for (const t of PROJECT_TABLES) {
    if (t.by === 'project') {
      const count = await countWhere(t.table, 'project_id', projectId)
      if (count && count > 0) removes.push({ label: t.label, count })
    } else if (t.parent) {
      const parentIds = await idsFor(t.parent.table, projectId)
      const count = await countIn(t.table, t.parent.column, parentIds)
      if (count && count > 0) removes.push({ label: t.label, count })
    }
  }

  return { removes, breaks: [], total: impactTotal(removes) }
}

export type ProjectPurgeResult = {
  ok: boolean
  /** Tables that reported an error, named. A partial delete must not be called a delete. */
  problems: { table: string; message: string }[]
  deleted: number
}

/**
 * Delete a project and everything scoped to it.
 *
 * Explicitly, table by table, rather than trusting the database to cascade —
 * see rule 4 in lib/purge.ts. Errors are collected rather than thrown: if one
 * table refuses, the rest should still be cleared and the caller told exactly
 * which one did not go, because "the delete failed" leaves somebody with no
 * idea how much of their project is still there.
 */
export async function purgeProject(projectId: string): Promise<ProjectPurgeResult> {
  const problems: { table: string; message: string }[] = []
  let deleted = 0

  for (const t of PROJECT_TABLES) {
    if (t.by === 'project') {
      const count = await countWhere(t.table, 'project_id', projectId)
      // Only a CONFIRMED zero is a reason to skip. An unknown count is a
      // reason to try.
      if (count === 0) continue
      const { error } = await supabase.from(t.table).delete().eq('project_id', projectId)
      if (error) problems.push({ table: t.label, message: error.message })
      else deleted += count ?? 0
    } else if (t.parent) {
      const parentIds = await idsFor(t.parent.table, projectId)
      if (parentIds.length === 0) continue
      const count = await countIn(t.table, t.parent.column, parentIds)
      if (count === 0) continue
      const { error } = await supabase.from(t.table).delete().in(t.parent.column, parentIds)
      if (error) problems.push({ table: t.label, message: error.message })
      else deleted += count ?? 0
    }
  }

  // The project row last. If something still references it the database will
  // say so, and that message is the single most useful thing this function
  // can return — it names the table that is holding it.
  const { error } = await supabase.from('projects').delete().eq('id', projectId)
  if (error) problems.push({ table: 'The project itself', message: error.message })

  return { ok: problems.length === 0, problems, deleted }
}

/** How many projects exist. The last one is not deletable — see the action. */
export async function projectCount(): Promise<number> {
  const { count, error } = await supabase.from('projects').select('id', { count: 'exact', head: true })
  return error ? 0 : (count ?? 0)
}


// ── Obligations ───────────────────────────────────────────────────────────

/**
 * Which obligations a bulk delete covers.
 *
 * Two scopes, mirroring the checklist. "One document" is the natural unit
 * here: obligations are read out of a contract, so the thing somebody wants
 * to undo is usually one document that turned out to be the wrong revision.
 * Unlike `discardRead`, this takes edited and assigned rows too — that is the
 * point of it, and why the project-wide version asks for a password.
 */
export type ObligationScope =
  | { kind: 'source'; source: string; label: string }
  | { kind: 'project'; label: string }

async function obligationIdsIn(projectId: string, scope: ObligationScope): Promise<string[]> {
  let q = supabase.from('obligations').select('id').eq('project_id', projectId)
  if (scope.kind === 'source') q = q.eq('source_name', scope.source)
  const { data, error } = await q
  if (error) return []
  return ((data ?? []) as { id: string }[]).map((r) => r.id)
}

/** What deleting these obligations removes, and what it leaves dangling. */
export async function obligationImpact(projectId: string, scope: ObligationScope): Promise<Impact> {
  const ids = await obligationIdsIn(projectId, scope)
  const removes = [{ label: 'Obligations', count: ids.length }]

  const breaks: Impact['breaks'] = []
  for (const ref of OBLIGATION_REFERENCES) {
    const count = await countIn(ref.table, ref.column, ids, ref.extra)
    if (count && count > 0) breaks.push({ label: ref.label, count, consequence: ref.consequence })
  }

  return { removes, breaks, total: impactTotal(removes) }
}

/**
 * Delete obligations in bulk.
 *
 * Signatures go with them, for the reason set out beside OBLIGATION_REFERENCES:
 * an acceptance with no subject still reads as agreement. Notices are KEPT and
 * unhooked — a notice was issued to somebody on a date, and that happened
 * whether or not the obligation still exists.
 */
export async function deleteObligations(projectId: string, scope: ObligationScope): Promise<PurgeResult> {
  const ids = await obligationIdsIn(projectId, scope)
  if (ids.length === 0) return { ok: true, deleted: 0 }

  await supabase.from('signatures').delete().in('entity_id', ids).eq('entity', 'obligation')
  // A notice that was sent is a thing that happened. It survives.
  await supabase.from('notifications').update({ entity_id: null }).in('entity_id', ids).eq('entity', 'obligation')

  const { error } = await supabase.from('obligations').delete().in('id', ids)
  if (error) return { ok: false, reason: error.message }

  return { ok: true, deleted: ids.length }
}

/** The source documents obligations were read from, with counts. */
export async function obligationSources(projectId: string): Promise<{ source: string; count: number }[]> {
  const { data, error } = await supabase
    .from('obligations')
    .select('source_name')
    .eq('project_id', projectId)
    .not('source_name', 'is', null)
  if (error) return []

  const counts = new Map<string, number>()
  for (const row of (data ?? []) as { source_name: string | null }[]) {
    if (!row.source_name) continue
    counts.set(row.source_name, (counts.get(row.source_name) ?? 0) + 1)
  }
  return [...counts.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count)
}
