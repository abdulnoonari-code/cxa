import ExcelJS from 'exceljs'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { CATEGORIES } from '@/app/equipment/styles'

// The catalogue as it stands, in the same shape the importer reads — so it
// can be edited in Excel and sent straight back.
export async function GET() {
  const project = await getCurrentProject()
  if (!project) return new Response('No project found', { status: 404 })

  const { data, error } = await supabase
    .from('equipment_types')
    .select('id, type_code, name, category, manufacturer, model, rating, description')
    .eq('project_id', project.id)
    .order('type_code')

  if (error) {
    return new Response(
      'The catalogue is not installed on this database. Run week5-part35-equipment-types.sql in Supabase.',
      { status: 409 }
    )
  }

  const rows = (data ?? []) as {
    id: string
    type_code: string
    name: string | null
    category: string | null
    manufacturer: string | null
    model: string | null
    rating: string | null
    description: string | null
  }[]

  // How many tags each type has. Written into the export as a read-only
  // figure: it is the number people want when deciding what to order.
  const { data: tagRows } = await supabase
    .from('equipment')
    .select('id, type_id')
    .eq('project_id', project.id)
    .not('type_id', 'is', null)
  const counts = new Map<string, number>()
  for (const t of (tagRows ?? []) as { type_id: string | null }[]) {
    if (t.type_id) counts.set(t.type_id, (counts.get(t.type_id) ?? 0) + 1)
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'CxSentinel'
  wb.created = new Date()

  const sheet = wb.addWorksheet('Types')
  sheet.columns = [
    { header: 'Type code', key: 'code', width: 20 },
    { header: 'Name', key: 'name', width: 48 },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Manufacturer', key: 'manufacturer', width: 22 },
    { header: 'Model', key: 'model', width: 18 },
    { header: 'Rating', key: 'rating', width: 30 },
    { header: 'Notes', key: 'description', width: 44 },
    { header: 'Tags on this project', key: 'tags', width: 20 },
  ]
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }]

  for (const t of rows) {
    sheet.addRow({
      code: t.type_code,
      name: t.name ?? '',
      category: CATEGORIES.find((c) => c.value === t.category)?.label ?? t.category ?? '',
      manufacturer: t.manufacturer ?? '',
      model: t.model ?? '',
      rating: t.rating ?? '',
      description: t.description ?? '',
      tags: counts.get(t.id) ?? 0,
    })
  }

  if (rows.length > 0) sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columnCount } }

  const guide = wb.addWorksheet('Guide')
  guide.columns = [
    { header: 'Column', key: 'col', width: 22 },
    { header: 'What it does', key: 'meaning', width: 100 },
  ]
  guide.getRow(1).font = { bold: true }
  guide.addRow({
    col: 'Editing this file',
    meaning:
      'Change what you like and import it back on the Equipment Types screen. A Type code that already exists is updated, not duplicated.',
  })
  guide.addRow({
    col: 'Tags on this project',
    meaning:
      'Read-only. It is worked out from the register every time this file is produced, so editing it here changes nothing — the column is here because it is the number people want when deciding what to order.',
  })
  guide.addRow({
    col: 'Blank cells',
    meaning: 'A blank cell means "I did not say", not "clear this".',
  })

  const buf = await wb.xlsx.writeBuffer()
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="cxsentinel-equipment-types.xlsx"',
      'Cache-Control': 'no-store',
    },
  })
}
