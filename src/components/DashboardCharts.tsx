import Link from 'next/link'
import { loadRuleInputs } from '@/data/site-rules'
import { loadCheckLinkInputs } from '@/data/check-links'
import { checkLinkFindings } from '@/lib/check-links'
import { loadFailedChecks } from '@/data/failed-checks'
import { failedCheckFindings } from '@/lib/failed-checks'
import { loadScopedChecks } from '@/data/scope'
import { scopeFindings, duplicateFindings } from '@/lib/scope'
import { loadLibrary } from '@/data/templates'
import { driftFindings } from '@/lib/templates'
import { loadCoverage } from '@/data/coverage'
import { leftOutFindings, untestedSystemFindings, partialApplicationFindings } from '@/lib/coverage'
import { levelProgress, punchByCategory, punchTrend, trendReading } from '@/lib/dashboard-charts'
import { StackedBars, TrendChart, ChartFrame, PROGRESS_SERIES, PUNCH_SERIES, TREND_SERIES } from '@/components/charts'
import { punchSummary, punchHeadline, PUNCH_DEFINITIONS } from '@/lib/punch-summary'
import { punchFindings, scheduleFindings, countBy, headline } from '@/lib/site-rules'

/** One of the four punch figures, with the word that stops it being misread. */
function Figure({
  n,
  label,
  means,
  tone,
}: {
  n: number
  label: string
  means: string
  tone?: string
}) {
  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderLeft: `4px solid ${tone ?? 'var(--color-border)'}`,
        borderRadius: 8,
        padding: '10px 12px',
      }}
    >
      <div className="mono" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1, color: tone }}>
        {n}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 2 }}>{label}</div>
      <p className="text-secondary" style={{ margin: '3px 0 0', fontSize: 11, lineHeight: 1.45 }}>
        {means}
      </p>
    </div>
  )
}

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
  const [inputs, checkInputs, failed, scoped, lib, cov] = await Promise.all([
    loadRuleInputs(projectId, project),
    loadCheckLinkInputs(projectId),
    loadFailedChecks(projectId),
    loadScopedChecks(projectId),
    loadLibrary(projectId),
    loadCoverage(projectId),
  ])
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
    ...[
      ...scopeFindings(scoped.checks, scoped.codeOf),
      ...duplicateFindings(scoped.checks, scoped.codeOf),
      ...driftFindings(lib.templates, lib.records, lib.codeOf),
      ...leftOutFindings(cov.subjects, cov.checks),
      ...untestedSystemFindings(cov.subjects, cov.checks),
      ...partialApplicationFindings(cov.subjects, cov.checks, cov.titleOf),
    ].map((f) => ({
      area: 'checks' as const,
      level: f.level,
      rule: f.rule,
      title: f.title,
      detail: f.detail,
      count: f.count,
      examples: f.examples,
      href: '/checklists',
    })),
    ...failedCheckFindings(failed.checks, failed.raisedFor).map((f) => ({
      area: 'checks' as const,
      level: f.level,
      rule: f.rule,
      title: f.title,
      detail: f.detail,
      count: f.count,
      examples: f.examples,
      href: '/issues',
    })),
    ...checkLinkFindings(checkInputs).map((f) => ({
      area: 'checks' as const,
      level: f.level,
      rule: f.rule,
      title: f.title,
      detail: f.detail,
      count: f.count,
      examples: f.examples,
      href: '/checklists',
    })),
  ]
  const n = countBy(findings)
  const trend = punchTrend(inputs.punch, today)
  const punch = punchSummary(inputs.punch, today)
  const means = (k: string) => PUNCH_DEFINITIONS.find((d) => d.key === k)?.means ?? ''

  return (
    <>
      {/* ── The punch list, defined ──────────────────────────────────────
          Four figures, each with the sentence that stops it being read two
          ways, and the categories underneath so "priority" is a number
          somebody can act on rather than a colour on a bar. */}
      <section className="card" style={{ marginTop: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <h2 className="section-title" style={{ margin: 0 }}>
            Punch list
          </h2>
          <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
            <a href="/dashboard/export?chart=punch" className="link" style={{ fontSize: 11.5 }} download>
              Export CSV
            </a>
            <Link href="/issues" className="link" style={{ fontSize: 11.5 }}>
              Open the punch list →
            </Link>
          </div>
        </div>
        <p style={{ margin: '4px 0 14px', fontSize: 13, fontWeight: 600 }}>{punchHeadline(punch)}</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          <Figure n={punch.raised} label="Raised" means={means('raised')} />
          <Figure n={punch.open} label="Open" means={means('open')} tone="var(--color-danger)" />
          <Figure n={punch.awaiting} label="Awaiting acceptance" means={means('awaiting')} tone="#4f46e5" />
          <Figure n={punch.closed} label="Closed" means={means('closed')} tone="var(--color-success)" />
        </div>

        <p className="text-secondary" style={{ margin: '10px 0 0', fontSize: 11.5, fontStyle: 'italic' }}>
          Raised = open + awaiting acceptance + closed. The three states do not overlap, so the four figures
          always reconcile — if they ever do not, the records have changed while this page was open.
        </p>

        {punch.raised > 0 && (
          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <table className="table" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 130 }}>Priority</th>
                  <th style={{ minWidth: 60 }}>Raised</th>
                  <th style={{ minWidth: 60 }}>Open</th>
                  <th style={{ minWidth: 80 }}>Awaiting</th>
                  <th style={{ minWidth: 60 }}>Closed</th>
                  <th style={{ minWidth: 70 }}>Overdue</th>
                  <th style={{ minWidth: 70 }}>No date</th>
                  <th>What this priority means</th>
                </tr>
              </thead>
              <tbody>
                {punch.categories.map((c) => (
                  <tr key={c.label}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{c.label}</td>
                    <td className="mono">{c.raised}</td>
                    <td className="mono" style={{ color: c.open > 0 ? 'var(--color-danger)' : undefined }}>
                      {c.open}
                    </td>
                    <td className="mono">{c.awaiting}</td>
                    <td className="mono">{c.closed}</td>
                    <td
                      className="mono"
                      style={{ fontWeight: c.overdue > 0 ? 700 : 400, color: c.overdue > 0 ? 'var(--color-danger)' : undefined }}
                    >
                      {c.overdue}
                    </td>
                    <td
                      className="mono"
                      style={{ fontWeight: c.undated > 0 ? 700 : 400, color: c.undated > 0 ? 'var(--color-warning)' : undefined }}
                    >
                      {c.undated}
                    </td>
                    <td className="text-secondary" style={{ fontSize: 11.5 }}>
                      {c.what}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* One footnote, not the same sentence repeated on four rows.
                It is the trap this table sets: a register full of undated
                items reports zero overdue and reads perfectly clean. */}
            <p className="text-secondary" style={{ margin: '8px 0 0', fontSize: 11.5 }}>
              <strong>No date</strong> counts items that are not closed and carry no due date. They can never
              appear in the Overdue column, so a high figure here means the Overdue column is understating the
              position — not that the position is good.
            </p>
          </div>
        )}
      </section>

      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          marginTop: 16,
        }}
      >
        <ChartFrame
          title="Progress by level"
          href="/plan"
          hrefLabel="Plan & progress"
          csv="/dashboard/export?chart=progress"
          definition={
            <>
              Every check on the project, counted at the level it sits at. <strong>Passed</strong> includes checks
              marked N/A — a check that does not apply is not outstanding work. <strong>Not started</strong> means
              the check exists on the plan with no answer against it. The percentage on each bar is passed out of
              that level&rsquo;s total, and levels are never added together.
            </>
          }
        >
          <StackedBars
            rows={levelProgress(inputs.checks)}
            series={PROGRESS_SERIES}
            percentOf={{ key: 'done', word: 'passed' }}
            emptyNote="No checks yet. Upload a checklist or a functional test script and this fills in."
          />
        </ChartFrame>

        <ChartFrame
          title="Punch list by priority"
          href="/issues"
          hrefLabel="Punch list"
          csv="/dashboard/export?chart=punch"
          definition={
            <>
              The full length of each bar is everything ever raised in that category. <strong>A</strong> stops the
              system advancing, <strong>B</strong> blocks handover unless the owner accepts it, <strong>C</strong>{' '}
              blocks nothing. <strong>Uncategorised</strong> is its own row on purpose: an item whose commercial
              position nobody has decided is a decision waiting to be made, not a Category C.
            </>
          }
        >
          <StackedBars
            rows={punchByCategory(inputs.punch)}
            series={PUNCH_SERIES}
            percentOf={{ key: 'closed', word: 'closed' }}
            emptyNote="No punch items yet."
          />
        </ChartFrame>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'minmax(340px, 2fr) minmax(260px, 1fr)',
          marginTop: 16,
        }}
      >
        <ChartFrame
          title="Raised against closed"
          href="/issues"
          hrefLabel="Punch list"
          csv="/dashboard/export?chart=trend"
          definition={
            <>
              Twelve weeks, both lines cumulative — running totals, not weekly counts. The vertical gap between
              them is everything <strong>not closed</strong>, which is the open items and the ones awaiting
              acceptance together — so it is larger than the Open figure above, on purpose. A widening gap is a
              project falling behind; a narrowing one is catching up. Closure is placed by the date it was closed,
              so an item recorded as closed with no closing date cannot appear on the lower line.
            </>
          }
        >
          <TrendChart
            points={trend}
            series={TREND_SERIES}
            emptyNote="Not enough history yet — this needs a couple of weeks of punch items."
          />
          <p style={{ margin: '10px 0 0', fontSize: 13, fontWeight: 600 }}>{trendReading(trend)}</p>
        </ChartFrame>

        <ChartFrame
          title="Rule checks"
          href="/rules"
          hrefLabel="See what they found"
          definition={
            <>
              Free checks over the records — no AI, no key, nothing stored. They say what could not be verified by
              somebody who was not there; they do not say the work was done badly. Worked out fresh every time this
              page opens, so the figure is never out of date.
            </>
          }
        >
          <div
            style={{
              fontSize: 38,
              fontWeight: 700,
              lineHeight: 1.05,
              color: n.blocking > 0 ? 'var(--color-danger)' : 'inherit',
            }}
          >
            {n.blocking}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{headline(findings)}</div>
          <p className="text-secondary" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
            {n.warning} worth a look, {n.note} noted.
          </p>
        </ChartFrame>
      </div>
    </>
  )
}
