import ExcelJS from 'exceljs'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { ancestorsOf, getSubject } from '@/lib/subjects'
import { CATEGORIES, INSTALL_STATUSES } from '@/app/equipment/styles'

// The project's tag list, laid out so it can be edited in Excel and imported
// straight back. The System / Subsystem / Area columns are written out as
// names, and read back the same way — so moving a tag between systems is a
// cell edit rather than a database job.
export async function GET() {
  const project = await getCurrentProject()
  if (!project) return new Response('No project found', { status: 404 })

  const index = await loadSubjectIndex(project.id)

  const { data: rows } = await supabase
    .from('equipment')
    .select('id, tag_id, description, category, manufacturer, model, serial_number, location, install_status, system_id, subsystem_id')
    .eq('project_id', project.id)
    .order('tag_id')

  const equipment = (rows ?? []) as {
    id: string
    tag_id: string
    description: string | null
    category: string | null
    manufacturer: string | null
    model: string | null
    serial_number: string | null
    location: string | null
    install_status: string | null
    system_id: string | null
    subsystem_id: string | null
  }[]

  const label = (value: string | null, options: { value: string; label: string }[]) =>
    options.find((o) => o.value === value)?.label ?? value ?? ''

  const wb = new ExcelJS.Workbook()
  wb.creator = 'CxSentinel'
  wb.created = new Date()

  const sheet = wb.addWorksheet('Equipment')
  sheet.columns = [
    { header: 'CXA ID', key: 'id', width: 38 },
    { header: 'Tag', key: 'tag', width: 22 },
    { header: 'Description', key: 'description', width: 46 },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Area', key: 'area', width: 20 },
    { header: 'System', key: 'system', width: 24 },
    { header: 'Subsystem', key: 'subsystem', width: 20 },
    { header: 'Location', key: 'location', width: 26 },
    { header: 'Manufacturer', key: 'manufacturer', width: 22 },
    { header: 'Model', key: 'model', width: 20 },
    { header: 'Serial number', key: 'serial', width: 20 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Remove', key: 'remove', width: 9 },
  ]

  for (const e of equipment) {
    // Walk up the tree so the row carries whatever the hierarchy knows,
    // whether the tag hangs off a subsystem or straight off a system.
    const chain = ancestorsOf(index, { type: 'equipment', id: e.id })
    const area = chain.find((s) => s.type === 'area')
    const system = chain.find((s) => s.type === 'system')
    const subsystem = chain.find((s) => s.type === 'subsystem')
    const self = getSubject(index, { type: 'equipment', id: e.id })

    sheet.addRow({
      id: e.id,
      tag: e.tag_id,
      description: e.description ?? self?.name ?? '',
      category: label(e.category, CATEGORIES),
      area: area ? area.code ?? area.name : '',
      system: system ? system.code ?? system.name : '',
      subsystem: subsystem ? subsystem.code ?? subsystem.name : '',
      location: e.location ?? '',
      manufacturer: e.manufacturer ?? '',
      model: e.model ?? '',
      serial: e.serial_number ?? '',
      status: label(e.install_status, INSTALL_STATUSES),
      remove: '',
    })
  }

  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }]
  if (equipment.length > 0) sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columnCount } }

  const guide = wb.addWorksheet('How to edit this')
  guide.columns = [
    { header: 'Column', key: 'col', width: 18 },
    { header: 'What it does', key: 'meaning', width: 94 },
  ]
  guide.addRow({ col: 'CXA ID', meaning: 'Leave as it is. A row that keeps its ID updates that tag. A NEW row with this blank adds a tag. Never invent an ID.' })
  guide.addRow({ col: 'Tag', meaning: 'The tag number. Must be unique on the project. If a tag already exists and the ID is blank, the existing one is updated rather than duplicated.' })
  guide.addRow({ col: 'Description', meaning: 'What the item is.' })
  guide.addRow({ col: 'Category', meaning: `One of: ${CATEGORIES.map((c) => c.label).join(', ')}. Anything else is left blank and reported as a warning.` })
  guide.addRow({ col: 'Area / System / Subsystem', meaning: 'Named, not coded. If the name does not exist on the project it is CREATED and the tag is filed under it. Nothing is ever renamed or deleted by an import.' })
  guide.addRow({ col: 'Status', meaning: `One of: ${INSTALL_STATUSES.map((s) => s.label).join(', ')}. Anything else is treated as Not Delivered and reported as a warning.` })
  guide.addRow({ col: 'Remove', meaning: 'Y deletes that tag on import. Leave blank to keep it.' })
  guide.addRow({ col: '', meaning: '' })
  guide.addRow({ col: 'Your headings', meaning: 'Your own column names are fine. Tag / Tag No / KKS / Asset ID, Description / Equipment / Service, Discipline / Type, Vendor / OEM / Make are all understood, and the table may start anywhere on the sheet.' })
  guide.addRow({ col: 'If a row is wrong', meaning: 'Nothing is imported at all, and every bad row is listed in the audit trail with its row number.' })
  guide.getRow(1).font = { bold: true }

  const buffer = await wb.xlsx.writeBuffer()
  const safe = project.name.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safe}_equipment.xlsx"`,
    },
  })
}
