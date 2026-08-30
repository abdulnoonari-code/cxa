// The configurable gate engine.
//
// A gate is a named set of rules that must hold before a subject may move on.
// Nine rule kinds cover every gate in the specification, from Design Ready to
// Handover Ready, because a gate differs from another gate only in which
// rules it carries and how they are parameterised.
//
// Two invariants carry over from the readiness engine and must not be lost:
//
//   1. An unchecked requirement is never a pass. Pending is an absence, not a
//      decision, and treating it as cleared is the failure this exists to
//      prevent.
//   2. Every result names its blockers individually. "92%" is useless;
//      "not ready — trip test failed on CB-01" is the product.
//
// And the governing rule from the specification: CXA never authorises
// anything. A gate reports what the records say. Whether work proceeds
// remains a human decision, recorded as a signature.

import type { Readiness } from '@/lib/readiness'
import { releaseBlocks } from '@/lib/inspection'
import { calibrationStatus } from '@/lib/tests'
import { isSatisfied, type RequirementStatus } from '@/lib/requirements'

export const RULE_KINDS = [
  {
    value: 'manual_confirmation',
    label: 'Confirmed by a person',
    note: 'A prerequisite no record can prove — a permit, a lock-out, a briefing. Somebody confirms it and says how.',
    derived: false,
  },
  {
    value: 'all_activities_complete',
    label: 'All work carried out',
    note: 'No check or test beneath this subject is still pending.',
    derived: true,
  },
  {
    value: 'no_failed_activities',
    label: 'Nothing failed',
    note: 'No check or test beneath this subject has failed.',
    derived: true,
  },
  {
    value: 'all_requirements_verified',
    label: 'Requirements proven',
    note: 'Every requirement at or above a stated criticality is verified and approved.',
    derived: true,
  },
  {
    value: 'no_open_issues',
    label: 'Punch list clear',
    note: 'No open issue at or above a stated category.',
    derived: true,
  },
  {
    value: 'no_unreleased_hold_points',
    label: 'Hold points released',
    note: 'Every hold point reached has been released by signature.',
    derived: true,
  },
  {
    value: 'instruments_in_calibration',
    label: 'Instruments in calibration',
    note: 'No result rests on an instrument whose calibration had expired.',
    derived: true,
  },
  {
    value: 'documents_present',
    label: 'Documents in place',
    note: 'Documents of the stated types exist at an approved revision.',
    derived: true,
  },
  {
    value: 'approvals_obtained',
    label: 'Authorised',
    note: 'Signatures obtained from the stated roles.',
    derived: true,
  },
]

export function ruleKindLabel(value: string): string {
  return RULE_KINDS.find((r) => r.value === value)?.label ?? value
}

export function isDerived(value: string): boolean {
  return RULE_KINDS.find((r) => r.value === value)?.derived ?? true
}

export const CONFIRMATION_STATUSES = [
  { value: 'pending', label: 'Not yet checked' },
  { value: 'satisfied', label: 'Satisfied' },
  { value: 'not_satisfied', label: 'Not satisfied' },
  { value: 'na', label: 'Not applicable' },
]

export function confirmationLabel(value: string | null): string {
  return CONFIRMATION_STATUSES.find((s) => s.value === value)?.label ?? 'Not yet checked'
}

export function confirmationBadgeClass(value: string | null): string {
  switch (value) {
    case 'satisfied':
      return 'badge badge-success'
    case 'not_satisfied':
      return 'badge badge-danger'
    case 'na':
      return 'badge badge-neutral'
    default:
      return 'badge badge-warning'
  }
}

// ── Gate templates ────────────────────────────────────────────────────────

export type TemplateRule = {
  rule_kind: string
  label: string
  params?: Record<string, unknown>
  category?: string
  mandatory?: boolean
}

export type GateTemplate = {
  key: string
  name: string
  stage_key: string
  note: string
  rules: TemplateRule[]
}

