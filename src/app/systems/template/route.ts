import ExcelJS from 'exceljs'
import { STAGES } from '@/lib/readiness'

// A blank system list with three worked rows, so a new project has something
// to type over rather than a format to guess at.
export async function GET() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CxSentinel'
  wb.created = new Date()

  const sheet = wb.addWorksheet('Systems')
  sheet.columns = [
    { header: 'System ID', key: 'system_id', width: 22 },
    { header: 'System name', key: 'name', width: 40 },
    { header: 'Discipline', key: 'discipline', width: 20 },
    { header: 'Building', key: 'building', width: 16 },
    { header: 'Area', key: 'area', width: 22 },
    { header: 'Boundary', key: 'boundary', width: 52 },
    { header: 'Responsible', key: 'responsible', width: 22 },
    { header: 'Stage', key: 'stage', width: 22 },
    { header: 'Notes', key: 'description', width: 40 },
  ]
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  sheet.addRow({
    system_id: 'SUDB MV SWGR',
    name: '11 kV switchboard',
    discipline: 'Electrical',
    building: 'Building 1',
    area: 'MV switchroom',
    boundary: 'Incomer, four feeders, bus tie, PQM. Excludes upstream cable.',
    responsible: 'A. Jabbar',
    stage: 'Pre-Commissioning',
  })
  sheet.addRow({
    system_id: 'CHW-01',
    name: 'Chilled water system 1',
    discipline: 'Mechanical',
    building: 'Building 1',
    area: 'Plant room',
    boundary: 'Chillers, primary pumps, headers to the riser valves.',
    stage: 'Construction',
  })
  sheet.addRow({
    system_id: 'FA-01',
    name: 'Fire alarm system',
    discipline: 'Fire & Life Safety',
    building: 'Building 2',
    area: 'Whole building',
    stage: 'Construction',
  })

  const guide = wb.addWorksheet('Guide')
  guide.columns = [
    { header: 'Column', key: 'col', width: 22 },
    { header: 'What to put in it', key: 'meaning', width: 100 },
  ]
  guide.getRow(1).font = { bold: true }

  guide.addRow({
    col: 'System ID',
    meaning:
      'The only column that is required. The board or system code, exactly as it appears on your drawings AND in your test scripts — the script importer matches on this, so a difference of one hyphen means the script will be refused later.',
  })
  guide.addRow({ col: 'System name', meaning: 'What it is in words. If you leave it blank the code is used as the name.' })
  guide.addRow({ col: 'Discipline', meaning: 'Electrical, Mechanical, Civil, ELV and so on. Free text here.' })
  guide.addRow({ col: 'Building', meaning: 'Which building on the campus. Read, and used to find or create the Area.' })
  guide.addRow({ col: 'Area', meaning: 'The room or zone. Created if it does not exist.' })
  guide.addRow({
    col: 'Boundary',
    meaning:
      'What is inside this system and what is not. The single most useful field on this sheet at handover, and the one nobody fills in — "excludes the upstream cable" is the sentence that settles an argument six months later.',
  })
  guide.addRow({ col: 'Responsible', meaning: 'The engineer who owns it.' })
  guide.addRow({
    col: 'Stage',
    meaning: `One of: ${STAGES.map((s) => s.label).join(', ')}. Anything else is left blank and reported — a system filed at the wrong stage reports the wrong readiness on every screen.`,
  })
  guide.addRow({ col: 'Notes', meaning: 'Free text. Optional.' })
  guide.addRow({ col: '', meaning: '' })
  guide.addRow({
    col: 'Run it twice',
    meaning:
      'A system whose code already exists is UPDATED, not duplicated. So it is safe to import equipment first and systems after — the boards created from the equipment System column get their discipline, boundary and stage filled in rather than being created twice.',
  })
  guide.addRow({
    col: 'Blank cells',
    meaning:
      'A blank cell means "I did not say", not "clear this". Importing a sheet with an empty Boundary column will not wipe boundaries you typed on screen.',
  })
  guide.addRow({
    col: 'Nothing is half-done',
    meaning:
      'If the sheet cannot be read, nothing is imported at all and the reason is shown on screen and written to the audit trail.',
  })

  const buf = await wb.xlsx.writeBuffer()
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="cxsentinel-systems-template.xlsx"',
      'Cache-Control': 'no-store',
    },
  })
}
