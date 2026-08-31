// Validity review — does the record support what it claims?
//
// Every other screen reports what has been entered. This one reads the same
// records and looks for the places where they contradict themselves: a hold
// point passed with nobody's signature on it, a test marked Pass whose own
// measured value fails its own acceptance criteria, an instrument that was
// out of calibration on the day it was used.
//
// These are the findings a third-party auditor raises, and every one of them
// is arithmetic — no judgement, no API call, no cost. They run on every load.
//
// Two rules govern this file:
//
//   1. A finding states what is wrong and why it matters, and links to the
//      place it is fixed. It never says what to do instead — that is the
//      engineer's call, and a tool that guesses corrective actions gets
//      ignored the first time it guesses wrong.
//   2. Nothing here is stored and nothing here is dismissible. Fix the cause
//      and the finding is gone on the next load. A dismissible audit finding
//      is a finding that gets dismissed.

import { evaluateTest } from '@/lib/tests'
import { LEVELS } from '@/lib/checklist'
import { inspectionType } from '@/lib/inspection'

export type Severity = 'critical' | 'high' | 'medium' | 'low'

export type Finding = {
  key: string
  kind: string
  severity: Severity
  title: string
  detail: string
  why: string
  href: string
  subjectKey: string | null
}

export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }

export function severityBadge(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return 'badge badge-danger'
    case 'high':
      return 'badge badge-warning'
    case 'medium':
      return 'badge badge-info'
    default:
      return 'badge badge-neutral'
  }
}

// ── Inputs ───────────────────────────────────────────────────────────────

export type CheckInput = {
  id: string
  item: string
  level: string
  status: string
  notes: string | null
  review_state: string | null
  inspection_type: string | null
  notified_at: string | null
  subjectKey: string | null
  subjectLabel: string
  attachmentCount: number
  hasSignature: boolean
  punchItemCount: number
  openPunchCount: number
}

export type TestInput = {
  id: string
  name: string
  criteria_type: string | null
  expected_min: number | null
  expected_max: number | null
  unit: string | null
  actual_value: number | null
  result: string
  approval_state: string | null
  inspection_type: string | null
  notified_at: string | null
  tested_by: string | null
  witness: string | null
  tested_at: string | null
  instrument_id: string | null
  instrumentExpiry: string | null
  instrumentLabel: string | null
  subjectKey: string | null
  subjectLabel: string
  hasSignature: boolean
  punchItemCount: number
}

export type PunchInput = {
  id: string
  ref: string | null
  title: string
  status: string
  checklist_item_id: string | null
  subjectKey: string | null
}

export type ValidityInput = {
  checks: CheckInput[]
  tests: TestInput[]
  punch: PunchInput[]
}

// ── Helpers ──────────────────────────────────────────────────────────────

const SETTLED_PUNCH = new Set(['verified', 'closed'])
const DONE_CHECK = new Set(['pass', 'fail', 'na'])
const APPROVED = new Set(['approved'])

function levelIndex(value: string): number {
  return LEVELS.findIndex((l) => l.value === value)
}

function levelName(value: string): string {
  return LEVELS.find((l) => l.value === value)?.label ?? value
}

// Words that, sitting in the note of something marked Pass, mean the note and
// the result disagree. Deliberately conservative: this produces a "worth a
// look", not an accusation, because "no leaks found" is a perfectly good note
// on a passed check and contains the word "leak".
const DOUBT = [
  'not complete',
  'incomplete',
  'to be completed',
  'to be done',
  'outstanding',
  'pending',
  'awaiting',
  'await',
  'tbc',
  'tbd',
  'temporary',
  'temp fix',
  'defect',
  'damaged',
  'missing',
  'failed',
  'leaking',
  'does not',
  'did not',
  'could not',
  'unable to',
  'not tested',
  'not verified',
  'not available',
  'subject to',
]

function doubtIn(note: string): string | null {
  const text = note.toLowerCase()
  for (const phrase of DOUBT) {
    if (text.includes(phrase)) return phrase
  }
  return null
}

/** A date string is after another, comparing calendar days only. */
function isAfter(a: string, b: string): boolean {
  return a.slice(0, 10) > b.slice(0, 10)
}

// ── The rules ────────────────────────────────────────────────────────────

