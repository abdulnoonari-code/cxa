// Free rule checks over the project's own records.
//
// The document rules in `doc-rules.ts` look inside an uploaded file. These
// look at the registers themselves — the punch list, the photographs, the
// dates — and report where the record does not hold up. Same principle,
// same price: no model, no key, no network. It can run on every screen load
// on a project with four thousand punch items and cost nothing, which is why
// none of it is stored.
//
// Everything here is DERIVED. Not one finding is written to a table. That is
// deliberate and it is the difference between a rule and an assessment: an
// assessment is a thing somebody said once and it goes stale the moment the
// record changes; a rule is the current answer, every time you look.
//
// ── Two things every rule in this file obeys ────────────────────────────
//
//   1. **It states a fact, never a judgement.** "Six closed items have no
//      photograph" is checkable by anybody in thirty seconds. "The punch
//      list quality is poor" is not, and cannot be argued with, which makes
//      it useless in a meeting.
//
//   2. **It never says the work is wrong.** A check with no photograph is
//      not a check that was done badly — it is a check nobody outside the
//      room can verify. The distinction matters because the person reading
//      this did the work, and a tool that calls them careless gets closed.

export type RuleLevel = 'blocking' | 'warning' | 'note'

export type SiteFinding = {
  area: 'punch' | 'photos' | 'schedule'
  level: RuleLevel
  /** Stable identifier, printed under each finding so it can be quoted. */
  rule: string
  title: string
  detail: string
  count: number
  /** A few of the records concerned, by their own reference. */
  examples: string[]
  /** Where to go and look. */
  href: string
}

// ── The shapes the rules read ────────────────────────────────────────────

export type PunchInput = {
  id: string
  ref: string | null
  title: string | null
  description: string | null
  category: string | null
  status: string | null
  level: string | null
  due_date: string | null
  closed_at: string | null
  closed_by: string | null
  created_at: string | null
  /** How many photographs are attached. */
  photos: number
  /** How many of those are marked as photographs of the repair. */
  fixPhotos: number
}

export type CheckInput = { level: string | null; status: string | null }
export type MilestoneInput = { name: string | null; target_date: string | null; status: string | null }
export type TaskInput = { title: string | null; assignee: string | null; due_date: string | null; status: string | null }
export type ObligationInput = { ref: string | null; statement: string | null; due_date: string | null; status: string | null }
export type ProjectInput = { name: string | null; target_date: string | null }

const SETTLED = new Set(['verified', 'closed'])
const OBLIGATION_CLOSED = new Set(['accepted', 'waived', 'not_applicable'])

const DAY = 24 * 60 * 60 * 1000

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Whole days late. Positive means past. Null when there is no date to judge. */
export function daysPast(date: string | null | undefined, today: Date): number | null {
  if (!date) return null
  const t = new Date(date)
  if (Number.isNaN(t.getTime())) return null
  return Math.round((dayStart(today) - dayStart(t)) / DAY)
}

function label(ref: string | null, title: string | null, fallback: string): string {
  const t = (title ?? '').trim()
  if (ref && t) return `${ref} — ${t.slice(0, 48)}`
  return ref ?? (t ? t.slice(0, 48) : fallback)
}

function finding(
  area: SiteFinding['area'],
  level: RuleLevel,
  rule: string,
  title: string,
  detail: string,
  items: string[],
  href: string
): SiteFinding {
  return { area, level, rule, title, detail, count: items.length, examples: items.slice(0, 5), href }
}

// ── Punch list and defect photographs ────────────────────────────────────

/**
 * How many words a defect has to carry before somebody who was not there can
 * act on it.
 *
 * Four. Not because four is magic, but because "damaged", "leaking", "fix
 * this" and "NG" are all one or two, and every one of them is a real punch
 * item somebody has raised on a real project. Six months later, at handover,
 * nobody can tell what was wrong or whether it is still wrong.
 */
const MIN_WORDS = 4

