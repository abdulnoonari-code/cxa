import ExcelJS from 'exceljs'
import { LEVELS } from '@/lib/checklist'

// A blank checklist to fill in offline and upload back. It carries its own
// instructions and one worked example row, so the format doesn't have to be
// explained anywhere else. The importer finds the table by looking for the
// "Level" header, which is why the notes above it are safe.
export async function GET() {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CxSentinel'

  const sheet = workbook.addWorksheet('Checklist')
  sheet.columns = [
    { key: 'level', width: 38 },
    { key: 'item', width: 62 },
    { key: 'notes', width: 40 },
  ]

  sheet.mergeCells('A1:C1')
  const title = sheet.getCell('A1')
  title.value = 'CxSentinel — checklist template'
  title.font = { name: 'Arial', size: 14, bold: true }

  sheet.mergeCells('A2:C2')
  const help = sheet.getCell('A2')
  help.value =
    'Fill in one row per check. Level must match one of the entries on the "Levels" tab — "L4" or the full label both work. Notes are optional. Delete the example row before uploading. Upload the finished file on the Checklists screen and choose which equipment tags it applies to.'
  help.font = { name: 'Arial', size: 10 }
  help.alignment = { wrapText: true, vertical: 'top' }
  sheet.getRow(2).height = 46

  const header = sheet.getRow(4)
  header.values = ['Level', 'Item to check', 'Notes (optional)']
  header.font = { name: 'Arial', bold: true }
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFBFD0F0' } } }
  })

  const example = sheet.getRow(5)
  example.values = [
    'L4 — Functional Performance Test (FPT)',
    'EXAMPLE — Load bank test held at 100% rated capacity for 2 hours',
    'Delete this row before uploading',
  ]
  example.font = { name: 'Arial', italic: true, color: { argb: 'FF8A6D00' } }
  example.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7DB' } }
  })

  for (let r = 6; r <= 60; r += 1) {
    sheet.getRow(r).font = { name: 'Arial' }
  }

  const levels = workbook.addWorksheet('Levels')
  levels.columns = [
    { header: 'Use one of these in the Level column', key: 'label', width: 46 },
    { header: 'Short code', key: 'code', width: 14 },
  ]
  levels.getRow(1).font = { name: 'Arial', bold: true }
  levels.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  for (const l of LEVELS) {
    const row = levels.addRow({ label: l.label, code: l.value.split('_')[0].toUpperCase() })
    row.font = { name: 'Arial' }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()

  return new Response(arrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="cxsentinel-checklist-template.xlsx"',
    },
  })
}
