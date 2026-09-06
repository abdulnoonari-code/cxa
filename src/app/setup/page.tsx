import { runSetupProbes } from '@/data/setup-checks'
import { countStates, setupHeadline } from '@/lib/setup-checks'
import { USING_SERVICE_ROLE } from '@/lib/supabase'
import { probeAnonAccess, accessVerdict } from '@/lib/db-access'
import { aiConfigured } from '@/lib/ai'

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
