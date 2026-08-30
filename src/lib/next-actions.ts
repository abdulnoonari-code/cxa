// "What should I do today?"
//
// Every screen in CXA can already tell you what is wrong with the thing you
// are looking at. Nothing yet answers the question an engineer actually walks
// in with, which is not "how is the project" but "what do I do first".
//
// This ranks the open work by what it costs to leave it alone. Safety first,
// then anything holding a gate, then anything holding a record open, then
// setup gaps. Every action names the record it came from and links to the
// place it is fixed, so the list is a route through the project rather than a
// summary of it.
//
// Nothing here is stored. The list is derived on every load, so an action
// disappears the moment its cause is dealt with — there is nothing to tick
// off, and nothing that can be marked done while the underlying record still
// says otherwise.

import { releaseBlocks } from '@/lib/inspection'
import { calibrationStatus } from '@/lib/tests'
import type { RequirementStatus } from '@/lib/requirements'

export type Urgency = 'safety' | 'blocking' | 'due' | 'setup'

export const URGENCY_ORDER: Record<Urgency, number> = { safety: 0, blocking: 1, due: 2, setup: 3 }

export const URGENCY_LABELS: Record<Urgency, string> = {
  safety: 'Safety',
  blocking: 'Blocking',
  due: 'Waiting on someone',
  setup: 'Setup',
}

export function urgencyBadgeClass(u: Urgency): string {
  switch (u) {
    case 'safety':
      return 'badge badge-danger'
    case 'blocking':
      return 'badge badge-warning'
    case 'due':
      return 'badge badge-info'
    default:
      return 'badge badge-neutral'
  }
}

export type NextAction = {
  urgency: Urgency
  title: string
  why: string
  href: string
  cta: string
  /** how many records this one action covers */
  count: number
}

export type ActionInput = {
  checks: {
    item: string
    status: string
    review_state: string | null
    inspection_type: string | null
    release: string
    tag: string
    hold_label: string
    notified_at?: string | null
  }[]
  tests: {
    name: string
    result: string
    approval_state: string | null
    inspection_type: string | null
    release: string
    tag: string
    hold_label: string
    has_instrument?: boolean
    instrument_expiry?: string | null
  }[]
  issues: { title: string; category: string | null; status: string }[]
  requirements: { ref: string | null; statement: string; criticality: string | null; status: RequirementStatus }[]
  instruments: { instrument_id: string; calibration_expiry: string | null }[]
  /** unmet or unanswered mandatory rules, per gate */
  gates: { id: string; name: string; blockers: string[]; unansweredManual: string[]; passed: boolean }[]
  /** notices written but never marked as sent */
  unsentNotices: { label: string | null }[]
  staleRequirements: number
  contactsWithEmail: number
  hasRequirements: boolean
  hasGates: boolean
}

function isOpen(status: string): boolean {
  return status !== 'closed' && status !== 'verified'
}

