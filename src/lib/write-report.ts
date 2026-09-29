// Counting only what the database actually accepted.
//
// ── The bug this exists for ─────────────────────────────────────────────
//
// Three importers were written like this:
//
//     await supabase.from('equipment').insert(values)
//     inserted += 1
//
// The error is thrown away and the counter goes up regardless. So the
// banner says "1,842 tags added" whether the database wrote 1,842 rows,
// 400, or none — and on a real register there are always some it refuses:
// a duplicate tag differing only in case, a category outside the CHECK
// constraint, a column a SQL step has not added yet.
//
// THE COUNT IS THE ONE THING SOMEBODY CHECKS. It is how you find out the
// import worked. A count that is always right-looking is worse than no
// count, because it is the thing people trust instead of counting.
//
// ── What this does instead ──────────────────────────────────────────────
//
// `done` goes up only on success. Every refusal is kept with its row
// number and the database's own words. The sentence at the end says both
// numbers, and says the failures FIRST when there are any — a success
// count read before a failure count is a success count somebody stops
// reading after.
//
// Identical messages are grouped. A batch of four hundred rows refused
// for one reason is one line saying four hundred, not four hundred lines.

export type WriteFailure = {
  /** The row in the sheet, where the write came from one. */
  row: number | null
  /** What was being written — a tag, a system name. */
  label: string
  /** The database's own words, not a paraphrase. */
  message: string
}

export type Tally = {
  done: number
  failed: WriteFailure[]
}

export const newTally = (): Tally => ({ done: 0, failed: [] })

/**
 * Record one write. Returns true when it landed.
 *
 * Takes the error object Supabase returns — null or undefined meaning it
 * worked. The return value is there so a caller can skip follow-up work
 * that depended on the row existing.
 */
export function record(
  tally: Tally,
  error: { message?: string } | null | undefined,
  what: { label: string; row?: number | null },
): boolean {
  if (!error) {
    tally.done += 1
    return true
  }
  tally.failed.push({
    row: what.row ?? null,
    label: what.label,
    message: (error.message ?? '').trim() || 'The database refused it and gave no reason.',
  })
  return false
}

/** Record a whole batch that succeeded or failed as one statement. */
export function recordBatch(
  tally: Tally,
  error: { message?: string } | null | undefined,
  rows: { label: string; row?: number | null }[],
): boolean {
  if (!error) {
    tally.done += rows.length
    return true
  }
  for (const r of rows) {
    tally.failed.push({
      row: r.row ?? null,
      label: r.label,
      message: (error.message ?? '').trim() || 'The database refused it and gave no reason.',
    })
  }
  return false
}

export const anyFailed = (t: Tally): boolean => t.failed.length > 0

/**
 * The headline. Failures first when there are any.
 *
 *   "412 tags added."
 *   "3 tags could not be written — 409 added."
 */
export function tallySentence(tally: Tally, noun: string, verb = 'added'): string {
  const plural = (n: number) => (n === 1 ? noun : `${noun}s`)
  if (tally.failed.length === 0) {
    return `${tally.done} ${plural(tally.done)} ${verb}.`
  }
  return `${tally.failed.length} ${plural(tally.failed.length)} could not be written — ${tally.done} ${verb}.`
}

/**
 * One line per DISTINCT reason, with the rows it happened on.
 *
 * Four hundred rows refused for one reason is one line saying four
 * hundred. The alternative is four hundred lines, which is a wall
 * nobody reads, and the one different reason hiding in the middle of it
 * is the one that mattered.
 */
export function failureLines(tally: Tally, limit = 10): string[] {
  const byMessage = new Map<string, WriteFailure[]>()
  for (const f of tally.failed) {
    const list = byMessage.get(f.message)
    if (list) list.push(f)
    else byMessage.set(f.message, [f])
  }

  const lines: string[] = []
  for (const [message, group] of byMessage) {
    if (lines.length >= limit) {
      lines.push(`…and ${byMessage.size - limit} more kinds of refusal.`)
      break
    }
    const rows = group.map((g) => g.row).filter((r): r is number => r !== null)
    const where =
      rows.length === 0
        ? group.slice(0, 3).map((g) => g.label).join(', ')
        : rows.length <= 5
          ? `row${rows.length === 1 ? '' : 's'} ${rows.join(', ')}`
          : `${rows.length} rows, first at ${rows[0]}`
    lines.push(`${group.length === 1 ? '' : `${group.length}× `}${where}: ${message}`)
  }
  return lines
}
