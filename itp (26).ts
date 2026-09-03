// The Inspection and Test Plan.
//
// CxSentinel already knows that an activity is a Hold Point. What it has never
// known is **whose** hold point it is — and that gap is the reason a pack can
// say "1 hold point with no release signature" while naming nobody to chase.
// On a real ITP every point belongs to somebody. The client holds energization;
// the CxA holds the point before cable pulling; the authority holds the one
// before the grid connection. Which of them it is decides who gets the phone
// call, and it is the single most useful fact on the sheet.
//
// Three positions govern this file:
//
//   1. **A point with no party is worse than no point at all.** A hold point
//      nobody owns will never be released, because there is nobody whose job
//      it is. That is reported as a finding in its own right, not quietly
//      filled in with a guess.
//
//   2. **A party assigned by convention is a weaker claim than one written on
//      the plan, and the plan says which is which.** The project convention
//      ("at L4, hold points are the Client's") exists so a thousand imported
//      rows are not all unowned. It is a default, it is labelled as one, and
//      nobody gets to say afterwards that it was agreed.
//
//   3. **The ITP does not authorise either.** It states what the plan says and
//      what the records show against it. Whether the work may proceed is a
//      signature, and the signature is on the hold point, not on this.

import { INSPECTION_TYPES, inspectionCode, inspectionLabel, carriesRelease, type ReleaseState } from '@/lib/inspection'
import { PARTIES, partyShort, partyLabel, type PartyValue } from '@/lib/obligations'
import { LEVELS } from '@/lib/checklist'

export { PARTIES, partyShort, partyLabel }
export type { PartyValue }

// ── Who holds the point ──────────────────────────────────────────────────

export type PartySource = 'explicit' | 'convention' | 'none'

export type PointParty = {
  party: PartyValue | null
  source: PartySource
  /** What to print beside the party, so a default is never mistaken for an agreement. */
  note: string
}

export const PARTY_SOURCE_LABELS: Record<PartySource, string> = {
  explicit: 'On the plan',
  convention: 'Project default',
  none: 'Nobody named',
}

/** A project's standing convention: at this level, this kind of point is theirs. */
export type Convention = {
  level: string
  inspection_type: string
  party: string
}

export function conventionKey(level: string | null, type: string | null): string {
  return `${level ?? ''}::${type ?? 'surveillance'}`
}

export function buildConventions(rows: Convention[]): Map<string, PartyValue> {
  const map = new Map<string, PartyValue>()
  for (const r of rows) {
    if (!isParty(r.party)) continue
    map.set(conventionKey(r.level, r.inspection_type), r.party)
  }
  return map
}

export function isParty(value: string | null | undefined): value is PartyValue {
  return PARTIES.some((p) => p.value === value)
}

/**
 * Resolve who holds a point: what the row says, else what the project's
 * convention says, else nobody — and never a guess dressed up as a fact.
 */
export function resolveParty(
  explicit: string | null | undefined,
  level: string | null,
  inspectionType: string | null,
  conventions: Map<string, PartyValue>
): PointParty {
  if (isParty(explicit)) {
    return { party: explicit, source: 'explicit', note: 'Named on this activity.' }
  }
  const byConvention = conventions.get(conventionKey(level, inspectionType))
  if (byConvention) {
    return {
      party: byConvention,
      source: 'convention',
      note: 'Not written on this activity — taken from the project default for this level and point type.',
    }
  }
  return {
    party: null,
    source: 'none',
    note: 'No party holds this point. Nobody has been made responsible for releasing or attending it.',
  }
}

// ── One row of the plan ──────────────────────────────────────────────────

