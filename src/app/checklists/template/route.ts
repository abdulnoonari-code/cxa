import ExcelJS from 'exceljs'
import { LEVELS, STATUSES } from '@/lib/checklist'
import { INSPECTION_TYPES } from '@/lib/inspection'

// A blank checklist in the same shape the export comes out in, so the two are
// the same file and there is only one format to learn. Three worked rows, one
// per common case: a check against a tag, a check against a system, and a hold
// point.
export async function GET() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CxSentinel'
  wb.created = new Date()

  const sheet = wb.addWorksheet('Checklist')
  sheet.columns = [
    { header: 'CXA ID', key: 'id', width: 38 },
    { header: 'Tag / System', key: 'subject', width: 22 },
    { header: 'Level', key: 'level', width: 38 },
    { header: 'Item to check', key: 'item', width: 62 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Notes', key: 'notes', width: 40 },
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

  const example = (values: Record<string, string>) => {
    const row = sheet.addRow(values)
    row.font = { name: 'Arial', italic: true, color: { argb: 'FF8A6D00' } }
    row.alignment = { vertical: 'top', wrapText: true }
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7DB' } }
    })
  }

  example({
    subject: 'GIS-115-CB-01',
    level: 'L2 — Installation Verification (IV)',
    item: 'EXAMPLE — Earthing connections torqued and marked. Delete this row.',
    status: 'Pending',
    itp: 'Surveillance',
  })
  example({
    subject: '115kV GIS',
    level: 'L3 — Pre-functional / Static',
    item: 'EXAMPLE — a check against the whole system, not one tag. Delete this row.',
    status: 'Pending',
    itp: 'Review',
  })
  example({
    subject: 'TX-01',
    level: 'L4 — Functional Performance Test (FPT)',
    item: 'EXAMPLE — a hold point: work stops until the client signs. Delete this row.',
    status: 'Pending',
    itp: 'Hold Point',
  })

  for (let r = 5; r <= 80; r += 1) sheet.getRow(r).font = { name: 'Arial' }

  // ── How to fill this in ────────────────────────────────────────────────
  const guide = wb.addWorksheet('How to fill this in')
  guide.columns = [
    { header: 'Column', key: 'col', width: 20 },
    { header: 'What to put in it', key: 'meaning', width: 100 },
  ]
  guide.getRow(1).font = { name: 'Arial', bold: true }
  guide.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }

  const note = (col: string, meaning: string) => {
    const r = guide.addRow({ col, meaning })
    r.font = { name: 'Arial' }
    r.alignment = { vertical: 'top', wrapText: true }
  }

  note('CXA ID', 'Leave blank on a new checklist. It only appears when you export checks that already exist, and it is what makes a second upload update them rather than duplicate them.')
  note('Tag / System', 'What the check belongs to — an equipment tag, or a system or area name for a check that is not about one piece of kit. Leave the whole column blank and the checklist is applied to every tag you tick on the Checklists screen, which is the usual way to load one ITP onto forty identical bays.')
  note('Level', `One of: ${LEVELS.map((l) => l.label).join(' · ')}. "L3" on its own works. You can also put nothing here and name the tab after the level instead — a tab called "L2" gives every row on it that level.`)
  note('Item to check', 'The only column that is required. A row with nothing in it is skipped, so blank spacing rows in your own sheet are harmless.')
  note('Status', `One of: ${STATUSES.map((s) => s.label).join(', ')}. Blank means Pending.`)
  note('Notes', 'Free text — a comment, a reading, an instrument number.')
  note('ITP type', `One of: ${INSPECTION_TYPES.map((t) => `${t.label} (${t.code})`).join(', ')}. Blank means Surveillance.`)
  note('Remove', 'Y deletes that check on upload. Only works on a row that has a CXA ID, so it can only be used on a file you exported.')
  note('', '')
  note('Use your own file', 'You do not have to use this template at all. Upload the ITP as the EPC issued it — headings are matched by name (Item, Description, Check, Task, Activity, Test all work; Tag, KKS, Equipment, System all work), the table can start anywhere in the first forty rows, and every tab in the workbook is read.')
  note('Nothing is half-done', 'If any row cannot be read, nothing at all is imported and every bad row is reported with its row number and the reason.')
  note('Nothing is guessed', 'A level or a status the importer does not recognise is reported, never assumed. It will not quietly file an unreadable row as Pending.')

  // ── Levels ─────────────────────────────────────────────────────────────
  const levels = wb.addWorksheet('Levels')
  levels.columns = [
    { header: 'Use one of these in the Level column', key: 'label', width: 46 },
    { header: 'Short code', key: 'code', width: 14 },
  ]
  levels.getRow(1).font = { name: 'Arial', bold: true }
  levels.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  for (const l of LEVELS) {
    levels.addRow({ label: l.label, code: l.value.split('_')[0].toUpperCase() }).font = { name: 'Arial' }
  }

  // ── ITP types ──────────────────────────────────────────────────────────
  const itp = wb.addWorksheet('ITP types')
  itp.columns = [
    { header: 'Use one of these in the ITP type column', key: 'label', width: 30 },
    { header: 'Code', key: 'code', width: 8 },
    { header: 'What it means', key: 'meaning', width: 90 },
  ]
  itp.getRow(1).font = { name: 'Arial', bold: true }
  itp.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  for (const t of INSPECTION_TYPES) {
    const r = itp.addRow({ label: t.label, code: t.code, meaning: t.note })
    r.font = { name: 'Arial' }
    r.alignment = { vertical: 'top', wrapText: true }
  }

  const arrayBuffer = await wb.xlsx.writeBuffer()

  return new Response(arrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="cxsentinel-checklist-template.xlsx"',
    },
  })
}
