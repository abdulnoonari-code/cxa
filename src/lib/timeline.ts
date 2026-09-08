// The project on one line of time: milestones as diamonds, gates as flags.
//
// ── The rules this file exists to enforce ───────────────────────────────
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
// 3. THE MARK SITS ON ITS DATE. THE LABEL GOES WHEREVER IT FITS.
//    These are two different jobs and the first render conflated them:
//    every mark was one centred column, so a label near the edge of the
//    chart hung off the card and got clipped, and moving a label to stop
//    two colliding dragged its flag off its date with it. Now every flag
//    and diamond sits exactly on its day, in one straight line along the
//    axis, and only the LABEL moves — up a row to avoid a neighbour, or
//    sideways so it stays inside the box — joined to its mark by a leader
//    line so you can always see which label belongs to which date.
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
  /** 0–100. Where the FLAG or DIAMOND sits. Never adjusted for looks. */
  percent: number
  /** Not closed, and its date has passed. */
  overdue: boolean
  /**
   * Which row of labels to use. 0 is nearest the axis.
   *
   * Two commitments three weeks apart on a nine-month chart are four
   * percent apart, and their labels are far wider than that — so without
   * this they overlap and neither can be read. Rendering it and looking at
   * it is what found this: "SAT witnessed by client" and "O&M manuals
   * accepted" printed on top of each other.
   */
  row: number
  /**
   * 0–100. Where the LEFT EDGE of the label box goes, already pulled back
   * inside the chart. For everything away from the edges this is simply
   * `percent` minus half a label; near an edge it stops rather than
   * overhanging, which is why the first and last labels are readable.
   */
  labelLeft: number
}

export type TimelineTick = {
  at: string
  /** Always the month — 'Jan', 'Apr'. Never the year; see `year`. */
  label: string
  /** Set only where the year changes, so it is printed once, not twelve times. */
  year: string | null
  percent: number
}

/**
 * One month (or quarter, or half) of the axis, as a stripe.
 *
 * Shading alternate periods is what makes a mark's month readable at a
 * glance. Without it every date has to be read off the nearest tick label
 * by eye, and on a busy chart that is most of them.
 */
export type TimelineBand = {
  key: string
  label: string
  year: string | null
  left: number
  width: number
  /** Alternate bands are tinted. Parity is taken from the real calendar so
   *  the stripes do not flip around when the chart's start date moves. */
  shade: boolean
}