export type ItpActivity = {
  /** 'checklist_item' | 'test_record' — which register the row came from. */
  entity: string
  id: string
  ref: string | null
  tag: string
  activity: string
  level: string
  inspectionType: string
  /** The acceptance criterion, where the record carries one. */
  criteria: string | null
  /** The controlled document the criterion came from, where one is cited. */
  reference: string | null
  holder: PointParty
  /** Whether the work itself is finished, however it turned out. */
  workComplete: boolean
  /** Whether the work was recorded as failing. */
  failed: boolean
  release: ReleaseState
  notifiedAt: string | null
  signedBy: string | null
  signedCompany: string | null
  signedAt: string | null
}

export function inspectionOrder(value: string): number {
  const order = ['hold', 'witness', 'review', 'surveillance']
  const i = order.indexOf(value)
  return i === -1 ? order.length : i
}

export function levelOrder(value: string): number {
  const i = LEVELS.findIndex((l) => l.value === value)
  return i === -1 ? LEVELS.length : i
}

/** Hold and witness points first, then by level — the order an ITP is read in. */
export function sortActivities(rows: ItpActivity[]): ItpActivity[] {
  return [...rows].sort((a, b) => {
    const t = inspectionOrder(a.inspectionType) - inspectionOrder(b.inspectionType)
    if (t !== 0) return t
    const l = levelOrder(a.level) - levelOrder(b.level)
    if (l !== 0) return l
    return (a.tag || '').localeCompare(b.tag || '') || a.activity.localeCompare(b.activity)
  })
}

// ── What the records show against the plan ───────────────────────────────

export type FindingSeverity = 'blocking' | 'gap' | 'note'

export type ItpFinding = {
  severity: FindingSeverity
  activity: ItpActivity
  title: string
  /** Who has to do something about it, in words. */
  owes: string
  detail: string
}

/**
 * Read one activity against its plan.
 *
 * Every message here names a party wherever one exists, because a finding that
 * says "a hold point is unreleased" produces a meeting and a finding that says
 * "the Client has not released HP at TX-01" produces a phone call.
 */
export function findingsFor(a: ItpActivity): ItpFinding[] {
  const found: ItpFinding[] = []
  const who = a.holder.party ? partyShort(a.holder.party) : null
  const where = a.tag ? `${a.tag} — ${a.activity}` : a.activity

  // A hold or witness point with nobody holding it. This is reported whether or
  // not the work has been done, because the time to find out that nobody owns a
  // hold point is before the work reaches it.
  if (carriesRelease(a.inspectionType) && !a.holder.party) {
    found.push({
      severity: a.inspectionType === 'hold' ? 'blocking' : 'gap',
      activity: a,
      title: `${inspectionLabel(a.inspectionType)} with no party`,
      owes: 'Whoever writes the ITP',
      detail:
        a.inspectionType === 'hold'
          ? `${where} is a Hold Point and no party holds it. Work stops here until somebody signs, and no such person exists in the plan. It cannot be released as it stands.`
          : `${where} is a Witness Point and no party holds it. Nobody will be given notice, so nobody will attend.`,
    })
  }

  if (a.release === 'rejected') {
    found.push({
      severity: 'blocking',
      activity: a,
      title: 'Not released — rework required',
      owes: 'Contractor',
      detail: `${where} was inspected and refused. The work has to be redone and re-offered${
        who ? ` to the ${who}` : ''
      }.`,
    })
    return found
  }

  // An unreleased hold point is only worth reporting when somebody holds it.
  // Where nobody does, the finding above has already said so and said it
  // better — reporting both produces two lines for one point, and the second
  // one reads "the holding party has not been told", which is a sentence about
  // a person who does not exist.
  if (
    a.inspectionType === 'hold' &&
    a.holder.party &&
    (a.release === 'awaiting_notice' || a.release === 'notified')
  ) {
    found.push({
      severity: 'blocking',
      activity: a,
      title: `Hold Point awaiting the ${who}`,
      owes: who as string,
      detail:
        a.release === 'awaiting_notice'
          ? `${where} is complete and the ${who} has not been told it is ready. Nothing downstream of it is supported until it is released.`
          : `${where} is complete, notice was given on ${(a.notifiedAt ?? '').slice(
              0,
              10
            )}, and the ${who} has not signed. Work is stopped here.`,
    })
  }

  if (a.inspectionType === 'witness' && a.workComplete && a.release === 'awaiting_notice') {
    found.push({
      severity: 'gap',
      activity: a,
      title: who ? `${who} was never given notice` : 'Witness Point with no notice',
      owes: 'Contractor',
      detail: `${where} was carried out and ${
        who ? `the ${who}` : 'the witness'
      } was not invited. The right to attend was in the plan and it was not offered — the work stands, the record of it does not.`,
    })
  }

  if (a.inspectionType === 'witness' && a.release === 'notified') {
    found.push({
      severity: 'note',
      activity: a,
      title: who ? `Awaiting the ${who}` : 'Awaiting the witness',
      owes: who ?? 'The witness',
      detail: `${where} was offered for witness on ${(a.notifiedAt ?? '').slice(0, 10)} and nobody has signed. A Witness Point does not stop the work, so this is a record to close, not a blockage.`,
    })
  }

  if (a.failed) {
    found.push({
      severity: 'blocking',
      activity: a,
      title: 'Recorded as failed',
      owes: 'Contractor',
      detail: `${where} is recorded as a failure and has not been redone.`,
    })
  }

  return found
}

