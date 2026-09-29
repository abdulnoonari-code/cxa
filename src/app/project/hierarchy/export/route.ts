import ExcelJS from 'exceljs'
import { requireAccess } from '@/data/require-access'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { HIERARCHY_HEADER, HIERARCHY_EXAMPLE, HIERARCHY_FOOTNOTES } from '@/lib/hierarchy-io'

/**
 * Your own hierarchy, as a spreadsheet.
 *
 * ── Why this is the FIRST button and not the second ─────────────────────
 *
 * "When I come to upload the sheets it is very difficult." The difficulty
 * was never the uploading — it was knowing what the file had to look like.
 *
 * So nobody has to know. Press Export, get your own job as a sheet, edit it
 * in Excel where you are quick, import it back. A file that came out of the
 * application is a file that goes back into it.
 *
 * ON AN EMPTY PROJECT this is not an empty grid — an empty grid is still a
 * format to guess at. It comes back with worked rows showing the three
 * levels and the fill-down, to be typed over.
 */
export async function GET() {
  const refused = await requireAccess()
  if (refused) return refused

  const project = await getCurrentProject()

  const wb = new ExcelJS.Workbook()
  wb.creator = 'CxNivora'
  wb.created = new Date()

  const sheet = wb.addWorksheet('Hierarchy')
  // The header comes from the reader's own module, so the two cannot drift.
  const WIDTHS = [22, 26, 20, 20, 22, 38]
  sheet.columns = HIERARCHY_HEADER.map((header, i) => ({ header, width: WIDTHS[i] }))
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  let wrote = 0
  if (project) {
    const [{ data: areas }, { data: systems }, { data: types }, { data: tags }] = await Promise.all([
      supabase.from('areas').select('id, name').eq('project_id', project.id),
      supabase.from('systems').select('id, name, area_id').eq('project_id', project.id).order('name'),
      supabase.from('equipment_types').select('id, type_code').eq('project_id', project.id),
      supabase.from('equipment').select('tag_id, description, system_id, subsystem_id, type_id').eq('project_id', project.id).order('tag_id'),
    ])
    const assetName = new Map(((areas ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]))
    const typeCode = new Map(((types ?? []) as { id: string; type_code: string }[]).map((t) => [t.id, t.type_code]))
    const systemRows = (systems ?? []) as { id: string; name: string; area_id: string | null }[]
    const sysName = new Map(systemRows.map((s) => [s.id, s.name]))
    const sysAsset = new Map(systemRows.map((s) => [s.id, (s.area_id && assetName.get(s.area_id)) || '']))
    // Scoped through this project's systems: `subsystems` carries no
    // project_id of its own, so an unfiltered read would return every
    // other job's bays as well.
    const ourSystemIds = [...sysName.keys()]
    const { data: subs } = ourSystemIds.length
      ? await supabase.from('subsystems').select('id, name, system_id').in('system_id', ourSystemIds)
      : { data: [] as { id: string; name: string; system_id: string | null }[] }
    const subName = new Map(((subs ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]))

    // Repeated LEVELS are written once and left blank underneath, exactly
    // as somebody would type them. Equipment Type is written on every row,
    // because it is not a level — it is a fact about the tag, and it does
    // not fill down on the way back in.
    let lastAsset = '', lastSystem = '', lastSub = ''
    type Row = { tag_id: string; description: string | null; system_id: string | null; subsystem_id: string | null; type_id: string | null }
    for (const t of (tags ?? []) as Row[]) {
      const asset = (t.system_id && sysAsset.get(t.system_id)) || ''
      const system = (t.system_id && sysName.get(t.system_id)) || ''
      const subsystem = (t.subsystem_id && subName.get(t.subsystem_id)) || ''
      const newAsset = asset !== lastAsset
      const newSystem = newAsset || system !== lastSystem
      sheet.addRow([
        newAsset ? asset : '',
        newSystem ? system : '',
        newSystem || subsystem !== lastSub ? subsystem : '',
        (t.type_id && typeCode.get(t.type_id)) || '',
        t.tag_id,
        t.description ?? '',
      ])
      lastAsset = asset
      lastSystem = system
      lastSub = subsystem
      wrote++
    }
  }

  if (wrote === 0) {
    for (const r of HIERARCHY_EXAMPLE) sheet.addRow(r)
    sheet.addRow([])
    for (const line of HIERARCHY_FOOTNOTES) {
      sheet.addRow([line]).font = { italic: true, size: 10 }
    }
  }

  const out = await wb.xlsx.writeBuffer()
  const name = (project?.name ?? 'CxNivora').replace(/[^A-Za-z0-9 _-]/g, '').trim() || 'CxNivora'
  return new Response(out as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name} - hierarchy.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
