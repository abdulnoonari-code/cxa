// Everything the validity review needs, in one pass.
//
// Eight queries regardless of project size, all filtered by project_id and
// none of them fanning out over a list of ids — the pattern the audit's F5
// defect was about.

import { supabase } from '@/lib/supabase'
import { latestSignature, type SignatureLike } from '@/lib/inspection'
import { refKey, type SubjectIndex } from '@/lib/subjects'
import type { CheckInput, TestInput, PunchInput, ValidityInput } from '@/lib/validity'

function keyOf(subjectType: string | null, subjectId: string | null, equipmentId: string | null): string | null {
  if (subjectType && subjectId) return refKey({ type: subjectType, id: subjectId })
  if (equipmentId) return refKey({ type: 'equipment', id: equipmentId })
  return null
}

function tally<T>(rows: T[], key: (row: T) => string | null): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    const k = key(row)
    if (!k) continue
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return map
}

export async function loadValidityInput(
  projectId: string | null,
  index: SubjectIndex
): Promise<ValidityInput> {
  const empty: ValidityInput = { checks: [], tests: [], punch: [] }
  if (!projectId) return empty

  const [checkRes, testRes, issueRes, instrumentRes, signatureRes, attachmentRes] = await Promise.all([
    supabase
      .from('checklist_items')
      .select(
        'id, item, level, status, notes, review_state, inspection_type, notified_at, subject_type, subject_id, equipment_id'
      )
      .eq('project_id', projectId),
    supabase
      .from('test_records')
      .select(
        'id, name, criteria_type, expected_min, expected_max, unit, actual_value, result, approval_state, ' +
          'inspection_type, notified_at, tested_by, tested_at, witness, instrument_id, subject_type, subject_id, equipment_id'
      )
      .eq('project_id', projectId),
    supabase
      .from('issues')
      .select('id, ref, title, status, checklist_item_id, subject_type, subject_id, equipment_id')
      .eq('project_id', projectId),
    supabase.from('instruments').select('id, instrument_id, name, calibration_expiry').eq('project_id', projectId),
    supabase.from('signatures').select('entity, entity_id, decision, created_at').eq('project_id', projectId),
    supabase.from('attachments').select('checklist_item_id').eq('project_id', projectId),
  ])

  const label = (key: string | null): string => {
    if (!key) return 'Unassigned'
    const subject = index.byKey.get(key)
    return subject ? (subject.code ?? subject.name) : 'Unassigned'
  }

  const signatures = (signatureRes.data ?? []) as SignatureLike[]

  const instruments = new Map(
    ((instrumentRes.data ?? []) as {
      id: string
      instrument_id: string | null
      name: string | null
      calibration_expiry: string | null
    }[]).map((i) => [i.id, i])
  )

  const issueRows = (issueRes.data ?? []) as {
    id: string
    ref: string | null
    title: string
    status: string
    checklist_item_id: string | null
    subject_type: string | null
    subject_id: string | null
    equipment_id: string | null
  }[]

  // How many punch items point at each check, counted once rather than by
  // filtering the whole issue list per check.
  const punchByCheck = tally(issueRows, (i) => i.checklist_item_id)
  const openPunchByCheck = tally(
    issueRows.filter((i) => i.status !== 'verified' && i.status !== 'closed'),
    (i) => i.checklist_item_id
  )
  const filesByCheck = tally(
    (attachmentRes.data ?? []) as { checklist_item_id: string | null }[],
    (a) => a.checklist_item_id
  )

  const checks: CheckInput[] = ((checkRes.data ?? []) as {
    id: string
    item: string
    level: string
    status: string
    notes: string | null
    review_state: string | null
    inspection_type: string | null
    notified_at: string | null
    subject_type: string | null
    subject_id: string | null
    equipment_id: string | null
  }[]).map((c) => {
    const key = keyOf(c.subject_type, c.subject_id, c.equipment_id)
    return {
      id: c.id,
      item: c.item,
      level: c.level,
      status: c.status,
      notes: c.notes,
      review_state: c.review_state,
      inspection_type: c.inspection_type,
      notified_at: c.notified_at,
      subjectKey: key,
      subjectLabel: label(key),
      attachmentCount: filesByCheck.get(c.id) ?? 0,
      hasSignature: latestSignature(signatures, 'checklist_item', c.id) !== null,
      punchItemCount: punchByCheck.get(c.id) ?? 0,
      openPunchCount: openPunchByCheck.get(c.id) ?? 0,
    }
  })

  // A punch item raised from a test names the test's checklist item, not the
  // test — so a failed test counts as tracked when any punch item sits on
  // the same subject and mentions it. Matching on the title the automatic
  // route writes is the only link the schema gives us today.
  const punchTitles = issueRows.map((i) => (i.title ?? '').toLowerCase())

  const tests: TestInput[] = ((testRes.data ?? []) as unknown as {
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
    tested_at: string | null
    witness: string | null
    instrument_id: string | null
    subject_type: string | null
    subject_id: string | null
    equipment_id: string | null
  }[]).map((t) => {
    const key = keyOf(t.subject_type, t.subject_id, t.equipment_id)
    const instrument = t.instrument_id ? instruments.get(t.instrument_id) : undefined
    const named = (t.name ?? '').toLowerCase()
    return {
      id: t.id,
      name: t.name,
      criteria_type: t.criteria_type,
      expected_min: t.expected_min,
      expected_max: t.expected_max,
      unit: t.unit,
      actual_value: t.actual_value,
      result: t.result,
      approval_state: t.approval_state,
      inspection_type: t.inspection_type,
      notified_at: t.notified_at,
      tested_by: t.tested_by,
      witness: t.witness,
      tested_at: t.tested_at,
      instrument_id: t.instrument_id,
      instrumentExpiry: instrument?.calibration_expiry ?? null,
      instrumentLabel: instrument ? (instrument.instrument_id ?? instrument.name ?? null) : null,
      subjectKey: key,
      subjectLabel: label(key),
      hasSignature: latestSignature(signatures, 'test_record', t.id) !== null,
      punchItemCount: named ? punchTitles.filter((title) => title.includes(named)).length : 0,
    }
  })

  const punch: PunchInput[] = issueRows.map((i) => ({
    id: i.id,
    ref: i.ref,
    title: i.title,
    status: i.status,
    checklist_item_id: i.checklist_item_id,
    subjectKey: keyOf(i.subject_type, i.subject_id, i.equipment_id),
  }))

  return { checks, tests, punch }
}
