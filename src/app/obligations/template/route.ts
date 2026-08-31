import ExcelJS from 'exceljs'
import { PARTIES, OBLIGATION_TYPES, OBLIGATION_STATUSES } from '@/lib/obligations'
import { LEVELS } from '@/lib/checklist'

// A blank obligations register in the same shape the export comes out in,
// with one worked row per party the reader most often gets wrong.
export async function GET() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CxSentinel'
  wb.created = new Date()

  const sheet = wb.addWorksheet('Obligations')
  sheet.columns = [
    { header: 'CXA ID', key: 'id', width: 38 },
    { header: 'Ref', key: 'ref', width: 12 },
    { header: 'Clause', key: 'clause', width: 11 },
    { header: 'Obligation', key: 'statement', width: 62 },
    { header: 'Party', key: 'party', width: 26 },
    { header: 'Kind', key: 'type', width: 16 },
    { header: 'State', key: 'status', width: 16 },
    { header: 'Owner', key: 'owner', width: 20 },
    { header: 'Due date', key: 'due', width: 12 },
    { header: 'Level', key: 'level', width: 34 },
    { header: 'Evidence', key: 'evidence', width: 30 },
    { header: 'Notes', key: 'notes', width: 28 },
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
    clause: '7.1',
    statement:
      'EXAMPLE — The Contractor shall submit the Inspection and Test Plan not less than fourteen (14) days before work starts. Delete this row.',
    party: 'Contractor',
    type: 'Provide',
    status: 'Open',
    owner: 'Site manager',
    due: '2026-09-15',
    level: 'L2 — Installation Verification (IV)',
  })
  example({
    clause: '8.1',
    statement: 'EXAMPLE — The Vendor shall attend and witness the first energization of each bay. Delete this row.',
    party: 'Vendor / Supplier',
    type: 'Witness / attend',
    status: 'Open',
    level: 'L4 — Functional Performance Test (FPT)',
  })
  example({
    clause: '11.3',
    statement:
      'EXAMPLE — The Commissioning Manager shall issue not less than five (5) working days notice of any Hold Point inspection. Delete this row.',
    party: 'Commissioning Manager (CxM)',
    type: 'Give notice',
    status: 'Submitted',
    evidence: 'Notice NT-0031 issued 12 Aug',
  })

  for (let r = 5; r <= 200; r += 1) sheet.getRow(r).font = { name: 'Arial' }

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

  note('CXA ID / Ref', 'Leave both blank on a new register. They appear when you export obligations that already exist, and they are what makes a second upload update them rather than duplicate them. References are never reused, even after one is deleted.')
  note('Clause', 'The clause number in the document it came from. This is what an argument on site is conducted in — "clause 7.1 was yours" is a conversation, "somewhere in the spec" is not.')
  note('Obligation', 'The only column that is required. A row with nothing in it is skipped.')
  note(
    'Party',
    `Who owes it: ${PARTIES.map((p) => p.label).join(' · ')}. Short forms work — Sub-con, Main Con, CxM, CxA, O&M. A party that cannot be recognised STOPS the import rather than being filed as unassigned, because an obligation quietly orphaned on a re-import is the one nobody chases. Leave it blank on purpose and the row imports unassigned, counted as such and named in the reading.`
  )
  note('Kind', `${OBLIGATION_TYPES.map((t) => t.label).join(', ')}. Blank or unrecognised is filed as Other.`)
  note(
    'State',
    `${OBLIGATION_STATUSES.map((s) => s.label).join(', ')}. Blank means Open. "Done" and "Complete" are read as **Submitted**, never Accepted — accepting is the receiving party's decision and a spreadsheet cell cannot make it.`
  )
  note('Owner', 'A named person inside the party, where the party alone is not specific enough.')
  note('Due date', 'Write it as 2026-04-03 or 3 Apr 2026. A bare 03/04/2026 is refused rather than guessed — day-first and month-first give dates a month apart, and the wrong one makes a late obligation look on time.')
  note('Level', `Which commissioning level it bites at, if any: ${LEVELS.map((l) => l.label).join(' · ')}.`)
  note('Evidence', 'What shows it was discharged — a transmittal number, an email date, a document reference.')
  note('Remove', 'Y deletes that obligation on upload. Only works on a row that already carries a CXA ID or a Ref.')
  note('', '')
  note('Use your own file', 'You do not have to use this template. Upload the register as the other party sent it back — headings are matched by name (Responsible, Owed by, Accountable all work as the party; Duty, Commitment, Undertaking all work as the obligation), the table can start anywhere in the first forty rows, and every tab is read.')
  note('Nothing is half-done', 'If any row cannot be read, nothing at all is imported and every bad row is reported with its row number and the reason.')

  // ── Reference tabs ─────────────────────────────────────────────────────
  const parties = wb.addWorksheet('Parties')
  parties.columns = [
    { header: 'Use one of these in the Party column', key: 'label', width: 34 },
    { header: 'Who they are', key: 'hint', width: 80 },
  ]
  parties.getRow(1).font = { name: 'Arial', bold: true }
  parties.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  for (const p of PARTIES) {
    const r = parties.addRow({ label: p.label, hint: p.hint })
    r.font = { name: 'Arial' }
    r.alignment = { vertical: 'top', wrapText: true }
  }

  const states = wb.addWorksheet('States')
  states.columns = [
    { header: 'State', key: 'label', width: 22 },
    { header: 'What it means', key: 'hint', width: 84 },
  ]
  states.getRow(1).font = { name: 'Arial', bold: true }
  states.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  for (const s of OBLIGATION_STATUSES) {
    const r = states.addRow({ label: s.label, hint: s.hint })
    r.font = { name: 'Arial' }
    r.alignment = { vertical: 'top', wrapText: true }
  }

  const kinds = wb.addWorksheet('Kinds')
  kinds.columns = [
    { header: 'Kind', key: 'label', width: 22 },
    { header: 'What it covers', key: 'hint', width: 84 },
  ]
  kinds.getRow(1).font = { name: 'Arial', bold: true }
  kinds.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  for (const t of OBLIGATION_TYPES) {
    const r = kinds.addRow({ label: t.label, hint: t.hint })
    r.font = { name: 'Arial' }
    r.alignment = { vertical: 'top', wrapText: true }
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="cxsentinel-obligations-template.xlsx"',
    },
  })
}
