// One defect, written out as a block somebody who was not there can act on.
//
// ── What a contractor actually needs, in order ──────────────────────────
//
//   1. Which thing.        A tag, not a row number.
//   2. What is wrong.      In words, not a category letter.
//   3. What it looks like. The photograph.
//   4. What must be done.  And whether anybody has actually agreed it.
//   5. Who, and by when.
//
// The punch list already answers 1, 2 and 5 in a table, and puts 3 in a
// gallery at the back. This file answers all five in one block per item, so
// nothing has to be carried in the reader's head from one page to another.
//
// It is pure on purpose: no database, no photographs, no document library.
// Everything here can be asserted with a plain object, and the two things
// most likely to be got wrong — printing a machine's guess as an instruction,
// and printing an empty remedy as though it were an answer — are exactly the
// things an assertion can pin down.

import { categoryLabel, statusLabel, severityLabel, daysOverdue, ageInDays, type PunchLike } from '@/lib/punchlist'
import { remedyFor, onDate, type RemedyLike } from '@/lib/remedy'

export type DefectRow = PunchLike &
  RemedyLike & {
    id: string
    ref?: string | null
    title: string
    severity?: string | null
    description?: string | null
    location?: string | null
    discipline?: string | null
    responsible_party?: string | null
    raised_by?: string | null
    due_date?: string | null
    level?: string | null
  }

export type DefectContext = {
  /** The tag or system it is raised against, as it is written on the plant. */
  against: string
  /** "L3 — Point to point" and so on, already shortened by the caller. */
  level?: string
  /** How many photographs this item has in CxSentinel, carried or not. */
  photos?: number
}

export type DefectCard = {
  heading: string
  strapline: string
  facts: { label: string; value: string }[]
  paragraphs: { label: string; text: string; note?: string }[]
  noImagesNote?: string
}

function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * The line that says when, and how late.
 *
 * "Due 14 Sep 2026" and "Due 14 Sep 2026 — 9 days overdue" are different
 * facts and the second one is the reason the document is being issued, so it
 * is never left for the reader to work out from a date and today's date.
 */
export function dueWording(row: DefectRow, today: Date = new Date()): string {
  const due = clean(row.due_date)
  if (!due) return 'No date agreed'
  const late = daysOverdue(row, today)
  const when = onDate(due) || due
  if (late === null || late <= 0) return `Due ${when}`
  return `Due ${when} — ${late} day${late === 1 ? '' : 's'} overdue`
}

export function cardFor(row: DefectRow, ctx: DefectContext, today: Date = new Date()): DefectCard {
  const ref = clean(row.ref)
  const title = clean(row.title) || 'Untitled item'
  const remedy = remedyFor(row)

  const heading = ref ? `${ref} — ${title}` : title

  const strapline = [
    ctx.against,
    row.category ? categoryLabel(row.category) : 'Uncategorised — nobody has decided whether this stops the job',
    statusLabel(row.status),
    severityLabel(row.severity),
  ]
    .filter(Boolean)
    .join('  ·  ')

  const facts: { label: string; value: string }[] = [
    { label: 'Responsible', value: clean(row.responsible_party) || 'Not assigned' },
    { label: 'By when', value: dueWording(row, today) },
  ]
  if (ctx.level) facts.push({ label: 'Level', value: ctx.level })
  if (clean(row.discipline)) facts.push({ label: 'Discipline', value: clean(row.discipline) })
  const age = ageInDays(row, today)
  if (age !== null) facts.push({ label: 'Raised', value: `${age} day${age === 1 ? '' : 's'} ago${clean(row.raised_by) ? ` by ${clean(row.raised_by)}` : ''}` })

  const paragraphs: DefectCard['paragraphs'] = []

  const description = clean(row.description)
  paragraphs.push({
    label: 'What is wrong',
    text: description || title,
    // Not decoration. A one-line defect with no detail is the single most
    // common reason an item comes back not fixed, and the person who can
    // still remember what they saw is the person reading this today.
    note: description ? undefined : 'No detail beyond the title was recorded against this item.',
  })

  if (clean(row.location)) {
    paragraphs.push({ label: 'Where', text: clean(row.location) })
  }

  paragraphs.push({
    label: 'What must be done',
    // The three states read differently ON PURPOSE. An empty remedy prints
    // a sentence saying nobody has decided — never a dash, which a reader
    // skims past as a formatting artefact.
    text: remedy.state === 'none' ? 'Not yet decided.' : remedy.text,
    note: remedy.provenance,
  })

  const photos = ctx.photos ?? 0

  return {
    heading,
    strapline,
    facts,
    paragraphs,
    noImagesNote:
      photos > 0
        ? `${photos} photograph${photos === 1 ? '' : 's'} on this item could not be carried into this document — see the note at the end.`
        : 'No photograph was taken of this defect.',
  }
}

// ── Grouping ────────────────────────────────────────────────────────────
//
// A defect report is walked, not read. Which order it is walked in depends
// on who is holding it:
//
//   by tag    the site engineer, going panel to panel
//   by party  the contractor, who only cares about their own items
//   by level  the commissioning manager, closing out a level
//
// so the grouping is a choice on the screen rather than a decision made here.
// "Nothing" is a real option: a report of eleven items is a list, not a
// document with sections.

export type GroupBy = 'subject' | 'party' | 'category' | 'level' | 'none'

export const GROUP_OPTIONS: { value: GroupBy; label: string; note: string }[] = [
  { value: 'subject', label: 'By tag or system', note: 'Walked panel by panel — what a site engineer carries.' },
  { value: 'party', label: 'By who is responsible', note: 'One section per contractor, so a section can be issued on its own.' },
  { value: 'category', label: 'By category', note: 'A before B before C — what stops the job, first.' },
  { value: 'level', label: 'By commissioning level', note: 'For closing out one level at a time.' },
  { value: 'none', label: 'One list', note: 'Most urgent first, no sections.' },
]

export function isGroupBy(value: string | null | undefined): value is GroupBy {
  return value === 'subject' || value === 'party' || value === 'category' || value === 'level' || value === 'none'
}

export type Grouped<T> = { title: string; rows: T[] }

/**
 * Split into sections, keeping the order the rows arrived in.
 *
 * The rows come in already sorted by urgency (see `workOrder`), and this must
 * not resort them — the first section is the one holding the most urgent item,
 * and within a section the most urgent is at the top. Sorting sections
 * alphabetically would put "Area lighting" above "115 kV switchyard".
 */
export function groupRows<T>(rows: T[], by: GroupBy, keyOf: (row: T, by: GroupBy) => string): Grouped<T>[] {
  if (by === 'none') return rows.length > 0 ? [{ title: '', rows }] : []

  const out: Grouped<T>[] = []
  const index = new Map<string, Grouped<T>>()
  for (const row of rows) {
    const title = keyOf(row, by) || 'Not recorded'
    const found = index.get(title)
    if (found) found.rows.push(row)
    else {
      const group = { title, rows: [row] }
      index.set(title, group)
      out.push(group)
    }
  }
  return out
}
