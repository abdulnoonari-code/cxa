import Link from 'next/link'
import { cookies } from 'next/headers'
import { getCurrentProject } from '@/lib/project'
import { addWorkedExample, removeWorkedExample } from '@/app/setup/example-actions'
import { EXAMPLE_FAULTS, EXAMPLE_MARK } from '@/lib/example-plan'
import { EXAMPLE_REPORT_COOKIE, decodeReport, reportVerdict } from '@/lib/example-report'
import { outcomeSentence } from '@/lib/pg-columns'
import { loadAllFindings } from '@/data/all-findings'
import RuleSummary from '@/components/RuleSummary'
import { SITE_RULES_NOTE, type SiteFinding } from '@/lib/site-rules'

export const dynamic = 'force-dynamic'

const TONE: Record<string, { color: string; label: string }> = {
  blocking: { color: 'var(--color-danger)', label: 'Would not stand up at handover' },
  warning: { color: 'var(--color-warning, #a35700)', label: 'Worth a look' },
  note: { color: 'var(--color-text-secondary)', label: 'Noted' },
}

const REPORT_TONE: Record<string, string> = {
  good: 'var(--color-success)',
  partial: 'var(--color-warning, #a35700)',
  bad: 'var(--color-danger)',
}

const AREA: Record<string, string> = {
  checks: 'Checks and what they depend on',
  photos: 'Photographs',
  punch: 'Punch list',
  schedule: 'Dates and progress',
}

function Finding({ f }: { f: SiteFinding }) {
  const tone = TONE[f.level]
  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderLeft: `4px solid ${tone.color}`,
        borderRadius: 8,
        padding: 14,
        background: 'var(--color-surface)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: tone.color }}>{f.title}</div>
        <span className="badge" style={{ fontSize: 11 }}>
          {f.count} record{f.count === 1 ? '' : 's'}
        </span>
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 13 }}>{f.detail}</p>

      <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5 }}>
        {f.examples.map((e, i) => (
          <li key={i} className="text-secondary">
            {e}
          </li>
        ))}
        {f.count > f.examples.length && (
          <li className="text-secondary">and {f.count - f.examples.length} more</li>
        )}
      </ul>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 10, alignItems: 'center' }}>
        <span className="text-secondary mono" style={{ fontSize: 10.5 }}>
          rule: {f.rule}
        </span>
        <Link href={f.href} className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}>
          Go and look
        </Link>
      </div>
    </div>
  )
}

export default async function RulesPage() {
  const [project, store] = await Promise.all([getCurrentProject(), cookies()])
  const { findings, counts, photosReady } = await loadAllFindings(project)
  const report = decodeReport(store.get(EXAMPLE_REPORT_COOKIE)?.value)
  const verdict = reportVerdict(report)

  const order: SiteFinding['level'][] = ['blocking', 'warning', 'note']
  const areas: SiteFinding['area'][] = ['checks', 'photos', 'punch', 'schedule']

  return (
    <>
      <h1 className="page-title">Rule checks</h1>
      <p className="page-subtitle">
        Every check on this page is free. No model reads anything, no key is needed, and nothing is stored —
        the answer is worked out from the records each time you open it, so it is never out of date.
      </p>

      <RuleSummary findings={findings} counts={counts} />

      {!photosReady && (
        <div className="alert alert-danger" style={{ marginTop: 16 }}>
          <strong>Photograph checks could not run.</strong> The photographs table is not there yet — run SQL
          part 21. Everything else on this page is unaffected.
        </div>
      )}

      {findings.length === 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="section-title">Every rule passed</h2>
          <p className="text-secondary" style={{ fontSize: 13, margin: 0 }}>
            Nothing to report. Every closed defect carries a photograph of the repair, every dated commitment is
            either met or still ahead of its date, and no level reads complete while work is open against it.
          </p>
        </div>
      )}

      {areas.map((area) => {
        const mine = order.flatMap((lvl) => findings.filter((f) => f.area === area && f.level === lvl))
        if (mine.length === 0) return null
        return (
          <div key={area} style={{ marginTop: 20 }}>
            <h2 className="section-title" style={{ marginBottom: 10 }}>
              {AREA[area]}
            </h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {mine.map((f) => (
                <Finding key={f.rule} f={f} />
              ))}
            </div>
          </div>
        )
      })}


      {/* The worked example belongs here and nowhere else.
          It exists for one purpose — to show what every rule on THIS page
          looks like when it fires. On the Setup screen it was next to SQL
          steps and database keys, which is why it kept being mistaken for
          part of installing the application. It is not. It is sample data
          for the rules. */}
      <details className="card" style={{ marginTop: 26 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}>
          Show me what these rules look like when they fire
        </summary>

        <p style={{ margin: '10px 0 4px', fontSize: 13 }}>
          Adds sample records to <strong>{project?.name ?? 'the open project'}</strong> — two switchboards, seven
          tags, a 24-line functional test script and three punch items — built to fail, deliberately, in{' '}
          {EXAMPLE_FAULTS.length} specific ways, one for each rule above.
        </p>
        <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>
          It is not a project and it does not create one. It goes inside the project you have open, beside your own
          records.
        </p>

        <p className="text-secondary" style={{ margin: '0 0 12px', fontSize: 12.5 }}>
          Every row it adds is prefixed <span className="mono">{EXAMPLE_MARK}</span> — the tags, the system codes
          and the punch references — so you can tell them from yours on any screen. Remove deletes exactly the rows
          carrying that prefix and nothing else.
        </p>

        <details style={{ marginBottom: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
            What is wrong with it, on purpose
          </summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5 }}>
            {EXAMPLE_FAULTS.map((f) => (
              <li key={f.rule} style={{ marginBottom: 4 }}>
                {f.what}
                <br />
                <span className="text-secondary mono" style={{ fontSize: 10.5 }}>
                  {f.rule}
                </span>
              </li>
            ))}
          </ul>
        </details>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <form action={addWorkedExample}>
            <button type="submit" className="btn btn-primary" disabled={!project}>
              Add the sample records
            </button>
          </form>
          <form action={removeWorkedExample}>
            <button type="submit" className="btn btn-secondary" disabled={!project}>
              Remove them again
            </button>
          </form>
        </div>
        {!project && (
          <p className="text-secondary" style={{ margin: '10px 0 0', fontSize: 12 }}>
            No project is open, so there is nowhere to put them. Choose one from Projects first.
          </p>
        )}

        {report.length > 0 && (
          <div
            style={{
              marginTop: 14,
              border: '1px solid var(--color-border)',
              borderLeft: `4px solid ${REPORT_TONE[verdict.level]}`,
              borderRadius: 8,
              padding: 14,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: REPORT_TONE[verdict.level] }}>{verdict.title}</div>
            <p style={{ margin: '4px 0 10px', fontSize: 13 }}>{verdict.detail}</p>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 130 }}>Table</th>
                    <th style={{ minWidth: 70 }}>Written</th>
                    <th>What happened</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((o) => (
                    <tr key={o.table}>
                      <td className="mono" style={{ fontSize: 11.5 }}>
                        {o.table}
                      </td>
                      <td
                        style={{
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          color: o.error
                            ? 'var(--color-danger)'
                            : o.dropped.length > 0
                              ? 'var(--color-warning, #a35700)'
                              : 'inherit',
                        }}
                      >
                        {o.wrote} / {o.of}
                      </td>
                      <td className="text-secondary">{outcomeSentence(o)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </details>

      <p className="text-secondary" style={{ margin: '22px 0 0', fontSize: 11.5, fontStyle: 'italic' }}>
        {SITE_RULES_NOTE}
      </p>
    </>
  )
}
