import ExcelJS from 'exceljs'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { selectWithFallback } from '@/lib/pg-columns'
import { STAGES } from '@/lib/readiness'
import { SYSTEM_SHEET_COLUMNS, SYSTEM_GUIDE_SHEET } from '@/lib/system-sheet'
import { requireAccess } from '@/data/require-access'

/**
 * The system list, in the SAME shape as the template.
 *
 * That is the whole requirement. Equipment has had export-edit-reimport
 * since week 3 and systems have not, so the only way to fix twenty
 * boundaries was to open twenty forms. The columns, their headings and
 * their order match `/systems/template` exactly, so what comes out of here
 * goes straight back in through the importer.
 *
 * The lesson from the equipment exporter is written into the shape of this
 * file: it once exported FEWER columns than the importer reads, so a
 * round trip through Excel silently blanked Building, Floor and Critical
 * on every row. Every column the importer looks at is written here, and an
 * assertion holds the two lists together.
 */
export async function GET() {
  const refused = await requireAccess()
  if (refused) return refused
  const project = await getCurrentProject()
  if (!project) return new Response('No project found', { status: 404 })

  // building / floor arrive with later SQL steps. Asking for a column this
  // database has not got fails the WHOLE query, which would hand back an
  // empty workbook for a project full of systems.
  //
  // AREA IS NOT ONE OF THEM. There is no systems.area column and no SQL step
  // adds one — an area is a row in the areas table and a system points at it
  // with area_id. Asking for "area" here meant the fallback dropped it and
  // EVERY export carried an "INCOMPLETE EXPORT — do NOT re-import this"
  // warning naming an outstanding SQL step that nobody could ever run. That
  // warning is the one thing standing between somebody and the round trip
  // this file exists to provide, so it had better be true.
  type SystemExportRow = {
    system_id?: string | null
    name?: string | null
    discipline?: string | null
    building?: string | null
    area_id?: string | null
    floor?: string | null
    boundary?: string | null
    responsible?: string | null
    stage?: string | null
    description?: string | null
  }

  const res = await selectWithFallback<SystemExportRow>(
    ['system_id', 'name', 'discipline', 'building', 'area_id', 'floor', 'boundary', 'responsible', 'stage', 'description'],
    async (cols) => {
      const r = await supabase
        .from('systems')
        .select(cols.join(', '))
        .eq('project_id', project.id)
        .order('system_id')
      return { data: r.data as unknown as SystemExportRow[] | null, error: r.error }
    }
  )

  // The sheet carries the area's NAME, because that is what the importer
  // reads: it looks the name up and creates the area if it is new. Writing
  // the id would export a value nobody can type and the importer would treat
  // as the name of a brand-new area on the way back in.
  const areaName = new Map<string, string>()
  if (!res.missing.includes('area_id')) {
    const { data: areas } = await supabase
      .from('areas')
      .select('id, name, code')
      .eq('project_id', project.id)
    for (const a of (areas ?? []) as { id: string; name: string | null; code: string | null }[])
      areaName.set(a.id, a.name ?? a.code ?? '')
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'CxSentinel'
  wb.created = new Date()

  const sheet = wb.addWorksheet('Systems')
  // The same list the blank template uses, so what comes out of here goes
  // straight back in through the importer.
  sheet.columns = SYSTEM_SHEET_COLUMNS.map((c) => ({ ...c }))
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  const stageLabel = (v: string | null | undefined) =>
    STAGES.find((s) => s.value === v)?.label ?? v ?? ''

  for (const row of res.rows)
    sheet.addRow({
      system_id: row.system_id ?? '',
      name: row.name ?? '',
      discipline: row.discipline ?? '',
      building: row.building ?? '',
      area: (row.area_id ? areaName.get(row.area_id) : '') ?? '',
      floor: row.floor ?? '',
      boundary: row.boundary ?? '',
      responsible: row.responsible ?? '',
      stage: stageLabel(row.stage),
      description: row.description ?? '',
    })

  // Named 'Guide' on purpose: the importer skips a sheet with that name.
  // A friendlier name here would be read as data.
  const guide = wb.addWorksheet(SYSTEM_GUIDE_SHEET)
  guide.columns = [
    { header: 'Point', key: 'k', width: 26 },
    { header: 'What it means', key: 'v', width: 110 },
  ]
  guide.getRow(1).font = { bold: true }
  guide.addRow({
    k: 'This is the import format',
    v: 'Edit any cell and import this same file back through Systems → Import. The columns are identical to the blank template.',
  })
  guide.addRow({
    k: 'Matching is on System ID',
    v: 'A system whose ID already exists is UPDATED, not duplicated. Change the ID in a cell and you will create a new system, not rename the old one.',
  })
  guide.addRow({
    k: 'A blank cell says nothing',
    v: 'It means "I did not say", not "clear this". Deleting the text in Boundary will not wipe the boundary already recorded.',
  })
  guide.addRow({
    k: 'Stage',
    v: `One of: ${STAGES.map((s) => s.label).join(', ')}. Anything else is left blank and reported.`,
  })
  if (res.missing.length > 0)
    guide.addRow({
      k: 'INCOMPLETE EXPORT',
      v: `This database does not have ${res.missing.join(', ')} yet, so ${
        res.missing.length === 1 ? 'that column is' : 'those columns are'
      } blank in this file. Do NOT re-import it until the outstanding SQL step has been run, or you will be importing blanks over real data.`,
    })

  const buf = await wb.xlsx.writeBuffer()
  const stamp = new Date().toISOString().slice(0, 10)
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="systems-${stamp}.xlsx"`,
    },
  })
}
