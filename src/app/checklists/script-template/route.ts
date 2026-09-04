import ExcelJS from 'exceljs'
import { LEVELS } from '@/lib/checklist'

// The blank test script.
//
// It is the same file the export comes out in, so there is one format and not
// two. Everything below the heading row is an example in amber italics —
// delete the three rows and start typing.

export async function GET() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CxSentinel'
  wb.created = new Date()

  const sheet = wb.addWorksheet('Test Script')

  sheet.getCell('A1').value = 'CxSentinel test script'
  sheet.getCell('A1').font = { name: 'Arial', bold: true, size: 13 }

  sheet.getCell('A2').value = 'Equipment / System:'
  sheet.getCell('B2').value = 'GIS-115-CB-01'
  sheet.getCell('D2').value = 'Level:'
  sheet.getCell('E2').value = 'L4 — Functional Performance Test (FPT)'
  for (const ref of ['A2', 'D2']) sheet.getCell(ref).font = { name: 'Arial', bold: true }
  for (const ref of ['B2', 'E2']) {
    sheet.getCell(ref).font = { name: 'Arial', italic: true, color: { argb: 'FF8A6D00' } }
    sheet.getCell(ref).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7DB' } }
  }

  const HEADERS = ['No.', 'Section', 'Content', 'Answer', 'Attachment', 'Remark', 'Links to', 'Tag / System', 'CXA ID', 'Remove']
  const WIDTHS = [7, 26, 62, 11, 26, 34, 26, 20, 38, 9]

  const header = sheet.getRow(4)
  HEADERS.forEach((h, i) => {
    header.getCell(i + 1).value = h
  })
  header.font = { name: 'Arial', bold: true }
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFBFD0F0' } } }
  })
  WIDTHS.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w
  })
  sheet.views = [{ state: 'frozen', ySplit: 4, xSplit: 3 }]

  const example = (values: (string | null)[]) => {
    const row = sheet.addRow(values)
    row.font = { name: 'Arial', italic: true, color: { argb: 'FF8A6D00' } }
    row.alignment = { vertical: 'top', wrapText: true }
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7DB' } }
    })
  }

  example([
    '1',
    'Prerequisites',
    'EXAMPLE — Approved single line drawing is available on site. Delete this row.',
    'Yes',
    'SLD rev C, uploaded 12 Aug',
    'Rev C supersedes rev B still on the wall in the control room.',
    'E-4102-C',
    null,
    null,
    null,
  ])
  example([
    '2',
    'Visual inspection — interior',
    'EXAMPLE — All cables torqued, double torque marks visible. Delete this row.',
    'No',
    'Photo of cubicle 3',
    'Two lugs in cubicle 3 have no second mark. Punch item raised.',
    'REQ-014',
    null,
    null,
    null,
  ])
  example([
    '3',
    'Protection',
    'EXAMPLE — Retest earth fault after the lugs in line 2 are re-torqued. Delete this row.',
    null,
    null,
    'Cannot be done until 2 is cleared.',
    '2; IEC 60255',
    'GIS-115-CB-02',
    null,
    null,
  ])

  // ── The guide tab ──────────────────────────────────────────────────────
  const guide = wb.addWorksheet('Guide')
  guide.columns = [
    { header: 'Column', key: 'c', width: 18 },
    { header: 'Needed?', key: 'n', width: 12 },
    { header: 'What goes in it', key: 'w', width: 96 },
  ]
  guide.getRow(1).font = { name: 'Arial', bold: true }
  guide.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  })

  const rows: [string, string, string][] = [
    ['Equipment / System', 'Yes', 'The tag, system or area this script tests, typed in cell B2. It has to already exist on the project — a test script cannot create the thing it tests. Put a Tag / System on a row instead if one sheet covers several.'],
    ['Level', 'Usually', 'Cell E2. Any of: ' + LEVELS.map((l) => l.label.split('—')[0].trim()).join(', ') + ', or the full name. If it is left out, choose the level on the upload screen.'],
    ['No.', 'Yes', 'The serial number of the check. It is how a check is referred to on site and what another line points at. It has to be unique on the sheet.'],
    ['Section', 'No', 'The heading a run of checks sits under. Repeat it down the rows, or fill it in on the first row of each group — both work.'],
    ['Content', 'Yes', 'The check itself. This is the only column that must be filled in.'],
    ['Answer', 'No', 'Yes, No or N/A. Pass and Fail mean the same and are accepted. Leave it EMPTY for a check nobody has done yet — empty and N/A are different facts and are never merged.'],
    ['Attachment', 'No', 'What proves it: a file name, a photo reference, a drawing number. A spreadsheet cannot carry a file, so this records what the evidence is; upload the file itself against the check.'],
    ['Remark', 'No', 'What actually happened. Anything a reviewer would want to know six months from now.'],
    ['Links to', 'No', 'What this check is connected to. Several are allowed, separated by a semicolon. Four kinds are understood: a line number on this sheet (2), a tag or system (GIS-115-CB-02), a requirement or obligation (REQ-014, OBL-0002), or anything else — a drawing, a submittal, a standard clause — which is kept exactly as typed.'],
    ['Tag / System', 'No', 'Overrides the equipment at the top of the sheet for that one row, so one sheet can cover several tags.'],
    ['CXA ID', 'No', 'Filled in by the export. Leave it alone — it is what tells CxSentinel which check a row already is, so an edited export updates instead of duplicating.'],
    ['Remove', 'No', 'Put Y here on an exported row to delete that check.'],
  ]
  for (const [c, n, w] of rows) {
    const row = guide.addRow({ c, n, w })
    row.alignment = { vertical: 'top', wrapText: true }
  }

  guide.addRow({})
  const note = guide.addRow({
    c: 'If anything is wrong',
    n: '',
    w: 'Nothing at all is imported and every bad row is reported by its row number. Half a script is worse than none: the missing half is invisible, and the half that arrived makes the register look like it worked.',
  })
  note.font = { name: 'Arial', bold: true }
  note.alignment = { vertical: 'top', wrapText: true }

  const buffer = await wb.xlsx.writeBuffer()
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="cxsentinel-test-script-template.xlsx"',
    },
  })
}