export function computeNextActions(input: ActionInput): NextAction[] {
  const out: NextAction[] = []

  // ── Safety ──────────────────────────────────────────────────────────────
  // A hold point that has been reached and not released means work is
  // physically stopped on site. Nothing else on this list costs more per day.
  const held = [
    ...input.checks.filter((c) => releaseBlocks(c.inspection_type, c.release as never)),
    ...input.tests.filter((t) => releaseBlocks(t.inspection_type, t.release as never)),
  ]
  if (held.length > 0) {
    out.push({
      urgency: 'safety',
      title: `Release ${held.length} hold point${held.length === 1 ? '' : 's'}`,
      why: `Work is stopped at ${held
        .slice(0, 3)
        .map((h) => h.hold_label)
        .join('; ')}${held.length > 3 ? `, and ${held.length - 3} more` : ''}.`,
      href: '/holdpoints',
      cta: 'Open hold points',
      count: held.length,
    })
  }

  const expired = input.instruments.filter((i) => calibrationStatus(i.calibration_expiry) === 'expired')
  if (expired.length > 0) {
    // Only worth shouting about if results actually rest on them.
    const affected = input.tests.filter(
      (t) => t.result !== 'pending' && t.has_instrument && calibrationStatus(t.instrument_expiry ?? null) === 'expired'
    ).length
    out.push({
      urgency: 'safety',
      title: `Recalibrate ${expired.length} instrument${expired.length === 1 ? '' : 's'}`,
      why: affected
        ? `${affected} recorded result${affected === 1 ? '' : 's'} rest${affected === 1 ? 's' : ''} on ${expired
            .map((i) => i.instrument_id)
            .slice(0, 3)
            .join(', ')} — those results are not valid evidence until this is settled.`
        : `${expired.map((i) => i.instrument_id).slice(0, 3).join(', ')} ${expired.length === 1 ? 'is' : 'are'} out of calibration and cannot be used.`,
      href: '/instruments',
      cta: 'Open instruments',
      count: expired.length,
    })
  }

  const categoryA = input.issues.filter((i) => isOpen(i.status) && i.category === 'A')
  if (categoryA.length > 0) {
    out.push({
      urgency: 'safety',
      title: `Close ${categoryA.length} Category A punch item${categoryA.length === 1 ? '' : 's'}`,
      why: `Category A is safety-critical: ${categoryA
        .slice(0, 2)
        .map((i) => i.title)
        .join('; ')}${categoryA.length > 2 ? `, and ${categoryA.length - 2} more` : ''}.`,
      href: '/issues',
      cta: 'Open punch list',
      count: categoryA.length,
    })
  }

  const unansweredSafety = input.gates.flatMap((g) => g.unansweredManual.map((label) => ({ gate: g, label })))
  if (unansweredSafety.length > 0) {
    // Link straight to the gate when every unanswered prerequisite is on the
    // same one — which is the usual case, and saves a hop through the list.
    const gateIds = new Set(unansweredSafety.map((u) => u.gate.id))
    out.push({
      urgency: 'safety',
      title: `Answer ${unansweredSafety.length} gate prerequisite${unansweredSafety.length === 1 ? '' : 's'}`,
      why: `Nobody has confirmed ${unansweredSafety
        .slice(0, 2)
        .map((u) => `"${u.label}"`)
        .join(' or ')}${unansweredSafety.length > 2 ? `, and ${unansweredSafety.length - 2} more` : ''}. An unanswered prerequisite is not a pass.`,
      href: gateIds.size === 1 ? `/gates/${unansweredSafety[0].gate.id}` : '/gates',
      cta: gateIds.size === 1 ? 'Open the gate' : 'Open gates',
      count: unansweredSafety.length,
    })
  }

  // ── Blocking ────────────────────────────────────────────────────────────
  const failedTests = input.tests.filter((t) => t.result === 'fail')
  const failedChecks = input.checks.filter((c) => c.status === 'fail')
  const failedTotal = failedTests.length + failedChecks.length
  if (failedTotal > 0) {
    out.push({
      urgency: 'blocking',
      title: `Deal with ${failedTotal} failed ${failedTotal === 1 ? 'result' : 'results'}`,
      why: `${[...failedTests, ...failedChecks]
        .slice(0, 3)
        .map((f) => f.hold_label)
        .join('; ')}${failedTotal > 3 ? `, and ${failedTotal - 3} more` : ''}. Each needs a corrective action and a retest.`,
      href: failedTests.length >= failedChecks.length ? '/tests' : '/checklists',
      cta: 'Open the records',
      count: failedTotal,
    })
  }

  const rejected = input.checks.filter((c) => (c.review_state ?? 'draft') === 'rejected')
  if (rejected.length > 0) {
    out.push({
      urgency: 'blocking',
      title: `Rework ${rejected.length} rejected check${rejected.length === 1 ? '' : 's'}`,
      why: 'Sent back at review. They keep blocking readiness until they are redone and approved.',
      href: '/review',
      cta: 'Open review',
      count: rejected.length,
    })
  }

  // A critical requirement with nothing linked can never be proven, and no
  // amount of testing will close it until somebody says what proves it.
  const unprovable = input.requirements.filter(
    (r) => (r.criticality ?? 'normal') === 'critical' && r.status === 'not_planned'
  )
  if (unprovable.length > 0) {
    out.push({
      urgency: 'blocking',
      title: `Say what proves ${unprovable.length} critical requirement${unprovable.length === 1 ? '' : 's'}`,
      why: `${unprovable
        .slice(0, 2)
        .map((r) => r.ref ?? r.statement.slice(0, 60))
        .join('; ')} ${unprovable.length === 1 ? 'has' : 'have'} no check or test linked, so nothing can ever verify ${unprovable.length === 1 ? 'it' : 'them'}.`,
      href: '/requirements',
      cta: 'Open requirements',
      count: unprovable.length,
    })
  }

  const witnessNoNotice = input.checks.filter(
    (c) => c.inspection_type === 'witness' && c.release === 'awaiting_notice'
  )
  if (witnessNoNotice.length > 0) {
    out.push({
      urgency: 'blocking',
      title: `Give notice for ${witnessNoNotice.length} witness point${witnessNoNotice.length === 1 ? '' : 's'}`,
      why: 'Work may proceed past a witness point only if proper notice was given. Without the record it is your word against theirs.',
      href: '/holdpoints',
      cta: 'Give notice',
      count: witnessNoNotice.length,
    })
  }

  if (input.unsentNotices.length > 0) {
    out.push({
      urgency: 'blocking',
      title: `Send ${input.unsentNotices.length} inspection notice${input.unsentNotices.length === 1 ? '' : 's'}`,
      why: 'Written but still sitting in your outbox. The client has not been told yet.',
      href: '/notifications',
      cta: 'Open notices',
      count: input.unsentNotices.length,
    })
  }

  // ── Waiting on someone ──────────────────────────────────────────────────
  const awaiting =
    input.checks.filter((c) => ['submitted', 'reviewed'].includes(c.review_state ?? 'draft')).length +
    input.tests.filter((t) => ['submitted', 'reviewed'].includes(t.approval_state ?? 'draft')).length
  if (awaiting > 0) {
    out.push({
      urgency: 'due',
      title: `Approve ${awaiting} record${awaiting === 1 ? '' : 's'}`,
      why: 'Passed and waiting for a signature. Nothing closes out, and no gate can be met, until somebody with approve rights signs them off.',
      href: '/review',
      cta: 'Open approvals',
      count: awaiting,
    })
  }

  const gatesToSign = input.gates.filter((g) => g.passed)
  if (gatesToSign.length > 0) {
    out.push({
      urgency: 'due',
      title: `${gatesToSign.length} gate${gatesToSign.length === 1 ? '' : 's'} ready for authorisation`,
      why: `The records support proceeding on ${gatesToSign
        .slice(0, 2)
        .map((g) => g.name)
        .join(' and ')}. The decision is still a person's to make and sign.`,
      href: gatesToSign.length === 1 ? `/gates/${gatesToSign[0].id}` : '/gates',
      cta: 'Open the gate',
      count: gatesToSign.length,
    })
  }

  if (input.staleRequirements > 0) {
    out.push({
      urgency: 'due',
      title: `Re-read ${input.staleRequirements} requirement${input.staleRequirements === 1 ? '' : 's'} against a new revision`,
      why: 'A newer revision of the source document has been issued. Each one needs checking against the new text before it can still be relied on.',
      href: '/requirements',
      cta: 'Open requirements',
      count: input.staleRequirements,
    })
  }

  const uncategorised = input.issues.filter((i) => isOpen(i.status) && !i.category)
  if (uncategorised.length > 0) {
    out.push({
      urgency: 'due',
      title: `Categorise ${uncategorised.length} punch item${uncategorised.length === 1 ? '' : 's'}`,
      why: 'Until each has a category it is not clear which of them block handover and which do not.',
      href: '/issues',
      cta: 'Open punch list',
      count: uncategorised.length,
    })
  }

  // ── Setup ───────────────────────────────────────────────────────────────
  if (!input.hasRequirements) {
    out.push({
      urgency: 'setup',
      title: 'Write down what this project must prove',
      why: 'No requirements are on the register, so nothing can say whether a system is finished — only how much has been ticked.',
      href: '/requirements',
      cta: 'Open requirements',
      count: 0,
    })
  }

  if (!input.hasGates) {
    out.push({
      urgency: 'setup',
      title: 'Set up your readiness gates',
      why: 'Gates are where work stops until something is proven. Create one against a system and it starts assessing itself from the records you already have.',
      href: '/gates',
      cta: 'Set up a gate',
      count: 0,
    })
  }

  if (input.contactsWithEmail === 0) {
    out.push({
      urgency: 'setup',
      title: 'Add the client and consultant as contacts',
      why: 'Until somebody has an email address on file, an inspection notice has nowhere to go.',
      href: '/contacts',
      cta: 'Open contacts',
      count: 0,
    })
  }

  return out.sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] || b.count - a.count)
}