// The sixteen prerequisites of an energization safety gate. Seeded onto every
// energization gate so nobody has to remember them at seven in the morning in
// a switchyard. They are editable afterwards — projects and utilities differ —
// but this is the default list, and it is the one that keeps people alive.
const SAFETY_GATE: TemplateRule[] = [
  { rule_kind: 'manual_confirmation', label: 'Permit to work issued, valid, and held by the person in charge', category: 'Permit & isolation' },
  { rule_kind: 'manual_confirmation', label: 'Isolation points confirmed, proved dead, and recorded', category: 'Permit & isolation' },
  { rule_kind: 'manual_confirmation', label: 'Lock-out / tag-out applied and independently verified', category: 'Permit & isolation' },
  { rule_kind: 'manual_confirmation', label: 'Approved switching procedure available on site and briefed', category: 'Permit & isolation' },
  { rule_kind: 'manual_confirmation', label: 'Protection settings applied per the approved setting sheet', category: 'Protection & control' },
  { rule_kind: 'manual_confirmation', label: 'Protection and trip circuits proven end to end', category: 'Protection & control' },
  { rule_kind: 'manual_confirmation', label: 'Interlocks proven and no defeats left in place', category: 'Protection & control' },
  { rule_kind: 'manual_confirmation', label: 'SCADA / control indications verified against field state', category: 'Protection & control', mandatory: false },
  { rule_kind: 'manual_confirmation', label: 'System earthing verified and continuity recorded', category: 'Earthing' },
  { rule_kind: 'manual_confirmation', label: 'Temporary earths accounted for and removed before energization', category: 'Earthing' },
  { rule_kind: 'manual_confirmation', label: 'Personnel authorised for the voltage level and named on the permit', category: 'Personnel' },
  { rule_kind: 'manual_confirmation', label: 'Pre-energization safety briefing carried out and attendance recorded', category: 'Personnel' },
  { rule_kind: 'manual_confirmation', label: 'Barricading, signage and access control in place', category: 'Site condition' },
  { rule_kind: 'manual_confirmation', label: 'Area clear of tools, scaffolding, debris and non-essential personnel', category: 'Site condition' },
  { rule_kind: 'manual_confirmation', label: 'Communications established with the control centre / network operator', category: 'Emergency readiness' },
  { rule_kind: 'manual_confirmation', label: 'Fire protection in service and emergency response arrangements confirmed', category: 'Emergency readiness' },
]

