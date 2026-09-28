import ExcelJS from 'exceljs'
import { requireAccess } from '@/data/require-access'

/**
 * The blank job sheet, with worked rows in it.
 *
 * Worked rows rather than an empty grid, because an empty grid is a format
 * to guess at and a filled one is an example to type over. The rows below
 * deliberately show the fill-down — the second and fourth have blank
 * System, Tag and Description cells — since that is the part somebody has
 * to be told about once and then never thinks about again.
 */
export async function GET() {
  const refused = await requireAccess()
  if (refused) return refused

  const wb = new ExcelJS.Workbook()
  wb.creator = 'CxNivora'
  wb.created = new Date()

  const sheet = wb.addWorksheet('Job sheet')
  sheet.columns = [
    { header: 'System', key: 'system', width: 24 },
    { header: 'Subsystem', key: 'subsystem', width: 18 },
    { header: 'Tag', key: 'tag', width: 24 },
    { header: 'Description', key: 'description', width: 34 },
    { header: 'Level', key: 'level', width: 10 },
    { header: 'Check', key: 'check', width: 46 },
    { header: 'Notes', key: 'notes', width: 28 },
    { header: 'ITP', key: 'itp', width: 14 },
  ]

  const rows = [
    ['SUDB-MV-SWGR', 'Incomer', 'SUDB-MV-SWGR-01', '22 kV incomer', 'L2', 'Busbar bolt torque', '55 Nm', ''],
    ['', '', '', '', 'L3', 'Insulation resistance', '>100 MOhm at 5 kV', 'Witness'],
    ['', 'Feeder 1', 'SUDB-MV-SWGR-02', 'Feeder to DCDB', 'L2', 'Busbar bolt torque', '55 Nm', ''],
    ['', '', '', '', 'L3', 'Phase rotation', 'R-Y-B', ''],
    ['DCDB-01', '', 'DCDB-01-MAIN', 'DC main board', 'L2', 'Earth continuity', 'less than 0.1 Ohm', ''],
  ]
  for (const r of rows) sheet.addRow(r)

  const header = sheet.getRow(1)
  header.font = { bold: true }
  header.alignment = { vertical: 'middle' }

  // A note under the table rather than a separate "instructions" tab. An
  // instructions tab is a tab nobody opens; a line under the rows they are
  // about to overwrite is read.
  sheet.addRow([])
  const note = sheet.addRow([
    'Leave System, Subsystem, Tag and Description blank to carry them down from the row above — as rows 3 and 5 do.',
  ])
  note.font = { italic: true, size: 10 }
  const note2 = sheet.addRow([
    'Only System, Tag, Level and Check are required. Delete these five example rows and this note before importing.',
  ])
  note2.font = { italic: true, size: 10 }

  const out = await wb.xlsx.writeBuffer()
  return new Response(out as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="CxNivora-job-sheet.xlsx"',
      'Cache-Control': 'no-store',
    },
  })
}
