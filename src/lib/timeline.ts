// The project on one line of time: milestones as diamonds, gates as flags.
//
// ── The two rules this file exists to enforce ───────────────────────────
//
// 1. NOTHING UNDATED IS EVER DRAWN.
//    A chart is a claim about when. An item with no date placed at a guess
//    — at the start, at the end, at today — is a claim nobody made, and it
//    is indistinguishable on screen from one somebody did. Undated items
//    are counted and listed instead, which is the honest answer and also
//    the useful one: "four gates have no date" is a thing to go and fix.
//
// 2. THE SCALE ALWAYS INCLUDES TODAY.
//    A timeline of a finished job that stops last March, or of a job that
//    starts next year, is read as "we are at the end" or "we are at the
//    start" whichever way the line happens to fall. Including today means
//    the marker is always somewhere on the axis, so the position of the
//    work relative to now is never ambiguous.
//
// Everything here is pure. No database, no dates from the system clock
// except the one passed in — so a test can ask what the chart looked like
// last April, and the answer is the same every time it is asked.

export type TimelineInput = {
  /** A dated thing to show. Anything without a date is filtered out here. */
  kind: 'milestone' | 'gate'
  id: string
  label: string
  /** ISO yyyy-mm-dd, or null. Null is normal and is not a fault. */
  date: string | null
  /** done | blocked | open — decided by the caller, which knows the domain. */
  state: 'done' | 'blocked' | 'open'
  href: string
  /** A sentence for the hover. */
  note?: string
}

export type TimelineMark = TimelineInput & {
  date: string
  /** 0–100, where it sits along the axis. */
  percent: number
  /** Not closed, and its date has passed. */
  overdue: boolean
  /**
   * Which row of its lane to draw in. 0 is nearest the axis.
   *
   * Two commitments three weeks apart on a nine-month chart are four
   * percent apart, and their labels are far wider than that — so without
   * this they overlap and neither can be read. Rendering it and looking at
   * it is what found this: "SAT witnessed by client" and "O&M manuals
   * accepted" printed on top of each other.
   */
  row: number
}

export type TimelineTick = { at: string; label: string; percent: number }

export type Timeline = {
  from: string
  to: string
  marks: TimelineMark[]
  ticks: TimelineTick[]
  /** Where today sits. Always between 0 and 100 — see rule 2. */
  todayPercent: number
  /** How many rows each lane needs, so the lane can be made tall enough. */
  gateRows: number
  milestoneRows: number
  today: string
  /** Things with no date, which are listed rather than drawn. */
  undated: TimelineInput[]
  /** True when there is nothing dated at all and no chart can be drawn. */
  empty: boolean
}

const DAY = 86_400_000

/** A yyyy-mm-dd string as a UTC timestamp, or null if it is not a date. */
export function dayValue(iso: string | null | undefined): number | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim())
  if (!m) return null
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(t) ? null : t
}

