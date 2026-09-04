import Link from 'next/link'
import { getCurrentProject } from '@/lib/project'
import { loadScripts } from '@/data/scripts'
import { progress, scriptState } from '@/lib/scripts'
import { LevelBadge } from '@/components/LevelBadge'

export const dynamic = 'force-dynamic'

const TONE: Record<string, string> = {
  ok: 'var(--color-success)',
  warning: 'var(--color-warning, #a35700)',
  danger: 'var(--color-danger)',
  plain: 'var(--color-text-secondary)',
}

export default async function ScriptsPage() {
  const project = await getCurrentProject()
  const scripts = await loadScripts(project?.id ?? null)

  return (
    <>
      <h1 className="page-title">Test scripts</h1>
      <p className="page-subtitle">
        Each procedure as it was written — in order, in its sections — rather than as loose checks under a tag.
        Nothing here is stored twice: these are the same records the checklist register holds, sorted back into
        the order somebody works through them.
      </p>

      {scripts.length === 0 && (
        <div className="card">
          <h2 className="section-title">No scripts yet</h2>
          <p className="text-secondary" style={{ fontSize: 13, margin: 0 }}>
            Import one on the Checklists screen — &ldquo;Upload a test script&rdquo;. Checks typed in by hand do
            not appear here, because they are not a procedure and inventing one would be worse than showing
            nothing.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {scripts.map((s) => {
          const state = scriptState(s)
          const pct = progress(s)
          return (
            <Link
              key={s.sheet}
              href={`/scripts/${encodeURIComponent(s.sheet)}`}
              className="card"
              style={{ display: 'block', textDecoration: 'none', color: 'inherit', margin: 0 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{s.sheet}</div>
                  <div className="text-secondary" style={{ fontSize: 12.5, marginTop: 3 }}>
                    {s.subjects.length > 0 ? s.subjects.join(', ') : 'No tag'} · {s.total} lines
                    {s.withEvidence > 0 ? ` · ${s.withEvidence} with a file attached` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <LevelBadge level={s.level} format="code" />
                  <span style={{ fontSize: 22, fontWeight: 700 }}>{pct}%</span>
                </div>
              </div>

              {/* Answered, not passed. Two different questions, and merging
                  them makes a bar that goes down when somebody finds a fault. */}
              <div
                style={{
                  height: 8,
                  borderRadius: 4,
                  background: 'var(--color-border-soft, #eef2f9)',
                  marginTop: 10,
                  overflow: 'hidden',
                }}
              >
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-neutral, #45557a)' }} />
              </div>

              <div style={{ fontSize: 13, marginTop: 8, color: TONE[state.tone], fontWeight: 600 }}>{state.text}</div>
            </Link>
          )
        })}
      </div>
    </>
  )
}
