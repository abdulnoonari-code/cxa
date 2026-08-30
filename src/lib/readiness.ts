import { calibrationStatus } from '@/lib/tests'

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

type CheckRow = { status: string; review_state?: string | null }
type TestRow = {
  result: string
  approval_state?: string | null
  name: string
  instrument_expiry?: string | null
  has_instrument?: boolean
}
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
