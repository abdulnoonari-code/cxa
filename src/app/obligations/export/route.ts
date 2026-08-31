import ExcelJS from 'exceljs'
import { buildObligationReport } from '../report'
import { safeFileName } from '@/lib/docgen'
import { LEVELS } from '@/lib/checklist'
import {
  PARTIES,
  OBLIGATION_TYPES,
  OBLIGATION_STATUSES,
  partyLabel,
  statusLabel,
  typeLabel,
  daysOverdue,
} from '@/lib/obligations'

// The register as a spreadsheet — the one that comes back edited.
//
// The first thirteen columns round-trip. Everything after them is the record
// and is ignored on the way in.
export async function GET(request: Request) {
  const built = await buildObligationReport(request.url)
  if (!built) return new Response('No project found', { status: 404 })

  const levelLabel = (v: string | null) => LEVELS.find((l) => l.value === v)?.label ?? ''

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
    { header: 'Notes', key: 'notes', width: 30 },
    { header: 'Remove', key: 'remove', width: 9 },
    { header: 'Source document', key: 'source', width: 30 },
    { header: 'How it got here', key: 'origin', width: 18 },
    { header: 'Days late', key: 'late', width: 11 },
    { header: 'Submitted', key: 'submitted', width: 12 },
    { header: 'Accepted', key: 'accepted', width: 12 },
  ]

  const header = sheet.getRow(1)
  header.font = { name: 'Arial', bold: true }
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  })
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }]

  for (const r of built.rows) {
    const late = daysOverdue(r)
    const row = sheet.addRow({
      id: r.id,
      ref: r.ref ?? '',
      clause: r.clause ?? '',
      statement: r.statement,
      party: r.party ? partyLabel(r.party) : '',
      type: typeLabel(r.obligation_type),
      status: statusLabel(r.status),
      owner: r.owner ?? '',
      due: r.due_date ?? '',
      level: levelLabel(r.level),
      evidence: r.evidence ?? '',
      notes: r.notes ?? '',
      remove: '',
      source: r.source_name ?? '',
      origin: r.origin === 'rule' ? 'Read from the document' : r.origin === 'import' ? 'Imported' : 'Typed by hand',
      late: late ?? '',
      submitted: (r.closed_at ?? '').slice(0, 10),
      accepted: (r.accepted_at ?? '').slice(0, 10),
    })
    row.font = { name: 'Arial' }
    row.alignment = { vertical: 'top', wrapText: true }

    if (late !== null) {
      row.getCell('due').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE2E2' } }
    }
    if (!r.party && r.status !== 'accepted') {
      row.getCell('party').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7DB' } }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────
  const s = wb.addWorksheet('Summary')
  s.columns = [
    { header: 'Figure', key: 'k', width: 34 },
    { header: 'Value', key: 'v', width: 74 },
  ]
  s.getRow(1).font = { name: 'Arial', bold: true }
  s.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  const line = (k: string, v: string | number) => {
    const r = s.addRow({ k, v })
    r.font = { name: 'Arial' }
    r.alignment = { vertical: 'top', wrapText: true }
  }
  line('Project', built.project.name)
  line('Scope of this file', built.report.subtitle ?? '')
  line('Exported', new Date().toISOString().slice(0, 16).replace('T', ' '))
  line('Reading', built.report.standfirst ?? '')
  for (const figure of built.report.figures ?? []) line(figure.label, figure.value)

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

  note('CXA ID / Ref', 'How CxSentinel recognises an obligation it already has, so your edits update it rather than create a second copy. Leave both blank on a new row and a new obligation is created with the next free reference. References are never reused.')
  note('Obligation', 'The only column that is required. A row with nothing in it is skipped.')
  note('Party', `Who owes it: ${PARTIES.map((p) => p.label).join(' · ')}. Blank means nobody owns it — the register counts those separately and says so, because an obligation nobody owns is one nobody will discharge.`)
  note('Kind', `${OBLIGATION_TYPES.map((t) => t.label).join(', ')}.`)
  note('State', `${OBLIGATION_STATUSES.map((t) => t.label).join(', ')}. Blank means Open. Submitted is the owing party saying it is done; Accepted is the other party agreeing. Only Accepted, Waived and Not applicable close an obligation.`)
  note('Owner', 'A named person inside the party, where the party alone is not specific enough.')
  note('Due date', 'Write it as 2026-04-03 or 3 Apr 2026. A bare 03/04/2026 is refused rather than guessed — day-first and month-first give dates a month apart, and the wrong one makes a late obligation look on time.')
  note('Level', `Which commissioning level the obligation bites at, if any: ${LEVELS.map((l) => l.label).join(' · ')}.`)
  note('Evidence', 'What shows it was discharged — a transmittal number, an email date, a document reference.')
  note('Remove', 'Y deletes that obligation on upload. Only works on a row that already has a CXA ID or a Ref.')
  note('', '')
  note('Source document, How it got here, Days late, Submitted, Accepted', 'Record only. Ignored on the way back in.')
  note('Nothing is half-done', 'If any row cannot be read, nothing at all is imported and every bad row is reported with its row number.')

  const buffer = await wb.xlsx.writeBuffer()
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safeFileName(`${built.project.name}-obligations.xlsx`)}"`,
    },
  })
}
