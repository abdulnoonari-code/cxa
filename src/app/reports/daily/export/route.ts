import ExcelJS from 'exceljs'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { loadProjectRollup, rollupFor } from '@/data/rollup'
import {
  buildDailyReport,
  today,
  shiftDay,
  longDate,
  timeOf,
  emptyDayNote,
  type AuditEvent,
} from '@/lib/daily-report'

// The daily report as a workbook, so it can go straight into a client email
// or a contractual submission without being retyped.
export async function GET(request: Request) {
  const project = await getCurrentProject()
  if (!project) return new Response('No project found', { status: 404 })

  const url = new URL(request.url)
  const raw = url.searchParams.get('day')
  const day = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today()

  const { data: auditRows } = await supabase
    .from('audit_log')
    .select('id, actor_name, actor_email, actor_role, action, entity, entity_id, entity_label, old_value, new_value, comment, created_at')
    .eq('project_id', project.id)
    .gte('created_at', `${shiftDay(day, -1)}T00:00:00`)
    .lte('created_at', `${shiftDay(day, 1)}T23:59:59`)
    .order('created_at', { ascending: true })

  const report = buildDailyReport((auditRows ?? []) as AuditEvent[], day)

  const index = await loadSubjectIndex(project.id)
  const rollup = await loadProjectRollup(project.id, index)
  const overall = rollupFor(rollup, index.root ? { type: 'project', id: index.root.id } : null)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'CxSentinel'
  wb.created = new Date()

  // ── Cover ───────────────────────────────────────────────────────────────
  const cover = wb.addWorksheet('Report')
  cover.columns = [
    { header: '', key: 'a', width: 30 },
    { header: '', key: 'b', width: 76 },
  ]
  const head = (text: string) => {
    const r = cover.addRow({ a: text, b: '' })
    r.font = { bold: true, size: 12 }
    return r
  }
  const line = (a: string, b: string | number) => cover.addRow({ a, b })

  head('DAILY COMMISSIONING REPORT')
  line('Project', project.name)
  if (project.client) line('Client', project.client)
  if (project.location) line('Location', project.location)
  line('Date', longDate(day))
  line('Generated', new Date().toLocaleString())
  cover.addRow({})

  head('FIGURES FOR THE DAY')
  line('Test entries', report.figures.testsRecorded)
  line('Check entries', report.figures.checksRecorded)
  line('Failures recorded', report.figures.failures)
  line('Inspection notices', report.figures.noticesIssued)
  line('Signatures', report.figures.signatures)
  line('Gate prerequisites answered', report.figures.prerequisitesAnswered)
  line('Total entries', report.total)
  cover.addRow({})

  if (report.total === 0) {
    const note = cover.addRow({ a: 'NOTE', b: emptyDayNote(day) })
    note.font = { italic: true }
    note.getCell('b').alignment = { wrapText: true }
    cover.addRow({})
  } else {
    head('WHO ENTERED WORK')
    for (const p of report.people) line(p.name, `${p.role ?? '—'} · ${p.entries} entries`)
    const caveat = cover.addRow({
      a: '',
      b: 'This is who entered work into CxSentinel, which is not the same as who was on site. It is not a manpower return.',
    })
    caveat.font = { italic: true, size: 9 }
    caveat.getCell('b').alignment = { wrapText: true }
    cover.addRow({})
  }

  head('CONSTRAINTS AS THEY STAND NOW')
  if (overall.readiness.blockers.length === 0) {
    line('', 'Nothing is blocking the project at present.')
  } else {
    for (const b of overall.readiness.blockers) {
      const r = cover.addRow({ a: '', b: b.text })
      r.getCell('b').font = { color: { argb: 'FFA12518' } }
      r.getCell('b').alignment = { wrapText: true }
    }
  }
  cover.addRow({})

  const provenance = cover.addRow({
    a: 'HOW THIS WAS MADE',
    b: 'Built from the CxSentinel audit log, which the database will not allow anyone to edit or delete. Every line traces to a record. To change what this report says, change the record it came from — the correction appears in the audit trail alongside the original.',
  })
  provenance.font = { italic: true, size: 9 }
  provenance.getCell('b').alignment = { wrapText: true }

  // ── The day itself ──────────────────────────────────────────────────────
  const detail = wb.addWorksheet('Activity')
  detail.columns = [
    { header: 'Section', key: 'section', width: 26 },
    { header: 'Time', key: 'time', width: 9 },
    { header: 'What', key: 'action', width: 34 },
    { header: 'Record', key: 'record', width: 46 },
    { header: 'Change', key: 'change', width: 40 },
    { header: 'Comment', key: 'comment', width: 46 },
    { header: 'By', key: 'by', width: 22 },
    { header: 'Role', key: 'role', width: 22 },
  ]

  for (const s of report.sections) {
    for (const e of s.events) {
      detail.addRow({
        section: s.label,
        time: timeOf(e.created_at),
        action: e.action,
        record: e.entity_label ?? e.entity,
        change: e.old_value && e.new_value ? `${e.old_value} → ${e.new_value}` : (e.new_value ?? e.old_value ?? ''),
        comment: e.comment ?? '',
        by: e.actor_name || e.actor_email || '',
        role: e.actor_role ?? '',
      })
    }
  }

  detail.getRow(1).font = { bold: true }
  detail.views = [{ state: 'frozen', ySplit: 1 }]
  if (report.total > 0) detail.autoFilter = { from: 'A1', to: { row: 1, column: detail.columnCount } }

  const buffer = await wb.xlsx.writeBuffer()
  const safe = project.name.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safe}_daily_report_${day}.xlsx"`,
    },
  })
}