// ── Project health, honestly ──────────────────────────────────────────────

export type Dimension = {
  key: string
  label: string
  /** null means: this is not tracked yet, and a number would be a lie */
  percent: number | null
  detail: string
  href: string
}

export type HealthInput = {
  checks: { status: string; review_state: string | null }[]
  tests: { result: string; approval_state: string | null }[]
  issues: { category: string | null; status: string }[]
  requirements: { status: RequirementStatus }[]
  documentCount: number
  documentsWithEffectiveRevision: number
  gates: { passed: boolean }[]
}

// Deliberately reports "not tracked yet" for the lifecycle stages that have no
// module behind them. Showing Procurement at 0% would read as a problem with
// procurement; showing it as untracked reads as a gap in the software, which
// is the truth.
export function computeHealth(input: HealthInput): Dimension[] {
  const pct = (met: number, total: number): number | null => (total > 0 ? Math.round((met / total) * 100) : null)

  const settledChecks = input.checks.filter((c) => c.status === 'pass' || c.status === 'na').length
  const settledTests = input.tests.filter((t) => t.result === 'pass').length
  const workTotal = input.checks.length + input.tests.length
  const workDone = settledChecks + settledTests

  const openIssues = input.issues.filter((i) => i.status !== 'closed' && i.status !== 'verified')
  const closedIssues = input.issues.length - openIssues.length

  const verified = input.requirements.filter((r) => r.status === 'verified').length

  return [
    {
      key: 'engineering',
      label: 'Engineering',
      percent: pct(input.documentsWithEffectiveRevision, input.documentCount),
      detail:
        input.documentCount > 0
          ? `${input.documentsWithEffectiveRevision} of ${input.documentCount} documents at an effective revision`
          : 'No controlled documents registered yet',
      href: '/doc-control',
    },
    {
      key: 'requirements',
      label: 'Requirements',
      percent: pct(verified, input.requirements.length),
      detail:
        input.requirements.length > 0
          ? `${verified} of ${input.requirements.length} verified and approved`
          : 'Nothing on the register yet',
      href: '/requirements',
    },
    {
      key: 'commissioning',
      label: 'Commissioning',
      percent: pct(workDone, workTotal),
      detail: workTotal > 0 ? `${workDone} of ${workTotal} checks and tests settled` : 'No checks or tests recorded yet',
      href: '/checklists',
    },
    {
      key: 'quality',
      label: 'Quality',
      percent: pct(closedIssues, input.issues.length),
      detail:
        input.issues.length > 0
          ? `${openIssues.length} punch item${openIssues.length === 1 ? '' : 's'} still open`
          : 'No punch items raised yet',
      href: '/issues',
    },
    {
      key: 'readiness',
      label: 'Readiness',
      percent: pct(input.gates.filter((g) => g.passed).length, input.gates.length),
      detail:
        input.gates.length > 0
          ? `${input.gates.filter((g) => g.passed).length} of ${input.gates.length} gates supported by the records`
          : 'No gates set up yet',
      href: '/gates',
    },
    {
      key: 'procurement',
      label: 'Procurement',
      percent: null,
      detail: 'Not tracked yet — no procurement module',
      href: '/assets',
    },
    {
      key: 'construction',
      label: 'Construction',
      percent: null,
      detail: 'Not tracked yet — no construction module',
      href: '/assets',
    },
    {
      key: 'operations',
      label: 'Operations readiness',
      percent: null,
      detail: 'Not tracked yet — no operations readiness module',
      href: '/assets',
    },
    {
      key: 'handover',
      label: 'Handover',
      percent: null,
      detail: 'Not tracked yet — no handover module',
      href: '/assets',
    },
  ]
}

// The single project number. Only the dimensions that are actually tracked
// count towards it, so adding a module later cannot make the project appear
// to go backwards.
export function overallHealth(dimensions: Dimension[]): { percent: number | null; tracked: number; total: number } {
  const tracked = dimensions.filter((d) => d.percent !== null)
  if (tracked.length === 0) return { percent: null, tracked: 0, total: dimensions.length }
  const sum = tracked.reduce((n, d) => n + (d.percent ?? 0), 0)
  return { percent: Math.round(sum / tracked.length), tracked: tracked.length, total: dimensions.length }
}
