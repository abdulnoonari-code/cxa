// The five commissioning levels, side by side, in tasks and in defects.
//
// ── What this screen is for ──────────────────────────────────────────────
//
// The punch list answers "what is wrong". The task list answers "who owes
// what". Neither answers the question a commissioning manager actually
// arrives with, which is "which LEVEL is holding us up" — because a job
// does not run out of tasks, it runs out of levels: L3 has to be clean
// before anything is energised, L4 before anything is integrated, and one
// unclosed L4 defect stops L5 whatever the overall percentages say.
//
// ── The four rules, and why each one is here ─────────────────────────────
//
// 1. EVERY LEVEL IS ALWAYS SHOWN, INCLUDING THE EMPTY ONES.
//    A level with nothing against it is not an absence of information, it
//    is information: nobody has raised an L4 defect because nobody has
//    started L4. Dropping empty rows makes an untouched level and a
//    finished level look identical — a blank space in both cases.
//
// 2. "NO LEVEL" IS SHOWN ONLY WHEN SOMETHING IS IN IT, AND IS FLAGGED.
//    An item with no level is invisible to every level filter on the
//    system. It is not a sixth level; it is a fault in the data, and the
//    row says so rather than quietly sitting at the bottom of the table.
//
// 3. A PERCENTAGE IS NEVER SHOWN FOR AN EMPTY LEVEL.
//    Zero of zero is not zero percent and it is not a hundred either. The
//    application has been bitten by this before — a half-finished bar that
//    read as complete — so `percent` is null where there is nothing to
//    take a percentage of, and the screen prints a dash.
//
// 4. THE SAME RECORD IS COUNTED THE SAME WAY EVERYWHERE.
//    Open, overdue and closed are decided here, once, from the same status
//    vocabularies the punch list and the task list use. Two screens that
//    disagree about how many L3 items are open are worse than one screen.
//
// Pure: no database, and today is passed in rather than read from the
// clock, so a test can ask what this said last April.

import { LEVELS } from '@/lib/checklist'
import { levelTone, levelCode, type LevelTone } from '@/lib/levels'

/** Just enough of a task row to count it. */
export type TaskLike = {
  level: string | null
  status: string | null
  due_date: string | null
}

/** Just enough of a punch item to count it. */
export type IssueLike = {
  level: string | null
  status: string | null
  severity: string | null
  due_date: string | null
}

/** The key used for anything that has no level recorded. */
export const NO_LEVEL = 'none'

/**
 * A punch item is finished when it has been closed AND, where the process
 * demands it, verified. Both count as "not open" — the distinction between
 * them is shown as its own column rather than folded into one number,
 * because "closed by the contractor" and "verified by the commissioning
 * agent" are different claims and only the second one ends the argument.
 */
const ISSUE_DONE = new Set(['closed', 'verified'])
const ISSUE_VERIFIED = new Set(['verified'])
const TASK_DONE = new Set(['done', 'complete', 'completed', 'closed'])
const TASK_BLOCKED = new Set(['blocked'])
/** Severities that stop a level rather than merely annoy it. */
const SEVERE = new Set(['critical', 'high', 'a', 'major'])

function past(due: string | null, today: string): boolean {
  if (!due) return false
  // String comparison is correct and total for yyyy-mm-dd, and it does not
  // drag a timezone into a question that has none.
  return due.slice(0, 10) < today.slice(0, 10)
}

export type Counts = {
  total: number
  open: number
  overdue: number
  done: number
  /** Extra column that means something different for each kind. */
  flagged: number
  /** null where there is nothing to take a percentage of — see rule 3. */
  percent: number | null
}

const EMPTY: Counts = { total: 0, open: 0, overdue: 0, done: 0, flagged: 0, percent: null }

export type LevelRow = {
  key: string
  /** 'L3', or 'No level'. */
  code: string
  /** The full name, for the row heading and the hover. */
  label: string
  tone: LevelTone
  /** True for the row that collects everything with no level recorded. */
  orphan: boolean
  tasks: Counts
  issues: Counts
  /** Nothing recorded against this level at all. */
  untouched: boolean
  /** The single most useful sentence about this level. */
  verdict: string
}

export type LevelSummary = {
  rows: LevelRow[]
  totals: { tasks: Counts; issues: Counts }
  /** True when there is not one task and not one issue on the project. */
  empty: boolean
  /** How many records carry no level. Zero is the good answer. */
  unlevelled: number
  today: string
  note: string
}

function countTasks(rows: TaskLike[], today: string): Counts {
  const total = rows.length
  if (total === 0) return { ...EMPTY }
  const done = rows.filter((t) => TASK_DONE.has((t.status ?? '').toLowerCase())).length
  const open = total - done
  const overdue = rows.filter((t) => !TASK_DONE.has((t.status ?? '').toLowerCase()) && past(t.due_date, today)).length
  const flagged = rows.filter((t) => TASK_BLOCKED.has((t.status ?? '').toLowerCase())).length
  return { total, open, overdue, done, flagged, percent: Math.round((done / total) * 100) }
}

