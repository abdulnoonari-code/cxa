// Deleting things, and saying what goes with them.
//
// Two deletions were asked for: a whole checklist, and a whole project. Both
// are the kind of button that gets pressed once and regretted for a week, so
// the rules here are about what has to be true BEFORE anything is removed.
//
//   1. **Count first, delete second.** The screen says "this removes 214
//      checks, 31 attachments and 4 links from requirements" before anything
//      happens. A confirmation dialogue that does not say how much is about
//      to go is a dialogue everybody clicks through.
//
//   2. **Name what breaks, not just what goes.** A check can be cited by a
//      requirement as the thing that verifies it, referenced by a punch item
//      as the check that found the defect, and signed off. Deleting the check
//      does not delete those — it leaves them pointing at nothing. That is
//      worse than the deletion, because the records still look complete.
//
//   3. **Type the name.** For anything project-wide, the confirmation is the
//      project's own name typed out. Not a checkbox — a checkbox is one
//      click away from the button that caused the problem.
//
//   4. **Never assume the database cascades.** These tables carry a
//      `project_id` column; whether they carry a foreign key that cascades on
//      delete is not something this application can see. So every table is
//      cleared explicitly. If the database does cascade, the extra deletes
//      cost nothing and remove nothing that was not already gone.

/**
 * The project this application falls back to when every other one is deleted.
 *
 * Deleting the last project used to be refused, because every screen here is
 * scoped to a current project and an installation with none is one where
 * nothing works and nothing explains why. Refusing was the wrong answer to a
 * real problem: somebody clearing out trial projects wants a clean slate, not
 * a permanent reminder of the first thing they ever typed.
 *
 * So the floor is held from underneath instead. Delete the last project and a
 * fresh, empty one called "My Site" is created in its place and opened. The
 * application is never projectless, and nobody is stuck with a project they
 * no longer want.
 *
 * It lives here rather than beside the action that uses it because a
 * 'use server' file may only export async functions — a constant exported
 * from one is silently stripped, and anything importing it gets "the module
 * has no exports at all". That compiles and lints cleanly and fails at run
 * time, which is the worst of the three.
 */
export const FALLBACK_PROJECT_NAME = 'My Site'

/** What a deletion is about to do, worked out before it does it. */
export type Impact = {
  /** The rows that will be deleted, by what they are. */
  removes: { label: string; count: number }[]
  /** Rows that will SURVIVE but end up pointing at something deleted. */
  breaks: { label: string; count: number; consequence: string }[]
  /** Total rows to be deleted. */
  total: number
}

export function impactTotal(removes: { count: number }[]): number {
  return removes.reduce((n, r) => n + r.count, 0)
}

/**
 * Whether the typed confirmation matches.
 *
 * Trimmed and case-insensitive, because requiring somebody to reproduce
 * capitalisation exactly protects nothing and just makes them paste it — and
 * pasting is the one thing a typed confirmation is supposed to prevent.
 */
export function confirmationMatches(typed: string | null | undefined, expected: string): boolean {
  if (!typed) return false
  return typed.trim().toLowerCase() === expected.trim().toLowerCase()
}

/**
 * Every table a project's data lives in, in the order it must be cleared.
 *
 * Children before parents. Not because a foreign key demands it — it may not
 * — but because if the run fails partway, what is left behind should be the
 * parent rows, which are still findable and deletable through the interface.
 * Losing the parents first would leave orphans nothing can reach.
 *
 * `by` says how a table is scoped:
 *   'project'  — it has its own project_id column
 *   'parent'   — it is reached through ids collected from another table
 */
export type ScopedTable = {
  table: string
  label: string
  by: 'project' | 'parent'
  /** For 'parent': the table whose ids scope it, and the column holding them. */
  parent?: { table: string; column: string }
}

export const PROJECT_TABLES: ScopedTable[] = [
  // ── Things that hang off other things ──────────────────────────────────
  { table: 'issue_photos', label: 'Punch photographs', by: 'project' },
  { table: 'attachments', label: 'Evidence files', by: 'project' },
  { table: 'requirement_verifications', label: 'Requirement links', by: 'parent', parent: { table: 'requirements', column: 'requirement_id' } },
  { table: 'document_revisions', label: 'Document revisions', by: 'parent', parent: { table: 'controlled_documents', column: 'document_id' } },
  { table: 'gate_rules', label: 'Gate rules', by: 'parent', parent: { table: 'gates', column: 'gate_id' } },
  { table: 'signatures', label: 'Signatures', by: 'project' },
  { table: 'itp_conventions', label: 'ITP conventions', by: 'project' },

  // ── The registers ──────────────────────────────────────────────────────
  { table: 'issues', label: 'Punch items', by: 'project' },
  { table: 'checklist_items', label: 'Checks', by: 'project' },
  { table: 'test_records', label: 'Test records', by: 'project' },
  { table: 'requirements', label: 'Requirements', by: 'project' },
  { table: 'controlled_documents', label: 'Controlled documents', by: 'project' },
  { table: 'documents', label: 'Document reviews', by: 'project' },
  { table: 'gates', label: 'Readiness gates', by: 'project' },
  { table: 'obligations', label: 'Obligations', by: 'project' },
  { table: 'instruments', label: 'Test instruments', by: 'project' },
  { table: 'milestones', label: 'Milestones', by: 'project' },
  { table: 'tasks', label: 'Tasks', by: 'project' },
  { table: 'meetings', label: 'Meetings', by: 'project' },
  { table: 'notifications', label: 'Notices', by: 'project' },
  { table: 'project_files', label: 'Files', by: 'project' },
  { table: 'project_contacts', label: 'Contacts', by: 'project' },
  { table: 'project_roles', label: 'Roles', by: 'project' },
  { table: 'project_members', label: 'Team members', by: 'project' },

  // ── The asset tree, deepest first ──────────────────────────────────────
  { table: 'components', label: 'Components', by: 'project' },
  { table: 'equipment', label: 'Equipment', by: 'project' },
  { table: 'subsystems', label: 'Subsystems', by: 'project' },
  { table: 'systems', label: 'Systems', by: 'project' },
  { table: 'areas', label: 'Areas', by: 'project' },
  { table: 'sites', label: 'Sites', by: 'project' },

]