export type Timeline = {
  from: string
  to: string
  marks: TimelineMark[]
  ticks: TimelineTick[]
  bands: TimelineBand[]
  /** Where today sits. Always between 0 and 100 — see rule 2. */
  todayPercent: number
  /** How many rows of labels each lane needs, so it can be made tall enough. */
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

/** Monthly, quarterly or half-yearly, depending on how long the job is. */
export function tickStep(fromT: number, toT: number): 1 | 3 | 6 {
  const months = Math.max(1, toT - fromT) / (DAY * 30.4)
  return months > 30 ? 6 : months > 14 ? 3 : 1
}

/**
 * Ticks along the axis: the first of each month, or of each quarter when the
 * span is long enough that monthly labels would collide into a grey smear.
 *
 * The label is the MONTH and nothing else. January used to be labelled with
 * the year instead, which meant the one month a reader most wants to find
 * was the one month whose name was missing. The year is carried separately
 * and printed under the month where it changes.
 */
export function buildTicks(fromT: number, toT: number): TimelineTick[] {
  const span = Math.max(1, toT - fromT)
  const step = tickStep(fromT, toT)

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
  if (step > 1)
    while (m % step !== 0) {
      m += 1
      if (m > 11) {
        m = 0
        y += 1
      }
    }

  let lastYear = new Date(fromT).getUTCFullYear()
  for (let guard = 0; guard < 200; guard++) {
    const t = Date.UTC(y, m, 1)
    if (t > toT) break
    ticks.push({
      at: isoOf(t),
      label: MONTHS[m],
      year: ticks.length === 0 || y !== lastYear ? String(y) : null,
      percent: ((t - fromT) / span) * 100,
    })
    lastYear = y
    m += step
    while (m > 11) {
      m -= 12
      y += 1
    }
  }
  return ticks
}

/**
 * The ticks turned into stripes that fill the axis end to end.
 *
 * Built FROM the ticks rather than alongside them, so a stripe and a label
 * can never end up describing different months — the same bug class as two
 * screens answering one question differently.
 */
export function buildBands(fromT: number, toT: number, ticks: TimelineTick[]): TimelineBand[] {
  if (toT <= fromT) return []
  const step = tickStep(fromT, toT)
  const bands: TimelineBand[] = []

  // The chart almost never starts on the 1st, so there is a part-period
  // before the first tick. It is a real month and gets a real stripe.
  const head = new Date(fromT)
  const headMonth = Math.floor(head.getUTCMonth() / step) * step
  const headYear = head.getUTCFullYear()
  const first = ticks[0]
  if (!first || first.percent > 0.5) {
    bands.push({
      key: `head-${headYear}-${headMonth}`,
      label: MONTHS[headMonth],
      year: String(headYear),
      left: 0,
      width: first ? first.percent : 100,
      shade: (headYear * 12 + headMonth) / step % 2 === 0,
    })
  }

  for (let i = 0; i < ticks.length; i++) {
    const left = ticks[i].percent
    const right = i + 1 < ticks.length ? ticks[i + 1].percent : 100
    const d = new Date(ticks[i].at + 'T00:00:00Z')
    const idx = (d.getUTCFullYear() * 12 + d.getUTCMonth()) / step
    bands.push({
      key: ticks[i].at,
      label: ticks[i].label,
      year: ticks[i].year,
      left,
      width: right - left,
      shade: Math.round(idx) % 2 === 0,
    })
  }

  // The year is printed where it CHANGES and nowhere else. A chart starting
  // mid-month has a part-month before the first tick, and both it and the
  // tick after it claimed to be the first of their year — so the first
  // render read "Mar 2026 · Apr 2026", which says the year twice and says
  // nothing the second time.
  let shown: string | null = null
  for (const b of bands) {
    if (b.year !== null && b.year === shown) b.year = null
    else if (b.year !== null) shown = b.year
  }
  return bands
}

/**
 * How wide a label is, as a share of the axis.
 *
 * The chart is around 1,050px inside the card and a label box is 116px, so
 * a shade over 11%. Two things depend on getting this honest: whether two
 * labels can share a row, and how far a label near the end has to be pulled
 * back to stay inside the box. Guessing low on either produces exactly the
 * overlapping, half-clipped text this replaced.
 */
export const LABEL_PERCENT = 11.5

/** Marks closer than one label are stacked, not overlapped. */
export const MIN_GAP_PERCENT = LABEL_PERCENT

/**
 * Where a label's left edge goes so that the label stays inside the chart.
 *
 * Centred on the mark everywhere except within half a label of an end,
 * where it stops dead against the edge instead of hanging over it. The
 * leader line still runs to the mark's real position, so a label that has
 * been nudged is never mistaken for a date that has moved.
 */
export function labelLeftFor(percent: number): number {
  const centred = percent - LABEL_PERCENT / 2
  if (centred < 0) return 0
  if (centred > 100 - LABEL_PERCENT) return 100 - LABEL_PERCENT
  return centred
}

/**
 * Put colliding labels on different rows, and return how many rows were
 * needed. Mutates `row` on each mark, in date order.
 *
 * Compares label EDGES, not mark centres: two marks near the right-hand end
 * both have their labels pulled left against the same stop, so by centre
 * they look far apart while their boxes sit on top of each other.
 *
 * Greedy and lowest-first — each label takes the row nearest the axis with
 * room for it — so the common case of dates comfortably apart stays on one
 * row and the lane only grows where the plan is genuinely crowded.
 */
export function stagger(marks: TimelineMark[]): number {
  const endOfRow: number[] = []
  for (const m of marks) {
    const left = m.labelLeft
    let row = 0
    // A hair of slack (0.2) so two labels that merely touch, which happens
    // constantly at the stops, are not pushed apart for nothing.
    while (endOfRow[row] !== undefined && left < endOfRow[row] - 0.2) row++
    m.row = row
    endOfRow[row] = left + LABEL_PERCENT
  }
  return Math.max(1, endOfRow.length)
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
      bands: [],
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
    // Otherwise a small margin so the first and last marks are not sitting
    // exactly on the edge of the box.
    const pad = Math.max(DAY * 3, (maxT - minT) * 0.04)
    minT -= pad
    maxT += pad
  }

  const span = maxT - minT
  const at = (t: number) => ((t - minT) / span) * 100

  const placed: TimelineMark[] = dated
    .sort((a, b) => a.t - b.t)
    .map(({ item, t }) => ({
      ...item,
      date: isoOf(t),
      percent: at(t),
      overdue: item.state !== 'done' && t < todayT,
      row: 0,
      labelLeft: labelLeftFor(at(t)),
    }))

  // Lanes are stacked separately: a gate and a milestone on the same day sit
  // on opposite sides of the axis and cannot collide with each other.
  const gateRows = stagger(placed.filter((m) => m.kind === 'gate'))
  const milestoneRows = stagger(placed.filter((m) => m.kind === 'milestone'))
  const ticks = buildTicks(minT, maxT)

  return {
    from: isoOf(minT),
    to: isoOf(maxT),
    marks: placed,
    ticks,
    bands: buildBands(minT, maxT, ticks),
    todayPercent: at(todayT),
    today,
    undated,
    empty: false,
    gateRows,
    milestoneRows,
  }
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
