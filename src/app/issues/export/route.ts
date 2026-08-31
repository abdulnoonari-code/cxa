import ExcelJS from 'exceljs'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { loadAllPunch } from '@/data/punchlist'
import { refKey } from '@/lib/subjects'
import { LEVELS } from '@/lib/checklist'
import { CATEGORIES, ISSUE_STATUSES, SEVERITIES } from '@/lib/issues'
import { CATEGORY_BLOCKS, summarise, verdict, daysOverdue, ageInDays, statusLabel, severityLabel } from '@/lib/punchlist'

// The punch list as it goes to the client, and as it comes back.
//
// The first fourteen columns are what the importer reads; the rest are the
// record and are ignored on the way back. The punch number is what makes a
// marked-up file land on the right rows.
export async function GET() {
  const project = await getCurrentProject()
  if (!project) return new Response('No project found', { status: 404 })

  const [index, items] = await Promise.all([loadSubjectIndex(project.id), loadAllPunch(project.id)])

  const levelLabel = (v: string | null) => LEVELS.find((l) => l.value === v)?.label ?? ''
  const categoryLabelOf = (v: string | null) => (v ? `Category ${v}` : '')

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
    { header: 'Days open', key: 'age', width: 11 },
    { header: 'Days late', key: 'late', width: 11 },
    { header: 'Raised on', key: 'created', width: 12 },
    { header: 'Cleared on', key: 'closed', width: 12 },
    { header: 'Accepted by', key: 'verified_by', width: 20 },
    { header: 'Automatic check', key: 'ai', width: 50 },
  ]

  const header = sheet.getRow(1)
  header.font = { name: 'Arial', bold: true }
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  })
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }]

  for (const item of items) {
    const subject =
      item.subject_type && item.subject_id
        ? index.byKey.get(refKey({ type: item.subject_type, id: item.subject_id }))
        : item.equipment_id
          ? index.byKey.get(refKey({ type: 'equipment', id: item.equipment_id }))
          : undefined

    const late = daysOverdue(item)
    const row = sheet.addRow({
      id: item.id,
      ref: item.ref ?? '',
      subject: subject?.code ?? subject?.name ?? '',
      title: item.title,
      detail: item.description ?? '',
      category: categoryLabelOf(item.category),
      severity: severityLabel(item.severity),
      status: statusLabel(item.status),
      level: levelLabel(item.level),
      raised_by: item.raised_by ?? '',
      party: item.responsible_party ?? '',
      discipline: item.discipline ?? '',
      location: item.location ?? '',
      due: item.due_date ?? '',
      remove: '',
      age: ageInDays(item) ?? '',
      late: late ?? '',
      created: (item.created_at ?? '').slice(0, 10),
      closed: (item.closed_at ?? '').slice(0, 10),
      verified_by: item.verified_by ?? '',
      ai: item.ai_comment ?? '',
    })
    row.font = { name: 'Arial' }
    row.alignment = { vertical: 'top', wrapText: true }

    // An open Category A item and an overdue item are the two things a
    // reader is looking for, so the sheet says so without them having to
    // sort it.
    if (item.category === 'A' && item.status !== 'closed' && item.status !== 'verified') {
      row.getCell('category').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE2E2' } }
    }
    if (late !== null) {
      row.getCell('due').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE2E2' } }
    }
    if (!item.category && item.status !== 'closed' && item.status !== 'verified') {
      row.getCell('category').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7DB' } }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────
  const summary = summarise(items)
  const reading = verdict(summary)

  const s = wb.addWorksheet('Summary')
  s.columns = [
    { header: 'Figure', key: 'k', width: 34 },
    { header: 'Value', key: 'v', width: 70 },
  ]
  s.getRow(1).font = { name: 'Arial', bold: true }
  s.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  const line = (k: string, v: string | number) => {
    const r = s.addRow({ k, v })
    r.font = { name: 'Arial' }
    r.alignment = { vertical: 'top', wrapText: true }
  }
  line('Project', project.name)
  line('Exported', new Date().toISOString().slice(0, 16).replace('T', ' '))
  line('Reading', reading.label)
  line('', reading.detail)
  line('Items raised', summary.total)
  line('Open', summary.open)
  line('Open Category A', summary.openA)
  line('Open Category B', summary.openB)
  line('Open Category C', summary.openC)
  line('Open with no category', summary.openUncategorised)
  line('Overdue', summary.overdue)
  line('Cleared, awaiting acceptance', summary.awaitingAcceptance)
  line('Closed and accepted', summary.closed)
  line('Oldest open item (days)', summary.oldest ?? '—')
  line('', '')
  line(
    'What this is not',
    'This is a record of what is outstanding, not a clearance. Whether a system may proceed is decided by its readiness gate, which reads these categories as rules.'
  )

  // ── How to edit this ───────────────────────────────────────────────────
  const guide = wb.addWorksheet('How to edit this')
  guide.columns = [
    { header: 'Column', key: 'col', width: 20 },
    { header: 'What it does when you upload this file back', key: 'meaning', width: 100 },
  ]
  guide.getRow(1).font = { name: 'Arial', bold: true }
  guide.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  const note = (col: string, meaning: string) => {
    const r = guide.addRow({ col, meaning })
    r.font = { name: 'Arial' }
    r.alignment = { vertical: 'top', wrapText: true }
  }

  note('CXA ID / Punch no', 'Do not change either. They are how CxSentinel knows which item each row already is, so your edits update the right rows instead of creating a second copy of the list. Add a row with both left blank and it is raised as a new item with the next free number.')
  note('Tag / System', 'What the defect is against — an equipment tag, or a system or area name. Required on a new item. Left blank on an existing one it means "unchanged", not "detach".')
  note('Punch item', 'The only column that is required. A row with nothing in it is skipped.')
  note('Detail', 'What needs to happen before it can be closed.')
  note('Category', `A, B or C. ${CATEGORIES.map((c) => `${c.value} = ${CATEGORY_BLOCKS[c.value]}`).join(' ')} Left blank, the item is imported uncategorised and counted as blocking until somebody assesses it.`)
  note('Severity', `${SEVERITIES.map((v) => v.label).join(', ')}. Blank means Minor. Severity is how bad it is; category is what it is allowed to stop. They are not the same thing.`)
  note('Status', `${ISSUE_STATUSES.map((v) => v.label).join(', ')}. Blank means Open. Ready for Retest means the contractor says it is done; only Verified means somebody accepted that.`)
  note('Level', `Which commissioning level it was raised at: ${LEVELS.map((l) => l.label).join(' · ')}. "L3" works. Leave blank if it is not tied to a level.`)
  note('Raised by / Responsible / Discipline / Location', 'Free text. Responsible is the party that has to clear it.')
  note('Due date', 'Write it as 2026-04-03 or as 3 Apr 2026. A bare 03/04/2026 is refused rather than guessed — day-first and month-first give different dates and the wrong one makes an item look on time.')
  note('Remove', 'Y deletes that item on upload. Only works on a row that already has a CXA ID or a punch number.')
  note('', '')
  note('Days open, Days late, Raised on, Cleared on, Accepted by, Automatic check', 'Record only. These are worked out from the data and are ignored on the way back in.')
  note('Nothing is half-done', 'If any row cannot be read, nothing at all is imported and every bad row is reported with its row number.')

  const buffer = await wb.xlsx.writeBuffer()
  const fileName = `${project.name}-punchlist.xlsx`.replace(/[^a-zA-Z0-9._-]/g, '_')

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