function countIssues(rows: IssueLike[], today: string): Counts {
  const total = rows.length
  if (total === 0) return { ...EMPTY }
  const done = rows.filter((i) => ISSUE_DONE.has((i.status ?? '').toLowerCase())).length
  const open = total - done
  const overdue = rows.filter((i) => !ISSUE_DONE.has((i.status ?? '').toLowerCase()) && past(i.due_date, today)).length
  // Severe AND still open. A closed critical defect is history; an open one
  // is the reason the level is not finished, and only the second is worth a
  // column on a summary.
  const flagged = rows.filter(
    (i) => !ISSUE_DONE.has((i.status ?? '').toLowerCase()) && SEVERE.has((i.severity ?? '').toLowerCase())
  ).length
  return { total, open, overdue, done, flagged, percent: Math.round((done / total) * 100) }
}

/** How many of these were signed off by somebody other than the closer. */
export function verifiedCount(rows: IssueLike[]): number {
  return rows.filter((i) => ISSUE_VERIFIED.has((i.status ?? '').toLowerCase())).length
}

/**
 * The sentence for one level. Ordered worst first, because the reason to
 * read a summary is to find the thing that needs doing, not to be told
 * again that everything else is fine.
 */
export function levelVerdict(row: {
  code: string
  orphan: boolean
  untouched: boolean
  tasks: Counts
  issues: Counts
}): string {
  if (row.orphan) {
    return `${row.tasks.total + row.issues.total} record${
      row.tasks.total + row.issues.total === 1 ? '' : 's'
    } with no level set — invisible to every level filter on the system. Open each one and give it a level.`
  }
  if (row.untouched) return 'Nothing recorded at this level yet.'
  if (row.issues.flagged > 0)
    return `${row.issues.flagged} serious defect${row.issues.flagged === 1 ? '' : 's'} still open. This level is not finished.`
  if (row.issues.overdue > 0 || row.tasks.overdue > 0) {
    const n = row.issues.overdue + row.tasks.overdue
    return `${n} item${n === 1 ? ' is' : 's are'} past the date and not closed.`
  }
  if (row.tasks.flagged > 0)
    return `${row.tasks.flagged} task${row.tasks.flagged === 1 ? ' is' : 's are'} blocked and waiting on somebody.`
  if (row.issues.open > 0 || row.tasks.open > 0) {
    const n = row.issues.open + row.tasks.open
    return `${n} item${n === 1 ? '' : 's'} still open, none of them late.`
  }
  return 'Everything raised at this level is closed out.'
}

export function buildLevelSummary(tasks: TaskLike[], issues: IssueLike[], today: string): LevelSummary {
  const keys = [...LEVELS.map((l) => l.value), NO_LEVEL]
  const bucket = (v: string | null) => (v && LEVELS.some((l) => l.value === v) ? v : NO_LEVEL)

  const rows: LevelRow[] = []
  for (const key of keys) {
    const orphan = key === NO_LEVEL
    const t = tasks.filter((x) => bucket(x.level) === key)
    const i = issues.filter((x) => bucket(x.level) === key)

    // Rule 2: the orphan row is not a level, so it is only shown when
    // something has actually fallen into it.
    if (orphan && t.length === 0 && i.length === 0) continue

    const counts = { tasks: countTasks(t, today), issues: countIssues(i, today) }
    const untouched = !orphan && t.length === 0 && i.length === 0
    const code = orphan ? 'No level' : levelCode(key)
    rows.push({
      key,
      code,
      label: orphan ? 'No level recorded' : LEVELS.find((l) => l.value === key)?.label ?? key,
      tone: levelTone(orphan ? null : key),
      orphan,
      untouched,
      ...counts,
      verdict: levelVerdict({ code, orphan, untouched, ...counts }),
    })
  }

  const totals = { tasks: countTasks(tasks, today), issues: countIssues(issues, today) }
  const unlevelled =
    tasks.filter((t) => bucket(t.level) === NO_LEVEL).length + issues.filter((i) => bucket(i.level) === NO_LEVEL).length

  return {
    rows,
    totals,
    empty: tasks.length === 0 && issues.length === 0,
    unlevelled,
    today,
    note: summaryNote(totals, unlevelled, tasks.length + issues.length),
  }
}

export function summaryNote(
  totals: { tasks: Counts; issues: Counts },
  unlevelled: number,
  all: number
): string {
  if (all === 0)
    return 'No tasks and no punch items on this project yet. Raise a defect from a failed check, or add a task, and the levels fill in here.'

  const parts: string[] = [
    `${totals.issues.total} punch item${totals.issues.total === 1 ? '' : 's'} and ${totals.tasks.total} task${
      totals.tasks.total === 1 ? '' : 's'
    }`,
  ]
  const openTotal = totals.issues.open + totals.tasks.open
  parts.push(`${openTotal} still open`)
  const lateTotal = totals.issues.overdue + totals.tasks.overdue
  if (lateTotal > 0) parts.push(`${lateTotal} past the date`)
  if (totals.issues.flagged > 0) parts.push(`${totals.issues.flagged} serious and unclosed`)
  if (unlevelled > 0)
    parts.push(
      `${unlevelled} with NO level set — those are invisible to every level filter, so they are the first thing to fix`
    )
  return parts.join(' · ')
}