export function findingsIn(rows: ItpActivity[]): ItpFinding[] {
  const all = rows.flatMap(findingsFor)
  const rank: Record<FindingSeverity, number> = { blocking: 0, gap: 1, note: 2 }
  return all.sort((a, b) => rank[a.severity] - rank[b.severity])
}

// ── The shape of the plan ────────────────────────────────────────────────

export type ItpSummary = {
  total: number
  byType: { value: string; code: string; label: string; count: number }[]
  byLevel: { value: string; label: string; count: number }[]
  /** Points that carry a release, i.e. hold and witness. */
  points: number
  unowned: number
  byConvention: number
  explicit: number
  released: number
  awaiting: number
  parties: { party: PartyValue; label: string; holds: number; outstanding: number }[]
}

export function summarise(rows: ItpActivity[]): ItpSummary {
  const points = rows.filter((r) => carriesRelease(r.inspectionType))
  const byParty = new Map<PartyValue, { holds: number; outstanding: number }>()

  for (const r of points) {
    if (!r.holder.party) continue
    const entry = byParty.get(r.holder.party) ?? { holds: 0, outstanding: 0 }
    entry.holds += 1
    if (r.release === 'awaiting_notice' || r.release === 'notified') entry.outstanding += 1
    byParty.set(r.holder.party, entry)
  }

  return {
    total: rows.length,
    byType: INSPECTION_TYPES.map((t) => ({
      value: t.value,
      code: t.code,
      label: t.label,
      count: rows.filter((r) => r.inspectionType === t.value).length,
    })),
    byLevel: LEVELS.map((l) => ({
      value: l.value,
      label: l.label,
      count: rows.filter((r) => r.level === l.value).length,
    })),
    points: points.length,
    unowned: points.filter((r) => !r.holder.party).length,
    byConvention: points.filter((r) => r.holder.source === 'convention').length,
    explicit: points.filter((r) => r.holder.source === 'explicit').length,
    released: points.filter((r) => r.release === 'released').length,
    awaiting: points.filter((r) => r.release === 'awaiting_notice' || r.release === 'notified').length,
    parties: [...byParty.entries()]
      .map(([party, v]) => ({ party, label: partyShort(party), holds: v.holds, outstanding: v.outstanding }))
      .sort((a, b) => b.outstanding - a.outstanding || b.holds - a.holds),
  }
}

// ── The verdict ──────────────────────────────────────────────────────────

export type ItpVerdict = { label: string; tone: 'blocking' | 'gap' | 'ready' | 'empty'; detail: string }

