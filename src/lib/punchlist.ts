// The punch list.
//
// A punch item is not a bug report. It is a defect raised against a specific
// piece of plant at a specific commissioning level, owned by a named party,
// with a date it has to be gone by — and a category that says what it is
// allowed to stop. That last part is the whole reason a punch list exists as
// a separate thing from an issue tracker: the category is a commercial
// position, not a severity.
//
// Everything in this file is derived from the record. Nothing here is stored.

import { CATEGORIES, ISSUE_STATUSES, SEVERITIES } from '@/lib/issues'

export { CATEGORIES, ISSUE_STATUSES, SEVERITIES }

export const CATEGORY_VALUES = CATEGORIES.map((c) => c.value)

// What each category is allowed to hold up. The gate engine already reads
// `min_category`; this is the same rule written in words, for the screen.
export const CATEGORY_BLOCKS: Record<string, string> = {
  A: 'Blocks the next step. The system does not advance while an A item is open.',
  B: 'Does not block progress, but blocks handover unless the owner accepts it in writing.',
  C: 'Blocks nothing. Recorded and carried to a future maintenance window.',
}

// An item is "live" until somebody has accepted the fix. Ready for retest is
// not closed: the work may be done, but nobody has agreed that it is.
const SETTLED = new Set(['verified', 'closed'])

export function isOpen(status: string | null | undefined): boolean {
  return !SETTLED.has(status ?? 'open')
}

// Cleared and accepted are two different events, and conflating them is how a
// punch list closes itself. Work done by the contractor moves an item to
// Ready for Retest; only the commissioning agent moves it past that.
export function isAwaitingAcceptance(status: string | null | undefined): boolean {
  return status === 'ready_for_retest'
}

export function categoryLabel(value: string | null | undefined): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? 'Uncategorised'
}

export function categoryShort(value: string | null | undefined): string {
  return value && CATEGORY_VALUES.includes(value) ? `Cat ${value}` : 'Uncategorised'
}

export function statusLabel(value: string | null | undefined): string {
  return ISSUE_STATUSES.find((s) => s.value === value)?.label ?? 'Open'
}

export function severityLabel(value: string | null | undefined): string {
  return SEVERITIES.find((s) => s.value === value)?.label ?? 'Minor'
}

// ── Ageing ───────────────────────────────────────────────────────────────

export type PunchLike = {
  status: string | null
  category: string | null
  due_date: string | null
  created_at: string | null
}

const DAY = 24 * 60 * 60 * 1000

function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
}

/** Whole days between two calendar days, ignoring the time of day. */
export function daysBetween(from: string | Date, to: string | Date = new Date()): number {
  const a = startOfDay(typeof from === 'string' ? new Date(from) : from)
  const b = startOfDay(typeof to === 'string' ? new Date(to) : to)
  return Math.round((b - a) / DAY)
}

/**
 * How overdue an item is, in days. Positive means late.
 *
 * A closed item is never overdue however long it sat there — the list is a
 * record of what is outstanding now, not a stick to beat the past with. An
 * item with no due date is never overdue either: nobody agreed a date, so
 * nobody has missed one.
 */
export function daysOverdue(item: PunchLike, today: Date = new Date()): number | null {
  if (!isOpen(item.status)) return null
  if (!item.due_date) return null
  const late = daysBetween(item.due_date, today)
  return late > 0 ? late : null
}

export function isOverdue(item: PunchLike, today: Date = new Date()): boolean {
  return daysOverdue(item, today) !== null
}

/** How long an open item has been open. Null once it is settled. */
export function ageInDays(item: PunchLike, today: Date = new Date()): number | null {
  if (!isOpen(item.status)) return null
  if (!item.created_at) return null
  return Math.max(0, daysBetween(item.created_at, today))
}

// ── What the list adds up to ─────────────────────────────────────────────

export type PunchSummary = {
  total: number
  open: number
  openA: number
  openB: number
  openC: number
  openUncategorised: number
  overdue: number
  awaitingAcceptance: number
  closed: number
  /** the oldest open item, in days */
  oldest: number | null
}

