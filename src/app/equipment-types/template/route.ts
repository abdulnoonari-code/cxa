import ExcelJS from 'exceljs'
import { CATEGORIES } from '@/app/equipment/styles'

// A blank catalogue with four worked rows, so a new project has something to
// type over rather than a format to guess at.
export async function GET() {
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
  ]
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  sheet.addRow({
    code: 'SIE-8DN9',
    name: '115 kV SF6 gas insulated circuit breaker',
    category: 'Electrical',
    manufacturer: 'Siemens Energy',
    model: '8DN9',
    rating: '115 kV, 40 kA, 3150 A',
    description: 'Three-phase, single tank. O&M manual DOC-114 rev C.',
  })
  sheet.addRow({
    code: 'ABB-TPU',
    name: 'Current transformer, protection class',
    category: 'Substation Protection',
    manufacturer: 'ABB',
    model: 'TPU 60.13',
    rating: '600/1 A, 5P20',
  })
  sheet.addRow({
    code: 'CAT-C18',
    name: 'Standby diesel generator set',
    category: 'Mechanical',
    manufacturer: 'Caterpillar',
    model: 'C18',
    rating: '600 kVA, 400 V, 50 Hz',
  })
  sheet.addRow({
    code: 'SCH-NSX',
    name: 'Moulded case circuit breaker',
    category: 'Electrical',
    manufacturer: 'Schneider Electric',
    model: 'Compact NSX250',
    rating: '250 A, 36 kA',
  })

  const guide = wb.addWorksheet('Guide')
  guide.columns = [
    { header: 'Column', key: 'col', width: 20 },
    { header: 'What to put in it', key: 'meaning', width: 100 },
  ]
  guide.getRow(1).font = { bold: true }

  guide.addRow({
    col: 'A type vs a tag',
    meaning:
      'A TYPE is a make and model. A TAG is one of them, installed somewhere. Forty identical breakers are forty tags and ONE type. Anything true of the model goes here; anything that differs between two units of the same model — serial number, floor, area, system, status — stays on the tag.',
  })
  guide.addRow({ col: '', meaning: '' })
  guide.addRow({
    col: 'Type code',
    meaning:
      'The only column that is required. Your catalogue code, and it is what the Type column of an equipment spreadsheet is matched on — so use the code your tag list already uses. One code means one type per project, and case does not matter.',
  })
  guide.addRow({ col: 'Name', meaning: 'What it is in words. If you leave it blank the code is used as the name.' })
  guide.addRow({
    col: 'Category',
    meaning: `The discipline. One of: ${CATEGORIES.map((c) => c.label).join(', ')}. A heading of Discipline, Trade or Class is read as this column. Anything else is left blank and reported.`,
  })
  guide.addRow({ col: 'Manufacturer', meaning: 'The OEM. Headings of OEM, Vendor, Supplier, Maker, Make or Brand are read as this column.' })
  guide.addRow({ col: 'Model', meaning: "The manufacturer's model number, if it is different from your code." })
  guide.addRow({
    col: 'Rating',
    meaning:
      'Free text, on purpose. "115 kV, 40 kA, 3150 A" is how an engineer writes a rating; three numbered columns make a form nobody fills in.',
  })
  guide.addRow({ col: 'Notes', meaning: 'Free text. A good place for the O&M manual or FAT certificate reference.' })
  guide.addRow({ col: '', meaning: '' })
  guide.addRow({
    col: 'Run it twice',
    meaning:
      'A code that already exists is UPDATED, not duplicated. So it is safe to import equipment first and the catalogue after — types created bare from a Type column get their manufacturer, rating and discipline filled in rather than being created twice.',
  })
  guide.addRow({
    col: 'Blank cells',
    meaning: 'A blank cell means "I did not say", not "clear this". A sheet with no Rating column cannot wipe ratings you typed on screen.',
  })
  guide.addRow({
    col: 'Nothing is half-done',
    meaning: 'If the sheet cannot be read, nothing is imported at all and the reason is shown on screen and written to the audit trail.',
  })

  const buf = await wb.xlsx.writeBuffer()
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="cxsentinel-equipment-types-template.xlsx"',
      'Cache-Control': 'no-store',
    },
  })
}
