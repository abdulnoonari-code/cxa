import ExcelJS from 'exceljs'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { refKey } from '@/lib/subjects'
import { criteriaLabel, calibrationStatus, calibrationLabel } from '@/lib/tests'
import { INSPECTION_TYPES } from '@/lib/inspection'

// Every test on the project, in the shape the importer reads back.
//
// The first eighteen columns round-trip. Everything after them is the record
// and is ignored on the way back — including Result, which is never imported
// from anywhere: it is worked out from the measured value and the criteria.
export async function GET() {
  const project = await getCurrentProject()
  if (!project) return new Response('No project found', { status: 404 })

  const [index, testRes, instrumentRes] = await Promise.all([
    loadSubjectIndex(project.id),
    supabase
      .from('test_records')
      .select(
        'id, test_ref, name, procedure_ref, preconditions, criteria_type, expected_min, expected_max, unit, ' +
          'criteria_text, actual_value, actual_text, result, approval_state, inspection_type, instrument_id, ' +
          'tested_by, tested_at, witness, comments, subject_type, subject_id, equipment_id'
      )
      .eq('project_id', project.id)
      .order('test_ref', { ascending: true }),
    supabase.from('instruments').select('id, instrument_id, name, calibration_expiry').eq('project_id', project.id),
  ])

  const tests = (testRes.data ?? []) as unknown as {
    id: string
    test_ref: string | null
    name: string
    procedure_ref: string | null
    preconditions: string | null
    criteria_type: string | null
    expected_min: number | null
    expected_max: number | null
    unit: string | null
    criteria_text: string | null
    actual_value: number | null
    actual_text: string | null
    result: string
    approval_state: string | null
    inspection_type: string | null
    instrument_id: string | null
    tested_by: string | null
    tested_at: string | null
    witness: string | null
    comments: string | null
    subject_type: string | null
    subject_id: string | null
    equipment_id: string | null
  }[]

  const instruments = new Map(
    ((instrumentRes.data ?? []) as {
      id: string
      instrument_id: string | null
      name: string | null
      calibration_expiry: string | null
    }[]).map((i) => [i.id, i])
  )

  const itpLabel = (v: string | null) =>
    INSPECTION_TYPES.find((t) => t.value === (v ?? 'surveillance'))?.label ?? 'Surveillance'

  const wb = new ExcelJS.Workbook()
  wb.creator = 'CxSentinel'
  wb.created = new Date()

  const sheet = wb.addWorksheet('Test records')
  sheet.columns = [
    { header: 'CXA ID', key: 'id', width: 38 },
    { header: 'Test ref', key: 'ref', width: 14 },
    { header: 'Tag / System', key: 'subject', width: 20 },
    { header: 'Test', key: 'name', width: 42 },
    { header: 'Acceptance criteria', key: 'criteria', width: 26 },
    { header: 'Min', key: 'min', width: 10 },
    { header: 'Max', key: 'max', width: 10 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Measured value', key: 'value', width: 15 },
    { header: 'Observation', key: 'text', width: 26 },
    { header: 'Instrument', key: 'instrument', width: 16 },
    { header: 'Tested by', key: 'tested_by', width: 18 },
    { header: 'Witness', key: 'witness', width: 18 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Procedure', key: 'procedure', width: 18 },
    { header: 'Comments', key: 'comments', width: 34 },
    { header: 'ITP type', key: 'itp', width: 14 },
    { header: 'Remove', key: 'remove', width: 9 },
    { header: 'Result (computed)', key: 'result', width: 16 },
    { header: 'Approval', key: 'approval', width: 13 },
    { header: 'Instrument calibration', key: 'cal', width: 22 },
  ]

  const header = sheet.getRow(1)
  header.font = { name: 'Arial', bold: true }
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  })
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }]

  for (const t of tests) {
    const subject =
      t.subject_type && t.subject_id
        ? index.byKey.get(refKey({ type: t.subject_type, id: t.subject_id }))
        : t.equipment_id
          ? index.byKey.get(refKey({ type: 'equipment', id: t.equipment_id }))
          : undefined
    const instrument = t.instrument_id ? instruments.get(t.instrument_id) : undefined
    const cal = calibrationStatus(instrument?.calibration_expiry ?? null)

    const row = sheet.addRow({
      id: t.id,
      ref: t.test_ref ?? '',
      subject: subject?.code ?? subject?.name ?? '',
      name: t.name,
      criteria: criteriaLabel(t.criteria_type, t.expected_min, t.expected_max, t.unit, t.criteria_text),
      min: t.expected_min ?? '',
      max: t.expected_max ?? '',
      unit: t.unit ?? '',
      value: t.actual_value ?? '',
      text: t.actual_text ?? '',
      instrument: instrument?.instrument_id ?? '',
      tested_by: t.tested_by ?? '',
      witness: t.witness ?? '',
      date: (t.tested_at ?? '').slice(0, 10),
      procedure: t.procedure_ref ?? '',
      comments: t.comments ?? '',
      itp: itpLabel(t.inspection_type),
      remove: '',
      result: t.result.toUpperCase(),
      approval: t.approval_state ?? 'draft',
      cal: instrument ? calibrationLabel(cal) : '',
    })
    row.font = { name: 'Arial' }
    row.alignment = { vertical: 'top', wrapText: true }

    if (t.result === 'fail') {
      row.getCell('result').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE2E2' } }
    }
    if (instrument && cal === 'expired') {
      row.getCell('cal').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE2E2' } }
    }
  }

  // ── How to edit this ───────────────────────────────────────────────────
  const guide = wb.addWorksheet('How to edit this')
  guide.columns = [
    { header: 'Column', key: 'col', width: 22 },
    { header: 'What it does when you upload this file back', key: 'meaning', width: 104 },
  ]
  guide.getRow(1).font = { name: 'Arial', bold: true }
  guide.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  const note = (col: string, meaning: string) => {
    const r = guide.addRow({ col, meaning })
    r.font = { name: 'Arial' }
    r.alignment = { vertical: 'top', wrapText: true }
  }

  note(
    'Result (computed)',
    'READ ONLY. This column is never imported, from this file or any other. CxSentinel works the result out from the Measured value and the acceptance criteria every time. If a supplier sends a sheet that says PASS next to a number that does not meet the criteria, the number wins and the disagreement is reported to you by row number. That is the whole point of recording a measured value rather than a verdict.'
  )
  note('CXA ID / Test ref', 'How CxSentinel recognises a test you already have, so your edits update it rather than create a second copy. Leave both blank on a new row and a new test is created.')
  note('Tag / System', 'What was tested — an equipment tag, or a system or area name. Required on a new test. Blank on an existing one means "unchanged".')
  note('Test', 'The only column that is required. A row with nothing in it is skipped.')
  note('Acceptance criteria', 'Write it the way you would say it: "≥ 1000 MΩ", "≤ 60 ms", "540 – 560 V", "between 3 and 5 bar". A bare number with no ≥ or ≤ cannot be judged — 50 could be a floor or a ceiling — so it is kept as a criterion for a person to judge rather than guessed at.')
  note('Min / Max', 'Use these instead if you prefer numbers in their own columns. Both filled is a range; one filled is a limit. They win over the Acceptance criteria column, because they cannot be misread.')
  note('Measured value', 'The reading. This is what decides the result.')
  note('Observation', 'For a test with no number — "operates correctly", "no tracking observed".')
  note('Instrument', 'The instrument id as printed on its label. If it is not registered on this project the reading still imports, without an instrument, and the Validity Review then tells you so.')
  note('Tested by / Witness', 'Two different people. The Validity Review flags a test where they are the same person.')
  note('Date', 'Write it as 2026-04-03 or 3 Apr 2026. A bare 03/04/2026 is refused rather than guessed. The date matters: a reading taken after its instrument’s calibration expired is not evidence of anything, and that is checked.')
  note('ITP type', `${INSPECTION_TYPES.map((t) => `${t.label} (${t.code})`).join(', ')}. Blank means Surveillance.`)
  note('Remove', 'Y deletes that test on upload. Only works on a row that already has a CXA ID or a Test ref.')
  note('', '')
  note('Approval, Instrument calibration', 'Record only. Ignored on the way back in — an approval is a person’s decision in the app, not a cell in a spreadsheet.')
  note('Nothing is half-done', 'If any row cannot be read, nothing at all is imported and every bad row is reported with its row number.')
  note('Your own file works too', 'Upload the testing contractor’s own sheet as it came — headings are matched by name (Measured, Actual, Reading, Value; Limit, Spec, Acceptance; M&TE, Test equipment, Meter all work), the table can start anywhere in the first forty rows, and every tab is read.')

  const buffer = await wb.xlsx.writeBuffer()
  const fileName = `${project.name}-test-records.xlsx`.replace(/[^a-zA-Z0-9._-]/g, '_')

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
