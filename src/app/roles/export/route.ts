import ExcelJS from 'exceljs'
import { getCurrentProject } from '@/lib/project'
import { loadRoles } from '@/data/project-roles'
import { CAPABILITIES } from '@/lib/project-roles'

// The project's role list as a workbook. Laid out so it can be edited in
// Excel and imported straight back: one row per role, one column per
// capability, with a Y where the role has it.
export async function GET() {
  const project = await getCurrentProject()
  if (!project) return new Response('No project found', { status: 404 })

  const roles = await loadRoles(project.id)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'CxSentinel'
  wb.created = new Date()

  const sheet = wb.addWorksheet('Roles')

  sheet.columns = [
    { header: 'Key', key: 'key', width: 26 },
    { header: 'Role', key: 'label', width: 30 },
    ...CAPABILITIES.map((c) => ({ header: c.label, key: c.value, width: 11 })),
    { header: 'Active', key: 'active', width: 9 },
    { header: 'Note', key: 'note', width: 52 },
    { header: 'Source', key: 'source', width: 14 },
  ]

  for (const r of roles) {
    const row: Record<string, string> = {
      key: r.value,
      label: r.label,
      active: r.active ? 'Y' : 'N',
      note: r.note,
      source: r.custom ? 'Project' : r.overridden ? 'Changed' : 'Built-in',
    }
    for (const c of CAPABILITIES) row[c.value] = r.caps.includes(c.value) ? 'Y' : ''
    sheet.addRow(row)
  }

  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).alignment = { vertical: 'middle' }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columnCount } }

  // A second sheet saying what each capability means, so whoever edits this
  // in Excel is not guessing.
  const guide = wb.addWorksheet('What the columns mean')
  guide.columns = [
    { header: 'Column', key: 'col', width: 16 },
    { header: 'Meaning', key: 'meaning', width: 78 },
  ]
  guide.addRow({ col: 'Key', meaning: 'The internal name. Leave it as it is for built-in roles. For a new role, leave blank and it is made from the Role name.' })
  guide.addRow({ col: 'Role', meaning: 'What this role is called on your site. Change it freely.' })
  for (const c of CAPABILITIES) guide.addRow({ col: c.label, meaning: `${c.note}. Put Y to grant it, leave blank to withhold it.` })
  guide.addRow({ col: 'Active', meaning: 'N hides the role from the team list without deleting it. Project Admin and Super Admin are always active.' })
  guide.addRow({ col: 'Note', meaning: 'A short description, shown beside the role.' })
  guide.addRow({ col: 'Source', meaning: 'Read only. Whether the role is built in, changed by this project, or new to it. Ignored on import.' })
  guide.addRow({
    col: '',
    meaning:
      'Project Admin and Super Admin always keep every capability, whatever this file says — otherwise one import could leave nobody able to undo it.',
  })
  guide.getRow(1).font = { bold: true }

  const buffer = await wb.xlsx.writeBuffer()
  const safe = project.name.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safe}_roles.xlsx"`,
    },
  })
}
