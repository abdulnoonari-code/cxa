import { supabase } from '@/lib/supabase'

/**
 * Does this record belong to the project the caller is working in?
 *
 * ── The hole this closes, and why update 116 did not close it ────────────
 *
 * Update 116 put a gate on every page, every action and every route handler.
 * That gate answers one question:
 *
 *     "May this account use the application at all?"
 *
 * It does not answer, and was never able to answer:
 *
 *     "May this account touch THIS RECORD?"
 *
 * Roughly fifty actions took a record id straight out of the submitted form
 * and did `.eq('id', id)` with it. The id is whatever the caller typed. So
 * anybody on the team of any one project could, by posting a different id:
 *
 *   · rename any project on the database, and rewrite its client and dates
 *   · delete any tag, system, test record, punch item or gate on any job
 *   · forge a measured value, an instrument, a tested_by and a witness on
 *     somebody else's test record — which is signed commissioning evidence
 *   · confirm somebody else's readiness gate rules
 *   · PROMOTE THEMSELVES TO ADMIN ON ANOTHER PROJECT, by posting that
 *     project's project_members row id to updateMemberRole
 *   · purge another project entirely, since deleteProject re-checks the
 *     caller's password but never checks the project is theirs
 *
 * None of that needed a flaw in the gate. The gate was working. It was
 * answering a different question from the one that mattered.
 *
 * ── The second, quieter half ─────────────────────────────────────────────
 *
 * Several actions read `getCurrentProject()` and then wrote
 *
 *     if (project && !(await actorCan('manage', project.id))) return
 *
 * Read that carefully: with NO project selected, `project` is null, the
 * whole condition is false, and the function carries on to the unscoped
 * delete. The permission check was skipped by the absence of the thing it
 * was meant to check against. So the strongest position an attacker could
 * take was to select no project at all.
 *
 * `ownedBy` refuses a null project. That is not a detail — it is half the
 * fix.
 *
 * ── Why a lookup and not just .eq('project_id', …) ───────────────────────
 *
 * Adding `.eq('project_id', project.id)` to the mutation is better where it
 * fits: one query, atomic, no gap between checking and acting. It is used
 * as well as this, not instead of it, where the chain is simple.
 *
 * But it cannot be the whole answer:
 *
 *   · Six tables have no project_id at all — document_revisions, gate_rules,
 *     requirement_verifications and subsystems reach a project only through
 *     a parent row. The PARENTS map below knows that walk.
 *   · A silent `.eq` that matches nothing looks exactly like a successful
 *     delete of an already-deleted row. Every one of those fifty call sites
 *     would have failed silently and correctly, and none of them would have
 *     told anybody that somebody was trying.
 *   · One line that is either there or not is something an assertion can
 *     sweep for. A missing `.eq` in the middle of a query chain is not.
 *
 * ── How to use it ────────────────────────────────────────────────────────
 *
 *     const project = await getCurrentProject()
 *     const id = str(formData, 'id')
 *     await ownedBy(project, 'equipment', id)
 *     ...
 *
 * AFTER requireActor(), BEFORE the mutation, and before anything is read
 * back out of the row — a refusal that first tells you the record's title
 * has already told you it exists.
 *
 * ── Why it throws ────────────────────────────────────────────────────────
 *
 * Same reasoning as requireActor: a refusal returned as a value can be
 * ignored by a caller that does not check it, and these are the calls where
 * being ignored is the whole problem.
 *
 * The message is identical for "no project selected", "no id given" and
 * "that record is on another job". Which of the three it was is exactly
 * what somebody probing must not be able to learn by comparing replies.
 */

/** Tables that carry project_id and can be checked directly. */
const DIRECT = new Set([
  'areas', 'attachments', 'audit_log', 'check_templates', 'checklist_items',
  'components', 'controlled_documents', 'equipment', 'equipment_types', 'gates',
  'instruments', 'issue_photos', 'issues', 'itp_conventions', 'layout_cables',
  'layout_items', 'layouts', 'lifecycle_stages', 'meetings', 'milestones',
  'notifications', 'obligations', 'project_contacts', 'project_files',
  'project_members', 'project_roles', 'requirements', 'signatures', 'sites',
  'systems', 'tasks', 'test_records',
])

/**
 * Tables with no project_id, and the parent row that has one.
 *
 * Checked against schema.sql by an assertion, so a table that gains or
 * loses project_id later cannot leave a stale entry here.
 */
const PARENTS: Record<string, { via: string; parent: string }> = {
  document_revisions: { via: 'document_id', parent: 'controlled_documents' },
  gate_rules: { via: 'gate_id', parent: 'gates' },
  requirement_verifications: { via: 'requirement_id', parent: 'requirements' },
  subsystems: { via: 'system_id', parent: 'systems' },
}

export type OwnedTable = string

/** The one refusal, for all three reasons. */
function refuse(): never {
  throw new Error('That record is not on the project you are working in.')
}

/**
 * Throw unless `id` names a row of `table` that belongs to `project`.
 *
 * `projects` itself is not handled here: a project is not "on" a project.
 * Use mayOpenProject(verdict, id) from lib/gate.ts for that.
 */
export async function ownedBy(
  project: { id: string } | null | undefined,
  table: OwnedTable,
  id: string | null | undefined,
): Promise<void> {
  if (!project?.id) refuse()
  if (!id) refuse()

  if (DIRECT.has(table)) {
    const { data } = await supabase.from(table).select('id').eq('id', id).eq('project_id', project.id).maybeSingle()
    if (!data) refuse()
    return
  }

  const step = PARENTS[table]
  if (!step) {
    // An unknown table is refused rather than waved through. A table added
    // next year that nobody listed above must fail loudly the first time
    // somebody uses it, not quietly permit everything.
    throw new Error(`ownedBy: '${table}' is not a table this can scope. Add it to DIRECT or PARENTS in src/data/owned.ts.`)
  }

  const { data: row } = await supabase.from(table).select(step.via).eq('id', id).maybeSingle()
  const parentId = (row as Record<string, unknown> | null)?.[step.via]
  if (!parentId || typeof parentId !== 'string') refuse()
  await ownedBy(project, step.parent, parentId)
}

/**
 * The same, for a list — a bulk approve, a bulk delete.
 *
 * ALL of them or none. A partial success on a bulk action is worse than a
 * refusal: the caller is told it worked, and half of somebody else's job
 * has moved.
 */
export async function ownedAllBy(
  project: { id: string } | null | undefined,
  table: OwnedTable,
  ids: readonly (string | null | undefined)[],
): Promise<void> {
  if (!project?.id) refuse()
  const wanted = ids.filter((v): v is string => typeof v === 'string' && v.length > 0)
  if (wanted.length === 0) refuse()

  if (DIRECT.has(table)) {
    const { data } = await supabase.from(table).select('id').in('id', wanted).eq('project_id', project.id)
    if (!data || data.length !== wanted.length) refuse()
    return
  }
  for (const id of wanted) await ownedBy(project, table, id)
}

/** For the assertion suite, so the lists above can be checked against schema.sql. */
export const OWNED_TABLES = { DIRECT: [...DIRECT], PARENTS }
