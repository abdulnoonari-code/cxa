import ExcelJS from 'exceljs'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { LEVELS, STATUSES, reviewLabel } from '@/lib/checklist'

const HEADER_FILL = 'FFEAF1FF'

function styleHeader(row: ExcelJS.Row) {
  row.font = { name: 'Arial', bold: true }
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
  })
}

// The progress report as a workbook: a summary tab a client can read, then the
// underlying detail on its own tabs so nothing is asserted without backing.
export async function GET() {
  const project = await getCurrentProject()
  if (!project) return new Response('No project found', { status: 404 })

  const { data: equipmentRows } = await supabase
    .from('equipment')
    .select('id, tag_id, description, install_status')
    .eq('project_id', project.id)
    .order('tag_id')

  const equipment = equipmentRows ?? []
  const equipmentIds = equipment.map((e) => e.id)
  const tagById = new Map(equipment.map((e) => [e.id, e.tag_id]))

  const { data: itemsRaw } =
    equipmentIds.length > 0
      ? await supabase
          .from('checklist_items')
          .select('id, level, item, status, notes, review_state, review_comment, equipment_id')
          .in('equipment_id', equipmentIds)
          .order('level', { ascending: true })
      : { data: [] as {
          id: string
          level: string
          item: string
          status: string
          notes: string | null
          review_state: string | null
          review_comment: string | null
          equipment_id: string
        }[] }

  const items = itemsRaw ?? []
  const itemIds = items.map((it) => it.id)

  const { data: attachmentsRaw } =
    itemIds.length > 0
      ? await supabase.from('attachments').select('checklist_item_id, file_name').in('checklist_item_id', itemIds)
      : { data: [] as { checklist_item_id: string; file_name: string }[] }
  const attachments = attachmentsRaw ?? []

  const { data: issuesRaw } =
    equipmentIds.length > 0
      ? await supabase
          .from('issues')
          .select('title, description, severity, category, status, equipment_id')
          .in('equipment_id', equipmentIds)
      : { data: [] as { title: string; description: string | null; severity: string; category: string | null; status: string; equipment_id: string }[] }
  const issues = issuesRaw ?? []

  const { data: milestonesRaw } = await supabase
    .from('milestones')
    .select('name, target_date, status, notes')
    .eq('project_id', project.id)
    .order('target_date', { ascending: true, nullsFirst: false })
  const milestones = milestonesRaw ?? []

  const levelLabel = (v: string) => LEVELS.find((l) => l.value === v)?.label ?? v
  const statusLabel = (v: string) => STATUSES.find((s) => s.value === v)?.label ?? v

  const totalChecks = items.length
  const resolved = items.filter((it) => it.status === 'pass' || it.status === 'na').length
  const approved = items.filter((it) => (it.review_state ?? 'draft') === 'approved').length
  const withEvidence = new Set(attachments.map((a) => a.checklist_item_id)).size
  const openIssues = issues.filter((i) => i.status !== 'closed' && i.status !== 'verified')
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) / 100 : 0)

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CxSentinel'

  // ---- Summary -------------------------------------------------------------
  const summary = workbook.addWorksheet('Summary')
  summary.columns = [
    { key: 'label', width: 34 },
    { key: 'value', width: 46 },
  ]

  summary.addRow({ label: 'CxSentinel — Progress Report' }).font = { name: 'Arial', size: 14, bold: true }
  summary.addRow({})
  const facts: [string, string | number][] = [
    ['Project', project.name],
    ['Client', project.client ?? '—'],
    ['Location', project.location ?? '—'],
    ['Start date', project.start_date ?? '—'],
    ['Target completion', project.target_date ?? '—'],
    ['Report generated', new Date().toISOString().slice(0, 10)],
    ['', ''],
    ['Equipment tags', equipment.length],
    ['Checks defined', totalChecks],
    ['Checks resolved', resolved],
    ['Checks approved', approved],
    ['Checks with evidence on file', withEvidence],
    ['Open punch list items', openIssues.length],
    ['Category A (blocking)', openIssues.filter((i) => i.category === 'A').length],
  ]
  for (const [label, value] of facts) {
    const row = summary.addRow({ label, value })
    row.font = { name: 'Arial' }
    row.getCell(1).font = { name: 'Arial', bold: label !== '' }
  }

  const percentRows: [string, number][] = [
    ['Resolved', pct(resolved, totalChecks)],
    ['Approved', pct(approved, totalChecks)],
    ['Evidence on file', pct(withEvidence, totalChecks)],
  ]
  summary.addRow({})
  const pctHeader = summary.addRow({ label: 'Completion', value: 'Percent' })
  styleHeader(pctHeader)
  for (const [label, value] of percentRows) {
    const row = summary.addRow({ label, value })
    row.font = { name: 'Arial' }
    row.getCell(2).numFmt = '0.0%'
  }

  // ---- By level ------------------------------------------------------------
  const byLevel = workbook.addWorksheet('By level')
  byLevel.columns = [
    { header: 'Level', key: 'level', width: 40 },
    { header: 'Checks', key: 'total', width: 12 },
    { header: 'Resolved', key: 'done', width: 12 },
    { header: 'Approved', key: 'approved', width: 12 },
    { header: 'Resolved %', key: 'donePct', width: 14 },
    { header: 'Approved %', key: 'apprPct', width: 14 },
  ]
  styleHeader(byLevel.getRow(1))
  for (const l of LEVELS) {
    const at = items.filter((it) => it.level === l.value)
    const done = at.filter((it) => it.status === 'pass' || it.status === 'na').length
    const app = at.filter((it) => (it.review_state ?? 'draft') === 'approved').length
    const row = byLevel.addRow({
      level: l.label,
      total: at.length,
      done,
      approved: app,
      donePct: pct(done, at.length),
      apprPct: pct(app, at.length),
    })
    row.font = { name: 'Arial' }
    row.getCell(5).numFmt = '0.0%'
    row.getCell(6).numFmt = '0.0%'
  }

  // ---- By equipment --------------------------------------------------------
  const byTag = workbook.addWorksheet('By equipment')
  byTag.columns = [
    { header: 'Tag', key: 'tag', width: 16 },
    { header: 'Description', key: 'description', width: 42 },
    { header: 'Install status', key: 'install', width: 16 },
    { header: 'Checks', key: 'checks', width: 10 },
    { header: 'Resolved %', key: 'pct', width: 13 },
    { header: 'Approved %', key: 'appr', width: 13 },
    { header: 'Open issues', key: 'issues', width: 13 },
  ]
  styleHeader(byTag.getRow(1))
  for (const e of equipment) {
    const own = items.filter((it) => it.equipment_id === e.id)
    const done = own.filter((it) => it.status === 'pass' || it.status === 'na').length
    const app = own.filter((it) => (it.review_state ?? 'draft') === 'approved').length
    const row = byTag.addRow({
      tag: e.tag_id,
      description: e.description ?? '',
      install: e.install_status ?? '',
      checks: own.length,
      pct: pct(done, own.length),
      appr: pct(app, own.length),
      issues: openIssues.filter((i) => i.equipment_id === e.id).length,
    })
    row.font = { name: 'Arial' }
    row.getCell(5).numFmt = '0.0%'
    row.getCell(6).numFmt = '0.0%'
  }

  // ---- Every check ---------------------------------------------------------
  const detail = workbook.addWorksheet('Checks')
  detail.columns = [
    { header: 'Tag', key: 'tag', width: 14 },
    { header: 'Level', key: 'level', width: 38 },
    { header: 'Check', key: 'item', width: 52 },
    { header: 'Result', key: 'status', width: 13 },
    { header: 'Approval', key: 'review', width: 14 },
    { header: 'Comment', key: 'notes', width: 40 },
    { header: 'Review note', key: 'reviewNote', width: 40 },
    { header: 'Documents', key: 'docs', width: 11 },
  ]
  styleHeader(detail.getRow(1))
  detail.views = [{ state: 'frozen', ySplit: 1 }]
  for (const it of items) {
    const row = detail.addRow({
      tag: tagById.get(it.equipment_id) ?? '',
      level: levelLabel(it.level),
      item: it.item,
      status: statusLabel(it.status),
      review: reviewLabel(it.review_state),
      notes: it.notes ?? '',
      reviewNote: it.review_comment ?? '',
      docs: attachments.filter((a) => a.checklist_item_id === it.id).length,
    })
    row.font = { name: 'Arial' }
    row.alignment = { vertical: 'top', wrapText: true }
  }

  // ---- Punch list ----------------------------------------------------------
  const punch = workbook.addWorksheet('Punch list')
  punch.columns = [
    { header: 'Tag', key: 'tag', width: 14 },
    { header: 'Item', key: 'title', width: 48 },
    { header: 'Severity', key: 'severity', width: 14 },
    { header: 'Category', key: 'category', width: 12 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Detail', key: 'description', width: 46 },
  ]
  styleHeader(punch.getRow(1))
  for (const i of issues) {
    const row = punch.addRow({
      tag: tagById.get(i.equipment_id) ?? '',
      title: i.title,
      severity: i.severity,
      category: i.category ?? '',
      status: i.status.replace(/_/g, ' '),
      description: i.description ?? '',
    })
    row.font = { name: 'Arial' }
    row.alignment = { vertical: 'top', wrapText: true }
  }

  // ---- Milestones ----------------------------------------------------------
  const ms = workbook.addWorksheet('Milestones')
  ms.columns = [
    { header: 'Milestone', key: 'name', width: 42 },
    { header: 'Target date', key: 'target', width: 15 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Notes', key: 'notes', width: 46 },
  ]
  styleHeader(ms.getRow(1))
  for (const m of milestones) {
    const row = ms.addRow({
      name: m.name,
      target: m.target_date ?? '',
      status: m.status,
      notes: m.notes ?? '',
    })
    row.font = { name: 'Arial' }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  const fileName = `${project.name}-progress-report-${new Date().toISOString().slice(0, 10)}.xlsx`.replace(
    /[^a-zA-Z0-9._-]/g,
    '_'
  )

  return new Response(arrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