export function review(input: ValidityInput): Finding[] {
  const findings: Finding[] = []
  const push = (f: Finding) => findings.push(f)

  // ── Checks ─────────────────────────────────────────────────────────────
  for (const c of input.checks) {
    const type = inspectionType(c.inspection_type)
    const done = DONE_CHECK.has(c.status)

    // A hold point that was worked past without a release signature is the
    // most serious thing on this page: the procedure said stop, and the
    // record says nobody said go.
    if (type === 'hold' && done && !c.hasSignature) {
      push({
        key: `hold:${c.id}`,
        kind: 'hold_point_unreleased',
        severity: 'critical',
        title: 'Hold point recorded as done with no release signature',
        detail: `${c.subjectLabel} — "${c.item}" is a Hold Point marked ${c.status.toUpperCase()}, but no release signature is on record.`,
        why: 'A hold point stops the work until a named person signs it off. Without that signature the record does not show that anybody authorised the work to continue past it, and an auditor will treat everything downstream of it as unsupported.',
        href: '/holdpoints',
        subjectKey: c.subjectKey,
      })
    }

    // A witness point is an invitation. If nobody was invited, the client's
    // absence is not their choice.
    if (type === 'witness' && done && !c.notified_at) {
      push({
        key: `witness:${c.id}`,
        kind: 'witness_no_notice',
        severity: 'high',
        title: 'Witness point carried out with no notice on record',
        detail: `${c.subjectLabel} — "${c.item}" is a Witness Point marked ${c.status.toUpperCase()}, but no notice was ever issued.`,
        why: 'A witness point only proceeds without the witness if they were properly invited and did not attend. With no notice on record there is nothing to show they were given the chance, so the work can be challenged and repeated.',
        href: '/holdpoints',
        subjectKey: c.subjectKey,
      })
    }

    // Approved while failing. Somebody signed off a defect.
    if (c.status === 'fail' && APPROVED.has(c.review_state ?? '')) {
      push({
        key: `approvedfail:${c.id}`,
        kind: 'approved_while_failing',
        severity: 'critical',
        title: 'A failed check has been approved',
        detail: `${c.subjectLabel} — "${c.item}" is marked FAIL and its review state is Approved.`,
        why: 'Approving a failed check closes it out with the defect still in it. Either the result is wrong or the approval is.',
        href: '/review',
        subjectKey: c.subjectKey,
      })
    }

    // A failure with nothing tracking it disappears the moment the page is
    // closed.
    if (c.status === 'fail' && c.punchItemCount === 0) {
      push({
        key: `failnopunch:${c.id}`,
        kind: 'failed_check_not_tracked',
        severity: 'high',
        title: 'Failed check with no punch item',
        detail: `${c.subjectLabel} — "${c.item}" is marked FAIL, and nothing on the punch list is tracking it.`,
        why: 'A failure that is not on the punch list is not being chased by anybody, does not block any gate, and does not appear in the outstanding-work figures the client is given.',
        href: '/issues',
        subjectKey: c.subjectKey,
      })
    }

    // Pass with nothing behind it.
    if (c.status === 'pass' && !c.notes && c.attachmentCount === 0) {
      push({
        key: `bare:${c.id}`,
        kind: 'unsupported_pass',
        severity: 'medium',
        title: 'Pass with no evidence and no note',
        detail: `${c.subjectLabel} — "${c.item}" is marked PASS with nothing recorded: no reading, no note, no document.`,
        why: 'A tick on its own proves that somebody clicked, not that anything was verified. In a handover dossier these are the rows the client asks about first.',
        href: '/checklists',
        subjectKey: c.subjectKey,
      })
    }

    // Pass whose own note argues with it.
    if (c.status === 'pass' && c.notes) {
      const phrase = doubtIn(c.notes)
      if (phrase) {
        push({
          key: `doubt:${c.id}`,
          kind: 'note_contradicts_result',
          severity: 'medium',
          title: 'Pass whose note may say otherwise',
          detail: `${c.subjectLabel} — "${c.item}" is marked PASS, and its note contains "${phrase}": ${c.notes}`,
          why: 'Either the note is out of date or the result is. This is a flag to read, not a verdict — some notes contain these words perfectly innocently.',
          href: '/checklists',
          subjectKey: c.subjectKey,
        })
      }
    }
  }

  // ── Tests ──────────────────────────────────────────────────────────────
  for (const t of input.tests) {
    // The strongest finding available, because it is pure arithmetic: the
    // number that was written down does not meet the criteria that were
    // written down, and the record says Pass anyway.
    if (t.criteria_type && t.criteria_type !== 'text' && t.actual_value !== null) {
      const computed = evaluateTest(t.criteria_type, t.expected_min, t.expected_max, t.actual_value)
      if (computed === 'fail' && t.result === 'pass') {
        push({
          key: `arith:${t.id}`,
          kind: 'result_contradicts_criteria',
          severity: 'critical',
          title: 'Test marked Pass but the measured value fails its own criteria',
          detail: `${t.subjectLabel} — "${t.name}" recorded ${t.actual_value}${t.unit ? ` ${t.unit}` : ''}, which does not meet its acceptance criteria, yet the result on file is PASS.`,
          why: 'The measured value and the acceptance criteria are both on the record and they disagree with the result. This is the single easiest thing for an auditor to find and the hardest to explain.',
          href: '/tests',
          subjectKey: t.subjectKey,
        })
      }
    }

    // An expired instrument invalidates the reading it took.
    if (t.instrumentExpiry && t.tested_at && isAfter(t.tested_at, t.instrumentExpiry)) {
      push({
        key: `cal:${t.id}`,
        kind: 'instrument_out_of_calibration',
        severity: 'critical',
        title: 'Test taken with an instrument that was out of calibration',
        detail: `${t.subjectLabel} — "${t.name}" was tested on ${t.tested_at.slice(0, 10)} using ${
          t.instrumentLabel ?? 'an instrument'
        }, whose calibration expired on ${t.instrumentExpiry}.`,
        why: 'A reading taken with an out-of-calibration instrument is not evidence of anything, whatever the number says. The test has to be repeated with a valid instrument — finding this now is cheaper than finding it at handover.',
        href: '/instruments',
        subjectKey: t.subjectKey,
      })
    }

    // A number with no instrument behind it.
    if (t.actual_value !== null && !t.instrument_id) {
      push({
        key: `noinst:${t.id}`,
        kind: 'no_instrument_recorded',
        severity: 'medium',
        title: 'Measured value with no instrument recorded',
        detail: `${t.subjectLabel} — "${t.name}" records ${t.actual_value}${t.unit ? ` ${t.unit}` : ''} but no test instrument.`,
        why: 'Without the instrument there is no way to show the reading was taken with something in calibration, which is the first thing asked about a disputed result.',
        href: '/tests',
        subjectKey: t.subjectKey,
      })
    }

    if (t.result === 'fail' && APPROVED.has(t.approval_state ?? '')) {
      push({
        key: `approvedfailtest:${t.id}`,
        kind: 'approved_while_failing',
        severity: 'critical',
        title: 'A failed test has been approved',
        detail: `${t.subjectLabel} — "${t.name}" is FAIL and its approval state is Approved.`,
        why: 'Approving a failed test closes it out with the failure still in it. Either the result is wrong or the approval is.',
        href: '/tests',
        subjectKey: t.subjectKey,
      })
    }

    if (t.result === 'fail' && t.punchItemCount === 0) {
      push({
        key: `failtestnopunch:${t.id}`,
        kind: 'failed_test_not_tracked',
        severity: 'high',
        title: 'Failed test with no punch item',
        detail: `${t.subjectLabel} — "${t.name}" is marked FAIL, and nothing on the punch list is tracking it.`,
        why: 'A failed test that is not on the punch list blocks no gate and appears in no outstanding-work figure. It will be found at handover instead.',
        href: '/issues',
        subjectKey: t.subjectKey,
      })
    }

    // The person who did the work is the person who witnessed it.
    if (t.tested_by && t.witness && t.tested_by.trim().toLowerCase() === t.witness.trim().toLowerCase()) {
      push({
        key: `self:${t.id}`,
        kind: 'self_witnessed',
        severity: 'high',
        title: 'Test witnessed by the person who performed it',
        detail: `${t.subjectLabel} — "${t.name}" records ${t.tested_by} as both the tester and the witness.`,
        why: 'A witness exists to be a second pair of eyes. When they are the same person the record shows one person\'s word twice, which is not what a witnessed test is.',
        href: '/tests',
        subjectKey: t.subjectKey,
      })
    }

    if (inspectionType(t.inspection_type) === 'hold' && t.result !== 'pending' && !t.hasSignature) {
      push({
        key: `holdtest:${t.id}`,
        kind: 'hold_point_unreleased',
        severity: 'critical',
        title: 'Hold point test carried out with no release signature',
        detail: `${t.subjectLabel} — "${t.name}" is a Hold Point with a result on file and no release signature.`,
        why: 'A hold point stops the work until a named person signs it off. Nothing on the record shows anybody did.',
        href: '/holdpoints',
        subjectKey: t.subjectKey,
      })
    }
  }

  // ── Punch items against their checks ───────────────────────────────────
  const checkById = new Map(input.checks.map((c) => [c.id, c]))
  for (const p of input.punch) {
    if (!SETTLED_PUNCH.has(p.status) || !p.checklist_item_id) continue
    const check = checkById.get(p.checklist_item_id)
    if (check && check.status === 'fail') {
      push({
        key: `closedstillfail:${p.id}`,
        kind: 'punch_closed_check_still_failed',
        severity: 'high',
        title: 'Punch item closed while the check it came from is still failed',
        detail: `${p.ref ? `${p.ref} — ` : ''}"${p.title}" is ${p.status}, but the check it was raised from is still marked FAIL.`,
        why: 'One of the two is wrong. Either the defect was cleared and the check was never re-done, or the punch item was closed early.',
        href: '/issues',
        subjectKey: p.subjectKey,
      })
    }
  }

  // ── Levels skipped ─────────────────────────────────────────────────────
  // Commissioning levels are sequential by design. A tag with completed L4
  // work and nothing at all recorded at L3 has either skipped a stage or has
  // records living somewhere other than here — both are worth knowing.
  const bySubject = new Map<string, CheckInput[]>()
  for (const c of input.checks) {
    if (!c.subjectKey) continue
    const list = bySubject.get(c.subjectKey)
    if (list) list.push(c)
    else bySubject.set(c.subjectKey, [c])
  }

  for (const [key, checks] of bySubject) {
    const label = checks[0].subjectLabel
    const levelsPresent = new Set(checks.map((c) => c.level))
    const highestDone = checks
      .filter((c) => DONE_CHECK.has(c.status))
      .reduce((max, c) => Math.max(max, levelIndex(c.level)), -1)
    if (highestDone <= 0) continue

    for (let i = 0; i < highestDone; i++) {
      const level = LEVELS[i]
      // L1 is factory acceptance and legitimately absent on plenty of
      // equipment — a locally fabricated panel never had a FAT. Only the
      // site levels are treated as a gap.
      if (i === 0) continue
      if (!levelsPresent.has(level.value)) {
        push({
          key: `skip:${key}:${level.value}`,
          kind: 'level_skipped',
          severity: 'medium',
          title: `No ${level.label.split('—')[0].trim()} checks recorded`,
          detail: `${label} has completed work at ${levelName(LEVELS[highestDone].value)} but nothing at all is recorded at ${level.label}.`,
          why: 'The levels are sequential: the later one assumes the earlier one was done. Either the stage was skipped or its records are somewhere other than CxSentinel, and neither shows up in a dossier.',
          href: '/checklists',
          subjectKey: key,
        })
      }
    }
  }

  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

// ── Reading the result ───────────────────────────────────────────────────

export type ValiditySummary = {
  total: number
  critical: number
  high: number
  medium: number
  low: number
  recordsExamined: number
  byKind: { kind: string; title: string; count: number; severity: Severity }[]
}

export function summarise(findings: Finding[], recordsExamined: number): ValiditySummary {
  const byKind = new Map<string, { kind: string; title: string; count: number; severity: Severity }>()
  const summary: ValiditySummary = {
    total: findings.length,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    recordsExamined,
    byKind: [],
  }

  for (const f of findings) {
    summary[f.severity] += 1
    const existing = byKind.get(f.kind)
    if (existing) existing.count += 1
    else byKind.set(f.kind, { kind: f.kind, title: f.title, count: 1, severity: f.severity })
  }

  summary.byKind = [...byKind.values()].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count
  )
  return summary
}