export function punchFindings(items: PunchInput[], checks: CheckInput[], today: Date): SiteFinding[] {
  const out: SiteFinding[] = []
  const open = items.filter((i) => !SETTLED.has(i.status ?? 'open'))
  const settled = items.filter((i) => SETTLED.has(i.status ?? 'open'))

  // ── Photographs ────────────────────────────────────────────────────────
  const closedNoPhoto = settled.filter((i) => i.photos === 0)
  if (closedNoPhoto.length > 0) {
    out.push(
      finding(
        'photos',
        'blocking',
        'punch/closed-without-a-photograph',
        'Closed defects with no photograph at all',
        'Closing a defect is a statement that it was found, fixed and accepted. With no image anywhere on the record, nothing survives that says what the defect was — and at handover, an item that reads "closed" with nothing behind it is indistinguishable from one that was never looked at.',
        closedNoPhoto.map((i) => label(i.ref, i.title, i.id)),
        '/issues?status=closed'
      )
    )
  }

  // The photographs carry their own kind — defect or fix — so this does not
  // have to be inferred from timestamps. A first version compared the last
  // photograph's date against the closure date, which would have called a
  // repair photograph uploaded a minute early a missing one, and would have
  // said nothing at all when both were uploaded together at the end of the
  // day. Asking what a photograph IS beats guessing from when it arrived.
  const noCloseoutPhoto = settled.filter((i) => i.photos > 0 && i.fixPhotos === 0)
  if (noCloseoutPhoto.length > 0) {
    out.push(
      finding(
        'photos',
        'warning',
        'punch/no-photograph-after-the-fix',
        'Closed defects with a photograph of the problem but none of the repair',
        'The record shows the defect and not the fix. A before with no after proves the half nobody disputes, and at handover it is the after that is being asked for.',
        noCloseoutPhoto.map((i) => label(i.ref, i.title, i.id)),
        '/issues?status=closed'
      )
    )
  }

  const openNoPhoto = open.filter((i) => i.photos === 0)
  if (openNoPhoto.length > 0) {
    out.push(
      finding(
        'photos',
        'warning',
        'punch/open-without-a-photograph',
        'Open defects with no photograph',
        'The person who has to fix these can only work from the words. A photograph costs ten seconds on site and saves the second visit that happens when the description turns out to mean something else.',
        openNoPhoto.map((i) => label(i.ref, i.title, i.id)),
        '/issues'
      )
    )
  }

  // ── The record itself ──────────────────────────────────────────────────
  // A first draft of this skipped items with no words at all, because the
  // filter asked for "more than nothing and fewer than four". An item with
  // nothing written on it is not the case to exclude — it is the worst one.
  const thin = items.filter((i) => {
    const words = `${i.title ?? ''} ${i.description ?? ''}`.trim().split(/\s+/).filter(Boolean)
    return words.length < MIN_WORDS
  })
  if (thin.length > 0) {
    out.push(
      finding(
        'punch',
        'warning',
        'punch/too-little-to-act-on',
        `Defects described in fewer than ${MIN_WORDS} words`,
        'These say something is wrong without saying what — or say nothing at all. They are readable today because the person who raised them remembers; they will not be readable at handover, and the contractor cannot price or plan them now.',
        thin.map((i) => label(i.ref, i.title, i.id)),
        '/issues'
      )
    )
  }

  const closedByNobody = settled.filter((i) => !(i.closed_by ?? '').trim())
  if (closedByNobody.length > 0) {
    out.push(
      finding(
        'punch',
        'warning',
        'punch/closed-by-nobody',
        'Closed defects with no name against the closure',
        'Somebody accepted that these were fixed. The record does not say who, so the acceptance cannot be traced to a person — which is the only thing that makes an acceptance mean anything.',
        closedByNobody.map((i) => label(i.ref, i.title, i.id)),
        '/issues?status=closed'
      )
    )
  }

  // ── Dates ──────────────────────────────────────────────────────────────
  const overdueA = open.filter((i) => i.category === 'A' && (daysPast(i.due_date, today) ?? -1) > 0)
  if (overdueA.length > 0) {
    out.push(
      finding(
        'punch',
        'blocking',
        'punch/category-a-past-its-date',
        'Category A defects past their date',
        'A Category A item is the one category that is defined by what it stops. Each of these is holding up the step it was raised against, and the date it was supposed to be gone by has passed.',
        overdueA.map((i) => `${label(i.ref, i.title, i.id)} — ${daysPast(i.due_date, today)} days`),
        '/issues?category=A'
      )
    )
  }

  const overdueOther = open.filter((i) => i.category !== 'A' && (daysPast(i.due_date, today) ?? -1) > 0)
  if (overdueOther.length > 0) {
    out.push(
      finding(
        'punch',
        'warning',
        'punch/past-its-date',
        'Open defects past their date',
        'Not blocking by category, but each one was given a date by somebody and the date has gone. A punch list where dates pass without consequence stops being a plan and becomes a list.',
        overdueOther.map((i) => `${label(i.ref, i.title, i.id)} — ${daysPast(i.due_date, today)} days`),
        '/issues'
      )
    )
  }

  const noDate = open.filter((i) => !i.due_date)
  if (noDate.length > 0) {
    out.push(
      finding(
        'punch',
        'note',
        'punch/no-date-at-all',
        'Open defects with no date on them',
        'Nothing can be late if nothing is due. These will never appear in an overdue figure, on any report, however long they sit there.',
        noDate.map((i) => label(i.ref, i.title, i.id)),
        '/issues'
      )
    )
  }

  // ── The level reads complete while defects are open ────────────────────
  //
  // This is the finding this whole file was worth writing for. A level whose
  // every check has passed looks finished on every screen and in every
  // export. If defects raised at that level are still open, it is not, and
  // the two facts live on different pages so nobody sees them together.
  const byLevel = new Map<string, { total: number; done: number }>()
  for (const c of checks) {
    if (!c.level) continue
    const e = byLevel.get(c.level) ?? { total: 0, done: 0 }
    e.total++
    if (c.status === 'pass' || c.status === 'na') e.done++
    byLevel.set(c.level, e)
  }
  const completeLevels = [...byLevel.entries()]
    .filter(([, v]) => v.total > 0 && v.done === v.total)
    .map(([k]) => k)

  const openAtCompleteLevel = open.filter((i) => i.level && completeLevels.includes(i.level))
  if (openAtCompleteLevel.length > 0) {
    out.push(
      finding(
        'punch',
        'blocking',
        'punch/open-at-a-level-that-reads-complete',
        'Defects still open at a level whose checks have all passed',
        `Every check at ${completeLevels.join(', ')} has passed, so the level reads complete everywhere in this application. These defects were raised at that level and are still open. The completion figure and the punch list disagree, and only the punch list is right.`,
        openAtCompleteLevel.map((i) => label(i.ref, i.title, i.id)),
        '/issues'
      )
    )
  }

  return out
}

