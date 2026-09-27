// When will this level actually be finished?
//
// ── What this is for ────────────────────────────────────────────────────
//
// A programme says a level finishes on a date because somebody typed that
// date. A percentage complete in a planning tool says 80% because a
// supervisor was asked and said "about eighty".
//
// This application knows something neither of those does: how many checks
// have actually been signed, and WHEN each one was signed. From that you
// can answer the only question anybody on a job really asks —
//
//     at the rate this is actually going, when is it done?
//
// — with a number nobody had to be asked for.
//
// ── The honesty rules, which are most of this file ──────────────────────
//
// A forecast is a claim about the future and it is very easy to make one
// that is confident and wrong. Three things are refused outright rather
// than guessed:
//
//   1. NO RATE, NO DATE. If nothing has been signed in the window, the
//      answer is "nothing has moved in 14 days", not a date computed from
//      a rate of zero, which is infinity, which would render as some
//      absurd year.
//
//   2. A BULK IMPORT IS NOT A RATE. Somebody imports four hundred checks
//      from a spreadsheet and every one of them gets the same timestamp.
//      Measured naively that is a rate of four hundred a day and a
//      forecast of "finished tomorrow". So when most of a window's
//      progress lands on a single day, this says so and declines to
//      forecast from it.
//
//   3. ONE DAY IS NOT A TREND. Below a floor of completed items there is
//      not enough to extrapolate from, and saying so is more useful than
//      a date with an implied precision it has not earned.
//
// ── What the timestamps actually mean ───────────────────────────────────
//
// `updated_at` is when the row was last written, not when the check was
// passed. Those are the same thing for a check that was filled in once and
// left alone, which is most of them, and different for one that was
// corrected afterwards. There is no "passed_at" column to use instead.
//
// This matters and it is stated on the screen rather than buried here: it
// is a rate of checks BEING WORKED ON, which is close enough to a rate of
// progress to plan around and not the same thing.

/** One completed check, reduced to the only thing the arithmetic needs. */
export type Completion = { at: Date }

export type ForecastInput = {
  /** Every check at this level, however many. */
  total: number
  /** How many are finished — passed, or not applicable. */
  done: number
  /** When each of the finished ones was last written. */
  completions: Completion[]
  /** How far back to look. */
  windowDays: number
  now: Date
}

export type Forecast =
  | { state: 'none'; reason: 'no checks' }
  | { state: 'complete' }
  | { state: 'no-rate'; reason: 'nothing signed in the window'; windowDays: number }
  | { state: 'too-few'; reason: 'not enough to extrapolate from'; completed: number }
  | { state: 'bulk'; reason: 'one bulk update, not a rate'; onBusiestDay: number; inWindow: number }
  | {
      state: 'ok'
      /** Checks per calendar day, over the window. */
      perDay: number
      remaining: number
      /** Calendar days from `now` until the last check is done. */
      days: number
      finishes: Date
    }

/** Below this many completions in the window, there is no trend to read. */
const MIN_COMPLETIONS = 3

/**
 * If this share of the window's progress lands on one day, it is an import
 * or a batch sign-off, not a rate.
 *
 * 0.8 rather than 1.0 because a bulk import is rarely the only thing that
 * happened that fortnight — a few checks get filled in by hand around it,
 * and those must not launder the import into a credible rate.
 */
const BULK_SHARE = 0.8

const DAY = 86_400_000

export function forecast(input: ForecastInput): Forecast {
  const { total, done, completions, windowDays, now } = input
  if (total <= 0) return { state: 'none', reason: 'no checks' }

  const remaining = total - done
  if (remaining <= 0) return { state: 'complete' }

  const from = new Date(now.getTime() - windowDays * DAY)
  const inWindow = completions.filter((c) => c.at > from && c.at <= now)

  if (inWindow.length === 0) {
    return { state: 'no-rate', reason: 'nothing signed in the window', windowDays }
  }
  if (inWindow.length < MIN_COMPLETIONS) {
    return { state: 'too-few', reason: 'not enough to extrapolate from', completed: inWindow.length }
  }

  // How many fell on the busiest single day?
  const byDay = new Map<string, number>()
  for (const c of inWindow) {
    const key = c.at.toISOString().slice(0, 10)
    byDay.set(key, (byDay.get(key) ?? 0) + 1)
  }
  const busiest = Math.max(...byDay.values())
  if (busiest / inWindow.length >= BULK_SHARE && byDay.size < windowDays / 2) {
    return { state: 'bulk', reason: 'one bulk update, not a rate', onBusiestDay: busiest, inWindow: inWindow.length }
  }

  const perDay = inWindow.length / windowDays
  const days = Math.ceil(remaining / perDay)
  return {
    state: 'ok',
    perDay,
    remaining,
    days,
    finishes: new Date(now.getTime() + days * DAY),
  }
}

/**
 * How that reads against a date somebody has promised.
 *
 * Positive is late. Returns null when there is no forecast or no promise —
 * "unknown" and "on time" must not look the same.
 */
export function against(f: Forecast, promised: Date | null | undefined): number | null {
  if (!promised || f.state !== 'ok') return null
  return Math.round((f.finishes.getTime() - promised.getTime()) / DAY)
}

/** One line of plain English. Used on the screen and in the daily report. */
export function forecastLine(f: Forecast): string {
  switch (f.state) {
    case 'none':
      return 'No checks at this level yet.'
    case 'complete':
      return 'Every check at this level is finished.'
    case 'no-rate':
      return `Nothing signed in ${f.windowDays} days, so there is no rate to work from.`
    case 'too-few':
      return `Only ${f.completed} signed in the window — too few to read a rate from.`
    case 'bulk':
      return `${f.onBusiestDay} of ${f.inWindow} were written on one day. That is an import or a batch sign-off, not a rate of work.`
    case 'ok': {
      const rate = f.perDay >= 1 ? `${f.perDay.toFixed(1)} a day` : `${(f.perDay * 7).toFixed(1)} a week`
      return `${f.remaining} left at ${rate}.`
    }
  }
}