// ── What is NOT in that list, and why ────────────────────────────────────
//
// `audit_log` was in it, and that was wrong. The database refused, correctly:
//
//     ERROR: audit_log is append-only: entries cannot be changed or deleted
//
// A trigger enforces it. And since audit_log also had ON DELETE CASCADE to
// projects, deleting a project made the database try to delete its audit
// entries, the trigger refused, and the whole delete was rolled back. No
// project could be deleted at all — by this code or by the one-click button
// that came before it.
//
// The list entry itself carried the argument against including it: "until the
// moment the project row is removed, the audit trail is the only record that
// any of this existed". If that is true — and it is — then the moment the
// project row is removed is exactly when the trail becomes the ONLY record.
// Deleting it then is the one thing that must never happen.
//
// So the audit trail is not project data that gets cleared with a project. It
// is a record OF the project, and it outlives it. SQL part 24 removes the
// ownership link in the database; this list stops the application asking.
//
// `profiles` is absent for a different reason: it holds people, not projects.

/** Deliberately never deleted. Named so nobody quietly adds it back. */
export const NEVER_PURGED = [
  { table: 'audit_log', why: 'The audit trail is append-only and outlives the project it describes.' },
  { table: 'profiles', why: 'Holds people rather than project records.' },
]

/**
 * What refers to a checklist item without owning it.
 *
 * Deleting a check leaves each of these pointing at an id that is no longer
 * there. The application does not crash on that — every one of these reads
 * tolerates a missing row — but the record silently stops meaning what it
 * says, which is the failure mode this whole application exists to prevent.
 */
export type CheckReference = {
  table: string
  column: string
  /** Extra equality filters, where one column holds several kinds of thing. */
  extra?: Record<string, string>
  label: string
  consequence: string
}

export const CHECK_REFERENCES: CheckReference[] = [
  {
    table: 'requirement_verifications',
    column: 'activity_id',
    extra: { activity_kind: 'checklist_item' },
    label: 'requirement links',
    consequence: 'A requirement that named this check as its proof would be left claiming verification by a record that no longer exists.',
  },
  {
    table: 'issues',
    column: 'checklist_item_id',
    label: 'punch items',
    consequence: 'The punch item survives, but stops saying which check found the defect.',
  },
  {
    table: 'attachments',
    column: 'checklist_item_id',
    label: 'evidence files',
    consequence: 'The uploaded evidence stays in storage but is no longer reachable from any screen.',
  },
  {
    table: 'signatures',
    column: 'entity_id',
    extra: { entity: 'checklist_item' },
    label: 'signatures',
    consequence: 'A signature would be left against a check nobody can look up. A signature that cannot be traced to what was signed is not evidence of anything.',
  },
]

/** The sentence shown above a delete button, so the size of it is not a surprise. */
export function impactSentence(impact: Impact, what: string): string {
  if (impact.total === 0) return `There is nothing to delete — ${what} holds no records.`

  // The labels are written plural ("Checks", "Sites") because that is how they
  // read in a list. A count of one has to be singularised or the confirmation
  // says "1 sites", which is the kind of thing that makes somebody distrust
  // the number next to it.
  const parts = impact.removes
    .filter((r) => r.count > 0)
    .map((r) => {
      const label = r.label.toLowerCase()
      const one = label.endsWith('ies') ? `${label.slice(0, -3)}y` : label.endsWith('s') ? label.slice(0, -1) : label
      return `${r.count} ${r.count === 1 ? one : label}`
    })

  const removed = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return `This permanently deletes ${removed}. It cannot be undone.`
}

/** And the warning underneath it, when something is left pointing at nothing. */
export function breakageSentences(impact: Impact): string[] {
  return impact.breaks
    .filter((b) => b.count > 0)
    .map((b) => `${b.count} ${b.label} will be left referring to something that no longer exists. ${b.consequence}`)
}
