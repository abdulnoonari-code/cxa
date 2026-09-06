// The punch list, counted the way a progress meeting asks for it.
//
// ── Why "raised against closed" needed defining ─────────────────────────
//
// The dashboard used to show two lines called Raised and Closed and a bar
// chart of open items, and nothing on the screen said what either word
// meant. Three people in a meeting can read that four ways:
//
//   • Is "raised" everything ever raised, or everything still open?
//   • Does "closed" include items the contractor says are done and nobody
//     has accepted yet?
//   • Is an item with no category counted in the totals or not?
//
// Every one of those changes the number, and a figure that changes meaning
// depending on who is reading it cannot be used to make a decision. So the
// three states are defined here, in one place, and the words are printed on
// the screen beside the chart rather than left in somebody's head.
//
// The states are exhaustive and do not overlap: every punch item is in
// exactly one of open, awaiting acceptance, or closed, and
//     raised = open + awaiting + closed
// which is what makes the full length of a stacked bar the total raised.

import { CATEGORIES } from '@/lib/issues'
import type { PunchInput } from '@/lib/site-rules'

/** Accepted as finished. */
const SETTLED = new Set(['verified', 'closed'])
/** Work done, acceptance not given. Deliberately NOT counted as closed. */
const AWAITING = 'ready_for_retest'

export type PunchState = 'open' | 'awaiting' | 'closed'

export function punchStateOf(item: PunchInput): PunchState {
  const s = item.status ?? 'open'
  if (SETTLED.has(s)) return 'closed'
  if (s === AWAITING) return 'awaiting'
  return 'open'
}

/** The sentence printed under each figure, so the word cannot be read two ways. */
export const PUNCH_DEFINITIONS: { key: PunchState | 'raised' | 'overdue'; label: string; means: string }[] = [
  {
    key: 'raised',
    label: 'Raised',
    means: 'Every punch item ever created on this project, whatever state it is in now. It never goes down.',
  },
  {
    key: 'open',
    label: 'Open',
    means: 'Raised and not yet fixed — open, in progress, or rejected on retest. This is the work outstanding.',
  },
  {
    key: 'awaiting',
    label: 'Awaiting acceptance',
    means:
      'The contractor says it is fixed and nobody has accepted it yet. It is not closed: counting it as closed is how a project reads finished while the client still has items to reject.',
  },
  {
    key: 'closed',
    label: 'Closed',
    means: 'Accepted as finished — verified or closed. Only these count as done.',
  },
  {
    key: 'overdue',
    label: 'Overdue',
    means: 'Not closed, and its due date has passed. An item with no due date can never be overdue and is counted separately.',
  },
]

export type CategoryRow = {
  /** The stored value, or null for items nobody has categorised. */
  value: string | null
  label: string
  what: string
  raised: number
  open: number
  awaiting: number
  closed: number
  overdue: number
  /** Not closed and carrying no due date, so no overdue figure can ever include it. */
  undated: number
}

export type PunchSummary = {
  raised: number
  open: number
  awaiting: number
  closed: number
  overdue: number
  undated: number
  categories: CategoryRow[]
}

// Severity was considered as a second breakdown and left out. The A/B/C
// category IS the priority on a commissioning punch list — it is what decides
// whether an item stops the system advancing — and severity is a second,
// looser word for the same idea that is filled in inconsistently. Two
// priority scales side by side on one screen is how two people end up
// quoting different numbers for the same list.

const WHAT: Record<string, string> = {
  A: 'Must be closed before the system can advance at all.',
  B: 'Minor. Can be deferred with the owner signing it off.',
  C: 'Deferred to future maintenance.',
}

const UNCATEGORISED_MEANS =
  'Nobody has decided what this blocks. It is not a Category C item — an item whose commercial position is undecided is a decision waiting to be made, and folding it into C hides that.'

function isOverdue(item: PunchInput, today: Date): boolean {
  if (!item.due_date) return false
  return new Date(item.due_date) < today
}

/**
 * Every figure the dashboard prints about the punch list, from one pass.
 *
 * Uncategorised gets its own row rather than being folded into C or dropped.
 * Dropping it makes the category rows fail to add up to the total, which is
 * the fastest way to lose a reader's trust in a whole screen.
 */
export function punchSummary(items: PunchInput[], today: Date): PunchSummary {
  const state = items.map((i) => [i, punchStateOf(i)] as const)

  const known = new Set(CATEGORIES.map((c) => c.value))
  const rows: { value: string | null; label: string; what: string }[] = [
    ...CATEGORIES.map((c) => ({ value: c.value as string | null, label: `Category ${c.value}`, what: WHAT[c.value] ?? '' })),
    { value: null, label: 'Uncategorised', what: UNCATEGORISED_MEANS },
  ]

  const categories: CategoryRow[] = rows.map((r) => {
    const mine = state.filter(([i]) =>
      r.value === null ? !i.category || !known.has(i.category) : i.category === r.value
    )
    const notClosed = mine.filter(([, s]) => s !== 'closed')
    return {
      value: r.value,
      label: r.label,
      what: r.what,
      raised: mine.length,
      open: mine.filter(([, s]) => s === 'open').length,
      awaiting: mine.filter(([, s]) => s === 'awaiting').length,
      closed: mine.filter(([, s]) => s === 'closed').length,
      overdue: notClosed.filter(([i]) => isOverdue(i, today)).length,
      undated: notClosed.filter(([i]) => !i.due_date).length,
    }
  })

  const notClosed = state.filter(([, s]) => s !== 'closed')

  return {
    raised: items.length,
    open: state.filter(([, s]) => s === 'open').length,
    awaiting: state.filter(([, s]) => s === 'awaiting').length,
    closed: state.filter(([, s]) => s === 'closed').length,
    overdue: notClosed.filter(([i]) => isOverdue(i, today)).length,
    undated: notClosed.filter(([i]) => !i.due_date).length,
    categories,
  }
}

/** One line describing the whole punch list, for the top of the section. */
export function punchHeadline(s: PunchSummary): string {
  if (s.raised === 0) return 'No punch items have been raised on this project yet.'
  const parts = [`${s.raised} raised`, `${s.open} still open`]
  if (s.awaiting > 0) parts.push(`${s.awaiting} waiting to be accepted`)
  parts.push(`${s.closed} closed`)
  const tail =
    s.overdue > 0
      ? ` ${s.overdue} ${s.overdue === 1 ? 'is' : 'are'} past ${s.overdue === 1 ? 'its' : 'their'} date.`
      : ''
  const undated =
    s.undated > 0
      ? ` ${s.undated} open ${s.undated === 1 ? 'item has' : 'items have'} no date at all, so ${s.undated === 1 ? 'it' : 'they'} can never appear in that figure.`
      : ''
  return parts.join(', ') + '.' + tail + undated
}