/**
 * As everywhere else in CxSentinel, the best case is a statement about the
 * record and not a permission. "The plan is being followed" is the strongest
 * thing this may say, and it is still followed by who holds what.
 */
export function verdict(rows: ItpActivity[], findings: ItpFinding[], summary: ItpSummary): ItpVerdict {
  if (rows.length === 0) {
    return {
      label: 'NO PLAN',
      tone: 'empty',
      detail:
        'No inspection or test activity is recorded for this scope. Until there is, there is nothing to hold, witness or review.',
    }
  }

  const blocking = findings.filter((f) => f.severity === 'blocking')
  if (blocking.length > 0) {
    const owed = [...new Set(blocking.map((f) => f.owes))].filter((o) => o !== 'Nobody named')
    return {
      label: 'WORK IS STOPPED',
      tone: 'blocking',
      detail: `${blocking.length} point${blocking.length === 1 ? '' : 's'} in this plan stop${
        blocking.length === 1 ? 's' : ''
      } work${owed.length > 0 ? `. Owed by: ${owed.join(', ')}` : ''}${
        summary.unowned > 0
          ? `. ${summary.unowned} of them ${summary.unowned === 1 ? 'has' : 'have'} no party at all, so there is nobody to ask.`
          : '.'
      }`,
    }
  }

  const gaps = findings.filter((f) => f.severity === 'gap')
  if (gaps.length > 0) {
    return {
      label: 'PLAN NOT FULLY FOLLOWED',
      tone: 'gap',
      detail: `Nothing is stopped, but ${gaps.length} thing${gaps.length === 1 ? '' : 's'} in the plan ${
        gaps.length === 1 ? 'was' : 'were'
      } not carried out as written — most often somebody entitled to attend was not asked.`,
    }
  }

  return {
    label: 'PLAN IS BEING FOLLOWED',
    tone: 'ready',
    detail: `${summary.points} inspection point${summary.points === 1 ? '' : 's'} in this plan, ${
      summary.released
    } released or witnessed and none outstanding. This says the plan was followed; it does not say the plant is ready.`,
  }
}

export function toneBadgeClass(tone: string): string {
  switch (tone) {
    case 'blocking':
      return 'badge badge-danger'
    case 'gap':
      return 'badge badge-warning'
    case 'ready':
      return 'badge badge-success'
    default:
      return 'badge badge-neutral'
  }
}

export function severityBadgeClass(severity: FindingSeverity): string {
  switch (severity) {
    case 'blocking':
      return 'badge badge-danger'
    case 'gap':
      return 'badge badge-warning'
    default:
      return 'badge badge-neutral'
  }
}

export function severityWord(severity: FindingSeverity): string {
  return severity === 'blocking' ? 'STOPS WORK' : severity === 'gap' ? 'NOT FOLLOWED' : 'NOTE'
}

// ── The matrix ───────────────────────────────────────────────────────────
//
// The classic ITP layout: activities down the side, parties across the top,
// and an H, W, S or R in the cell where a party is involved. It is the form a
// client expects to approve, and it is derived from the same rows as
// everything else.

export type MatrixColumn = { party: PartyValue; label: string }

export function matrixColumns(rows: ItpActivity[]): MatrixColumn[] {
  const present = new Set<PartyValue>()
  for (const r of rows) if (r.holder.party) present.add(r.holder.party)
  return PARTIES.filter((p) => present.has(p.value)).map((p) => ({ party: p.value, label: partyShort(p.value) }))
}

/** The letter in the cell, or an empty string where that party is not involved. */
export function matrixCell(row: ItpActivity, party: PartyValue): string {
  if (row.holder.party !== party) return ''
  const code = inspectionCode(row.inspectionType)
  // A default is printed in brackets. A client approving this sheet can see at
  // a glance which points were assigned to them and which were assumed.
  return row.holder.source === 'convention' ? `(${code})` : code
}

