import Link from 'next/link'
import { loadRuleInputs } from '@/data/site-rules'
import { levelProgress, punchByCategory, punchTrend, trendReading } from '@/lib/dashboard-charts'
import { StackedBars, TrendChart, PROGRESS_SERIES, PUNCH_SERIES, TREND_SERIES } from '@/components/charts'
import { punchFindings, scheduleFindings, countBy, headline } from '@/lib/site-rules'

/**
 * The picture half of the dashboard.
 *
 * Three charts and one tile, chosen so that each answers a question somebody
 * actually asks in a progress meeting:
 *
 *   • "How far through are we?"      → progress by level
 *   • "What is left on the punch?"   → by category, because the category is
 *                                      what decides whether it stops anything
 *   • "Are we catching up?"          → raised against closed, cumulative
 *   • "What will not stand up?"      → the free rule checks, in one number
 *
 * A fourth chart was considered and left out. A dashboard that answers four
 * questions gets read; one that answers nine gets scrolled past.
 */
export default async function DashboardCharts({
  projectId,
  project,
}: {
  projectId: string | null
  project: { name: string | null; target_date: string | null } | null
}) {
  const inputs = await loadRuleInputs(projectId, project)
  const today = new Date()

  const findings = [
    ...punchFindings(inputs.punch, inputs.checks, today),
    ...scheduleFindings(
      {
        project: inputs.project,
        milestones: inputs.milestones,
        tasks: inputs.tasks,
        obligations: inputs.obligations,
        checks: inputs.checks,
        openPunch: inputs.punch.filter((p) => p.status !== 'closed' && p.status !== 'verified').length,
      },
      today
    ),
  ]
  const n = countBy(findings)
  const trend = punchTrend(inputs.punch, today)

  return (
    <>
      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          marginTop: 16,
        }}
      >
        <div className="card" style={{ margin: 0 }}>
          <h2 className="section-title">Progress by level</h2>
          <p className="text-secondary" style={{ fontSize: 12.5, margin: '0 0 12px' }}>
            Every check on the project, by the level it sits at. N/A counts as done — a check that does not
            apply is not outstanding work.
          </p>
          <StackedBars
            rows={levelProgress(inputs.checks)}
            series={PROGRESS_SERIES}
            percentOf={{ key: 'done', word: 'passed' }}
            emptyNote="No checks yet. Upload a checklist or a functional test script and this fills in."
          />
        </div>

        <div className="card" style={{ margin: 0 }}>
          <h2 className="section-title">Punch list by category</h2>
          <p className="text-secondary" style={{ fontSize: 12.5, margin: '0 0 12px' }}>
            The category is a commercial position, not a severity: A stops the next step, B blocks handover
            unless the owner accepts it, C blocks nothing.
          </p>
          <StackedBars
            rows={punchByCategory(inputs.punch)}
            series={PUNCH_SERIES}
            percentOf={{ key: 'closed', word: 'closed' }}
            emptyNote="No punch items yet."
          />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'minmax(340px, 2fr) minmax(260px, 1fr)',
          marginTop: 16,
        }}
      >
        <div className="card" style={{ margin: 0 }}>
          <h2 className="section-title">Raised against closed</h2>
          <p className="text-secondary" style={{ fontSize: 12.5, margin: '0 0 12px' }}>
            Twelve weeks, running totals. The gap between the two lines is the open list — whether it is
            widening or closing is the question a weekly count cannot answer.
          </p>
          <TrendChart
            points={trend}
            series={TREND_SERIES}
            emptyNote="Not enough history yet — this needs a couple of weeks of punch items."
          />
          <p style={{ margin: '10px 0 0', fontSize: 13, fontWeight: 600 }}>{trendReading(trend)}</p>
        </div>

        <div
          className="card"
          style={{
            margin: 0,
            borderLeft: `4px solid ${n.blocking > 0 ? 'var(--color-danger)' : 'var(--color-border)'}`,
          }}
        >
          <h2 className="section-title">Rule checks</h2>
          <div
            style={{
              fontSize: 34,
              fontWeight: 700,
              lineHeight: 1.1,
              color: n.blocking > 0 ? 'var(--color-danger)' : 'inherit',
            }}
          >
            {n.blocking}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{headline(findings)}</div>
          <p className="text-secondary" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
            {n.warning} worth a look, {n.note} noted. Free, no AI, nothing stored — worked out from the records
            every time this page opens.
          </p>
          <div style={{ marginTop: 12 }}>
            <Link href="/rules" className="btn btn-secondary btn-sm">
              See what they found
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
