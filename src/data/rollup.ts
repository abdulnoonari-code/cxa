// The determination spine, generalised to every level of the asset tree.
//
// Load every work record on the project once, bucket each by the subject it
// belongs to, then walk the tree so that a system knows about the tests on the
// equipment inside it, an area knows about its systems, and the project knows
// about everything. Readiness at any level is computed from the same records
// by the same function — nothing is stored, so a system can never claim to be
// ready while a test underneath it has failed.

import { supabase } from '@/lib/supabase'
import { computeReadiness, type Readiness } from '@/lib/readiness'
import { latestSignature, releaseState, releaseBlocks, type SignatureLike } from '@/lib/inspection'
import { requirementStatus, isBlocking, type VerificationActivity } from '@/lib/requirements'
import {
  refKey,
  childrenOf,
  type Subject,
  type SubjectIndex,
  type SubjectRef,
} from '@/lib/subjects'

export type CheckRecord = {
  id: string
  item: string
  level: string
  status: string
  review_state: string | null
  inspection_type: string | null
  notified_at: string | null
  subjectKey: string
  tag: string
  release: ReturnType<typeof releaseState>
  hold_label: string
}

export type TestRecord = {
  id: string
  name: string
  test_ref: string | null
  result: string
  approval_state: string | null
  inspection_type: string | null
  notified_at: string | null
  instrument_id: string | null
  instrument_expiry: string | null
  has_instrument: boolean
  subjectKey: string
  tag: string
  release: ReturnType<typeof releaseState>
  hold_label: string
}

export type IssueRecord = {
  id: string
  title: string
  category: string | null
  severity: string
  status: string
  subjectKey: string
}

export type RequirementRecord = {
  id: string
  ref: string | null
  statement: string
  criticality: string | null
  subjectKey: string
  status: ReturnType<typeof requirementStatus>
  blocking: boolean
}

export type Rollup = {
  readiness: Readiness
  checks: CheckRecord[]
  tests: TestRecord[]
  issues: IssueRecord[]
  requirements: RequirementRecord[]
  openIssues: number
  categoryA: number
  heldPoints: number
  requirementsVerified: number
  requirementsBlocking: number
  /** records attached to this exact subject, not to anything beneath it */
  ownRecords: number
}

export type ProjectRollup = {
  byKey: Map<string, Rollup>
  checks: CheckRecord[]
  tests: TestRecord[]
  issues: IssueRecord[]
  requirements: RequirementRecord[]
}

const EMPTY: Rollup = {
  readiness: computeReadiness([], [], []),
  checks: [],
  tests: [],
  issues: [],
  requirements: [],
  openIssues: 0,
  categoryA: 0,
  heldPoints: 0,
  requirementsVerified: 0,
  requirementsBlocking: 0,
  ownRecords: 0,
}

export function emptyRollup(): Rollup {
  return { ...EMPTY, readiness: computeReadiness([], [], []) }
}

export function rollupFor(rollup: ProjectRollup, ref: SubjectRef | null): Rollup {
  if (!ref) return emptyRollup()
  return rollup.byKey.get(refKey(ref)) ?? emptyRollup()
}

// A record whose subject columns were never filled in still belongs somewhere:
// fall back to the equipment it was originally attached to, so nothing
// silently disappears from a roll-up.
function keyOf(
  subjectType: string | null,
  subjectId: string | null,
  equipmentId: string | null
): string | null {
  if (subjectType && subjectId) return `${subjectType}:${subjectId}`
  if (equipmentId) return `equipment:${equipmentId}`
  return null
}

