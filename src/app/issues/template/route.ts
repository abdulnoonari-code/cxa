import ExcelJS from 'exceljs'
import { LEVELS } from '@/lib/checklist'
import { CATEGORIES, ISSUE_STATUSES, SEVERITIES } from '@/lib/issues'
import { CATEGORY_BLOCKS } from '@/lib/punchlist'

// A blank punch list in the same shape the export comes out in, so a walkdown
// done on paper and typed up in Excel imports without anybody being told the
// format. Three worked rows: an A item against a tag, a B item against a
// system, and one already cleared and waiting on acceptance.
export async function GET() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CxSentinel'
  wb.created = new Date()

  const sheet = wb.addWorksheet('Punch list')
  sheet.columns = [
    { header: 'CXA ID', key: 'id', width: 38 },
    { header: 'Punch no', key: 'ref', width: 11 },
    { header: 'Tag / System', key: 'subject', width: 20 },
    { header: 'Punch item', key: 'title', width: 46 },
    { header: 'Detail', key: 'detail', width: 44 },
    { header: 'Category', key: 'category', width: 12 },
    { header: 'Severity', key: 'severity', width: 13 },
    { header: 'Status', key: 'status', width: 17 },
    { header: 'Level', key: 'level', width: 34 },
    { header: 'Raised by', key: 'raised_by', width: 20 },
    { header: 'Responsible', key: 'party', width: 22 },
    { header: 'Discipline', key: 'discipline', width: 16 },
    { header: 'Location', key: 'location', width: 20 },
    { header: 'Due date', key: 'due', width: 12 },
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
    title: 'EXAMPLE — Earth connection at the breaker base not torqued or marked. Delete this row.',
    detail: 'Torque to the approved figure, apply the torque mark, and photograph.',
    category: 'A',
    severity: 'Major',
    status: 'Open',
    level: 'L2 — Installation Verification (IV)',
    raised_by: 'A. Jabbar',
    party: 'Electrical subcontractor',
    discipline: 'Electrical',
    location: 'Switchyard, bay 01',
    due: '2026-09-15',
  })
  example({
    subject: '115kV GIS',
    title: 'EXAMPLE — an item against the whole system, not one tag. Delete this row.',
    detail: 'Cable schedule rev C not yet issued for the bay.',
    category: 'B',
    severity: 'Minor',
    status: 'Open',
    level: 'L3 — Pre-functional / Static',
    party: 'EPC document control',
    due: '2026-09-30',
  })
  example({
    subject: 'TX-01',
    title: 'EXAMPLE — cleared by the contractor, not yet accepted. Delete this row.',
    detail: 'Oil leak at the radiator flange rectified; gasket replaced.',
    category: 'A',
    severity: 'Critical',
    status: 'Ready for Retest',
    level: 'L3 — Pre-functional / Static',
    party: 'Vendor',
    discipline: 'Mechanical',
  })

  for (let r = 5; r <= 200; r += 1) sheet.getRow(r).font = { name: 'Arial' }

  // ── How to fill this in ────────────────────────────────────────────────
  const guide = wb.addWorksheet('How to fill this in')
  guide.columns = [
    { header: 'Column', key: 'col', width: 22 },
    { header: 'What to put in it', key: 'meaning', width: 100 },
  ]
  guide.getRow(1).font = { name: 'Arial', bold: true }
  guide.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  const note = (col: string, meaning: string) => {
    const r = guide.addRow({ col, meaning })
    r.font = { name: 'Arial' }
    r.alignment = { vertical: 'top', wrapText: true }
  }

  note('CXA ID / Punch no', 'Leave both blank on a new list. They appear when you export items that already exist, and they are what makes a second upload update those items rather than duplicate them. Punch numbers are never reused, even after an item is deleted.')
  note('Tag / System', 'What the defect is against — an equipment tag, or a system or area name. Required on every new item, because a defect that is not against anything cannot block anything.')
  note('Punch item', 'The only column that is required. A row with nothing in it is skipped, so blank spacing rows are harmless.')
  note('Detail', 'What has to happen before it can be closed. Worth writing: a Category A item with no detail is flagged on import.')
  note('Category', `What the item is allowed to stop. ${CATEGORIES.map((c) => `${c.value} — ${CATEGORY_BLOCKS[c.value]}`).join(' ')} Leave it blank and the item is imported uncategorised and counted as blocking, because an item nobody has assessed cannot be assumed harmless.`)
  note('Severity', `${SEVERITIES.map((s) => s.label).join(', ')}. Blank means Minor. Severity is how bad the defect is; category is what it holds up. A critical defect can be Category C if everyone agrees it waits for the outage.`)
  note('Status', `${ISSUE_STATUSES.map((s) => s.label).join(', ')}. Blank means Open. "Ready for Retest" means the contractor says it is done; "Verified" means somebody accepted that. They are deliberately two different states.`)
  note('Level', `Which commissioning level raised it: ${LEVELS.map((l) => l.label).join(' · ')}. "L3" on its own works. Leave blank if it is not tied to a level.`)
  note('Raised by', 'Who found it.')
  note('Responsible', 'The party that has to clear it — usually a company, not a person. This is what the Responsible filter on the screen groups by.')
  note('Discipline / Location', 'Free text. Both optional.')
  note('Due date', 'Write it as 2026-04-03 or as 3 Apr 2026. A bare 03/04/2026 is refused rather than guessed: day-first and month-first give different dates a month apart, and the wrong one makes a late item look on time.')
  note('Remove', 'Y deletes that item on upload. Only works on a row that already carries a CXA ID or a punch number.')
  note('', '')
  note('Use your own file', 'You do not have to use this template. Upload the punch list as the client issued it — headings are matched by name (Description, Defect, Observation, Finding, Snag, NCR all work as the item; Tag, KKS, Equipment, System all work as the subject), the table can start anywhere in the first forty rows, and every tab is read.')
  note('Nothing is half-done', 'If any row cannot be read, nothing at all is imported and every bad row is reported with its row number and the reason.')
  note('Nothing is guessed', 'A category, status, level or date the importer cannot read is reported, never assumed.')

  // ── Reference tabs ─────────────────────────────────────────────────────
  const cats = wb.addWorksheet('Categories')
  cats.columns = [
    { header: 'Category', key: 'c', width: 12 },
    { header: 'Meaning', key: 'l', width: 46 },
    { header: 'What it blocks', key: 'b', width: 90 },
  ]
  cats.getRow(1).font = { name: 'Arial', bold: true }
  cats.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  for (const c of CATEGORIES) {
    const r = cats.addRow({ c: c.value, l: c.label, b: CATEGORY_BLOCKS[c.value] })
    r.font = { name: 'Arial' }
    r.alignment = { vertical: 'top', wrapText: true }
  }

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

  const buffer = await wb.xlsx.writeBuffer()

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="cxsentinel-punchlist-template.xlsx"',
    },
  })
}
