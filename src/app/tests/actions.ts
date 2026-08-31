'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { evaluateTest, criteriaLabel } from '@/lib/tests'
import { getCurrentProject } from '@/lib/project'
import { actorCan, recordAudit } from '@/lib/audit'
import { reviewLabel } from '@/lib/checklist'
import { loadPunchRefs } from '@/data/punchlist'
import { nextRef } from '@/lib/punchlist'
import { parseTestWorkbook, type TestProblem } from '@/lib/test-io'
import { loadSubjectIndex } from '@/data/subjects'
import { buildTextIndex, findSubjectByText, subjectLabel } from '@/lib/subjects'

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

  // Same rule as everywhere else: a record that does not carry its project is
  // invisible to every project-scoped screen. This is the third place it was
  // missing.
  const { data: owner } = await supabase.from('equipment').select('project_id').eq('id', equipment_id).single()

  await supabase.from('test_records').insert({
    equipment_id,
    project_id: (owner as { project_id: string | null } | null)?.project_id ?? null,
    subject_type: 'equipment',
    subject_id: equipment_id,
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

  // The punch item must carry the project and a punch number like any other,
  // or it is invisible on the punch list it was raised onto.
  const project = await getCurrentProject()
  const ref = project ? nextRef(await loadPunchRefs(project.id)) : null

  await supabase.from('issues').insert({
    project_id: project?.id ?? null,
    ref,
    equipment_id: test.equipment_id,
    subject_type: test.equipment_id ? 'equipment' : null,
    subject_id: test.equipment_id,
    checklist_item_id: test.checklist_item_id,
    title: `${test.name} failed`,
    description: `Measured ${test.actual_value ?? '—'}${test.unit ? ` ${test.unit}` : ''} against acceptance criteria ${criteria}.`,
    severity: 'major',
    category: 'A',
    status: 'open',
    raised_by: 'Raised automatically when the test was recorded as failed',
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

// ── Import ───────────────────────────────────────────────────────────────

function describeTestProblem(p: TestProblem): string {
  return `Row ${p.row} · ${p.column}: ${p.message}${p.value ? ` (found "${p.value}")` : ''}`
}

function chunkTests<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * Import test results from a testing contractor's spreadsheet.
 *
 * The one rule that shapes everything here: the **result is never imported**.
 * Whatever the file says in its Result column, the record stores what the
 * measured value and the acceptance criteria actually give. Where the two
 * disagree, the disagreement is reported by row number and the arithmetic
 * wins — the alternative is letting a supplier's spreadsheet mark its own
 * homework, which is the exact thing this app exists to stop.
 *
 * All-or-nothing on errors, as with every other importer.
 */
export async function importTests(formData: FormData) {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) redirect('/tests?import=nofile')

  const project = await getCurrentProject()
  if (!project) redirect('/tests?import=noproject')
  if (!(await actorCan('record', project.id))) redirect('/tests?import=denied')

  const parsed = await parseTestWorkbook(await file.arrayBuffer(), { fileName: file.name })

  if (parsed.rows.length === 0 && parsed.errors.length === 0) {
    await recordAudit({
      projectId: project.id,
      action: 'test import failed',
      entity: 'test_record',
      entityLabel: file.name,
      comment:
        parsed.headingsSeen.length > 0
          ? `No test column found. Headings seen: ${parsed.headingsSeen.slice(0, 15).join(', ')}`
          : 'The file had nothing readable in it.',
    })
    redirect(`/tests?import=empty&headings=${encodeURIComponent(parsed.headingsSeen.slice(0, 8).join(', '))}`)
  }

  const index = await loadSubjectIndex(project.id)
  const text = buildTextIndex(index)
  const errors: TestProblem[] = [...parsed.errors]

  const { data: existingRows } = await supabase
    .from('test_records')
    .select('id, test_ref')
    .eq('project_id', project.id)
  const existing = (existingRows ?? []) as { id: string; test_ref: string | null }[]
  const byId = new Map(existing.map((r) => [r.id, r]))
  const byRef = new Map(existing.filter((r) => r.test_ref).map((r) => [r.test_ref as string, r]))

  // Instruments are matched by the id printed on the label. An instrument the
  // file names but CxSentinel does not have is a warning, not an error: the
  // testing company's kit is not always registered here yet, and refusing the
  // whole file over it would be useless. The reading imports with no
  // instrument, and the Validity Review then reports exactly that.
  const { data: instrumentRows } = await supabase
    .from('instruments')
    .select('id, instrument_id, name')
    .eq('project_id', project.id)
  const instrumentByCode = new Map(
    ((instrumentRows ?? []) as { id: string; instrument_id: string | null; name: string | null }[]).flatMap((i) => {
      const keys = [i.instrument_id, i.name].filter((v): v is string => !!v).map((v) => v.trim().toLowerCase())
      return keys.map((k) => [k, i.id] as const)
    })
  )

  type TestPlan = {
    row: (typeof parsed.rows)[number]
    targetId: string | null
    equipment_id: string | null
    subject_type: string | null
    subject_id: string | null
    instrument_id: string | null
  }
  const plans: TestPlan[] = []

  for (const row of parsed.rows) {
    let targetId: string | null = null
    if (row.id) {
      if (!byId.has(row.id)) {
        errors.push({
          row: row.row,
          column: 'CXA ID',
          value: row.id,
          message: 'No test on this project has that ID. Clear the cell to create a new one instead.',
        })
        continue
      }
      targetId = row.id
    } else if (row.test_ref) {
      targetId = byRef.get(row.test_ref)?.id ?? null
    }

    if (row.remove && !targetId) {
      errors.push({
        row: row.row,
        column: 'Remove',
        value: 'Y',
        message: 'Only a test already on the project can be removed — there is nothing to identify this row by.',
      })
      continue
    }

    let equipment_id: string | null = null
    let subject_type: string | null = null
    let subject_id: string | null = null

    if (row.subject) {
      const match = findSubjectByText(text, row.subject)
      if (!match.subject) {
        errors.push({
          row: row.row,
          column: 'Tag / System',
          value: row.subject,
          message:
            match.candidates.length > 1
              ? `More than one thing on the project is called that (${match.candidates
                  .map((c) => subjectLabel(c.type))
                  .join(', ')}). Use the tag or system code instead.`
              : 'Not a tag, system or area on this project. Add it first, or clear the cell.',
        })
        continue
      }
      subject_type = match.subject.type
      subject_id = match.subject.id
      equipment_id = match.subject.type === 'equipment' ? match.subject.id : null
    } else if (!targetId) {
      errors.push({
        row: row.row,
        column: 'Tag / System',
        value: '',
        message: 'A new test has to say what it is against. Put a tag or a system name in this column.',
      })
      continue
    }

    let instrument_id: string | null = null
    if (row.instrument) {
      instrument_id = instrumentByCode.get(row.instrument.trim().toLowerCase()) ?? null
      if (!instrument_id) {
        parsed.warnings.push({
          row: row.row,
          column: 'Instrument',
          value: row.instrument,
          message:
            'Not a test instrument registered on this project, so the reading is imported without one. Add it on the Test Instruments screen and re-import to attach it.',
        })
      }
    }

    plans.push({ row, targetId, equipment_id, subject_type, subject_id, instrument_id })
  }

  if (errors.length > 0) {
    await recordAudit({
      projectId: project.id,
      action: 'test import rejected',
      entity: 'test_record',
      entityLabel: file.name,
      newValue: `${errors.length} problems, nothing imported`,
      comment: errors.slice(0, 12).map(describeTestProblem).join(' | '),
    })
    const detail = errors.slice(0, 3).map(describeTestProblem).join(' · ')
    redirect(`/tests?import=rejected&errors=${errors.length}&detail=${encodeURIComponent(detail.slice(0, 400))}`)
  }

  const removals = plans.filter((p) => p.row.remove && p.targetId)
  const updates = plans.filter((p) => p.targetId && !p.row.remove)
  const additions = plans.filter((p) => !p.targetId && !p.row.remove)

  for (const part of chunkTests(removals.map((p) => p.targetId as string), 200)) {
    await supabase.from('test_records').delete().in('id', part)
  }

  const fields = (p: TestPlan) => ({
    test_ref: p.row.test_ref,
    name: p.row.name,
    procedure_ref: p.row.procedure_ref,
    preconditions: p.row.preconditions,
    criteria_type: p.row.criteria_type,
    expected_min: p.row.expected_min,
    expected_max: p.row.expected_max,
    unit: p.row.unit,
    criteria_text: p.row.criteria_text,
    actual_value: p.row.actual_value,
    actual_text: p.row.actual_text,
    // Computed in the parser from the value and the criteria. Never the
    // file's own claim.
    result: p.row.result,
    instrument_id: p.instrument_id,
    tested_by: p.row.tested_by,
    tested_at: p.row.tested_at,
    witness: p.row.witness,
    comments: p.row.comments,
    inspection_type: p.row.inspection_type,
  })

  for (const p of updates) {
    await supabase
      .from('test_records')
      .update({
        ...fields(p),
        // A blank subject cell on an existing test means "unchanged".
        ...(p.subject_id ? { equipment_id: p.equipment_id, subject_type: p.subject_type, subject_id: p.subject_id } : {}),
      })
      .eq('id', p.targetId as string)
  }

  const newRows = additions.map((p) => ({
    project_id: project.id,
    equipment_id: p.equipment_id,
    subject_type: p.subject_type,
    subject_id: p.subject_id,
    ...fields(p),
  }))

  for (const part of chunkTests(newRows, 500)) {
    await supabase.from('test_records').insert(part)
  }

  await recordAudit({
    projectId: project.id,
    action: 'imported test results',
    entity: 'test_record',
    entityLabel: file.name,
    newValue: `${newRows.length} added, ${updates.length} updated, ${removals.length} removed`,
    comment:
      `Read from ${parsed.sheetName ?? 'sheet'}, header row ${parsed.headerRow}. Columns used: ${parsed.detectedColumns.join(', ')}.` +
      (parsed.disagreements > 0
        ? ` ${parsed.disagreements} row(s) claimed a result their own measured value does not support; the measured value was used.`
        : '') +
      (parsed.warnings.length > 0
        ? ` ${parsed.warnings.length} warnings: ${parsed.warnings.slice(0, 8).map(describeTestProblem).join(' | ')}`
        : ''),
  })

  refresh()
  redirect(
    `/tests?import=ok&added=${newRows.length}&updated=${updates.length}&removed=${removals.length}` +
      `&rows=${parsed.rows.length}&warnings=${parsed.warnings.length}&overruled=${parsed.disagreements}`
  )
}
