import { getCurrentProject } from '@/lib/project'
import { loadRuleInputs } from '@/data/site-rules'
import { levelProgress, punchTrend } from '@/lib/dashboard-charts'
import { punchSummary, PUNCH_DEFINITIONS } from '@/lib/punch-summary'
import { loadHierarchy } from '@/data/hierarchy'
import { devicePercent, systemPercent, sumCells, HIERARCHY_NOTE } from '@/lib/hierarchy'

export const dynamic = 'force-dynamic'

/**
 * The figures behind each chart, as a spreadsheet.
 *
 * ── Why this exists ────────────────────────────────────────────────────
 *
 * A picture cannot be pasted into a monthly report, checked by somebody who
 * was not in the room, or added up by hand when a client disputes it. Every
 * one of those happens on a commissioning job, and the answer to all three
 * has been "screenshot the dashboard", which is not an answer.
 *
 * ── Why it recomputes rather than being handed the numbers ─────────────
 *
 * It calls the SAME functions the charts call, on the same inputs. It does
 * not re-derive the figures a second way. A second calculation always
 * eventually disagrees with the first, and then there are two numbers for
 * one thing and no way to tell which is right — which is the exact problem
 * this whole application exists to prevent.
 */

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  // Quote anything that could break a cell boundary. A description with a
  // comma in it silently shifting every later column is the classic way a
  // CSV export corrupts a report without anybody noticing.
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows: unknown[][]): string {
  // A BOM, because Excel opens a UTF-8 CSV as Windows-1252 without one and
  // turns every — and every ° into mojibake.
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

function file(name: string, rows: unknown[][]): Response {
  return new Response(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  })
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  const project = await getCurrentProject()
  if (!project) return new Response('No project is open.', { status: 400 })

  const chart = new URL(request.url).searchParams.get('chart') ?? 'punch'
  const inputs = await loadRuleInputs(project.id, project)
  const today = new Date()
  const safeName = project.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 40)

  if (chart === 'progress') {
    const rows = levelProgress(inputs.checks)
    return file(`${safeName}-progress-by-level-${stamp()}.csv`, [
      ['Project', project.name],
      ['Exported', new Date().toISOString()],
      [],
      ['Level', 'What it proves', 'Passed or N/A', 'Failed', 'Not started', 'Total'],
      ...rows.map((r) => {
        const v = r.values
        return [r.label, r.sublabel ?? '', v.done, v.failed, v.pending, v.done + v.failed + v.pending]
      }),
      [],
      ['Passed or N/A', 'A check recorded as pass, or marked not applicable. Both are settled.'],
      ['Failed', 'Recorded as fail. Still counts as recorded work.'],
      ['Not started', 'The check exists on the plan and has no answer against it.'],
    ])
  }

  if (chart === 'hierarchy') {
    const nodes = await loadHierarchy(project.id)
    return file(`${safeName}-project-summary-${stamp()}.csv`, [
      ['Project', project.name],
      ['Exported', new Date().toISOString()],
      [],
      [
        'Level in tree',
        'Kind',
        'Code',
        'Name',
        'Tags',
        'Device checks recorded (L1-L3)',
        'Device passed',
        'Device failed',
        'Device %',
        'System checks recorded (L4-L5)',
        'System passed',
        'System failed',
        'System %',
        'Open defects',
        'Blocking (Category A open)',
      ],
      ...nodes.map((n) => {
        const d = sumCells(n.deviceCells)
        const y = sumCells(n.systemCells)
        return [
          n.depth,
          n.type,
          n.code,
          n.name,
          n.devices,
          d.total,
          d.done,
          d.failed,
          devicePercent(n) ?? '',
          y.total,
          y.done,
          y.failed,
          systemPercent(n) ?? '',
          n.punchOpen,
          n.punchBlocking,
        ]
      }),
      [],
      [HIERARCHY_NOTE],
      ['An empty percentage means nothing is recorded at that level. It is not nought per cent.'],
    ])
  }

  if (chart === 'trend') {
    const rows = punchTrend(inputs.punch, today)
    return file(`${safeName}-raised-against-closed-${stamp()}.csv`, [
      ['Project', project.name],
      ['Exported', new Date().toISOString()],
      [],
      ['Week ending', 'Raised (cumulative)', 'Closed (cumulative)', 'Still open'],
      ...rows.map((p) => {
        const raised = Number(p.raised ?? 0)
        const closed = Number(p.closed ?? 0)
        return [p.label, raised, closed, raised - closed]
      }),
      [],
      ['Both columns are cumulative totals, not weekly counts.'],
      ['Still open is the gap between them: a widening gap is a project falling behind.'],
    ])
  }

  const s = punchSummary(inputs.punch, today)
  return file(`${safeName}-punch-list-${stamp()}.csv`, [
    ['Project', project.name],
    ['Exported', new Date().toISOString()],
    [],
    ['Category', 'What it means', 'Raised', 'Open', 'Awaiting acceptance', 'Closed', 'Overdue', 'No due date'],
    ...s.categories.map((c) => [c.label, c.what, c.raised, c.open, c.awaiting, c.closed, c.overdue, c.undated]),
    ['All categories', '', s.raised, s.open, s.awaiting, s.closed, s.overdue, s.undated],
    [],
    ['Definitions'],
    ...PUNCH_DEFINITIONS.map((d) => [d.label, d.means]),
    [],
    ['Raised equals open plus awaiting acceptance plus closed. The three states do not overlap.'],
  ])
}
