import { calibrationStatus } from '@/lib/tests'
import { releaseBlocks, type ReleaseState } from '@/lib/inspection'

// The commissioning stages a system moves through. Configurable per project is
// a later job; this is the common industrial sequence.
export const STAGES = [
  { value: 'construction', label: 'Construction' },
  { value: 'mechanical_completion', label: 'Mechanical Completion' },
  { value: 'pre_commissioning', label: 'Pre-Commissioning' },
  { value: 'functional_testing', label: 'Functional Testing' },
  { value: 'energization', label: 'Energization' },
  { value: 'performance', label: 'Performance Testing' },
  { value: 'handover', label: 'Handover' },
]

export function stageLabel(value: string | null): string {
  return STAGES.find((s) => s.value === value)?.label ?? 'Construction'
}

export type Finding = { kind: 'blocker' | 'warning'; text: string }

export type Readiness = {
  percent: number
  ready: boolean
  requirementsMet: number
  requirementsTotal: number
  blockers: Finding[]
  warnings: Finding[]
}

// The two ITP fields are optional so that anything computing readiness from a
// narrower query still works — a row without them is simply surveillance.
type InspectionFields = {
  inspection_type?: string | null
  release?: ReleaseState
  hold_label?: string | null
}

type CheckRow = { status: string; review_state?: string | null } & InspectionFields
type TestRow = {
  result: string
  approval_state?: string | null
  name: string
  instrument_expiry?: string | null
  has_instrument?: boolean
} & InspectionFields
type IssueRow = { category: string | null; severity: string; status: string; title: string }

