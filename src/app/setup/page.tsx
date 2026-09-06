import { supabase, USING_SERVICE_ROLE } from '@/lib/supabase'
import { runSetupProbes } from '@/data/setup-checks'
import { countStates, setupHeadline } from '@/lib/setup-checks'
import { probeAnonAccess, accessVerdict } from '@/lib/db-access'
import { aiConfigured } from '@/lib/ai'

export const dynamic = 'force-dynamic'

const STATE: Record<string, { color: string; word: string }> = {
  'in place': { color: 'var(--color-success)', word: 'In place' },
  missing: { color: 'var(--color-danger)', word: 'Not run yet' },
  unknown: { color: 'var(--color-warning, #a35700)', word: 'Could not tell' },
}

export default async function SetupPage() {
  // Whether any project exists at all, asked with the SERVER key — which is
  // the whole reason this panel can be sure of anything.
  //
  // With the database closed, a read by the browser key comes back as an
  // empty list rather than an error, and an empty list is ambiguous: it means
  // "refused" if there is something to read and "correct" if there is not.
  // This page was passing `false` — "I do not know whether there are rows" —
  // so it could only ever answer "could not tell", while the Project Details
  // panel, which does know, was answering "the browser key cannot reach the
  // data" on the same site at the same moment.
  //
  // Two panels disagreeing about the same question is worse than either
  // answer alone, so this one is now told what the other one knows.
  const [results, projectCount] = await Promise.all([
    runSetupProbes(),
    supabase.from('projects').select('id', { count: 'exact', head: true }),
  ])
  const anyProject = (projectCount.count ?? 0) > 0
  const anon = await probeAnonAccess(anyProject)
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
        {/* Always printed, whatever the probe found. Somebody who has just put
            the key into Vercel comes to this panel to check it took, and until
            now the only sentence here was about the other key entirely. */}
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 13,
            fontWeight: 600,
            color: USING_SERVICE_ROLE ? 'var(--color-success)' : 'var(--color-danger)',
          }}
        >
          {access.serverKey}
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
