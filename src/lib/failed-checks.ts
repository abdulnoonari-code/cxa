// A failed check is a defect. Turning one into the other.
//
// ── The hole this closes ────────────────────────────────────────────────
//
// Import a test script with twenty "No" answers and you get twenty failed
// checks and an empty punch list. Every screen that counts defects says
// zero, the readiness figures say zero, the client report says zero — and
// twenty things are wrong on the plant.
//
// Nobody did anything wrong. The two registers simply do not talk, and the
// person who wrote "No" on the sheet reasonably assumed the software had
// noticed. That is the most dangerous kind of gap in a system like this: not
// a wrong number, an absent one.
//
// ── What this deliberately refuses to work out ──────────────────────────
//
// **The category.** A, B or C is not a severity, it is a commercial position
// — what this defect is allowed to stop, and who carries the cost of it
// stopping that. Nothing in a failed check tells you that. It is a decision
// somebody makes, usually with a contract open, and software that fills it
// in produces a punch list where the most consequential field on every row
// was guessed by a computer and then signed for by a person.
//
// So every item raised here comes out UNCATEGORISED, and the punch rules
// already report uncategorised items so they cannot be quietly forgotten.
// The same goes for severity, the responsible party, and the date.
//
// What it does fill in is what the check already knows and a person would
// otherwise re-type: what was being checked, where in the procedure, at what
// level, against which piece of plant, and what the tester wrote down.

export type FailedCheck = {
  id: string
  serial: string | null
  sheet: string | null
  item: string | null
  section: string | null
  level: string | null
  status: string | null
  subjectType: string | null
  subjectId: string | null
  equipmentId: string | null
  /** The Remark column — what the tester actually wrote. */
  remark: string | null
  evidenceRef: string | null
}

/** A punch item ready to be written, with everything that must not be guessed left out. */
export type PunchDraft = {
  checkId: string
  title: string
  description: string
  level: string | null
  subjectType: string | null
  subjectId: string | null
  equipmentId: string | null
}

const TITLE_MAX = 90

/**
 * The title.
 *
 * The check's own words, because a punch item that reads differently from the
 * check that produced it is two records of one fact that a reviewer then has
 * to reconcile. Long checks are cut at a sentence boundary where there is one
 * — never mid-word — and the whole text is repeated in the description, so
 * nothing is lost by the trim.
 */
export function draftTitle(item: string | null): string {
  const text = (item ?? '').trim().replace(/\s+/g, ' ')
  if (!text) return 'Failed check'
  if (text.length <= TITLE_MAX) return text

  const stop = text.slice(0, TITLE_MAX).lastIndexOf('. ')
  if (stop > 30) return text.slice(0, stop + 1)

  const space = text.slice(0, TITLE_MAX).lastIndexOf(' ')
  return `${text.slice(0, space > 30 ? space : TITLE_MAX).trimEnd()}…`
}

/** The description — everything the check knows, written out. */
export function draftDescription(c: FailedCheck): string {
  const parts: string[] = []
  const item = (c.item ?? '').trim()
  if (item) parts.push(item)

  const where: string[] = []
  if (c.serial) where.push(`line ${c.serial}`)
  if (c.sheet) where.push(`of ${c.sheet}`)
  if (c.section) where.push(`— ${c.section}`)
  if (where.length > 0) parts.push(`Raised from ${where.join(' ')}.`)
  else parts.push('Raised from a failed check.')

  if (c.remark && c.remark.trim()) parts.push(`The tester wrote: ${c.remark.trim()}`)
  if (c.evidenceRef && c.evidenceRef.trim()) parts.push(`Evidence named on the sheet: ${c.evidenceRef.trim()}`)

  return parts.join('\n\n')
}

export function draftFrom(c: FailedCheck): PunchDraft {
  return {
    checkId: c.id,
    title: draftTitle(c.item),
    description: draftDescription(c),
    level: c.level,
    subjectType: c.subjectType,
    subjectId: c.subjectId,
    equipmentId: c.equipmentId,
  }
}

/**
 * Failed checks with nothing raised against them.
 *
 * `raisedFor` is the set of checklist item ids that already have a punch item
 * pointing at them — INCLUDING closed ones. A defect that was raised, fixed
 * and closed while the check was never re-tested is a different problem, and
 * raising a second item for it would be wrong.
 */
export function unraised(checks: FailedCheck[], raisedFor: Set<string>): FailedCheck[] {
  return checks.filter((c) => c.status === 'fail' && !raisedFor.has(c.id))
}

export type FailedCheckFinding = {
  rule: string
  level: 'blocking' | 'warning' | 'note'
  title: string
  detail: string
  count: number
  examples: string[]
}

export function failedCheckFindings(checks: FailedCheck[], raisedFor: Set<string>): FailedCheckFinding[] {
  const out: FailedCheckFinding[] = []

  const open = unraised(checks, raisedFor)
  if (open.length > 0) {
    out.push({
      rule: 'check/failed-with-nothing-raised',
      level: 'blocking',
      title: 'Failed checks with no punch item against them',
      detail:
        'Somebody wrote No on a test sheet and nothing was raised. The check is honest and the punch list is honest, and between them a defect exists that every count on this project reports as zero — including the readiness figures and anything sent to the client.',
      count: open.length,
      examples: open.map((c) => `${c.serial ? `${c.serial}. ` : ''}${(c.item ?? '').slice(0, 60)}`).slice(0, 5),
    })
  }

  // The reverse, and it is worth saying separately: a check that was failed,
  // had an item raised, and has since been marked pass while the item is
  // still open, is caught by the punch rules from the other side.
  return out
}