export const GATE_TEMPLATES: GateTemplate[] = [
  {
    key: 'mechanical_completion',
    name: 'Mechanical Completion',
    stage_key: 'completion',
    note: 'Construction has finished and the system can be handed to commissioning.',
    rules: [
      { rule_kind: 'all_activities_complete', label: 'All installation checks carried out', params: { kind: 'check' }, category: 'Records' },
      { rule_kind: 'no_failed_activities', label: 'No installation check has failed', category: 'Records' },
      { rule_kind: 'no_open_issues', label: 'No open Category A punch items', params: { min_category: 'A' }, category: 'Punch list' },
      { rule_kind: 'manual_confirmation', label: 'As-built redlines captured and issued', category: 'Documents' },
      { rule_kind: 'manual_confirmation', label: 'Area released by the construction manager', category: 'Handover' },
    ],
  },
  {
    key: 'commissioning_ready',
    name: 'Ready for Commissioning',
    stage_key: 'pre_commissioning',
    note: 'Everything commissioning needs before it can start work on this system.',
    rules: [
      { rule_kind: 'documents_present', label: 'Commissioning procedure and ITP issued', params: { doc_types: ['itp', 'procedure'] }, category: 'Documents' },
      { rule_kind: 'instruments_in_calibration', label: 'Test instruments in calibration', category: 'Equipment' },
      { rule_kind: 'no_open_issues', label: 'No open Category A punch items', params: { min_category: 'A' }, category: 'Punch list' },
      { rule_kind: 'manual_confirmation', label: 'Mechanical completion certificate signed', category: 'Prerequisites' },
      { rule_kind: 'manual_confirmation', label: 'Temporary services available (power, air, water as required)', category: 'Prerequisites', mandatory: false },
    ],
  },
  {
    key: 'energization_ready',
    name: 'Energization Readiness',
    stage_key: 'energization',
    note: 'The safety gate, plus what the commissioning records must show, plus who must authorise it.',
    rules: [
      { rule_kind: 'no_failed_activities', label: 'No check or test has failed', category: 'Records' },
      { rule_kind: 'all_requirements_verified', label: 'All critical requirements verified', params: { criticality: 'critical' }, category: 'Records' },
      { rule_kind: 'no_unreleased_hold_points', label: 'Every hold point released', category: 'Records' },
      { rule_kind: 'instruments_in_calibration', label: 'No result rests on an expired instrument', category: 'Records' },
      { rule_kind: 'no_open_issues', label: 'No open Category A punch items', params: { min_category: 'A' }, category: 'Punch list' },
      ...SAFETY_GATE,
      { rule_kind: 'approvals_obtained', label: 'Authorised by the commissioning manager and the client', params: { roles: ['Commissioning Manager', 'Client / Owner'] }, category: 'Authorisation' },
    ],
  },
  {
    key: 'takeover_ready',
    name: 'Takeover Readiness',
    stage_key: 'takeover',
    note: 'Combines commissioning, construction, quality, safety and documentation.',
    rules: [
      { rule_kind: 'all_activities_complete', label: 'All checks and tests carried out', params: { kind: 'both' }, category: 'Records' },
      { rule_kind: 'no_failed_activities', label: 'Nothing outstanding has failed', category: 'Records' },
      { rule_kind: 'all_requirements_verified', label: 'All requirements verified', params: { criticality: 'any' }, category: 'Records' },
      { rule_kind: 'no_open_issues', label: 'No open Category A or B punch items', params: { min_category: 'B' }, category: 'Punch list' },
      { rule_kind: 'no_unreleased_hold_points', label: 'Every hold point released', category: 'Records' },
      { rule_kind: 'manual_confirmation', label: 'Operations readiness assessed and accepted', category: 'Operations' },
      { rule_kind: 'manual_confirmation', label: 'Training delivered and attendance recorded', category: 'Operations' },
      { rule_kind: 'approvals_obtained', label: 'Authorised by the client', params: { roles: ['Client / Owner'] }, category: 'Authorisation' },
    ],
  },
  {
    key: 'handover_ready',
    name: 'Handover Readiness',
    stage_key: 'handover',
    note: 'What must exist in the dossier before the system can be handed over.',
    rules: [
      { rule_kind: 'documents_present', label: 'As-built drawings issued', params: { doc_types: ['drawing', 'sld'] }, category: 'Dossier' },
      { rule_kind: 'documents_present', label: 'O&M manuals issued', params: { doc_types: ['manual'] }, category: 'Dossier' },
      { rule_kind: 'documents_present', label: 'Test certificates on file', params: { doc_types: ['certificate'] }, category: 'Dossier' },
      { rule_kind: 'no_open_issues', label: 'Punch list closed out', params: { min_category: 'C' }, category: 'Punch list' },
      { rule_kind: 'all_requirements_verified', label: 'Every requirement verified', params: { criticality: 'any' }, category: 'Records' },
      { rule_kind: 'manual_confirmation', label: 'Spare parts delivered and receipted', category: 'Dossier' },
      { rule_kind: 'manual_confirmation', label: 'Warranty documents issued and start date agreed', category: 'Warranty' },
      { rule_kind: 'approvals_obtained', label: 'Final acceptance signed by the client', params: { roles: ['Client / Owner'] }, category: 'Authorisation' },
    ],
  },
]

export function templateFor(key: string): GateTemplate | null {
  return GATE_TEMPLATES.find((t) => t.key === key) ?? null
}

