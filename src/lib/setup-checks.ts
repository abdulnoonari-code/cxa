// What has actually been set up, asked rather than assumed.
//
// Twenty-nine SQL files have been run against this database over several
// weeks, by hand, from a chat window, on a phone as often as not. Some were
// run twice, one was run before the code that needed it, and at least one was
// almost certainly skipped. Nothing records which — Supabase does not keep a
// migration history when the migrations are pasted into an editor.
//
// The consequence is not theoretical. A page that selects a column which does
// not exist gets an error back from PostgREST, and the honest thing most code
// does with that error is show an empty list. So a missing column looks
// exactly like a project with nothing in it, and the person looking at the
// screen has no way to tell the difference.
//
// This asks the database directly, one small query per step. Each step names
// the file to run if it is not there, and nothing here can break anything —
// every probe is a SELECT with a limit of one.
//
// ── Why it is not a checklist somebody ticks ────────────────────────────
//
// Because a tick says what somebody believed at the time. This page is right
// every time it is opened, including the day somebody restores a backup from
// before part 26 and cannot work out why the document panel went quiet.

export type SetupStep = {
  id: string
  /** The SQL file, or the setting. */
  source: string
  title: string
  /** What stops working without it, in the words of somebody using the app. */
  matters: string
  /**
   * How to check it.
   *
   * Usually a table and the columns that step adds. Step 38 is different:
   * it does not add a column, it closes the file store, so the only honest
   * check is to ask the bucket whether it is still public. A step whose
   * effect cannot be probed should not be on this list at all — a row that
   * always says "in place" is worse than no row.
   */
  probe: { table: string; columns: string[] } | { bucket: string; mustBePrivate: boolean }
}

/** Which kind of probe this is. */
export function isBucketProbe(
  probe: SetupStep['probe']
): probe is { bucket: string; mustBePrivate: boolean } {
  return 'bucket' in probe
}

export const SETUP_STEPS: SetupStep[] = [
  {
    id: 'part20',
    source: 'week5-part20-itp.sql',
    title: 'Inspection & Test Plan',
    matters: 'Hold and witness points, and which party holds each one. Without it the ITP screen has nothing to write to.',
    probe: { table: 'checklist_items', columns: ['point_party'] },
  },
  {
    id: 'part21',
    source: 'week5-part21-photos.sql',
    title: 'Punch photographs',
    matters:
      'Photographs against defects. Without it a photograph appears to upload and is then never seen again — which is exactly what happened before this was found.',
    probe: { table: 'issue_photos', columns: ['id'] },
  },
  {
    id: 'part22',
    source: 'week5-part22-defect-review.sql',
    title: 'AI reading of defects',
    matters: 'The technical assessment panel on a punch item. Needs an API key as well as this.',
    probe: { table: 'issues', columns: ['ai_problem', 'ai_recommendation'] },
  },
  {
    id: 'part25',
    source: 'week5-part25-ai-obligations-documents.sql',
    title: 'AI reading of obligations and documents',
    matters: 'The assessment panels on an obligation and on an uploaded document. Needs an API key as well.',
    probe: { table: 'obligations', columns: ['ai_discharge', 'ai_standing'] },
  },
  {
    id: 'part26',
    source: 'week5-part26-rules-and-standards.sql',
    title: 'Document rule checks and standards',
    matters:
      'The free checks on an uploaded document — whether it mentions the tag it is filed against, and which standards it cites. No key needed.',
    probe: { table: 'attachments', columns: ['rules_run_at', 'rules_verdict', 'rules_citations'] },
  },
  {
    id: 'part28',
    source: 'week5-part28-test-scripts.sql',
    title: 'Test scripts — structure',
    matters: 'Sections, answer types and the reference that stops a re-imported script doubling the register.',
    probe: { table: 'checklist_items', columns: ['section_path', 'answer_type', 'source_ref', 'source_line'] },
  },
  {
    id: 'part29',
    source: 'week5-part29-script-columns.sql',
    title: 'Test scripts — number, evidence and links',
    matters:
      'The serial number, the Attachment column and the Links to column. Without it the script importer refuses the file and the checklist screen cannot show what a check is connected to.',
    probe: { table: 'checklist_items', columns: ['serial_no', 'evidence_ref', 'links_to'] },
  },
  {
    id: 'part30',
    source: 'week5-part30-check-library.sql',
    title: 'Check library',
    matters:
      'One definition applied to many tags. Without it the Check Library screen says it is not installed, and nothing else is affected.',
    probe: { table: 'check_templates', columns: ['id', 'title', 'level'] },
  },
  {
    id: 'part31',
    source: 'week5-part31-floors.sql',
    title: 'Which floor equipment is on',
    matters:
      'The storey a tag sits on — B, G, L1, L10, R. Without it the Floor column in an equipment spreadsheet is read and then thrown away.',
    probe: { table: 'equipment', columns: ['floor'] },
  },
  {
    id: 'part32',
    source: 'week5-part32-building-critical-disciplines.sql',
    title: 'Building, criticality and disciplines',
    matters:
      'Which building a tag is in, whether it is critical, and the wider discipline list — Civil, Architectural, Plumbing, ELV. Without it those columns are read from your spreadsheet and thrown away, and Civil or ELV are refused by the database.',
    probe: { table: 'equipment', columns: ['building', 'critical'] },
  },
  {
    id: 'part33',
    source: 'week5-part33-system-place.sql',
    title: 'Where a system is',
    matters:
      'Which building and floor a SYSTEM is on, in its own right — a board is on basement 1 whether or not a single tag has been loaded against it. Without it the Building and Floor columns in a systems spreadsheet are read and then thrown away.',
    probe: { table: 'systems', columns: ['building', 'floor'] },
  },
  {
    id: 'part34',
    source: 'week5-part34-components.sql',
    title: 'Components — the tags inside a tag',
    matters:
      'The breaker inside the board, the CT, the PQM. Without it the "Part of tag" column in an equipment spreadsheet has nowhere to go, and a file that uses it is refused rather than half imported.',
    probe: { table: 'components', columns: ['id', 'equipment_id', 'tag_id'] },
  },
  {
    id: 'part35',
    source: 'week5-part35-equipment-types.sql',
    title: 'Equipment types — the catalogue',
    matters:
      'Makes and models, so forty identical breakers are forty tags and one type carrying the rating, the manual and the spec. Without it the Equipment Types screen says it is not installed, and a Type column in a tag spreadsheet is read and then thrown away.',
    probe: { table: 'equipment_types', columns: ['id', 'type_code'] },
  },
  {
    id: 'part36',
    source: 'week5-part36-task-levels.sql',
    title: 'Task levels',
    matters:
      'Which commissioning level a task belongs to. Without it every task lands in the "No level recorded" row on the Level Summary, so the screen can tell you about defects at L3 and nothing at all about the work somebody was asked to do about them.',
    probe: { table: 'tasks', columns: ['level'] },
  },
  {
    id: 'part37',
    source: 'week5-part37-project-config.sql',
    title: 'Project configuration',
    matters:
      'Which levels and disciplines this job actually commissions, and the standards it is commissioned against. Without it the Configuration screen cannot save anything, and every project is scored against all five levels whether it runs them or not.',
    probe: { table: 'projects', columns: ['config'] },
  },
  {
    id: 'part38',
    source: 'week5-part38-private-files.sql',
    title: 'The file store is closed',
    matters:
      'THIS IS THE ONE THAT MATTERS MOST. Until it is run, every photograph and every document in this project can be opened by anybody holding the link — no sign-in, no cookie, nothing. A link forwarded in an email or sitting in a browser history is a working key to that file for the whole internet.',
    probe: { bucket: 'documents', mustBePrivate: true },
  },
]