export function summarise(items: PunchLike[], today: Date = new Date()): PunchSummary {
  const summary: PunchSummary = {
    total: items.length,
    open: 0,
    openA: 0,
    openB: 0,
    openC: 0,
    openUncategorised: 0,
    overdue: 0,
    awaitingAcceptance: 0,
    closed: 0,
    oldest: null,
  }

  for (const item of items) {
    if (!isOpen(item.status)) {
      summary.closed += 1
      continue
    }
    summary.open += 1
    if (item.category === 'A') summary.openA += 1
    else if (item.category === 'B') summary.openB += 1
    else if (item.category === 'C') summary.openC += 1
    // An item nobody has categorised has not been assessed, and an
    // unassessed item cannot be assumed harmless. It is counted on its own
    // rather than folded into C.
    else summary.openUncategorised += 1

    if (isOverdue(item, today)) summary.overdue += 1
    if (isAwaitingAcceptance(item.status)) summary.awaitingAcceptance += 1

    const age = ageInDays(item, today)
    if (age !== null && (summary.oldest === null || age > summary.oldest)) summary.oldest = age
  }

  return summary
}

// ── What the list means ──────────────────────────────────────────────────

export type PunchVerdict = {
  label: string
  tone: 'danger' | 'warning' | 'neutral' | 'success'
  detail: string
}

/**
 * The one-line reading of a punch list. Deliberately never says "cleared" or
 * "approved": a punch list does not authorise anything, it only reports what
 * is outstanding. The gate does the authorising, and it does it against rules.
 */
export function verdict(summary: PunchSummary): PunchVerdict {
  if (summary.total === 0) {
    return {
      label: 'NOTHING RAISED',
      tone: 'neutral',
      detail:
        'No punch items on record. That is not the same as no defects — it means nothing has been entered here.',
    }
  }
  if (summary.openA > 0) {
    return {
      label: 'BLOCKED',
      tone: 'danger',
      detail: `${summary.openA} open Category A item${summary.openA === 1 ? '' : 's'}. These stop the system advancing.`,
    }
  }
  if (summary.openUncategorised > 0) {
    return {
      label: 'NOT ASSESSED',
      tone: 'warning',
      detail: `${summary.openUncategorised} open item${
        summary.openUncategorised === 1 ? ' has' : 's have'
      } no category. Until somebody says what they block, they have to be treated as if they block.`,
    }
  }
  if (summary.openB > 0) {
    return {
      label: 'HANDOVER BLOCKED',
      tone: 'warning',
      detail: `${summary.openB} open Category B item${
        summary.openB === 1 ? '' : 's'
      }. Work may proceed; handover needs the owner to accept them in writing.`,
    }
  }
  if (summary.open > 0) {
    return {
      label: 'CARRIED FORWARD',
      tone: 'neutral',
      detail: `${summary.open} open Category C item${
        summary.open === 1 ? '' : 's'
      }, deferred to a future maintenance window. Nothing is held up.`,
    }
  }
  return {
    label: 'ALL ITEMS CLOSED',
    tone: 'success',
    detail: `All ${summary.total} punch item${summary.total === 1 ? '' : 's'} closed out and accepted.`,
  }
}

export function verdictBadgeClass(tone: PunchVerdict['tone']): string {
  switch (tone) {
    case 'danger':
      return 'badge badge-danger'
    case 'warning':
      return 'badge badge-warning'
    case 'success':
      return 'badge badge-success'
    default:
      return 'badge badge-neutral'
  }
}

// ── Punch numbers ────────────────────────────────────────────────────────

const REF_PATTERN = /^P-(\d+)$/i

/**
 * The next punch number for a project. Reads the highest number already
 * issued rather than counting the rows, so deleting an item never causes a
 * number to be reused — a re-used punch number is how two different defects
 * end up in the same row of a client's spreadsheet.
 */
export function nextRef(existing: (string | null)[]): string {
  let highest = 0
  for (const ref of existing) {
    const match = (ref ?? '').trim().match(REF_PATTERN)
    if (!match) continue
    const n = Number(match[1])
    if (Number.isFinite(n) && n > highest) highest = n
  }
  return `P-${String(highest + 1).padStart(4, '0')}`
}

/** A run of consecutive numbers, for inserting a batch in one go. */
export function refSeries(existing: (string | null)[], count: number): string[] {
  const first = nextRef(existing)
  const start = Number(first.slice(2))
  return Array.from({ length: count }, (_, i) => `P-${String(start + i).padStart(4, '0')}`)
}
