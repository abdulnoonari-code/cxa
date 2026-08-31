import ExcelJS from 'exceljs'
import { CATEGORIES, INSTALL_STATUSES } from '@/app/equipment/styles'

// A blank tag list with three worked rows, so a new project has something to
// type over rather than a format to guess at.
export async function GET() {
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

  sheet.addRow({
    tag: 'GIS-115-CB-01',
    description: '115 kV Circuit Breaker',
    category: 'Electrical',
    area: 'Substation A',
    system: '115kV GIS',
    subsystem: 'Line Bay 01',
    location: 'Switchyard',
    manufacturer: 'Siemens Energy',
    model: '8DN9',
    status: 'Installed',
  })
  sheet.addRow({
    tag: 'TX-01',
    description: 'Main power transformer 115/22 kV',
    category: 'Electrical',
    area: 'Substation A',
    system: 'Transformer',
    location: 'Transformer bay',
    status: 'Received',
  })
  sheet.addRow({
    tag: 'GEN-01',
    description: 'Standby diesel generator',
    category: 'Mechanical',
    area: 'Plant Room',
    system: 'Standby Power',
    status: 'Not Delivered',
  })

  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  const guide = wb.addWorksheet('How to fill this in')
  guide.columns = [
    { header: 'Column', key: 'col', width: 20 },
    { header: 'What to put in it', key: 'meaning', width: 96 },
  ]
  guide.addRow({ col: 'CXA ID', meaning: 'Leave blank on a new list. It only appears when you export tags that already exist.' })
  guide.addRow({ col: 'Tag', meaning: 'The only column that is required. Must be unique on the project.' })
  guide.addRow({ col: 'Description', meaning: 'What the item is.' })
  guide.addRow({ col: 'Category', meaning: `One of: ${CATEGORIES.map((c) => c.label).join(', ')}.` })
  guide.addRow({ col: 'Area', meaning: 'Created if it does not exist. Optional.' })
  guide.addRow({ col: 'System', meaning: 'Created if it does not exist, filed under the Area on the same row. This is how the asset tree gets built.' })
  guide.addRow({ col: 'Subsystem', meaning: 'Created if it does not exist, filed under the System on the same row. A bay, a panel, a train.' })
  guide.addRow({ col: 'Location, Manufacturer, Model, Serial number', meaning: 'Free text. All optional.' })
  guide.addRow({ col: 'Status', meaning: `One of: ${INSTALL_STATUSES.map((s) => s.label).join(', ')}. Blank counts as Not Delivered.` })
  guide.addRow({ col: 'Remove', meaning: 'Y deletes that tag on import. Leave blank on a new list.' })
  guide.addRow({ col: '', meaning: '' })
  guide.addRow({ col: 'Use your own file', meaning: 'You do not have to use this template. Import the EPC list as it came — your headings are matched by name, and the table can start anywhere on the sheet.' })
  guide.addRow({ col: 'Nothing is half-done', meaning: 'If any row cannot be read, nothing is imported at all and every bad row is listed in the audit trail with its row number.' })
  guide.getRow(1).font = { bold: true }

  const buffer = await wb.xlsx.writeBuffer()
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="cxsentinel_equipment_template.xlsx"',
    },
  })
}