/**
 * The last column, headed "Not stated".
 *
 * Every row of an ITP carries at least one letter, because every activity is
 * done by somebody. Without this column a plan where most activities name
 * nobody prints as a grid of empty cells and reads as a broken document rather
 * than an incomplete plan — which is the opposite of the point. Whether a blank
 * here is serious depends entirely on the letter in it: an S means nobody wrote
 * down who does the work, an H means nobody can release it.
 */
export const UNASSIGNED_COLUMN = 'Not stated'

export function unassignedCell(row: ItpActivity): string {
  return row.holder.party ? '' : inspectionCode(row.inspectionType)
}

/** Whether an unassigned row is the serious kind — a point nobody can release. */
export function unassignedIsSerious(row: ItpActivity): boolean {
  return !row.holder.party && carriesRelease(row.inspectionType)
}

export function hasUnassigned(rows: ItpActivity[]): boolean {
  return rows.some((r) => !r.holder.party)
}

// ── Changing one point by hand ───────────────────────────────────────────

export type PointChange =
  | { ok: false; reason: 'bad_party' | 'bad_type' | 'no_change' }
  | {
      ok: true
      patch: { point_party?: PartyValue | null; inspection_type?: string }
      /** What the audit trail will say, in the words a reader would use. */
      describe: string
    }

/**
 * Work out what changing one inspection point actually does.
 *
 * Extracted out of the server action so it can be asserted. The action is
 * where the writing and the permission check live; deciding *whether* a change
 * is real, and what to call it, is a rule — and rules in this codebase are
 * tested.
 *
 * Note what counts as "was". Only a party written against the activity is a
 * previous value; one supplied by the project default is not, because setting
 * the same party explicitly IS a change — it turns an assumption into an
 * agreement, which is the whole distinction the brackets exist to mark.
 */
export function planPointChange(input: {
  wasParty: string | null
  wasType: string
  party: string | null
  type: string | null
}): PointChange {
  const nextParty = input.party === '' || input.party === null ? null : input.party
  if (nextParty !== null && !isParty(nextParty)) return { ok: false, reason: 'bad_party' }
  if (input.type && !INSPECTION_TYPES.some((t) => t.value === input.type)) return { ok: false, reason: 'bad_type' }

  const wasParty = input.wasParty === '' ? null : input.wasParty
  const patch: { point_party?: PartyValue | null; inspection_type?: string } = {}
  const bits: string[] = []

  if (nextParty !== wasParty) {
    patch.point_party = nextParty
    bits.push(`held by ${wasParty ? partyLabel(wasParty) : 'nobody'} → ${nextParty ? partyLabel(nextParty) : 'nobody'}`)
  }
  if (input.type && input.type !== input.wasType) {
    patch.inspection_type = input.type
    bits.push(`point type ${inspectionLabel(input.wasType)} → ${inspectionLabel(input.type)}`)
  }

  if (bits.length === 0) return { ok: false, reason: 'no_change' }
  return { ok: true, patch, describe: bits.join('; ') }
}

/**
 * Whether a project default may be set for this kind of point.
 *
 * Surveillance and Review points carry no release, so nobody needs to hold
 * them. A default for one would put a party on four hundred rows that will
 * never be waiting on anybody, and bury the four that are.
 */
export function conventionAllowed(inspectionType: string): boolean {
  return inspectionType === 'hold' || inspectionType === 'witness'
}

export const MATRIX_KEY =
  'H = Hold Point, work stops until released · W = Witness Point, notice given and attendance invited · ' +
  'R = Review Point, documents reviewed before the next activity · S = Surveillance, record checked afterwards. ' +
  'A letter in brackets was taken from the project default for that level and point type, not written against the activity. ' +
  'A letter under "Not stated" means no party is recorded against that activity — harmless on Surveillance, and the ' +
  'reason a Hold Point can never be released.'
