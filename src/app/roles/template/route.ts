import ExcelJS from 'exceljs'
import { CAPABILITIES } from '@/lib/project-roles'

// A blank role list with the columns filled in and three worked examples, so
// somebody setting up a new site has something to type over rather than a
// format to guess at.
export async function GET() {
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
  ]

  sheet.addRow({
    key: '',
    label: 'Authorised Person',
    view: 'Y',
    record: 'Y',
    review: 'Y',
    approve: 'Y',
    active: 'Y',
    note: 'Holds the permit and authorises switching',
  })
  sheet.addRow({
    key: '',
    label: 'Protection Engineer',
    view: 'Y',
    record: 'Y',
    review: 'Y',
    active: 'Y',
    note: 'Applies and proves protection settings',
  })
  sheet.addRow({
    key: 'client',
    label: 'Owner Representative',
    view: 'Y',
    approve: 'Y',
    active: 'Y',
    note: 'Renaming the built-in Client role for this site',
  })

  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  const guide = wb.addWorksheet('How to fill this in')
  guide.columns = [
    { header: 'Column', key: 'col', width: 16 },
    { header: 'What to put in it', key: 'meaning', width: 82 },
  ]
  guide.addRow({ col: 'Key', meaning: 'Leave blank for a new role — one is made from the Role name. Put an existing key here to change that role instead of adding one.' })
  guide.addRow({ col: 'Role', meaning: 'What this person is called on your site. This is what appears everywhere in the app.' })
  for (const c of CAPABILITIES) guide.addRow({ col: c.label, meaning: `${c.note}. Y to grant, blank to withhold.` })
  guide.addRow({ col: 'Active', meaning: 'N hides the role without deleting it. Blank counts as Y.' })
  guide.addRow({ col: 'Note', meaning: 'A short description shown beside the role.' })
  guide.addRow({ col: '', meaning: '' })
  guide.addRow({ col: 'Headings', meaning: 'Your own headings are fine. Role, Position, Designation and Job title are all understood, and the table may start anywhere on the sheet.' })
  guide.addRow({ col: 'Errors', meaning: 'If any row cannot be read, nothing is imported at all and every bad row is listed in the audit trail with its row number.' })
  guide.addRow({ col: 'Admins', meaning: 'Project Admin and Super Admin always keep every capability, whatever this file says.' })
  guide.getRow(1).font = { bold: true }

  const buffer = await wb.xlsx.writeBuffer()
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="cxsentinel_roles_template.xlsx"',
    },
  })
}