/**
 * SQL files that ship with the application and deliberately have no row
 * on the Setup page, each with the reason.
 *
 * This list exists because the alternative is silence. A file sitting in
 * the repository with nothing anywhere explaining why it is not on the
 * checklist is indistinguishable from one somebody forgot to add — which
 * is exactly what happened to steps 36, 37 and 38, and step 38 was the one
 * that leaves every photograph open to the internet.
 *
 * An assertion reads the repository and fails if a SQL file is neither a
 * step above nor named here, so a new file cannot go unaccounted for.
 */
export const NOT_PROBED: { source: string; why: string }[] = [
  {
    source: 'week5-part23-fix-rls.sql',
    why: 'Superseded by part 27, which switched row level security on for every table. Whatever this set, part 27 decides now.',
  },
  {
    source: 'week5-part24-audit-outlives-project.sql',
    why: 'Changes a trigger so the audit trail survives a deleted project. There is no column to look for — the effect only shows the day somebody deletes a project.',
  },
  {
    source: 'week5-part27-lock-the-database.sql',
    why: 'Checked by the "Who can reach the data" panel above, which asks the browser key directly instead of looking for a column. A better check than this list could make.',
  },
  {
    source: 'week5-part27-ROLLBACK.sql',
    why: 'An undo, not a step. It reopens the database to the browser key and must never appear as something to run.',
  },
]

export type StepResult = {
  step: SetupStep
  state: 'in place' | 'missing' | 'unknown'
  /** The database's own words, when it said anything. */
  detail: string | null
}

/**
 * Read a PostgREST error and decide what it means.
 *
 * A missing column and a missing table both come back as errors, and both
 * mean "run the file". Anything else — a network failure, a permission
 * problem, RLS with no policy — must NOT read as missing, because telling
 * somebody to run a SQL file they have already run is how they lose an hour.
 */
export function readProbeError(message: string, code: string | null): 'missing' | 'unknown' {
  const m = message.toLowerCase()
  // 42703 undefined_column · 42P01 undefined_table · PGRST204 unknown column
  if (code === '42703' || code === '42P01' || code === 'PGRST204' || code === 'PGRST205') return 'missing'
  if (m.includes('does not exist') || m.includes('could not find') || m.includes('unknown column')) return 'missing'
  return 'unknown'
}

export function countStates(results: StepResult[]): { ok: number; missing: number; unknown: number } {
  return {
    ok: results.filter((r) => r.state === 'in place').length,
    missing: results.filter((r) => r.state === 'missing').length,
    unknown: results.filter((r) => r.state === 'unknown').length,
  }
}

export function setupHeadline(results: StepResult[]): string {
  const n = countStates(results)
  if (n.missing > 0)
    return `${n.missing} SQL file${n.missing === 1 ? '' : 's'} still ${n.missing === 1 ? 'needs' : 'need'} running`
  if (n.unknown > 0) return `${n.unknown} could not be checked`
  return 'Every SQL step is in place'
}