// ── Evaluation ────────────────────────────────────────────────────────────

export type GateRule = {
  id: string
  rule_kind: string
  label: string
  params: Record<string, unknown> | null
  category: string | null
  mandatory: boolean | null
  status: string | null
  evidence: string | null
  confirmed_by: string | null
  confirmed_at: string | null
}

export type GateContext = {
  readiness: Readiness
  checks: { status: string; inspection_type: string | null; release: string; hold_label: string }[]
  tests: {
    name: string
    result: string
    inspection_type: string | null
    release: string
    hold_label: string
    has_instrument?: boolean
    instrument_expiry?: string | null
  }[]
  issues: { title: string; category: string | null; status: string }[]
  requirements: { ref: string | null; statement: string; criticality: string | null; status: RequirementStatus }[]
  /** doc_type values that exist at an approved or issued revision */
  documentTypesPresent: Set<string>
  /** signer_role values that have approved this gate */
  approvedRoles: Set<string>
  /** signer_role values that have refused this gate */
  refusedRoles: Set<string>
}

export type RuleOutcome = {
  rule: GateRule
  /** 'met' | 'not_met' | 'unanswered' | 'not_applicable' */
  outcome: 'met' | 'not_met' | 'unanswered' | 'not_applicable'
  /** why, in words an engineer would use */
  reason: string
  /** the specific records causing a failure, named individually */
  detail: string[]
}

const CATEGORY_RANK: Record<string, number> = { A: 3, B: 2, C: 1 }

function isOpen(status: string): boolean {
  return status !== 'closed' && status !== 'verified'
}

function param<T>(rule: GateRule, key: string, fallback: T): T {
  const p = rule.params
  if (!p || typeof p !== 'object') return fallback
  const value = (p as Record<string, unknown>)[key]
  return (value === undefined ? fallback : value) as T
}