export async function loadProjectRollup(
  projectId: string | null,
  index: SubjectIndex
): Promise<ProjectRollup> {
  const empty: ProjectRollup = { byKey: new Map(), checks: [], tests: [], issues: [], requirements: [] }
  if (!projectId || !index.root) return empty

  const labelOf = (key: string | null): string => {
    if (!key) return '—'
    const s = index.byKey.get(key)
    return s ? s.code ?? s.name : '—'
  }

  const [checkRes, testRes, issueRes, instrumentRes, signatureRes, reqRes, linkRes] = await Promise.all([
    supabase
      .from('checklist_items')
      .select('id, item, level, status, review_state, inspection_type, notified_at, subject_type, subject_id, equipment_id')
      .eq('project_id', projectId),
    supabase
      .from('test_records')
      .select('id, name, test_ref, result, approval_state, inspection_type, notified_at, instrument_id, subject_type, subject_id, equipment_id')
      .eq('project_id', projectId),
    supabase
      .from('issues')
      .select('id, title, category, severity, status, subject_type, subject_id, equipment_id')
      .eq('project_id', projectId),
    supabase.from('instruments').select('id, calibration_expiry').eq('project_id', projectId),
    supabase.from('signatures').select('entity, entity_id, decision, created_at').eq('project_id', projectId),
    supabase
      .from('requirements')
      .select('id, ref, statement, criticality, subject_type, subject_id')
      .eq('project_id', projectId),
    supabase.from('requirement_verifications').select('requirement_id, activity_kind, activity_id'),
  ])

  const signatures = (signatureRes.data ?? []) as SignatureLike[]
  const expiryById = new Map(
    ((instrumentRes.data ?? []) as { id: string; calibration_expiry: string | null }[]).map((i) => [
      i.id,
      i.calibration_expiry,
    ])
  )

  const checks: CheckRecord[] = ((checkRes.data ?? []) as {
    id: string
    item: string
    level: string
    status: string
    review_state: string | null
    inspection_type: string | null
    notified_at: string | null
    subject_type: string | null
    subject_id: string | null
    equipment_id: string | null
  }[])
    .map((c) => {
      const key = keyOf(c.subject_type, c.subject_id, c.equipment_id)
      const tag = labelOf(key)
      return {
        id: c.id,
        item: c.item,
        level: c.level,
        status: c.status,
        review_state: c.review_state,
        inspection_type: c.inspection_type,
        notified_at: c.notified_at,
        subjectKey: key ?? '',
        tag,
        release: releaseState({
          inspectionType: c.inspection_type,
          workComplete: c.status !== 'pending',
          notifiedAt: c.notified_at,
          signature: latestSignature(signatures, 'checklist_item', c.id),
        }),
        hold_label: `${tag} — ${c.item}`,
      }
    })
    .filter((c) => c.subjectKey !== '')

  const tests: TestRecord[] = ((testRes.data ?? []) as {
    id: string
    name: string
    test_ref: string | null
    result: string
    approval_state: string | null
    inspection_type: string | null
    notified_at: string | null
    instrument_id: string | null
    subject_type: string | null
    subject_id: string | null
    equipment_id: string | null
  }[])
    .map((t) => {
      const key = keyOf(t.subject_type, t.subject_id, t.equipment_id)
      const tag = labelOf(key)
      return {
        id: t.id,
        name: t.name,
        test_ref: t.test_ref,
        result: t.result,
        approval_state: t.approval_state,
        inspection_type: t.inspection_type,
        notified_at: t.notified_at,
        instrument_id: t.instrument_id,
        instrument_expiry: t.instrument_id ? expiryById.get(t.instrument_id) ?? null : null,
        has_instrument: Boolean(t.instrument_id),
        subjectKey: key ?? '',
        tag,
        release: releaseState({
          inspectionType: t.inspection_type,
          workComplete: t.result !== 'pending',
          notifiedAt: t.notified_at,
          signature: latestSignature(signatures, 'test_record', t.id),
        }),
        hold_label: `${tag} — ${t.name}`,
      }
    })
    .filter((t) => t.subjectKey !== '')

  const issues: IssueRecord[] = ((issueRes.data ?? []) as {
    id: string
    title: string
    category: string | null
    severity: string
    status: string
    subject_type: string | null
    subject_id: string | null
    equipment_id: string | null
  }[])
    .map((i) => ({
      id: i.id,
      title: i.title,
      category: i.category,
      severity: i.severity,
      status: i.status,
      subjectKey: keyOf(i.subject_type, i.subject_id, i.equipment_id) ?? '',
    }))
    .filter((i) => i.subjectKey !== '')

  // Requirements carry their own derived status, so a system's page can say
  // how many of its obligations are actually proven.
  const links = ((linkRes.data ?? []) as {
    requirement_id: string
    activity_kind: string
    activity_id: string
  }[])

  const checkById = new Map(checks.map((c) => [c.id, c]))
  const testById = new Map(tests.map((t) => [t.id, t]))
  const activitiesByRequirement = new Map<string, VerificationActivity[]>()

  for (const l of links) {
    let activity: VerificationActivity | null = null
    if (l.activity_kind === 'checklist_item') {
      const c = checkById.get(l.activity_id)
      if (c) activity = { kind: 'checklist_item', id: c.id, label: c.item, result: c.status, approval: c.review_state }
    } else if (l.activity_kind === 'test_record') {
      const t = testById.get(l.activity_id)
      if (t) activity = { kind: 'test_record', id: t.id, label: t.name, result: t.result, approval: t.approval_state }
    }
    if (!activity) continue
    const list = activitiesByRequirement.get(l.requirement_id)
    if (list) list.push(activity)
    else activitiesByRequirement.set(l.requirement_id, [activity])
  }

  const requirements: RequirementRecord[] = ((reqRes.data ?? []) as {
    id: string
    ref: string | null
    statement: string
    criticality: string | null
    subject_type: string | null
    subject_id: string | null
  }[])
    .map((r) => {
      const status = requirementStatus(activitiesByRequirement.get(r.id) ?? [])
      // A requirement with no subject belongs to the project as a whole —
      // an obligation that is nobody's is still the project's.
      const key = keyOf(r.subject_type, r.subject_id, null) ?? refKey({ type: 'project', id: index.root!.id })
      return {
        id: r.id,
        ref: r.ref,
        statement: r.statement,
        criticality: r.criticality,
        subjectKey: key,
        status,
        blocking: isBlocking(status, r.criticality),
      }
    })

  // ── Bucket, then walk the tree ──────────────────────────────────────────

  const checksAt = new Map<string, CheckRecord[]>()
  const testsAt = new Map<string, TestRecord[]>()
  const issuesAt = new Map<string, IssueRecord[]>()
  const reqsAt = new Map<string, RequirementRecord[]>()

  const push = <T>(map: Map<string, T[]>, key: string, value: T) => {
    const list = map.get(key)
    if (list) list.push(value)
    else map.set(key, [value])
  }

  for (const c of checks) push(checksAt, c.subjectKey, c)
  for (const t of tests) push(testsAt, t.subjectKey, t)
  for (const i of issues) push(issuesAt, i.subjectKey, i)
  for (const r of requirements) push(reqsAt, r.subjectKey, r)

  const byKey = new Map<string, Rollup>()

  // Post-order: a node's totals are its own records plus everything its
  // children have already accumulated. One pass, no repeated filtering.
  const visit = (subject: Subject): Rollup => {
    const key = refKey(subject)
    const ref: SubjectRef = { type: subject.type, id: subject.id }

    const ownChecks = checksAt.get(key) ?? []
    const ownTests = testsAt.get(key) ?? []
    const ownIssues = issuesAt.get(key) ?? []
    const ownReqs = reqsAt.get(key) ?? []

    let allChecks = [...ownChecks]
    let allTests = [...ownTests]
    let allIssues = [...ownIssues]
    let allReqs = [...ownReqs]

    for (const child of childrenOf(index, ref)) {
      const childRollup = visit(child)
      allChecks = allChecks.concat(childRollup.checks)
      allTests = allTests.concat(childRollup.tests)
      allIssues = allIssues.concat(childRollup.issues)
      allReqs = allReqs.concat(childRollup.requirements)
    }

    const openIssues = allIssues.filter((i) => i.status !== 'closed' && i.status !== 'verified')

    const rollup: Rollup = {
      readiness: computeReadiness(allChecks, allTests, allIssues),
      checks: allChecks,
      tests: allTests,
      issues: allIssues,
      requirements: allReqs,
      openIssues: openIssues.length,
      categoryA: openIssues.filter((i) => i.category === 'A').length,
      heldPoints:
        allChecks.filter((c) => releaseBlocks(c.inspection_type, c.release)).length +
        allTests.filter((t) => releaseBlocks(t.inspection_type, t.release)).length,
      requirementsVerified: allReqs.filter((r) => r.status === 'verified').length,
      requirementsBlocking: allReqs.filter((r) => r.blocking).length,
      ownRecords: ownChecks.length + ownTests.length + ownIssues.length + ownReqs.length,
    }

    byKey.set(key, rollup)
    return rollup
  }

  visit(index.root)

  return { byKey, checks, tests, issues, requirements }
}
