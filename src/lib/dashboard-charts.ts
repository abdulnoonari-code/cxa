// Turning the registers into the three shapes the dashboard charts read.
//
// Kept apart from the drawing so both halves can be checked: these are plain
// functions over plain arrays, and every one of them is asserted against
// hand-worked numbers. A chart that is drawn beautifully from the wrong
// figures is worse than no chart, because it is believed.

import { LEVELS } from '@/lib/checklist'
import { CATEGORIES } from '@/lib/issues'
import type { BarRow, TrendPoint } from '@/components/charts'
import type { CheckInput, PunchInput } from '@/lib/site-rules'

const SETTLED = new Set(['verified', 'closed'])

/** Passed / not started / failed, per commissioning level. */
export function levelProgress(checks: CheckInput[]): BarRow[] {
  return LEVELS.map((l) => {
    const mine = checks.filter((c) => c.level === l.value)
    const done = mine.filter((c) => c.status === 'pass' || c.status === 'na').length
    const failed = mine.filter((c) => c.status === 'fail').length
    return {
      label: l.label.split('—')[0].trim(),
      sublabel: l.label.split('—')[1]?.trim(),
      values: { done, failed, pending: mine.length - done - failed },
    }
  })
}

/**
 * Punch items by category.
 *
 * Uncategorised is shown as its own row rather than folded into C or left
 * out. An item nobody has categorised is not a Category C item — it is an
 * item whose commercial position has not been decided, and the row makes
 * that visible instead of quietly filing it under "blocks nothing".
 */
export function punchByCategory(items: PunchInput[]): BarRow[] {
  const rows = CATEGORIES.map((c) => ({ value: c.value as string | null, label: `Category ${c.value}` }))
  rows.push({ value: null, label: 'Uncategorised' })

  return rows.map((r) => {
    const mine = items.filter((i) =>
      r.value === null ? !i.category || !CATEGORIES.some((c) => c.value === i.category) : i.category === r.value
    )
    return {
      label: r.label,
      values: {
        open: mine.filter((i) => !SETTLED.has(i.status ?? 'open') && i.status !== 'ready_for_retest').length,
        awaiting: mine.filter((i) => i.status === 'ready_for_retest').length,
        closed: mine.filter((i) => SETTLED.has(i.status ?? 'open')).length,
      },
    }
  })
}

function weekEnd(d: Date): Date {
  // Sunday-ending weeks, at the very end of the day, so an item raised on the
  // last day of a week counts in that week rather than the next one.
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
  out.setDate(out.getDate() + (7 - out.getDay()) % 7)
  return out
}

const SHORT_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Cumulative defects raised against defects closed, by week.
 *
 * The gap between the two lines is the open count, so a widening gap is a
 * project falling behind and a narrowing one is a project catching up. That
 * is the question; the weekly count is not.
 */
export function punchTrend(items: PunchInput[], today: Date, weeks = 12): TrendPoint[] {
  const ends: Date[] = []
  const last = weekEnd(today)
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(last)
    d.setDate(d.getDate() - i * 7)
    ends.push(d)
  }

  const at = (value: string | null | undefined): number | null => {
    if (!value) return null
    const t = new Date(value).getTime()
    return Number.isNaN(t) ? null : t
  }

  return ends.map((end) => {
    const cut = end.getTime()
    const raised = items.filter((i) => {
      const t = at(i.created_at)
      return t !== null && t <= cut
    }).length
    const closed = items.filter((i) => {
      const t = at(i.closed_at)
      return t !== null && t <= cut && SETTLED.has(i.status ?? 'open')
    }).length
    return { label: `${end.getDate()} ${SHORT_MONTH[end.getMonth()]}`, raised, closed }
  })
}

/** The sentence under the trend chart, which says what the picture means. */
export function trendReading(points: TrendPoint[]): string {
  if (points.length < 2) return 'Not enough history yet to show a direction.'
  const first = points[0]
  const last = points[points.length - 1]
  const gapNow = Number(last.raised) - Number(last.closed)
  const gapThen = Number(first.raised) - Number(first.closed)

  if (Number(last.raised) === 0) return 'No defects have been raised yet.'
  if (gapNow === 0) return 'Every defect raised has been closed.'
  if (gapNow > gapThen) {
    return `${gapNow} defects are open, up from ${gapThen} twelve weeks ago. Defects are being raised faster than they are being closed.`
  }
  if (gapNow < gapThen) {
    return `${gapNow} defects are open, down from ${gapThen} twelve weeks ago. The list is coming down.`
  }
  return `${gapNow} defects are open, the same as twelve weeks ago. Closing is keeping pace with raising, and no more.`
}
