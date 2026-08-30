'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { evaluateTest, criteriaLabel } from '@/lib/tests'
import { getCurrentProject } from '@/lib/project'
import { actorCan, recordAudit } from '@/lib/audit'
import { reviewLabel } from '@/lib/checklist'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

function num(formData: FormData, key: string): number | null {
  const value = str(formData, key)
  if (value === null) return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

function refresh() {
  revalidatePath('/tests')
  revalidatePath('/dashboard')
  revalidatePath('/reports')
  revalidatePath('/readiness')
  revalidatePath('/systems')
  revalidatePath('/audit')
}

export async function createTest(formData: FormData) {
  const equipment_id = str(formData, 'equipment_id')
  const name = str(formData, 'name')
  if (!equipment_id || !name) return

  await supabase.from('test_records').insert({
    equipment_id,
    test_ref: str(formData, 'test_ref'),
    name,
    procedure_ref: str(formData, 'procedure_ref'),
    preconditions: str(formData, 'preconditions'),
    criteria_type: str(formData, 'criteria_type') ?? 'max',
    expected_min: num(formData, 'expected_min'),
    expected_max: num(formData, 'expected_max'),
    unit: str(formData, 'unit'),
    criteria_text: str(formData, 'criteria_text'),
    result: 'pending',
  })

  refresh()
}

// Record a measured value. The pass/fail is computed from the acceptance
// criteria — the engineer never types it — except where the criteria can only
// be judged by a person, in which case their choice is taken as given.
export async function recordResult(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

  const { data: test } = await supabase
    .from('test_records')
    .select('id, name, criteria_type, expected_min, expected_max, unit, criteria_text, equipment_id')
    .eq('id', id)
    .single()

  if (!test) return

  const actual_value = num(formData, 'actual_value')
  const manualResult = str(formData, 'manual_result')

  const result =
    test.criteria_type === 'text'
      ? manualResult ?? 'pending'
      : evaluateTest(test.criteria_type, test.expected_min, test.expected_max, actual_value)

  await supabase
    .from('test_records')
    .update({
      actual_value,
      actual_text: str(formData, 'actual_text'),
      result,
      instrument_id: str(formData, 'instrument_id'),
      tested_by: str(formData, 'tested_by'),
      tested_at: str(formData, 'tested_at'),
      witness: str(formData, 'witness'),
      comments: str(formData, 'comments'),
    })
    .eq('id', id)

  const project = await getCurrentProject()
  await recordAudit({
    projectId: project?.id ?? null,
    action: `recorded result — ${result.toUpperCase()}`,
    entity: 'test_record',
    entityId: id,
    entityLabel: test.name,
    oldValue: criteriaLabel(test.criteria_type, test.expected_min, test.expected_max, test.unit, test.criteria_text),
    newValue:
      actual_value !== null ? `${actual_value}${test.unit ? ` ${test.unit}` : ''}` : (manualResult ?? 'not tested'),
    comment: str(formData, 'comments'),
  })

  refresh()

  // A failure is the moment something has to happen next, so say so rather
  // than leaving a red badge on a list.
  if (result === 'fail') {
    const criteria = criteriaLabel(
      test.criteria_type,
      test.expected_min,
      test.expected_max,
      test.unit,
      test.criteria_text
    )
    redirect(
      `/tests?failed=${encodeURIComponent(test.id)}&name=${encodeURIComponent(test.name)}&criteria=${encodeURIComponent(criteria)}&actual=${encodeURIComponent(String(actual_value ?? ''))}`
    )
  }
}

// One click from a failed test to a punch list item, with the numbers already
// written into the description.
export async function raiseIssueFromTest(formData: FormData) {
  const test_id = str(formData, 'test_id')
  if (!test_id) return

  const { data: test } = await supabase
    .from('test_records')
    .select('name, equipment_id, criteria_type, expected_min, expected_max, unit, criteria_text, actual_value, checklist_item_id')
    .eq('id', test_id)
    .single()

  if (!test) return

  const criteria = criteriaLabel(
    test.criteria_type,
    test.expected_min,
    test.expected_max,
    test.unit,
    test.criteria_text
  )

  await supabase.from('issues').insert({
    equipment_id: test.equipment_id,
    checklist_item_id: test.checklist_item_id,
    title: `${test.name} failed`,
    description: `Measured ${test.actual_value ?? '—'}${test.unit ? ` ${test.unit}` : ''} against acceptance criteria ${criteria}.`,
    severity: 'major',
    category: 'A',
    status: 'open',
  })

  revalidatePath('/issues')
  revalidatePath('/dashboard')
  redirect('/issues')
}

export async function approveTest(formData: FormData) {
  const id = str(formData, 'id')
  const approval_state = str(formData, 'approval_state') ?? 'draft'
  if (!id) return

  const project = await getCurrentProject()
  const capability = approval_state === 'approved' || approval_state === 'rejected' ? 'approve' : 'review'
  if (!(await actorCan(capability, project?.id ?? null))) return

  const { data: before } = await supabase
    .from('test_records')
    .select('name, approval_state')
    .eq('id', id)
    .single()

  await supabase.from('test_records').update({ approval_state }).eq('id', id)

  await recordAudit({
    projectId: project?.id ?? null,
    action: `set approval to ${reviewLabel(approval_state)}`,
    entity: 'test_record',
    entityId: id,
    entityLabel: before?.name ?? null,
    oldValue: reviewLabel(before?.approval_state ?? 'draft'),
    newValue: reviewLabel(approval_state),
  })

  refresh()
}

export async function deleteTest(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return
  await supabase.from('test_records').delete().eq('id', id)
  refresh()
}