/**
 * The one-line reading. Like every other verdict in CxSentinel it refuses to
 * authorise: a clean validity review means nothing contradicts itself, not
 * that the work is right.
 */
export function verdict(summary: ValiditySummary): { label: string; tone: Severity | 'ok'; detail: string } {
  if (summary.recordsExamined === 0) {
    return {
      label: 'NOTHING TO EXAMINE',
      tone: 'ok',
      detail: 'No checks, tests or punch items are recorded yet, so there is nothing for this review to read.',
    }
  }
  if (summary.critical > 0) {
    return {
      label: 'RECORDS CONTRADICT THEMSELVES',
      tone: 'critical',
      detail: `${summary.critical} finding${
        summary.critical === 1 ? '' : 's'
      } where the record states something its own contents do not support. These are what a third-party auditor finds first.`,
    }
  }
  if (summary.high > 0) {
    return {
      label: 'GAPS IN THE RECORD',
      tone: 'high',
      detail: `${summary.high} finding${
        summary.high === 1 ? '' : 's'
      } where something required is missing rather than wrong — a notice never issued, a failure nobody is tracking.`,
    }
  }
  if (summary.total > 0) {
    return {
      label: 'WORTH A LOOK',
      tone: 'medium',
      detail: `${summary.total} finding${summary.total === 1 ? '' : 's'} that are not defects in themselves but would be asked about.`,
    }
  }
  return {
    label: 'NOTHING CONTRADICTS ITSELF',
    tone: 'ok',
    detail: `All ${summary.recordsExamined} records read consistently. That is not the same as the work being right — it means nothing on file argues with anything else on file.`,
  }
}
