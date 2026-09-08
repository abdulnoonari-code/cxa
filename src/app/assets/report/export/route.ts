import ExcelJS from 'exceljs'
import { getCurrentProject } from '@/lib/project'
import { loadAssetReport } from '@/data/asset-report'

// The asset report as a workbook, so it can go in a monthly pack or be
// pasted into somebody else's format.
//
// Findings first, breakdowns after. The order is the point: whoever opens
// this should meet the rows that will make another screen wrong before
// they meet the pie-chart material.
export async function GET() {
  const project = await getCurrentProject()
  if (!project) return new Response('No project found', { status: 404 })

  const { report, missing } = await loadAssetReport(project.id)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'CxSentinel'
  wb.created = new Date()

  const head = (sheet: ExcelJS.Worksheet) => {
    sheet.getRow(1).font = { bold: true }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
  }

  // ── Summary ───────────────────────────────────────────────────────────
  const s = wb.addWorksheet('Summary')
  s.columns = [
    { header: 'Item', key: 'k', width: 46 },
    { header: 'Value', key: 'v', width: 70 },
  ]
  head(s)
  s.addRow({ k: 'Project', v: project.name })
  s.addRow({ k: 'Report date', v: new Date().toISOString().slice(0, 10) })
  s.addRow({ k: 'Systems', v: report.counts.systems })
  s.addRow({ k: 'Equipment types', v: report.counts.types })
  s.addRow({ k: 'Tags', v: report.counts.tags })
  s.addRow({ k: 'Tags linked to a type', v: report.counts.typed })
  s.addRow({ k: 'Tags with a location', v: report.counts.placed })
  s.addRow({ k: 'Checks run', v: report.checksRun })
  s.addRow({ k: 'Findings', v: report.findings.length })
  s.addRow({ k: 'In one line', v: report.note })
  if (missing.length > 0)
    // Never silently. A column this database has not got changes what the
    // findings mean, and a workbook that does not say so is a workbook
    // somebody will act on.
    s.addRow({
      k: 'INCOMPLETE',
      v: `This database does not have ${missing.join(', ')} yet. Those columns were read as blank, so any finding about them counts every row. Run the outstanding SQL step and export again.`,
    })

  // ── Findings ──────────────────────────────────────────────────────────
  const f = wb.addWorksheet('Findings')
  f.columns = [
    { header: 'Severity', key: 'sev', width: 12 },
    { header: 'Finding', key: 'title', width: 42 },
    { header: 'How many', key: 'count', width: 11 },
    { header: 'What it is', key: 'what', width: 60 },
    { header: 'What it costs', key: 'cost', width: 90 },
    { header: 'For example', key: 'sample', width: 46 },
  ]
  head(f)
  if (report.findings.length === 0) {
    f.addRow({
      sev: 'none',
      title: `All ${report.checksRun} checks run, nothing found`,
      count: 0,
      what: 'No duplicate tag numbers, no equipment outside a system, no empty systems, no tag contradicting its catalogue entry.',
    })
  } else {
    for (const x of report.findings)
      f.addRow({
        sev: x.severity,
        title: x.title,
        count: x.count,
        what: x.what,
        cost: x.cost,
        sample: x.sample.join(', '),
      })
  }

  // ── Breakdowns ────────────────────────────────────────────────────────
  const sheets: [string, typeof report.bySystem][] = [
    ['By system', report.bySystem],
    ['By discipline', report.byCategory],
    ['By install status', report.byStatus],
    ['By type', report.byType],
  ]
  for (const [name, rows] of sheets) {
    const sheet = wb.addWorksheet(name)
    sheet.columns = [
      { header: name.replace('By ', '').replace(/^./, (c) => c.toUpperCase()), key: 'label', width: 40 },
      { header: 'Tags', key: 'count', width: 10 },
      { header: 'Share', key: 'percent', width: 10 },
    ]
    head(sheet)
    for (const r of rows)
      // A blank share stays blank. Writing 0 here would be a number
      // somebody sums.
      sheet.addRow({ label: r.label, count: r.count, percent: r.percent === null ? '' : r.percent / 100 })
    sheet.getColumn('percent').numFmt = '0%'
    sheet.addRow({ label: 'Total', count: report.counts.tags })
    sheet.lastRow!.font = { bold: true }
  }

  const buffer = await wb.xlsx.writeBuffer()
  const stamp = new Date().toISOString().slice(0, 10)
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="asset-register-report-${stamp}.xlsx"`,
    },
  })
}
