import ExcelJS from 'exceljs'
import { supabase } from '@/lib/supabase'
import { LEVELS, STATUSES } from '@/lib/checklist'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: equipment } = await supabase
    .from('equipment')
    .select('tag_id, description')
    .eq('id', id)
    .single()

  if (!equipment) {
    return new Response('Equipment not found', { status: 404 })
  }

  const { data: items } = await supabase
    .from('checklist_items')
    .select('level, item, status, notes, ai_comment')
    .eq('equipment_id', id)
    .order('level', { ascending: true })
    .order('created_at', { ascending: true })

  const levelLabel = (value: string) => LEVELS.find((l) => l.value === value)?.label ?? value
  const statusLabel = (value: string) => STATUSES.find((s) => s.value === value)?.label ?? value

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CxSentinel'
  const sheet = workbook.addWorksheet('Checklist')

  sheet.columns = [
    { header: 'Level', key: 'level', width: 34 },
    { header: 'Item', key: 'item', width: 50 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Notes', key: 'notes', width: 40 },
    { header: 'Check note', key: 'ai_comment', width: 50 },
  ]
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEFF4FF' },
  }

  for (const it of items ?? []) {
    sheet.addRow({
      level: levelLabel(it.level),
      item: it.item,
      status: statusLabel(it.status),
      notes: it.notes ?? '',
      ai_comment: it.ai_comment ?? '',
    })
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  const fileName = `${equipment.tag_id}-checklist.xlsx`.replace(/[^a-zA-Z0-9._-]/g, '_')

  return new Response(arrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
