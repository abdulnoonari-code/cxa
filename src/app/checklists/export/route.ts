import ExcelJS from 'exceljs'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { LEVELS, STATUSES } from '@/lib/checklist'

// The whole project's checklist in one workbook — every tag, every level, with
// status, comments and how many documents are attached to each check.
export async function GET() {
  const project = await getCurrentProject()
  if (!project) return new Response('No project found', { status: 404 })

  const { data: equipmentRows } = await supabase
    .from('equipment')
    .select('id, tag_id, description')
    .eq('project_id', project.id)
    .order('tag_id')

  const equipment = equipmentRows ?? []
  const equipmentIds = equipment.map((e) => e.id)
  const tagById = new Map(equipment.map((e) => [e.id, e.tag_id]))

  const { data: itemsRaw } =
    equipmentIds.length > 0
      ? await supabase
          .from('checklist_items')
          .select('id, level, item, status, notes, ai_comment, equipment_id')
          .in('equipment_id', equipmentIds)
          .order('level', { ascending: true })
      : { data: [] as {
          id: string
          level: string
          item: string
          status: string
          notes: string | null
          ai_comment: string | null
          equipment_id: string
        }[] }

  const items = itemsRaw ?? []
  const itemIds = items.map((it) => it.id)

  const { data: attachmentsRaw } =
    itemIds.length > 0
      ? await supabase.from('attachments').select('checklist_item_id, file_name').in('checklist_item_id', itemIds)
      : { data: [] as { checklist_item_id: string; file_name: string }[] }

  const attachments = attachmentsRaw ?? []

  const levelLabel = (v: string) => LEVELS.find((l) => l.value === v)?.label ?? v
  const statusLabel = (v: string) => STATUSES.find((s) => s.value === v)?.label ?? v

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CxSentinel'
  const sheet = workbook.addWorksheet('Project checklist')

  sheet.columns = [
    { header: 'Equipment', key: 'tag', width: 16 },
    { header: 'Level', key: 'level', width: 38 },
    { header: 'Item to check', key: 'item', width: 55 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Comment', key: 'notes', width: 42 },
    { header: 'Documents', key: 'docs', width: 12 },
    { header: 'Attached files', key: 'files', width: 46 },
    { header: 'Automatic check', key: 'ai', width: 58 },
  ]
  const header = sheet.getRow(1)
  header.font = { name: 'Arial', bold: true }
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  })
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  for (const it of items) {
    const files = attachments.filter((a) => a.checklist_item_id === it.id)
    const row = sheet.addRow({
      tag: tagById.get(it.equipment_id) ?? '',
      level: levelLabel(it.level),
      item: it.item,
      status: statusLabel(it.status),
      notes: it.notes ?? '',
      docs: files.length,
      files: files.map((f) => f.file_name).join(', '),
      ai: it.ai_comment ?? '',
    })
    row.font = { name: 'Arial' }
    row.alignment = { vertical: 'top', wrapText: true }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  const fileName = `${project.name}-checklist.xlsx`.replace(/[^a-zA-Z0-9._-]/g, '_')

  return new Response(arrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