// Readiness is computed from the records themselves, never stored — so it can
// never drift out of step with the data underneath it. A blocker stops the
// system advancing; a warning is something a person should see but which does
// not by itself prevent progression.
//
// This function decides nothing about safety. It reports what the records say.
// Authorising energization remains a human act.
export function computeReadiness(
  checks: CheckRow[],
  tests: TestRow[],
  issues: IssueRow[]
): Readiness {
  const blockers: Finding[] = []
  const warnings: Finding[] = []

  // ── Checks ──────────────────────────────────────────────────────────────
  const failedChecks = checks.filter((c) => c.status === 'fail')
  const pendingChecks = checks.filter((c) => c.status === 'pending')
  const resolvedChecks = checks.filter((c) => c.status === 'pass' || c.status === 'na')
  const unapprovedChecks = resolvedChecks.filter((c) => (c.review_state ?? 'draft') !== 'approved')
  const rejectedChecks = checks.filter((c) => (c.review_state ?? 'draft') === 'rejected')

  if (failedChecks.length > 0) {
    blockers.push({
      kind: 'blocker',
      text: `${failedChecks.length} check${failedChecks.length === 1 ? '' : 's'} failed and awaiting corrective action`,
    })
  }
  if (rejectedChecks.length > 0) {
    blockers.push({
      kind: 'blocker',
      text: `${rejectedChecks.length} check${rejectedChecks.length === 1 ? '' : 's'} rejected at review — rework required`,
    })
  }
  if (pendingChecks.length > 0) {
    warnings.push({
      kind: 'warning',
      text: `${pendingChecks.length} check${pendingChecks.length === 1 ? '' : 's'} not yet carried out`,
    })
  }
  if (unapprovedChecks.length > 0) {
    warnings.push({
      kind: 'warning',
      text: `${unapprovedChecks.length} completed check${unapprovedChecks.length === 1 ? '' : 's'} still awaiting approval`,
    })
  }

  // ── Tests ───────────────────────────────────────────────────────────────
  const failedTests = tests.filter((t) => t.result === 'fail')
  const pendingTests = tests.filter((t) => t.result === 'pending')
  const passedTests = tests.filter((t) => t.result === 'pass')
  const unapprovedTests = passedTests.filter((t) => (t.approval_state ?? 'draft') !== 'approved')

  for (const t of failedTests) {
    blockers.push({ kind: 'blocker', text: `Test failed — ${t.name}` })
  }
  if (pendingTests.length > 0) {
    warnings.push({
      kind: 'warning',
      text: `${pendingTests.length} test${pendingTests.length === 1 ? '' : 's'} not yet run`,
    })
  }
  if (unapprovedTests.length > 0) {
    warnings.push({
      kind: 'warning',
      text: `${unapprovedTests.length} passed test${unapprovedTests.length === 1 ? '' : 's'} awaiting approval`,
    })
  }

  // A result recorded on a lapsed instrument is not a valid record, so it
  // blocks rather than merely warns.
  const badInstrument = tests.filter(
    (t) => t.has_instrument && t.result !== 'pending' && calibrationStatus(t.instrument_expiry ?? null) === 'expired'
  )
  if (badInstrument.length > 0) {
    blockers.push({
      kind: 'blocker',
      text: `${badInstrument.length} test result${badInstrument.length === 1 ? '' : 's'} recorded on an instrument whose calibration had expired`,
    })
  }

  // ── Hold and witness points ─────────────────────────────────────────────
  // A hold point is the one thing in this engine that blocks even when
  // everything around it passed. Reaching a hold point without a release
  // signature means the work is finished and the authority to continue has
  // not been given — which is precisely the situation the hold point exists
  // to create.
  const itpRows: { type: string | null | undefined; release: ReleaseState; label: string }[] = [
    ...checks
      .filter((c) => c.release)
      .map((c) => ({
        type: c.inspection_type,
        release: c.release as ReleaseState,
        label: c.hold_label ?? 'checklist item',
      })),
    ...tests
      .filter((t) => t.release)
      .map((t) => ({
        type: t.inspection_type,
        release: t.release as ReleaseState,
        label: t.hold_label ?? t.name,
      })),
  ]

  for (const r of itpRows) {
    if (releaseBlocks(r.type, r.release)) {
      const reason =
        r.release === 'rejected'
          ? 'refused at inspection and not released'
          : r.release === 'notified'
            ? 'reached, notice given, awaiting release signature'
            : 'reached and not released — no notice given yet'
      blockers.push({
        kind: 'blocker',
        text: `Hold point ${reason} — ${r.label}`,
      })
    }
  }

  const holdsAhead = itpRows.filter((r) => r.type === 'hold' && r.release === 'awaiting_work')
  if (holdsAhead.length > 0) {
    warnings.push({
      kind: 'warning',
      text: `${holdsAhead.length} hold point${holdsAhead.length === 1 ? '' : 's'} still ahead — each will stop the work until released`,
    })
  }

  const witnessUnnotified = itpRows.filter((r) => r.type === 'witness' && r.release === 'awaiting_notice')
  if (witnessUnnotified.length > 0) {
    warnings.push({
      kind: 'warning',
      text: `${witnessUnnotified.length} witness point${witnessUnnotified.length === 1 ? '' : 's'} carried out without notice being given`,
    })
  }

  const witnessWaiting = itpRows.filter((r) => r.type === 'witness' && r.release === 'notified')
  if (witnessWaiting.length > 0) {
    warnings.push({
      kind: 'warning',
      text: `${witnessWaiting.length} witness point${witnessWaiting.length === 1 ? '' : 's'} notified but not yet signed`,
    })
  }

  // ── Punch list ──────────────────────────────────────────────────────────
  const openIssues = issues.filter((i) => i.status !== 'closed' && i.status !== 'verified')
  const categoryA = openIssues.filter((i) => i.category === 'A')
  const categoryB = openIssues.filter((i) => i.category === 'B')
  const uncategorised = openIssues.filter((i) => !i.category)

  for (const i of categoryA) {
    blockers.push({ kind: 'blocker', text: `Category A punch item open — ${i.title}` })
  }
  if (categoryB.length > 0) {
    warnings.push({
      kind: 'warning',
      text: `${categoryB.length} Category B item${categoryB.length === 1 ? '' : 's'} open — may be deferred with owner acceptance`,
    })
  }
  if (uncategorised.length > 0) {
    warnings.push({
      kind: 'warning',
      text: `${uncategorised.length} open punch item${uncategorised.length === 1 ? '' : 's'} not categorised — category needed before handover`,
    })
  }

  // ── Score ───────────────────────────────────────────────────────────────
  // Every check and every test is one requirement. A requirement is met when
  // it has reached a satisfactory conclusion, not merely when it was touched.
  const requirementsTotal = checks.length + tests.length
  const requirementsMet = resolvedChecks.length + passedTests.length
  const percent = requirementsTotal > 0 ? Math.round((requirementsMet / requirementsTotal) * 100) : 0

  const ready = blockers.length === 0 && requirementsTotal > 0 && requirementsMet === requirementsTotal

  return { percent, ready, requirementsMet, requirementsTotal, blockers, warnings }
}

export function readinessBadgeClass(r: Readiness): string {
  if (r.requirementsTotal === 0) return 'badge badge-neutral'
  if (r.blockers.length > 0) return 'badge badge-danger'
  if (r.ready) return 'badge badge-success'
  return 'badge badge-warning'
}

export function readinessVerdict(r: Readiness): string {
  if (r.requirementsTotal === 0) return 'Nothing recorded'
  if (r.blockers.length > 0) return 'Blocked'
  if (r.ready) return 'Ready'
  return 'In progress'
}