export function isoOf(t: number): string {
  return new Date(t).toISOString().slice(0, 10)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Ticks along the axis: the first of each month, or of each quarter when the
 * span is long enough that monthly labels would collide into a grey smear.
 */
export function buildTicks(fromT: number, toT: number): TimelineTick[] {
  const span = Math.max(1, toT - fromT)
  const months = span / (DAY * 30.4)
  const step = months > 30 ? 6 : months > 14 ? 3 : 1

  const ticks: TimelineTick[] = []
  const start = new Date(fromT)
  let y = start.getUTCFullYear()
  let m = start.getUTCMonth()

  // Begin at the first month boundary at or after the start, then walk.
  if (start.getUTCDate() !== 1) {
    m += 1
    if (m > 11) {
      m = 0
      y += 1
    }
  }
  // Align a quarterly or half-yearly scale to real quarter boundaries, so
  // the labels read Jan/Apr/Jul/Oct rather than wherever the job began.
  if (step > 1) while (m % step !== 0) {
    m += 1
    if (m > 11) {
      m = 0
      y += 1
    }
  }

  for (let guard = 0; guard < 200; guard++) {
    const t = Date.UTC(y, m, 1)
    if (t > toT) break
    ticks.push({
      at: isoOf(t),
      label: m === 0 ? String(y) : MONTHS[m],
      percent: ((t - fromT) / span) * 100,
    })
    m += step
    while (m > 11) {
      m -= 12
      y += 1
    }
  }
  return ticks
}

/**
 * Build the chart.
 *
 * `today` is passed in rather than read from the clock so that this is a
 * function of its arguments and nothing else.
 */
export function buildTimeline(items: TimelineInput[], today: string): Timeline {
  const todayT = dayValue(today) ?? Date.UTC(2000, 0, 1)

  const dated: { item: TimelineInput; t: number }[] = []
  const undated: TimelineInput[] = []
  for (const i of items) {
    const t = dayValue(i.date)
    if (t === null) undated.push(i)
    else dated.push({ item: i, t })
  }

  if (dated.length === 0) {
    return {
      from: today,
      to: today,
      marks: [],
      ticks: [],
      todayPercent: 50,
      gateRows: 1,
      milestoneRows: 1,
      today,
      undated,
      empty: true,
    }
  }

  // Rule 2: today is always on the axis.
  let minT = Math.min(todayT, ...dated.map((d) => d.t))
  let maxT = Math.max(todayT, ...dated.map((d) => d.t))

  // A single date, or several on one day, would give a span of zero and a
  // division by it. Two weeks either side gives that case a readable axis.
  if (maxT - minT < DAY * 14) {
    minT -= DAY * 7
    maxT += DAY * 7
  } else {
    // Otherwise a small margin so the first and last marks are not clipped
    // by the edge of the box.
    const pad = Math.max(DAY * 3, (maxT - minT) * 0.04)
    minT -= pad
    maxT += pad
  }

  const span = maxT - minT
  const at = (t: number) => ((t - minT) / span) * 100

  const placed = dated
    .sort((a, b) => a.t - b.t)
    .map(({ item, t }) => ({
      ...item,
      date: isoOf(t),
      percent: at(t),
      overdue: item.state !== 'done' && t < todayT,
      row: 0,
    }))

  // Lanes are stacked separately: a gate and a milestone on the same day sit
  // on opposite sides of the axis and cannot collide with each other.
  const gateRows = stagger(placed.filter((m) => m.kind === 'gate'))
  const milestoneRows = stagger(placed.filter((m) => m.kind === 'milestone'))

  return {
    from: isoOf(minT),
    to: isoOf(maxT),
    marks: placed,
    ticks: buildTicks(minT, maxT),
    todayPercent: at(todayT),
    today,
    undated,
    empty: false,
    gateRows,
    milestoneRows,
  }
}

/**
 * How far apart two marks must be, as a percentage of the axis, before their
 * labels can sit on the same row.
 *
 * A label is about 108px wide; a chart is roughly 1100px. That is a shade
 * under 10%, and 9 leaves the gap honest without pushing everything onto
 * separate rows the moment two dates are in the same month.
 */
export const MIN_GAP_PERCENT = 9

/**
 * Put colliding marks on different rows, and return how many rows were
 * needed. Mutates `row` on each mark, in date order.
 *
 * Greedy and lowest-first: each mark takes the row nearest the axis that has
 * room for it. That keeps the common case — dates comfortably apart — on one
 * row, and only grows the lane where the plan is genuinely crowded.
 */
export function stagger(marks: TimelineMark[]): number {
  const lastInRow: number[] = []
  for (const m of marks) {
    let row = 0
    while (lastInRow[row] !== undefined && m.percent - lastInRow[row] < MIN_GAP_PERCENT) row++
    m.row = row
    lastInRow[row] = m.percent
  }
  return Math.max(1, lastInRow.length)
}

/** The sentence under the chart. Says what is drawn AND what is not. */
export function timelineNote(t: Timeline): string {
  if (t.empty) {
    return t.undated.length === 0
      ? 'Nothing to show yet. Add a milestone with a target date, or give a gate a planned date, and it appears here.'
      : `Nothing is dated, so there is no timeline to draw. ${t.undated.length} item${
          t.undated.length === 1 ? ' is' : 's are'
        } listed below — give them dates and they appear on the chart.`
  }

  const overdue = t.marks.filter((m) => m.overdue).length
  const parts = [`${t.marks.length} dated item${t.marks.length === 1 ? '' : 's'}`]
  if (overdue > 0) parts.push(`${overdue} past its date and not closed`)
  if (t.undated.length > 0) {
    parts.push(
      `${t.undated.length} with no date, listed below and NOT on the chart — an undated item placed at a guess is a claim nobody made`
    )
  }
  return parts.join(' · ')
}