// ── Schedule ─────────────────────────────────────────────────────────────

const LEVEL_ORDER = ['L1_fat', 'L2_iv', 'L3_prefunctional', 'L4_fpt', 'L5_ist']

export function scheduleFindings(
  input: {
    project: ProjectInput | null
    milestones: MilestoneInput[]
    tasks: TaskInput[]
    obligations: ObligationInput[]
    checks: CheckInput[]
    openPunch: number
  },
  today: Date
): SiteFinding[] {
  const out: SiteFinding[] = []

  const lateMilestones = input.milestones
    .filter((m) => m.status !== 'complete' && (daysPast(m.target_date, today) ?? -1) > 0)
    .sort((a, b) => (daysPast(b.target_date, today) ?? 0) - (daysPast(a.target_date, today) ?? 0))
  if (lateMilestones.length > 0) {
    const worst = daysPast(lateMilestones[0].target_date, today) ?? 0
    out.push(
      finding(
        'schedule',
        'blocking',
        'schedule/milestone-passed',
        'Milestones whose date has passed',
        `The furthest behind is ${worst} days past its target and is not marked complete. A milestone that slips without being re-dated stops being a commitment, and the plan quietly becomes a description of the past.`,
        lateMilestones.map((m) => `${m.name ?? 'Unnamed'} — ${daysPast(m.target_date, today)} days`),
        '/milestones'
      )
    )
  }

  const lateObligations = input.obligations.filter(
    (o) => !OBLIGATION_CLOSED.has(o.status ?? 'open') && (daysPast(o.due_date, today) ?? -1) > 0
  )
  if (lateObligations.length > 0) {
    out.push(
      finding(
        'schedule',
        'blocking',
        'schedule/obligation-passed',
        'Obligations past their date and not accepted',
        'An obligation is a duty somebody owes under the contract. Submitted is not accepted, and a date that passes on an undischarged obligation is the kind of thing that is argued about at the end of a job with money attached.',
        lateObligations.map((o) => `${label(o.ref, o.statement, 'Obligation')} — ${daysPast(o.due_date, today)} days`),
        '/obligations'
      )
    )
  }

  const lateTasks = input.tasks.filter((t) => t.status !== 'done' && (daysPast(t.due_date, today) ?? -1) > 0)
  if (lateTasks.length > 0) {
    const byPerson = new Map<string, number>()
    for (const t of lateTasks) byPerson.set(t.assignee ?? 'Nobody assigned', (byPerson.get(t.assignee ?? 'Nobody assigned') ?? 0) + 1)
    out.push(
      finding(
        'schedule',
        'warning',
        'schedule/task-passed',
        'Tasks past their date',
        'Grouped by who holds them, because the useful question is never how many are late but whose they are.',
        [...byPerson.entries()].sort((a, b) => b[1] - a[1]).map(([who, n]) => `${who} — ${n}`),
        '/tasks'
      )
    )
  }

  // ── Testing above a level that is not finished ─────────────────────────
  //
  // The levels exist in order for a reason: L4 proves a system works on its
  // own, and it is only meaningful once L3 has proved it is safe to energise.
  // Passing checks at a level while a level below it still has work open is
  // not automatically wrong — programmes overlap, and sometimes deliberately
  // — but it is always worth somebody having decided it on purpose.
  const level = new Map<string, { total: number; done: number; pending: number }>()
  for (const c of input.checks) {
    if (!c.level) continue
    const e = level.get(c.level) ?? { total: 0, done: 0, pending: 0 }
    e.total++
    if (c.status === 'pass' || c.status === 'na') e.done++
    else e.pending++
    level.set(c.level, e)
  }
  const outOfOrder: string[] = []
  for (let i = LEVEL_ORDER.length - 1; i > 0; i--) {
    const higher = level.get(LEVEL_ORDER[i])
    if (!higher || higher.done === 0) continue
    for (let j = 0; j < i; j++) {
      const lower = level.get(LEVEL_ORDER[j])
      if (lower && lower.pending > 0) {
        outOfOrder.push(
          `${LEVEL_ORDER[i].split('_')[0].toUpperCase()} has ${higher.done} passed while ${LEVEL_ORDER[j]
            .split('_')[0]
            .toUpperCase()} still has ${lower.pending} open`
        )
      }
    }
  }
  if (outOfOrder.length > 0) {
    out.push(
      finding(
        'schedule',
        'warning',
        'schedule/testing-above-an-unfinished-level',
        'Testing has moved up before a lower level finished',
        'The levels are a sequence: each one is only meaningful once the one below it is done. Overlapping them can be a deliberate programme decision — this is here so that it is one, rather than something nobody noticed.',
        outOfOrder,
        '/checklists'
      )
    )
  }

  const projectLate = daysPast(input.project?.target_date ?? null, today)
  if (projectLate !== null && projectLate > 0 && input.openPunch > 0) {
    out.push(
      finding(
        'schedule',
        'blocking',
        'schedule/project-past-completion',
        'The project is past its completion date with defects open',
        `Target completion was ${projectLate} days ago and ${input.openPunch} defect${input.openPunch === 1 ? ' is' : 's are'} still open.`,
        [`${input.project?.name ?? 'This project'} — ${projectLate} days past target`],
        '/project'
      )
    )
  }

  return out
}

// ── Summary ──────────────────────────────────────────────────────────────

export function countBy(findings: SiteFinding[]): Record<RuleLevel, number> {
  return {
    blocking: findings.filter((f) => f.level === 'blocking').length,
    warning: findings.filter((f) => f.level === 'warning').length,
    note: findings.filter((f) => f.level === 'note').length,
  }
}

/** The one line a dashboard tile shows. */
export function headline(findings: SiteFinding[]): string {
  const n = countBy(findings)
  if (n.blocking > 0) {
    const records = findings.filter((f) => f.level === 'blocking').reduce((s, f) => s + f.count, 0)
    return `${n.blocking} thing${n.blocking === 1 ? '' : 's'} would not stand up at handover, across ${records} record${records === 1 ? '' : 's'}`
  }
  if (n.warning > 0) return `${n.warning} thing${n.warning === 1 ? '' : 's'} worth a look`
  if (n.note > 0) return `${n.note} note${n.note === 1 ? '' : 's'}`
  return 'Every rule passed'
}

export const SITE_RULES_NOTE =
  'These are rules, not an opinion. Each one counts records and reports what it counted — no model reads them, nothing is stored, and the answer changes the moment the records do. They say what cannot be verified by somebody who was not there; they do not say the work was done badly.'
