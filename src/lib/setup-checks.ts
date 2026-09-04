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
  /** How to check it: a table, and the columns that step adds. */
  probe: { table: string; columns: string[] }
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
