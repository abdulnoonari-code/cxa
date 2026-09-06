import { runSetupProbes } from '@/data/setup-checks'
import { countStates, setupHeadline } from '@/lib/setup-checks'
import { USING_SERVICE_ROLE } from '@/lib/supabase'
import { probeAnonAccess, accessVerdict } from '@/lib/db-access'
import { aiConfigured } from '@/lib/ai'
import { createWorkedExample } from '@/app/setup/example-actions'
import { EXAMPLE_FAULTS, EXAMPLE_PROJECT } from '@/lib/example-plan'

export const dynamic = 'force-dynamic'

const STATE: Record<string, { color: string; word: string }> = {
  'in place': { color: 'var(--color-success)', word: 'In place' },
  missing: { color: 'var(--color-danger)', word: 'Not run yet' },
  unknown: { color: 'var(--color-warning, #a35700)', word: 'Could not tell' },
}

export default async function SetupPage() {
  const [results, anon] = await Promise.all([runSetupProbes(), probeAnonAccess(false)])
  const n = countStates(results)
  const access = accessVerdict(USING_SERVICE_ROLE, anon)
  const aiOn = aiConfigured()

  return (
    <>
      <h1 className="page-title">Setup</h1>
      <p className="page-subtitle">
        What is actually in place, asked of the database each time this page opens. Nothing here is read from a
        setting or a list of what was supposed to have happened.
      </p>

      <div className="card">
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, color: n.missing > 0 ? 'var(--color-danger)' : 'inherit' }}>
              {n.ok}/{results.length}
            </div>
            <div className="text-secondary" style={{ fontSize: 11.5 }}>
              SQL steps in place
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{setupHeadline(results)}</div>
            <div className="text-secondary" style={{ fontSize: 12 }}>
              Each row below names the file to run. Every one is safe to run twice.
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title">Database steps</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 160 }}>Step</th>
                <th style={{ minWidth: 110 }}>State</th>
                <th style={{ minWidth: 230 }}>Run this if it is missing</th>
                <th>What it is for</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.step.id}>
                  <td style={{ fontWeight: 600 }}>{r.step.title}</td>
                  <td style={{ color: STATE[r.state].color, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {STATE[r.state].word}
                    {r.state === 'unknown' && r.detail && (
                      <div className="text-secondary mono" style={{ fontSize: 10, fontWeight: 400 }}>
                        {r.detail.slice(0, 60)}
                      </div>
                    )}
                  </td>
                  <td className="mono" style={{ fontSize: 11.5 }}>
                    {r.state === 'in place' ? <span className="text-secondary">—</span> : r.step.source}
                  </td>
                  <td className="text-secondary" style={{ fontSize: 12.5 }}>
                    {r.step.matters}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-secondary" style={{ margin: '10px 0 0', fontSize: 11.5, fontStyle: 'italic' }}>
          Each step is checked by selecting the exact columns it adds, not by looking for the table. A table
          that exists with none of its new columns would otherwise report as done.
        </p>
      </div>

      <div
        className="card"
        style={{
          marginTop: 16,
          borderLeft: `4px solid ${access.level === 'danger' ? 'var(--color-danger)' : 'var(--color-border)'}`,
        }}
      >
        <h2 className="section-title">Who can reach the data</h2>
        <div style={{ fontSize: 14, fontWeight: 600, color: access.level === 'danger' ? 'var(--color-danger)' : 'inherit' }}>
          {access.title}
        </div>
        <p className="text-secondary" style={{ margin: '4px 0 0', fontSize: 13 }}>
          {access.detail}
        </p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title">A worked example</h2>
        <p style={{ margin: '0 0 4px', fontSize: 13 }}>
          A switchboard, two systems, seven tags, a functional test script and a punch list, created in its own
          project called <strong>{EXAMPLE_PROJECT.name}</strong>. Nothing touches the project you have open.
        </p>
        <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>
          It is not a demonstration of a well-run job. It is built to fail, deliberately, in {EXAMPLE_FAULTS.length}{' '}
          specific ways — one for each rule — so that Rule Checks shows what every finding looks like on real
          records instead of an empty page.
        </p>

        <details style={{ marginBottom: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
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

        <form action={createWorkedExample}>
          <button type="submit" className="btn btn-primary">
            Create the worked example
          </button>
        </form>
        <p className="text-secondary" style={{ margin: '10px 0 0', fontSize: 11.5, fontStyle: 'italic' }}>
          Delete it whole from All Projects when you are done — the password-confirmed project delete removes
          every record with it. Press the button twice and you get two example projects, not a doubled one.
        </p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title">AI features</h2>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{aiOn ? 'A key is set' : 'Switched off — no key'}</div>
        <p className="text-secondary" style={{ margin: '4px 0 0', fontSize: 13 }}>
          {aiOn
            ? 'The assessment panels on defects, obligations and documents will run and will be charged for.'
            : 'The assessment panels are off. Everything on the Rule Checks page works without this and always will — the rules cost nothing and are not affected.'}
        </p>
        <p className="text-secondary" style={{ margin: '8px 0 0', fontSize: 11.5, fontStyle: 'italic' }}>
          Only whether a key is present is reported. The key itself is never read into a page, a log or a table.
        </p>
      </div>
    </>
  )
}
