import Link from 'next/link'
import { getCurrentProject } from '@/lib/project'
import { loadAssetReport } from '@/data/asset-report'
import { missingColumnNote } from '@/lib/pg-columns'
import type { Breakdown, Finding, Severity } from '@/lib/asset-report'

export const dynamic = 'force-dynamic'

/**
 * The asset register, reported on.
 *
 * Printable, because this is the thing that gets handed across a table at
 * a progress meeting. The controls, the rail and the links are all
 * `no-print`; the tables and the findings are not.
 */

const TONE: Record<Severity, { label: string; cls: string }> = {
  blocking: { label: 'Will make another screen wrong', cls: 'badge badge-danger' },
  warning: { label: 'Worth looking at', cls: 'badge badge-warning' },
  note: { label: 'Note', cls: 'badge badge-neutral' },
}

function BreakdownTable({
  title,
  means,
  rows,
  total,
}: {
  title: string
  means: string
  rows: Breakdown[]
  total: number
}) {
  return (
    <div className="card">
      <h2 className="section-title" style={{ marginBottom: 2 }}>
        {title}
      </h2>
      <p className="text-secondary" style={{ fontSize: 12, margin: '0 0 12px' }}>
        {means}
      </p>
      {rows.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: 12.5, margin: 0 }}>
          Nothing to break down yet.
        </p>
      ) : (
        <table className="table ar-table">
          <tbody>
            {rows.map((r) => (
              <tr key={r.key || 'blank'} className={r.key ? undefined : 'ar-blank'}>
                {/* Truncated in CSS when the name is long, so the full
                    text has to survive somewhere the reader can get at it. */}
                <td title={r.label}>
                  {r.href ? (
                    <Link href={r.href} className="ar-link">
                      {r.label}
                    </Link>
                  ) : (
                    r.label
                  )}
                </td>
                <td className="ar-num mono">{r.count}</td>
                <td style={{ width: 96 }}>
                  <div className="ar-bar">
                    <span style={{ width: `${r.percent ?? 0}%` }} />
                  </div>
                </td>
                <td className="ar-num mono" style={{ width: 46 }}>
                  {/* Never a percentage of nothing. */}
                  {r.percent === null ? <span className="ar-dash">—</span> : `${r.percent}%`}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>
                <strong>Total</strong>
              </td>
              <td className="ar-num mono">{total}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}

function FindingCard({ f }: { f: Finding }) {
  return (
    <div className={`ar-finding ar-${f.severity}`}>
      <div className="ar-finding-head">
        <span className="ar-finding-count mono">{f.count}</span>
        <div>
          <div className="ar-finding-title">{f.title}</div>
          <span className={TONE[f.severity].cls}>{TONE[f.severity].label}</span>
        </div>
        <Link href={f.href} className="btn btn-secondary btn-sm no-print">
          Open the list
        </Link>
      </div>
      <p className="ar-finding-what">{f.what}</p>
      {/* What it costs, not what it is. A finding without this is a nag. */}
      <p className="ar-finding-cost">{f.cost}</p>
      {f.sample.length > 0 && (
        <div className="ar-sample">
          <span className="stat-label">For example</span>
          <div className="ar-sample-list">
            {f.sample.map((s) => (
              <span key={s} className="tag-id ar-chip">
                {s}
              </span>
            ))}
            {f.count > f.sample.length && (
              <span className="text-secondary" style={{ fontSize: 11.5 }}>
                and {f.count - f.sample.length} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default async function AssetReportPage() {
  const project = await getCurrentProject()
  const { report, missing, error } = await loadAssetReport(project?.id ?? null)
  const schemaNote = missingColumnNote(missing, 'the outstanding SQL step')
  const blocking = report.findings.filter((f) => f.severity === 'blocking')
  const rest = report.findings.filter((f) => f.severity !== 'blocking')

  return (
    <>
      <h1 className="page-title">Asset Register Report</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — what is in the register, and whether it can be trusted.
        Every other number in this application is computed from these rows: a system&rsquo;s readiness, a
        level&rsquo;s completion, what goes in a handover pack. So this counts them, and then it names the rows
        that will make one of those screens wrong.
      </p>

      <div className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <Link href="/systems" className="btn btn-secondary">
          Systems
        </Link>
        <Link href="/equipment-types" className="btn btn-secondary">
          Equipment Types
        </Link>
        <Link href="/equipment" className="btn btn-secondary">
          Equipment
        </Link>
        {/* A route handler that answers with a file, not a page. <Link>
            would try to navigate to it client-side and the download would
            never start. The rule cannot tell the two apart. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/assets/report/export" className="btn btn-primary">
          Download as Excel
        </a>
      </div>

      {schemaNote && (
        <div className="alert alert-warning" role="alert" style={{ marginBottom: 18 }}>
          {schemaNote}
        </div>
      )}
      {error && (
        <div className="alert alert-danger" role="alert" style={{ marginBottom: 18 }}>
          The database refused a query, so this report is not the answer: {error}
        </div>
      )}

      <div className="stat-grid">
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-primary)' }}>
          <div className="stat-label">Systems</div>
          <div className="stat-value">{report.counts.systems}</div>
          <div className="stat-note">Commissionable systems on the project</div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-progress)' }}>
          <div className="stat-label">Equipment types</div>
          <div className="stat-value">{report.counts.types}</div>
          <div className="stat-note">Makes and models in the catalogue</div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-accent-2)' }}>
          <div className="stat-label">Tags</div>
          <div className="stat-value">{report.counts.tags}</div>
          <div className="stat-note">
            {report.counts.typed} linked to a type · {report.counts.placed} with a location
          </div>
        </div>
        <div
          className="stat"
          style={{
            ['--stat-accent' as string]:
              blocking.length > 0 ? 'var(--color-danger-solid)' : 'var(--color-success-solid)',
          }}
        >
          <div className="stat-label">Findings</div>
          <div className="stat-value">{report.findings.length}</div>
          <div className="stat-note">
            {report.checksRun} checks run ·{' '}
            {blocking.length > 0 ? `${blocking.length} will make another screen wrong` : 'none blocking'}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title" style={{ marginBottom: 6 }}>
          In one line
        </h2>
        <p style={{ fontSize: 13.5, margin: 0 }}>{report.note}</p>
      </div>

      {report.findings.length === 0 ? (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 className="section-title">Findings</h2>
          {/* A clean report has to be printable AS a clean report. A blank
              space here is indistinguishable from a page that failed. */}
          <p style={{ fontSize: 13.5, margin: 0 }}>
            {report.empty
              ? 'Nothing in the register yet, so there is nothing to check. Import a system list and a tag list first.'
              : `All ${report.checksRun} checks run, nothing found. No duplicate tag numbers, no equipment outside a system, no empty systems, no tag contradicting its catalogue entry.`}
          </p>
        </div>
      ) : (
        <>
          <h2 className="section-title" style={{ marginTop: 4 }}>
            Findings — {blocking.length > 0 ? 'worst first' : 'nothing blocking'}
          </h2>
          <div className="ar-findings">
            {blocking.map((f) => (
              <FindingCard key={f.id} f={f} />
            ))}
            {rest.map((f) => (
              <FindingCard key={f.id} f={f} />
            ))}
          </div>
        </>
      )}

      <h2 className="section-title" style={{ marginTop: 26 }}>
        The breakdown
      </h2>
      <div className="ar-grid">
        <BreakdownTable
          title="Tags by system"
          means="Where the plant sits. A system with no tags is in the findings above, not here."
          rows={report.bySystem}
          total={report.counts.tags}
        />
        <BreakdownTable
          title="Tags by discipline"
          means="What kind of plant it is, as recorded on the tag itself."
          rows={report.byCategory}
          total={report.counts.tags}
        />
        <BreakdownTable
          title="Tags by install status"
          means="How far each piece has got — delivered, installed, energised."
          rows={report.byStatus}
          total={report.counts.tags}
        />
        <BreakdownTable
          title="Tags by type"
          means="How many of each model. Forty identical breakers should be one row here, not forty."
          rows={report.byType}
          total={report.counts.tags}
        />
      </div>
    </>
  )
}
