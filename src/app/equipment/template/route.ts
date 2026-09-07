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
    { header: 'Building', key: 'building', width: 16 },
    { header: 'Area', key: 'area', width: 20 },
    { header: 'Floor', key: 'floor', width: 12 },
    { header: 'System', key: 'system', width: 24 },
    { header: 'Subsystem', key: 'subsystem', width: 20 },
    { header: 'Part of tag', key: 'parent', width: 20 },
    { header: 'Type code', key: 'type', width: 18 },
    { header: 'Location', key: 'location', width: 26 },
    { header: 'Manufacturer', key: 'manufacturer', width: 22 },
    { header: 'Model', key: 'model', width: 20 },
    { header: 'Serial number', key: 'serial', width: 20 },
    { header: 'Critical', key: 'critical', width: 11 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Remove', key: 'remove', width: 9 },
  ]

  sheet.addRow({
    tag: 'GIS-115-CB-01',
    description: '115 kV Circuit Breaker',
    category: 'Electrical',
    building: 'Building 1',
    area: 'Substation A',
    floor: 'G',
    system: '115kV GIS',
    subsystem: 'Line Bay 01',
    location: 'Switchyard',
    manufacturer: 'Siemens Energy',
    model: '8DN9',
    type: 'SIE-8DN9',
    critical: 'Yes',
    status: 'Installed',
  })
  sheet.addRow({
    tag: 'TX-01',
    description: 'Main power transformer 115/22 kV',
    category: 'Electrical',
    building: 'Building 1',
    area: 'Substation A',
    floor: 'B1',
    system: 'Transformer',
    location: 'Transformer bay',
    status: 'Received',
  })
  // Two parts of the transformer above, to show the level without
  // explaining it. A person reading this sheet sees the shape immediately:
  // blank Part of tag = plant, filled in = a piece of that plant.
  sheet.addRow({
    tag: 'TX-01-OLTC',
    description: 'On-load tap changer',
    category: 'Electrical',
    parent: 'TX-01',
    critical: 'Yes',
    status: 'Received',
  })
  sheet.addRow({
    tag: 'TX-01-BUCH',
    description: 'Buchholz relay',
    category: 'Electrical',
    parent: 'TX-01',
    status: 'Received',
  })
  sheet.addRow({
    tag: 'GEN-01',
    description: 'Standby diesel generator',
    category: 'Mechanical',
    building: 'Building 2',
    area: 'Plant Room',
    floor: 'R',
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
  guide.addRow({
    col: 'Category',
    meaning: `The discipline. One of: ${CATEGORIES.map((c) => c.label).join(', ')}. A heading of Discipline, Trade, Type or Class is read as this column. Anything not on this list is left blank and reported — the database refuses values it does not know, and it refuses the whole row.`,
  })
  guide.addRow({
    col: 'Building',
    meaning:
      'Which building on the campus — Building 2, Tower A, Block C. Kept separate from Area on purpose: the building is the structure, the area is a room or zone inside it. Headings of Bldg, Block, Tower or Building number are read as this column.',
  })
  guide.addRow({ col: 'Area', meaning: 'A room or zone — MV switchroom, Plant room. Created if it does not exist. Optional.' })
  guide.addRow({
    col: 'Critical',
    meaning:
      'Yes or No. Leave it BLANK if nobody has decided — blank is kept as undecided and is deliberately not the same as No, because "we decided this is not critical" and "nobody has looked at it" are different facts. Y, N, TRUE, FALSE, 1, 0 and Critical / Non-critical are all read.',
  })
  guide.addRow({
    col: 'Floor',
    meaning:
      'The storey: B2, B, LG, G, M, L1, L2, L10, R. Written as you write it — L3, Level 3, 3F and 3 all mean the third floor, and what you type is what is stored. NOT the commissioning level: L1 to L5 elsewhere in CxSentinel mean factory acceptance through to integrated testing. A heading of Level, Storey or Floor level is read as this column.',
  })
  guide.addRow({ col: 'System', meaning: 'Created if it does not exist, filed under the Area on the same row. This is how the asset tree gets built.' })
  guide.addRow({ col: 'Subsystem', meaning: 'Created if it does not exist, filed under the System on the same row. A bay, a panel, a train.' })
  guide.addRow({
    col: 'Part of tag',
    meaning:
      'LEAVE BLANK for a piece of equipment. Fill it in with another Tag from this same sheet, or one already in the project, and this row becomes a PART of that item instead — the breaker inside the board, the CT, the PQM. One sheet describes both levels: System > Equipment > Parts. Headings of Parent tag, Part of, Belongs to, Component of, Installed in or Mounted in are read as this column.',
  })
  guide.addRow({
    col: '',
    meaning:
      'Two levels only. A part cannot contain another part — put both under the same equipment. A row naming a parent that is nowhere in the project is reported by row number and left unfiled; the parent is never invented for you.',
  })
  guide.addRow({
    col: 'Type code',
    meaning:
      'The catalogue code this tag is one of — see the Equipment Types screen. Forty identical breakers carry the same code here and share one catalogue entry holding the rating, the manual and the spec. A code that does not exist yet is CREATED, with just the code, and the Equipment Types import fills the rest in afterwards. Leave it blank if you do not use a catalogue; a tag with no type is completely normal. Headed "Type code", not "Type": on a tag list "Type" has always meant the DISCIPLINE, and one column cannot mean two things.',
  })
  guide.addRow({
    col: 'Manufacturer',
    meaning: 'The OEM. A heading of OEM, Vendor, Supplier, Maker, Make or Brand is read as this column. Kept on the tag; the catalogue entry has its own.',
  })
  guide.addRow({ col: 'Location, Model, Serial number', meaning: 'Free text. All optional.' })
  guide.addRow({
    col: 'Project',
    meaning:
      'Optional, and it is a CHECK rather than a destination. Equipment always goes into the project you have open. If this column names a different project, nothing is imported at all — which is what stops one site\u2019s tag list being loaded into another.',
  })
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
