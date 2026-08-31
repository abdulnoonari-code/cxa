import ExcelJS from 'exceljs'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { LEVELS, STATUSES } from '@/lib/checklist'
import { INSPECTION_TYPES } from '@/lib/inspection'
import { loadSubjectIndex } from '@/data/subjects'
import { refKey, subjectLabel, type Subject } from '@/lib/subjects'

// The whole project's checklist in one workbook — and the same workbook goes
// back in. The first eight columns are what the importer reads; everything
// after them is reporting, and is ignored on the way back. The CXA ID is what
// makes a re-import an update instead of six thousand duplicates.
export async function GET() {
  const project = await getCurrentProject()
  if (!project) return new Response('No project found', { status: 404 })

  const index = await loadSubjectIndex(project.id)

  const { data: itemsRaw } = await supabase
    .from('checklist_items')
    .select('id, level, item, status, notes, ai_comment, inspection_type, review_state, subject_type, subject_id, equipment_id')
    .eq('project_id', project.id)
    .order('level', { ascending: true })

  const items = (itemsRaw ?? []) as {
    id: string
    level: string
    item: string
    status: string
    notes: string | null
    ai_comment: string | null
    inspection_type: string | null
    review_state: string | null
    subject_type: string | null
    subject_id: string | null
    equipment_id: string | null
  }[]

  const itemIds = items.map((it) => it.id)

  // Attachments in bounded batches. The `.in()` list is the whole checklist,
  // which on a substation is tens of thousands of ids — long enough to be
  // refused as one URL.
  const attachments: { checklist_item_id: string; file_name: string }[] = []
  for (let i = 0; i < itemIds.length; i += 200) {
    const { data } = await supabase
      .from('attachments')
      .select('checklist_item_id, file_name')
      .in('checklist_item_id', itemIds.slice(i, i + 200))
    attachments.push(...((data ?? []) as { checklist_item_id: string; file_name: string }[]))
  }

  const filesByItem = new Map<string, string[]>()
  for (const a of attachments) {
    const list = filesByItem.get(a.checklist_item_id)
    if (list) list.push(a.file_name)
    else filesByItem.set(a.checklist_item_id, [a.file_name])
  }

  const levelLabel = (v: string) => LEVELS.find((l) => l.value === v)?.label ?? v
  const statusLabel = (v: string) => STATUSES.find((s) => s.value === v)?.label ?? v
  const itpLabel = (v: string | null) => INSPECTION_TYPES.find((t) => t.value === (v ?? 'surveillance'))?.label ?? 'Surveillance'

  // A check may hang off a system rather than a tag, so the subject column
  // says what it actually belongs to — the code where there is one, because
  // that is what the importer matches on first.
  const subjectOf = (subject_type: string | null, subject_id: string | null, equipment_id: string | null): Subject | null => {
    if (subject_type && subject_id) return index.byKey.get(refKey({ type: subject_type, id: subject_id })) ?? null
    if (equipment_id) return index.byKey.get(refKey({ type: 'equipment', id: equipment_id })) ?? null
    return null
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CxSentinel'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Project checklist')
  sheet.columns = [
    { header: 'CXA ID', key: 'id', width: 38 },
    { header: 'Tag / System', key: 'subject', width: 22 },
    { header: 'Level', key: 'level', width: 38 },
    { header: 'Item to check', key: 'item', width: 55 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Notes', key: 'notes', width: 42 },
    { header: 'ITP type', key: 'itp', width: 14 },
    { header: 'Remove', key: 'remove', width: 9 },
    { header: 'Belongs to', key: 'kind', width: 14 },
    { header: 'Documents', key: 'docs', width: 11 },
    { header: 'Attached files', key: 'files', width: 40 },
    { header: 'Automatic check', key: 'ai', width: 52 },
  ]

  const header = sheet.getRow(1)
  header.font = { name: 'Arial', bold: true }
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  })
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }]

  for (const it of items) {
    const subject = subjectOf(it.subject_type, it.subject_id, it.equipment_id)
    const files = filesByItem.get(it.id) ?? []
    const row = sheet.addRow({
      id: it.id,
      subject: subject?.code ?? subject?.name ?? '',
      level: levelLabel(it.level),
      item: it.item,
      status: statusLabel(it.status),
      notes: it.notes ?? '',
      itp: itpLabel(it.inspection_type),
      remove: '',
      kind: subject ? subjectLabel(subject.type) : 'Unassigned',
      docs: files.length,
      files: files.join(', '),
      ai: it.ai_comment ?? '',
    })
    row.font = { name: 'Arial' }
    row.alignment = { vertical: 'top', wrapText: true }
  }

  // ── How to edit this ────────────────────────────────────────────────────
  const guide = workbook.addWorksheet('How to edit this')
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

  note('CXA ID', 'Do not change it. It is how CxSentinel knows this row is the check you already have, so editing a row here updates that check instead of creating a second copy. Leave it blank on a row you have added yourself and a new check is created.')
  note('Tag / System', 'What the check belongs to. A tag creates the check against that piece of equipment; a system or area name creates it against the system itself, which is where checks like "all cable schedules issued" belong. Codes are matched before names.')
  note('Level', `One of: ${LEVELS.map((l) => l.label).join(' · ')}. "L3" on its own works too.`)
  note('Item to check', 'The check itself. Required on every row — a row with an empty item is skipped, which is how you leave spacing rows in your own sheet.')
  note('Status', `One of: ${STATUSES.map((s) => s.label).join(', ')}. Blank means Pending. Pass, P, OK, Complete and Accepted are all read as Pass.`)
  note('Notes', 'Free text.')
  note('ITP type', `One of: ${INSPECTION_TYPES.map((t) => t.label).join(', ')}. Blank means Surveillance. A Hold point stops the work until the client signs; a Witness point needs notice but does not stop the work.`)
  note('Remove', 'Y deletes that check when you upload. Only works on a row that has a CXA ID.')
  note('', '')
  note('Belongs to, Documents, Attached files, Automatic check', 'Reporting only. These are ignored on the way back in — you cannot attach a document by typing its name here.')
  note('', '')
  note('Nothing is half-done', 'If any row cannot be read, nothing at all is imported and every bad row is listed with its row number, both on screen and in the audit trail.')
  note('Your own file works too', 'You do not have to use this one. Import your own ITP as it came — headings are matched by name, the table can start anywhere on the sheet, and each tab can be a different level.')

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  const fileName = `${project.name}-checklist.xlsx`.replace(/[^a-zA-Z0-9._-]/g, '_')

  return new Response(arrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
