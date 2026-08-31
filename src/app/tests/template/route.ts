import ExcelJS from 'exceljs'
import { INSPECTION_TYPES } from '@/lib/inspection'

// A blank test sheet in the same shape the export comes out in, with four
// worked rows covering the four kinds of acceptance criteria: a minimum, a
// maximum, a range, and one that can only be judged by a person.
export async function GET() {
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
  ]

  const header = sheet.getRow(1)
  header.font = { name: 'Arial', bold: true }
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFBFD0F0' } } }
  })
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }]

  const example = (values: Record<string, string | number>) => {
    const row = sheet.addRow(values)
    row.font = { name: 'Arial', italic: true, color: { argb: 'FF8A6D00' } }
    row.alignment = { vertical: 'top', wrapText: true }
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7DB' } }
    })
  }

  example({
    ref: 'TR-001',
    subject: 'TX-01',
    name: 'EXAMPLE — Winding insulation resistance. Delete this row.',
    criteria: '≥ 1000 MΩ',
    unit: 'MΩ',
    value: 2400,
    instrument: 'MEG-4402',
    tested_by: 'A. Jabbar',
    witness: 'Client rep',
    date: '2026-09-02',
    itp: 'Witness Point',
  })
  example({
    ref: 'TR-002',
    subject: 'GIS-115-CB-01',
    name: 'EXAMPLE — Breaker trip timing. A maximum. Delete this row.',
    criteria: '≤ 60 ms',
    unit: 'ms',
    value: 42,
    instrument: 'TIM-118',
    tested_by: 'A. Jabbar',
    witness: 'Client rep',
    date: '2026-09-02',
    itp: 'Hold Point',
  })
  example({
    ref: 'TR-003',
    subject: 'UPS-01',
    name: 'EXAMPLE — Battery string float voltage. A range, written in its own columns. Delete this row.',
    min: 540,
    max: 560,
    unit: 'V',
    value: 548,
    instrument: 'DMM-07',
    tested_by: 'A. Jabbar',
    date: '2026-09-03',
    itp: 'Surveillance',
  })
  example({
    ref: 'TR-004',
    subject: '115kV GIS',
    name: 'EXAMPLE — Interlock scheme operates per the approved logic. Judged by a person. Delete this row.',
    criteria: 'Operates per approved interlock schedule rev C',
    text: 'Operated correctly in both directions',
    tested_by: 'A. Jabbar',
    witness: 'Client rep',
    date: '2026-09-04',
    itp: 'Witness Point',
  })

  for (let r = 6; r <= 200; r += 1) sheet.getRow(r).font = { name: 'Arial' }

  // ── How to fill this in ────────────────────────────────────────────────
  const guide = wb.addWorksheet('How to fill this in')
  guide.columns = [
    { header: 'Column', key: 'col', width: 22 },
    { header: 'What to put in it', key: 'meaning', width: 104 },
  ]
  guide.getRow(1).font = { name: 'Arial', bold: true }
  guide.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  const note = (col: string, meaning: string) => {
    const r = guide.addRow({ col, meaning })
    r.font = { name: 'Arial' }
    r.alignment = { vertical: 'top', wrapText: true }
  }

  note(
    'There is no Result column',
    'On purpose. You record the measured value; CxSentinel works out whether it passed. If you upload a supplier sheet that has a Result column, it is read and then overruled by the arithmetic — and every row where the two disagreed is reported to you with its row number. A result typed next to a number that does not meet the criteria is the single easiest thing for an auditor to find.'
  )
  note('CXA ID / Test ref', 'Leave both blank on a new sheet. They appear when you export tests that already exist, and they are what makes a second upload update those tests rather than duplicate them.')
  note('Tag / System', 'What was tested — an equipment tag, or a system or area name for a test that is not against one piece of kit. Required on every new test.')
  note('Test', 'The only column that is required. A row with nothing in it is skipped, so blank spacing rows are harmless.')
  note(
    'Acceptance criteria',
    'Write it the way you would say it. "≥ 1000 MΩ", ">= 1000", "min 1000 MΩ" and "not less than 1000 MΩ" all mean the same thing. "540 – 560 V" and "between 3 and 5 bar" are ranges. A bare number with no ≥ or ≤ is NOT read as a limit — 50 could be a floor or a ceiling and the difference is the whole test — so it is kept as a criterion for a person to judge.'
  )
  note('Min / Max', 'Numbers in their own columns, if you prefer. Both filled is a range; one filled is a limit. These win over the Acceptance criteria column because they cannot be misread. A limit that is not a number stops the import rather than being ignored.')
  note('Unit', 'MΩ, ms, V, bar, µΩ. Optional if it is already inside the criteria text.')
  note('Measured value', 'The reading. This is what decides pass or fail. If the test has a numeric criterion and this cell is not a number, the import stops and tells you which row.')
  note('Observation', 'For a test with no number — "operates correctly", "no tracking observed". Used when the criterion is judged by a person.')
  note('Instrument', 'The instrument id as printed on its label. If it is not registered on the Test Instruments screen the reading still imports without one, and the Validity Review then tells you which readings have no instrument behind them.')
  note('Tested by / Witness', 'Two different people. A test where the tester witnessed himself is reported by the Validity Review — a witness exists to be a second pair of eyes.')
  note(
    'Date',
    'Write it as 2026-04-03 or 3 Apr 2026. A bare 03/04/2026 is refused rather than guessed: day-first and month-first give dates a month apart. The date matters more here than anywhere else — a reading taken after its instrument’s calibration expired is not evidence of anything, and that is checked automatically.'
  )
  note('Procedure / Comments', 'Free text. Both optional.')
  note('ITP type', `${INSPECTION_TYPES.map((t) => `${t.label} (${t.code})`).join(', ')}. Blank means Surveillance. A Hold Point stops the work until it is signed off.`)
  note('Remove', 'Y deletes that test on upload. Only works on a row that already carries a CXA ID or a Test ref.')
  note('', '')
  note('Use your own file', 'You do not have to use this template. Upload the testing contractor’s sheet as it came — headings are matched by name, the table can start anywhere in the first forty rows, and every tab is read.')
  note('Nothing is half-done', 'If any row cannot be read, nothing at all is imported and every bad row is reported with its row number and the reason.')

  // ── Criteria examples ──────────────────────────────────────────────────
  const crit = wb.addWorksheet('Criteria')
  crit.columns = [
    { header: 'Write this', key: 'w', width: 34 },
    { header: 'It is read as', key: 'r', width: 34 },
  ]
  crit.getRow(1).font = { name: 'Arial', bold: true }
  crit.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  const pair = (w: string, r: string) => {
    crit.addRow({ w, r }).font = { name: 'Arial' }
  }
  pair('≥ 1000 MΩ', 'Not less than 1000, unit MΩ')
  pair('>= 1000', 'Not less than 1000')
  pair('min 1000 MΩ', 'Not less than 1000, unit MΩ')
  pair('not less than 1000 MΩ', 'Not less than 1000, unit MΩ')
  pair('≤ 60 ms', 'Not more than 60, unit ms')
  pair('max 50 µΩ', 'Not more than 50, unit µΩ')
  pair('not exceeding 50 µΩ', 'Not more than 50, unit µΩ')
  pair('540 – 560 V', 'Between 540 and 560, unit V')
  pair('3 to 5 bar', 'Between 3 and 5, unit bar')
  pair('between 3 and 5 bar', 'Between 3 and 5, unit bar')
  pair('50', 'NOT a limit — kept for a person to judge')
  pair('Operates correctly', 'Judged by a person')

  const buffer = await wb.xlsx.writeBuffer()

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="cxsentinel-test-records-template.xlsx"',
    },
  })
}
