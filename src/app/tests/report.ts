// The test register as a document — the pack that goes into a handover
// dossier, where every result is stated next to the criterion it was judged
// against and the instrument that took it.

import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { refKey } from '@/lib/subjects'
import { criteriaLabel, calibrationStatus, calibrationLabel } from '@/lib/tests'
import { INSPECTION_TYPES } from '@/lib/inspection'
import type { Report } from '@/lib/docgen'

export type BuiltTests = { project: { id: string; name: string }; report: Report }

export async function buildTestReport(url: string): Promise<BuiltTests | null> {
  const project = await getCurrentProject()
  if (!project) return null

  const p = new URL(url).searchParams
  const wantResult = p.get('result')
  const wantEquipment = p.get('equipment')

  const [index, testRes, instrumentRes] = await Promise.all([
    loadSubjectIndex(project.id),
    supabase
      .from('test_records')
      .select(
        'id, test_ref, name, criteria_type, expected_min, expected_max, unit, criteria_text, actual_value, ' +
          'actual_text, result, approval_state, inspection_type, instrument_id, tested_by, tested_at, witness, ' +
          'comments, subject_type, subject_id, equipment_id'
      )
      .eq('project_id', project.id)
      .order('test_ref', { ascending: true }),
    supabase.from('instruments').select('id, instrument_id, calibration_expiry').eq('project_id', project.id),
  ])

  type Row = {
    id: string
    test_ref: string | null
    name: string
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
  }

  const all = (testRes.data ?? []) as unknown as Row[]
  const rows = all.filter((t) => {
    if (wantResult && t.result !== wantResult) return false
    if (wantEquipment && t.equipment_id !== wantEquipment) return false
    return true
  })

  const instruments = new Map(
    ((instrumentRes.data ?? []) as { id: string; instrument_id: string | null; calibration_expiry: string | null }[]).map(
      (i) => [i.id, i]
    )
  )

  const label = (t: Row): string => {
    const subject =
      t.subject_type && t.subject_id
        ? index.byKey.get(refKey({ type: t.subject_type, id: t.subject_id }))
        : t.equipment_id
          ? index.byKey.get(refKey({ type: 'equipment', id: t.equipment_id }))
          : undefined
    return subject?.code ?? subject?.name ?? 'Unassigned'
  }

  const passed = rows.filter((t) => t.result === 'pass').length
  const failed = rows.filter((t) => t.result === 'fail').length
  const pending = rows.filter((t) => t.result === 'pending').length

  // A reading taken with an instrument that had already expired is not
  // evidence of anything, so the pack says which rows those are rather than
  // leaving an auditor to find them.
  const expired = new Set<number>()
  rows.forEach((t, i) => {
    const inst = t.instrument_id ? instruments.get(t.instrument_id) : undefined
    if (inst && t.tested_at && inst.calibration_expiry && t.tested_at.slice(0, 10) > inst.calibration_expiry) {
      expired.add(i)
    }
    if (t.result === 'fail') expired.add(i)
  })

  const itpLabel = (v: string | null) =>
    INSPECTION_TYPES.find((x) => x.value === (v ?? 'surveillance'))?.label ?? 'Surveillance'

  const report: Report = {
    title: 'Test Register',
    subtitle: wantResult ? `Filtered to results marked ${wantResult.toUpperCase()}` : 'Every test on record',
    project: project.name,
    standfirst:
      rows.length === 0
        ? 'No test records match. That is not a statement that nothing was tested — only that nothing is recorded here.'
        : `${passed} passed, ${failed} failed, ${pending} not yet tested. Every result is worked out from the measured value against the acceptance criterion beside it — no result on this register was typed by hand.`,
    figures: [
      { label: 'In this register', value: rows.length, note: 'Tests listed' },
      { label: 'Passed', value: passed, note: 'Value meets its criterion' },
      { label: 'Failed', value: failed, note: 'Value does not' },
      { label: 'Not tested', value: pending, note: 'No reading yet' },
    ],
    tables: [
      {
        title: 'The register',
        columns: ['Ref', 'Against', 'Test', 'Acceptance', 'Measured', 'Result', 'Instrument', 'Tested by', 'Date'],
        widths: [1.1, 1.4, 3.6, 1.8, 1.3, 1, 1.3, 1.5, 1.1],
        rows: rows.map((t) => [
          t.test_ref ?? '',
          label(t),
          t.name,
          criteriaLabel(t.criteria_type, t.expected_min, t.expected_max, t.unit, t.criteria_text),
          t.actual_value !== null ? `${t.actual_value}${t.unit ? ` ${t.unit}` : ''}` : (t.actual_text ?? ''),
          t.result.toUpperCase(),
          instruments.get(t.instrument_id ?? '')?.instrument_id ?? '',
          t.tested_by ?? '',
          (t.tested_at ?? '').slice(0, 10),
        ]),
        emphasise: expired,
      },
      ...(rows.some((t) => t.inspection_type && t.inspection_type !== 'surveillance')
        ? [
            {
              title: 'Hold and witness points in this register',
              columns: ['Ref', 'Test', 'Point type', 'Witness', 'Result'],
              widths: [1.2, 5, 1.6, 2, 1.2],
              rows: rows
                .filter((t) => t.inspection_type && t.inspection_type !== 'surveillance')
                .map((t) => [t.test_ref ?? '', t.name, itpLabel(t.inspection_type), t.witness ?? '', t.result.toUpperCase()]),
            },
          ]
        : []),
      ...(rows.some((_, i) => expired.has(i))
        ? [
            {
              title: 'Rows to look at',
              columns: ['Ref', 'Test', 'Why'],
              widths: [1.2, 5, 4],
              rows: rows
                .map((t, i) => ({ t, i }))
                .filter(({ i }) => expired.has(i))
                .map(({ t }) => {
                  const inst = t.instrument_id ? instruments.get(t.instrument_id) : undefined
                  const cal = inst ? calibrationStatus(inst.calibration_expiry) : null
                  const late =
                    inst && t.tested_at && inst.calibration_expiry && t.tested_at.slice(0, 10) > inst.calibration_expiry
                  return [
                    t.test_ref ?? '',
                    t.name,
                    late
                      ? `Taken with ${inst?.instrument_id ?? 'an instrument'}, whose calibration expired on ${inst?.calibration_expiry}. The reading is not evidence of anything.`
                      : `Result is FAIL${cal ? ` · instrument calibration ${calibrationLabel(cal).toLowerCase()}` : ''}.`,
                  ]
                }),
            },
          ]
        : []),
    ],
    footnotes: [
      'Every result on this register is computed from the measured value and the acceptance criterion recorded beside it. A result was never typed in — not on screen, and not on import, where a supplier sheet claiming otherwise is overruled and the disagreement reported.',
      'This register records what has been tested. It authorises nothing: whether plant is fit to energise is decided at its readiness gate, against rules, by a named person.',
    ],
  }

  return { project, report }
}
