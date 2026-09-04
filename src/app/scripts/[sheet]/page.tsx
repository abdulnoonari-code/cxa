import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCurrentProject } from '@/lib/project'
import { loadScript } from '@/data/scripts'
import { loadProjectLinkContext, contextFor } from '@/data/check-links'
import { progress, scriptState } from '@/lib/scripts'
import { STATUSES } from '@/lib/checklist'
import { statusBadgeClass } from '@/lib/checklist'
import { LevelBadge } from '@/components/LevelBadge'
import CheckDetail from '@/components/CheckDetail'
import { answerLine } from '@/app/scripts/actions'

export const dynamic = 'force-dynamic'

const TONE: Record<string, string> = {
  ok: 'var(--color-success)',
  warning: 'var(--color-warning, #a35700)',
  danger: 'var(--color-danger)',
  plain: 'var(--color-text-secondary)',
}

/**
 * One script, top to bottom.
 *
 * The screen a tester actually stands in front of. Everything about it is
 * chosen for somebody holding a phone next to a switchboard:
 *
 *   • The answer is three buttons, not a dropdown. A dropdown on a phone is
 *     two taps and a scroll, two hundred times.
 *   • The page returns to the line you answered, not to the top.
 *   • Nothing is hidden behind an expander. A procedure you have to open
 *     line by line is a procedure nobody reads ahead in, and reading ahead is
 *     how a tester knows to leave the panel open.
 */
export default async function ScriptPage({ params }: { params: Promise<{ sheet: string }> }) {
  const { sheet: raw } = await params
  const sheet = decodeURIComponent(raw)

  const project = await getCurrentProject()
  const [script, linkCtx] = await Promise.all([
    loadScript(project?.id ?? null, sheet),
    loadProjectLinkContext(project?.id ?? null),
  ])

  if (!script) notFound()

  const state = scriptState(script)
  const pct = progress(script)

  return (
    <>
      <p style={{ margin: '0 0 6px' }}>
        <Link href="/scripts" className="text-secondary" style={{ fontSize: 12.5 }}>
          ← All test scripts
        </Link>
      </p>
      <h1 className="page-title" style={{ marginBottom: 4 }}>
        {script.sheet}
      </h1>
      <p className="page-subtitle" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <LevelBadge level={script.level} format="full" />
        <span>{script.subjects.length > 0 ? script.subjects.join(', ') : 'No tag'}</span>
      </p>

      <div className="card">
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{pct}%</div>
            <div className="text-secondary" style={{ fontSize: 11.5 }}>
              answered
            </div>
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, color: script.failed > 0 ? 'var(--color-danger)' : 'inherit' }}>
              {script.failed}
            </div>
            <div className="text-secondary" style={{ fontSize: 11.5 }}>
              failed
            </div>
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{script.na}</div>
            <div className="text-secondary" style={{ fontSize: 11.5 }}>
              not applicable
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: TONE[state.tone] }}>{state.text}</div>
            <div className="text-secondary" style={{ fontSize: 11.5 }}>
              {script.withEvidence} of {script.total} have a file attached.
            </div>
          </div>
        </div>
      </div>

      {script.sections.map((section) => (
        <div key={section.path} style={{ marginTop: 22 }}>
          {section.path && (
            <h2 className="section-title" style={{ marginBottom: 10 }}>
              {section.path}
            </h2>
          )}

          <div style={{ display: 'grid', gap: 10 }}>
            {section.checks.map((c) => (
              <div
                key={c.id}
                id={`check-${c.id}`}
                style={{
                  border: '1px solid var(--color-border)',
                  borderLeft: `4px solid ${
                    c.status === 'fail'
                      ? 'var(--color-danger)'
                      : c.status === 'pass'
                        ? 'var(--color-success)'
                        : c.status === 'na'
                          ? 'var(--color-neutral-solid, #b9c8e0)'
                          : 'var(--color-border)'
                  }`,
                  borderRadius: 10,
                  padding: 14,
                  background: 'var(--color-surface)',
                  scrollMarginTop: 20,
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <span
                      className="mono text-secondary"
                      style={{ fontSize: 12, minWidth: 34, paddingTop: 2, fontWeight: 600 }}
                    >
                      {c.serial ?? '—'}
                    </span>
                    <span style={{ fontSize: 14.5 }}>{c.item}</span>
                  </div>
                  <span className={statusBadgeClass(c.status ?? 'pending')} style={{ whiteSpace: 'nowrap' }}>
                    {STATUSES.find((s) => s.value === c.status)?.label ?? 'Pending'}
                  </span>
                </div>

                <form action={answerLine} style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="sheet" value={script.sheet} />

                  {/* Three buttons, in the words the sheet used. A "Yes / No /
                      N A" script must not ask for "Pass" — the tester is
                      copying from a form and the words have to match it. */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      ['pass', (c.answerType ?? '').startsWith('Pass') ? 'Pass' : 'Yes'],
                      ['fail', (c.answerType ?? '').startsWith('Pass') ? 'Fail' : 'No'],
                      ['na', 'N/A'],
                      ['pending', 'Not done'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="submit"
                        name="status"
                        value={value}
                        className={c.status === value ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <input
                    key={`r-${c.id}-${c.notes ?? ''}`}
                    name="notes"
                    defaultValue={c.notes ?? ''}
                    placeholder="Remark — what actually happened"
                    className="input"
                    style={{ fontSize: 13 }}
                  />
                </form>

                <CheckDetail
                  check={{
                    serial_no: c.serial,
                    section_path: null,
                    evidence_ref: c.evidenceRef,
                    links_to: c.links,
                    answer_type: c.answerType,
                  }}
                  ctx={contextFor(linkCtx, c.sourceRef)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
