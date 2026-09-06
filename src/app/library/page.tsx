import { getCurrentProject } from '@/lib/project'
import { loadLibrary, targetsForLevel } from '@/data/templates'
import { coverageOf, planApply, applySentence, planEdit, editSentence, candidatesFrom } from '@/lib/templates'
import { LEVELS } from '@/lib/checklist'
import { LevelBadge } from '@/components/LevelBadge'
import { createTemplate, editTemplate, applyTemplate, adoptCandidates } from '@/app/library/actions'

export const dynamic = 'force-dynamic'

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const one = (k: string) => {
    const v = sp[k]
    return Array.isArray(v) ? v[0] : v
  }

  const project = await getCurrentProject()
  const lib = await loadLibrary(project?.id ?? null)

  const candidates = candidatesFrom(
    lib.records.map((r) => ({
      id: r.id,
      item: r.item,
      level: r.level,
      status: r.status,
      subjectId: r.subjectId,
      templateId: r.templateId,
    }))
  )

  const savedRecords = candidates.reduce((n, c) => n + c.records - 1, 0)

  return (
    <>
      <h1 className="page-title">Check library</h1>
      <p className="page-subtitle">
        One definition, many records. Twenty breakers each need their cables torqued, signed and evidenced —
        that is twenty records and it should be. What should not be twenty is the sentence.
      </p>

      {!lib.ready && (
        <div className="alert alert-danger">
          <strong>The library is not installed yet.</strong> Run{' '}
          <span className="mono">week5-part30-check-library.sql</span> in Supabase, then come back. Nothing else
          on the site is affected.
        </div>
      )}

      {one('saved') === 'edited' && (
        <div className="alert" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
          <strong>Definition changed.</strong> {one('rewrote')} unanswered check
          {one('rewrote') === '1' ? '' : 's'} reworded.{' '}
          {Number(one('kept') ?? 0) > 0 &&
            `${one('kept')} that had already been answered were left exactly as signed — they now show on Rule Checks as having drifted.`}
        </div>
      )}
      {one('saved') === 'created' && <div className="alert alert-info">Added to the library.</div>}
      {one('saved') === 'error' && (
        <div className="alert alert-danger">
          <strong>Not saved.</strong> {one('detail')}
        </div>
      )}
      {one('applied') === 'ok' && (
        <div className="alert" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
          <strong>{one('n')} checks created.</strong>{' '}
          {Number(one('have') ?? 0) > 0 && `${one('have')} already had it and were left alone. `}
          {Number(one('wrong') ?? 0) > 0 && `${one('wrong')} were the wrong kind of thing for that level and were skipped.`}
        </div>
      )}
      {one('applied') === 'nothing' && (
        <div className="alert alert-info">
          Nothing created — everything ticked already has that check, or is the wrong kind of thing for its
          level.
        </div>
      )}
      {one('adopt') === 'ok' && (
        <div className="alert" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
          <strong>{one('made')} definitions made</strong> from {one('linked')} existing checks. Their wording was
          left exactly as it is — some have already been answered. Only the link was added.
        </div>
      )}

      {/* ── What already exists, and could be a definition ─────────────── */}
      {candidates.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--color-warning, #a35700)' }}>
          <h2 className="section-title">{candidates.length} checks are already repeated across tags</h2>
          <p style={{ margin: '0 0 4px', fontSize: 13 }}>
            These exist on more than one tag at the same level, word for word or near enough. Making each one a
            definition does not delete anything — the records stay exactly as they are, answers and all. It
            links them, so from then on the wording lives in one place.
          </p>
          <p className="text-secondary" style={{ margin: '0 0 12px', fontSize: 12.5 }}>
            {savedRecords} record{savedRecords === 1 ? '' : 's'} would come under {candidates.length} definition
            {candidates.length === 1 ? '' : 's'}.
          </p>

          <form action={adoptCandidates}>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={{ width: 34 }} />
                    <th>Check</th>
                    <th style={{ minWidth: 70 }}>Level</th>
                    <th style={{ minWidth: 90 }}>On</th>
                    <th style={{ minWidth: 150 }}>Other wordings</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.slice(0, 40).map((c) => (
                    <tr key={`${c.level}|${c.title}`}>
                      <td>
                        <input type="checkbox" name="candidate" value={`${c.level}|${c.title}`} defaultChecked />
                      </td>
                      <td>{c.title}</td>
                      <td>
                        <LevelBadge level={c.level} format="code" />
                      </td>
                      <td className="text-secondary">
                        {c.subjects} tag{c.subjects === 1 ? '' : 's'} · {c.records} records
                      </td>
                      <td className="text-secondary" style={{ fontSize: 11.5 }}>
                        {c.variants.length === 0 ? '—' : c.variants.slice(0, 2).join(' · ')}
                        {c.variants.length > 2 ? ` · +${c.variants.length - 2}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {candidates.length > 40 && (
              <p className="text-secondary" style={{ fontSize: 12 }}>
                Showing the 40 that cover the most records. Adopt these and the rest will still be here.
              </p>
            )}
            <button type="submit" className="btn btn-primary" style={{ marginTop: 10 }}>
              Make definitions from the ticked rows
            </button>
          </form>
        </div>
      )}

      {/* ── The library ────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {lib.templates.map((t) => {
          const cov = coverageOf(t, lib.records)
          const targets = targetsForLevel(lib.targets, t.level)
          const plan = planApply(t, targets, lib.records)
          const edit = planEdit(t, lib.records)

          return (
            <div key={t.id} className="card" style={{ margin: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <LevelBadge level={t.level} format="code" />
                    {t.code && <span className="mono text-secondary" style={{ fontSize: 11.5 }}>{t.code}</span>}
                    {t.section && <span className="text-secondary" style={{ fontSize: 11.5 }}>{t.section}</span>}
                  </div>
                  <div style={{ fontSize: 14.5, fontWeight: 500 }}>{t.title}</div>
                  {t.guidance && (
                    <p className="text-secondary" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
                      {t.guidance}
                    </p>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>
                    {cov.done}/{cov.applied}
                  </div>
                  <div className="text-secondary" style={{ fontSize: 11 }}>
                    done, of {cov.applied} applied
                  </div>
                  {cov.failed > 0 && (
                    <div style={{ fontSize: 11.5, color: 'var(--color-danger)' }}>{cov.failed} failed</div>
                  )}
                  {cov.drifted > 0 && (
                    <div style={{ fontSize: 11.5, color: 'var(--color-warning, #a35700)' }}>
                      {cov.drifted} drifted
                    </div>
                  )}
                </div>
              </div>

              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  Apply to tags — {applySentence(plan)}
                </summary>
                <form action={applyTemplate} style={{ marginTop: 10 }}>
                  <input type="hidden" name="id" value={t.id} />
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                      gap: 6,
                      maxHeight: 240,
                      overflowY: 'auto',
                    }}
                  >
                    {targets.map((target) => {
                      const already = plan.alreadyHave.some((a) => a.id === target.id)
                      return (
                        <label
                          key={target.id}
                          style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, opacity: already ? 0.5 : 1 }}
                        >
                          <input type="checkbox" name="target" value={target.id} disabled={already} />
                          <span className="mono">{target.code}</span>
                          {already && <span className="text-secondary" style={{ fontSize: 10.5 }}>has it</span>}
                        </label>
                      )
                    })}
                  </div>
                  {targets.length === 0 && (
                    <p className="text-secondary" style={{ fontSize: 12.5 }}>
                      Nothing on this project is the right kind of thing for a {t.level} check yet.
                    </p>
                  )}
                  <button type="submit" className="btn btn-primary btn-sm" style={{ marginTop: 10 }}>
                    Apply to the ticked
                  </button>
                </form>
              </details>

              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Change the wording</summary>
                <p className="text-secondary" style={{ fontSize: 12.5, margin: '8px 0' }}>
                  {editSentence(edit)}
                </p>
                <form action={editTemplate} style={{ display: 'grid', gap: 10 }}>
                  <input type="hidden" name="id" value={t.id} />
                  <label className="field">
                    Check
                    <input name="title" defaultValue={t.title} required className="input" />
                  </label>
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                    <label className="field">
                      Reference
                      <input name="code" defaultValue={t.code ?? ''} className="input" />
                    </label>
                    <label className="field">
                      Section
                      <input name="section" defaultValue={t.section ?? ''} className="input" />
                    </label>
                  </div>
                  <label className="field">
                    Guidance — how to do it. Never part of what gets signed.
                    <input name="guidance" defaultValue={t.guidance ?? ''} className="input" />
                  </label>
                  <div>
                    <button type="submit" className="btn btn-secondary btn-sm">
                      Save the definition
                    </button>
                  </div>
                </form>
              </details>
            </div>
          )
        })}
      </div>

      {lib.ready && lib.templates.length === 0 && candidates.length === 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="section-title">The library is empty</h2>
          <p className="text-secondary" style={{ fontSize: 13, margin: 0 }}>
            Add a check below, or import some work first — anything already repeated across two or more tags
            will be offered here as a definition.
          </p>
        </div>
      )}

      {/* ── Add one ────────────────────────────────────────────────────── */}
      <details className="card" style={{ marginTop: 16 }}>
        <summary className="section-title" style={{ cursor: 'pointer', marginBottom: 0 }}>
          Add a check to the library
        </summary>
        <form action={createTemplate} style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          <label className="field">
            Check *
            <input name="title" required placeholder="e.g. All cables properly torqued, double torque marks visible." className="input" />
          </label>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <label className="field">
              Level *
              <select name="level" required className="input" defaultValue="">
                <option value="" disabled>
                  Choose
                </option>
                {LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Reference
              <input name="code" placeholder="e.g. CHK-014" className="input" />
            </label>
            <label className="field">
              Section
              <input name="section" placeholder="e.g. Visual inspection — interior" className="input" />
            </label>
          </div>
          <label className="field">
            Guidance
            <input name="guidance" placeholder="How to do it. Shown to the tester, never part of the check." className="input" />
          </label>
          <div>
            <button type="submit" className="btn btn-primary" disabled={!project || !lib.ready}>
              Add to the library
            </button>
          </div>
        </form>
      </details>

      <p className="text-secondary" style={{ margin: '20px 0 0', fontSize: 11.5, fontStyle: 'italic' }}>
        Changing a definition rewords every check still waiting to be done and leaves every answered one exactly
        as it was signed. A check marked Pass is a statement by a person about a particular sentence; rewriting
        it afterwards would change what they put their name to, months later, with no trace. The ones left
        behind are reported on Rule Checks as having drifted, with both sentences shown.
      </p>
    </>
  )
}