export function evaluateRule(rule: GateRule, ctx: GateContext): RuleOutcome {
  const detail: string[] = []

  switch (rule.rule_kind) {
    // ── The only rule a person answers ─────────────────────────────────
    case 'manual_confirmation': {
      const status = rule.status ?? 'pending'
      if (status === 'satisfied') {
        return { rule, outcome: 'met', reason: rule.evidence ? `Confirmed — ${rule.evidence}` : 'Confirmed', detail }
      }
      if (status === 'na') {
        return { rule, outcome: 'not_applicable', reason: 'Recorded as not applicable here', detail }
      }
      if (status === 'not_satisfied') {
        return { rule, outcome: 'not_met', reason: rule.evidence ? `Not satisfied — ${rule.evidence}` : 'Not satisfied', detail }
      }
      // Deliberately not "not_met": an unanswered safety question is a
      // different problem from a failed one, and reads differently.
      return { rule, outcome: 'unanswered', reason: 'Nobody has confirmed this yet', detail }
    }

    case 'all_activities_complete': {
      const kind = param<string>(rule, 'kind', 'both')
      const pendingChecks = kind !== 'test' ? ctx.checks.filter((c) => c.status === 'pending') : []
      const pendingTests = kind !== 'check' ? ctx.tests.filter((t) => t.result === 'pending') : []
      const total = pendingChecks.length + pendingTests.length
      if (total === 0) return { rule, outcome: 'met', reason: 'Everything has been carried out', detail }
      for (const t of pendingTests.slice(0, 6)) detail.push(`${t.hold_label} — not yet carried out`)
      return {
        rule,
        outcome: 'not_met',
        reason: `${total} item${total === 1 ? '' : 's'} still to be carried out`,
        detail,
      }
    }

    case 'no_failed_activities': {
      const failedChecks = ctx.checks.filter((c) => c.status === 'fail')
      const failedTests = ctx.tests.filter((t) => t.result === 'fail')
      const total = failedChecks.length + failedTests.length
      if (total === 0) return { rule, outcome: 'met', reason: 'Nothing has failed', detail }
      for (const t of failedTests.slice(0, 6)) detail.push(`${t.hold_label} — failed`)
      for (const c of failedChecks.slice(0, 6)) detail.push(`${c.hold_label} — failed`)
      return { rule, outcome: 'not_met', reason: `${total} failed and awaiting corrective action`, detail }
    }

    case 'all_requirements_verified': {
      const wanted = param<string>(rule, 'criticality', 'critical')
      const scope =
        wanted === 'any' ? ctx.requirements : ctx.requirements.filter((q) => (q.criticality ?? 'normal') === wanted)
      if (scope.length === 0) {
        return { rule, outcome: 'unanswered', reason: 'No requirements of this kind are on the register', detail }
      }
      const unproven = scope.filter((q) => !isSatisfied(q.status))
      if (unproven.length === 0) {
        return { rule, outcome: 'met', reason: `All ${scope.length} verified and approved`, detail }
      }
      for (const q of unproven.slice(0, 6)) {
        detail.push(`${q.ref ?? 'Requirement'} — ${q.statement.slice(0, 90)}`)
      }
      return {
        rule,
        outcome: 'not_met',
        reason: `${unproven.length} of ${scope.length} not yet verified and approved`,
        detail,
      }
    }

    case 'no_open_issues': {
      const min = param<string>(rule, 'min_category', 'A')
      const rank = CATEGORY_RANK[min] ?? 3
      const offending = ctx.issues.filter(
        (i) => isOpen(i.status) && (CATEGORY_RANK[i.category ?? ''] ?? 0) >= rank
      )
      if (offending.length === 0) return { rule, outcome: 'met', reason: 'Nothing open at that category', detail }
      for (const i of offending.slice(0, 6)) detail.push(`${i.category ?? '—'} · ${i.title}`)
      return { rule, outcome: 'not_met', reason: `${offending.length} still open`, detail }
    }

    case 'no_unreleased_hold_points': {
      const held = [
        ...ctx.checks.filter((c) => releaseBlocks(c.inspection_type, c.release as never)),
        ...ctx.tests.filter((t) => releaseBlocks(t.inspection_type, t.release as never)),
      ]
      if (held.length === 0) return { rule, outcome: 'met', reason: 'No hold point is holding work', detail }
      for (const h of held.slice(0, 6)) detail.push(`${h.hold_label} — not released`)
      return { rule, outcome: 'not_met', reason: `${held.length} hold point${held.length === 1 ? '' : 's'} not released`, detail }
    }

    case 'instruments_in_calibration': {
      const bad = ctx.tests.filter(
        (t) => t.result !== 'pending' && t.has_instrument && calibrationStatus(t.instrument_expiry ?? null) === 'expired'
      )
      if (bad.length === 0) return { rule, outcome: 'met', reason: 'No result rests on an expired instrument', detail }
      for (const t of bad.slice(0, 6)) detail.push(`${t.hold_label} — instrument out of calibration`)
      return {
        rule,
        outcome: 'not_met',
        reason: `${bad.length} result${bad.length === 1 ? '' : 's'} recorded on an expired instrument`,
        detail,
      }
    }

    case 'documents_present': {
      const wanted = param<string[]>(rule, 'doc_types', [])
      const missing = wanted.filter((t) => !ctx.documentTypesPresent.has(t))
      if (wanted.length === 0) return { rule, outcome: 'unanswered', reason: 'No document types specified', detail }
      if (missing.length === 0) return { rule, outcome: 'met', reason: 'All present at an effective revision', detail }
      for (const m of missing) detail.push(`No ${m} registered at an effective revision`)
      return { rule, outcome: 'not_met', reason: `${missing.length} document type${missing.length === 1 ? '' : 's'} missing`, detail }
    }

    case 'approvals_obtained': {
      const roles = param<string[]>(rule, 'roles', [])
      if (roles.length === 0) return { rule, outcome: 'unanswered', reason: 'No roles specified', detail }
      const refused = roles.filter((r) => ctx.refusedRoles.has(r))
      if (refused.length > 0) {
        for (const r of refused) detail.push(`${r} has refused`)
        return { rule, outcome: 'not_met', reason: 'Authorisation refused', detail }
      }
      const missing = roles.filter((r) => !ctx.approvedRoles.has(r))
      if (missing.length === 0) return { rule, outcome: 'met', reason: 'All required signatures obtained', detail }
      for (const m of missing) detail.push(`${m} has not signed`)
      return { rule, outcome: 'not_met', reason: `${missing.length} signature${missing.length === 1 ? '' : 's'} outstanding`, detail }
    }

    default:
      return { rule, outcome: 'unanswered', reason: 'Unknown rule kind — treated as unmet', detail }
  }
}

export type GateResult = {
  outcomes: RuleOutcome[]
  met: number
  notMet: number
  unanswered: number
  notApplicable: number
  mandatoryTotal: number
  mandatoryMet: number
  percent: number
  /** every mandatory rule is met or explicitly not applicable, and nothing failed */
  passed: boolean
  blockers: string[]
}

export function evaluateGate(rules: GateRule[], ctx: GateContext): GateResult {
  const outcomes = rules.map((r) => evaluateRule(r, ctx))

  const met = outcomes.filter((o) => o.outcome === 'met').length
  const notMet = outcomes.filter((o) => o.outcome === 'not_met').length
  const unanswered = outcomes.filter((o) => o.outcome === 'unanswered').length
  const notApplicable = outcomes.filter((o) => o.outcome === 'not_applicable').length

  const mandatory = outcomes.filter((o) => o.rule.mandatory !== false)
  const mandatoryMet = mandatory.filter((o) => o.outcome === 'met' || o.outcome === 'not_applicable').length

  const blockers: string[] = []
  for (const o of outcomes) {
    if (o.rule.mandatory === false) continue
    if (o.outcome === 'not_met') blockers.push(`${o.rule.label} — ${o.reason}`)
    else if (o.outcome === 'unanswered') blockers.push(`${o.rule.label} — ${o.reason}`)
  }

  const percent = mandatory.length > 0 ? Math.round((mandatoryMet / mandatory.length) * 100) : 0

  return {
    outcomes,
    met,
    notMet,
    unanswered,
    notApplicable,
    mandatoryTotal: mandatory.length,
    mandatoryMet,
    percent,
    // A gate with no rules has not been passed; it has not been attempted.
    passed: mandatory.length > 0 && mandatoryMet === mandatory.length && notMet === 0,
    blockers,
  }
}

// Deliberately never the words "approved" or "cleared to proceed". The verdict
// describes the records; it does not grant a permission.
export function gateVerdict(result: GateResult): string {
  if (result.mandatoryTotal === 0) return 'NOT ASSESSED'
  if (result.notMet > 0) return 'NOT MET'
  if (result.unanswered > 0) return 'INCOMPLETE'
  return 'RECORDS SUPPORT PROCEEDING'
}

export function gateBadgeClass(result: GateResult): string {
  if (result.mandatoryTotal === 0) return 'badge badge-neutral'
  if (result.notMet > 0) return 'badge badge-danger'
  if (result.unanswered > 0) return 'badge badge-warning'
  return 'badge badge-success'
}

export function outcomeBadgeClass(outcome: RuleOutcome['outcome']): string {
  switch (outcome) {
    case 'met':
      return 'badge badge-success'
    case 'not_met':
      return 'badge badge-danger'
    case 'not_applicable':
      return 'badge badge-neutral'
    default:
      return 'badge badge-warning'
  }
}

export function outcomeLabel(outcome: RuleOutcome['outcome']): string {
  switch (outcome) {
    case 'met':
      return 'Met'
    case 'not_met':
      return 'Not met'
    case 'not_applicable':
      return 'N/A'
    default:
      return 'Unanswered'
  }
}
