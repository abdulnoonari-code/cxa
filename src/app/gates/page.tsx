import Link from 'next/link'
import { getCurrentProject } from '@/lib/project'
import { getActor } from '@/lib/audit'
import { can } from '@/lib/roles'
import { loadSubjectIndex } from '@/data/subjects'
import { loadProjectRollup } from '@/data/rollup'
import { loadGates } from '@/data/gates'
import { getSubject, subjectTitle, subjectLabel, SUBJECT_TYPES } from '@/lib/subjects'
import { GATE_TEMPLATES, gateVerdict, gateBadgeClass } from '@/lib/gates'
import { createGate, deleteGate, importGateRules } from './actions'

export const dynamic = 'force-dynamic'

export default async function GatesPage() {
  const project = await getCurrentProject()
  const actor = await getActor(project?.id ?? null)
  const mayEdit = can(actor.role, 'review')
  const mayDelete = can(actor.role, 'manage')

  const index = await loadSubjectIndex(project?.id ?? null)
  const rollup = await loadProjectRollup(project?.id ?? null, index)
  const gates = await loadGates(project?.id ?? null, rollup)

  const subjectOptions = [...index.byKey.values()].sort(
    (a, b) =>
      SUBJECT_TYPES.findIndex((t) => t.value === a.type) - SUBJECT_TYPES.findIndex((t) => t.value === b.type) ||
      subjectTitle(a).localeCompare(subjectTitle(b))
  )

  const passed = gates.filter((g) => g.result.passed).length
  const blocked = gates.filter((g) => g.result.notMet > 0).length
  const incomplete = gates.filter((g) => g.result.notMet === 0 && g.result.unanswered > 0).length

  return (
    <>
      <h1 className="page-title">Readiness Gates</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — the points where a system has to prove itself before it
        may move on. Each gate is a set of rules; most are answered by the records themselves, and the few that no
        record can prove are confirmed by a person.
      </p>

      <div className="alert alert-info">
        <strong>A gate is an assessment, not an authorisation.</strong> CXA reports what the records show. Deciding
        that work may proceed — energizing plant especially — remains with the authorised commissioning and safety
        personnel, and is recorded here as their signature.
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Gates</div>
          <div className="stat-value">{gates.length}</div>
          <div className="stat-note">Open on this project</div>
        </div>
        <div className="stat">
          <div className="stat-label">Records support proceeding</div>
          <div className="stat-value" style={{ color: passed > 0 ? 'var(--color-success)' : undefined }}>
            {passed}
          </div>
          <div className="stat-note">Every mandatory rule met</div>
        </div>
        <div className="stat">
          <div className="stat-label">Not met</div>
          <div className="stat-value" style={{ color: blocked > 0 ? 'var(--color-danger)' : undefined }}>
            {blocked}
          </div>
          <div className="stat-note">Something has failed or is missing</div>
        </div>
        <div className="stat">
          <div className="stat-label">Incomplete</div>
          <div className="stat-value" style={{ color: incomplete > 0 ? 'var(--color-warning)' : undefined }}>
            {incomplete}
          </div>
          <div className="stat-note">Prerequisites nobody has answered</div>
        </div>
      </div>

      {gates.length === 0 && (
        <div className="alert" style={{ marginTop: 20, background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
          <strong>No gates set up yet.</strong> A gate is where work stops until something is proven — mechanical
          completion, ready for commissioning, energization, takeover, handover. Create one against a system below
          and it starts assessing itself immediately from the records you already have.
        </div>
      )}

      {mayEdit && (
        <details className="card" style={{ marginTop: 20 }} open={gates.length === 0}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 15 }}>Set up a gate</summary>
          <form action={createGate} style={{ display: 'grid', gap: 14, marginTop: 16 }}>
            <label className="field">
              Gate
              <select name="gate_key" className="input" defaultValue="energization_ready">
                {GATE_TEMPLATES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name} — {t.rules.length} rules
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1.4fr 1fr' }}>
              <label className="field">
                Applies to
                <select name="subject" className="input" defaultValue={index.root ? `project:${index.root.id}` : ''}>
                  {subjectOptions.map((s) => (
                    <option key={`${s.type}:${s.id}`} value={`${s.type}:${s.id}`}>
                      {subjectLabel(s.type)} · {subjectTitle(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Planned for
                <input name="planned_for" type="datetime-local" className="input" />
              </label>
            </div>
            <div
              style={{
                display: 'grid',
                gap: 10,
                gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                paddingTop: 6,
              }}
            >
              {GATE_TEMPLATES.map((t) => (
                <div key={t.key}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                  <p className="text-secondary" style={{ fontSize: 12, margin: '3px 0 0' }}>
                    {t.note}
                  </p>
                </div>
              ))}
            </div>
            <div>
              <button type="submit" className="btn btn-primary" disabled={!project}>
                Create gate
              </button>
            </div>
          </form>
        </details>
      )}


      {/* ── Excel round trip ─────────────────────────────────────── */}
      {gates.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            Gate requirements in Excel
          </h2>
          <p className="text-secondary" style={{ fontSize: 13.5 }}>
            Every requirement on every gate, in one sheet. Edit it the way your ITP and your utility actually word
            things, then bring it back. Each row carries its own ID, so a row comes back to the right requirement
            even if you rewrite the text completely.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <a href="/gate-requirements/export" className="btn btn-secondary btn-sm">
              Download all gate requirements (.xlsx)
            </a>
          </div>

          {mayEdit && (
            <form
              action={importGateRules}
              style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}
            >
              <label className="field" style={{ flex: '1 1 320px' }}>
                Import gate requirements
                <input type="file" name="file" accept=".xlsx,.xls,.csv" required className="input" />
              </label>
              <button type="submit" className="btn btn-primary">
                Import
              </button>
            </form>
          )}

          <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 14, marginBottom: 0 }}>
            A row that keeps its ID is updated. A new row with the ID left blank is added to whichever gate its
            <em> Gate</em> column names. Put <strong>Y</strong> in <em>Remove</em> to delete one. If any row is
            wrong, <strong>nothing is imported at all</strong> and every bad row is listed in the{' '}
            <Link href="/audit" className="link">
              audit trail
            </Link>{' '}
            by row number.
          </p>
          <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 8, marginBottom: 0 }}>
            An import changes what the requirements <em>are</em>. It never changes whether somebody has confirmed
            one, or who did — a spreadsheet must not be able to mark a permit as issued.
          </p>
        </div>
      )}

      {gates.map((g) => {
        const subject =
          g.subject_type && g.subject_id ? getSubject(index, { type: g.subject_type as never, id: g.subject_id }) : null
        return (
          <div
            key={g.id}
            className="card"
            style={{
              marginTop: 16,
              borderLeft: `4px solid ${
                g.result.notMet > 0
                  ? 'var(--color-danger-solid)'
                  : g.result.passed
                    ? 'var(--color-success-solid)'
                    : 'var(--color-warning-solid, #d97706)'
              }`,
            }}
          >
            <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 5 }}>
                  <span className={gateBadgeClass(g.result)}>{gateVerdict(g.result)}</span>
                  <span className="text-secondary mono" style={{ fontSize: 11.5 }}>
                    {g.result.mandatoryMet}/{g.result.mandatoryTotal} mandatory rules met
                  </span>
                </div>
                <Link href={`/gates/${g.id}`} className="link" style={{ fontWeight: 600, fontSize: 16.5 }}>
                  {g.name}
                </Link>
                <div className="text-secondary" style={{ fontSize: 12.5, marginTop: 3 }}>
                  {subject ? (
                    <>
                      {subjectLabel(subject.type)} · {subjectTitle(subject)}
                    </>
                  ) : (
                    'Whole project'
                  )}
                </div>
              </div>
              <Link href={`/gates/${g.id}`} className="btn btn-secondary btn-sm">
                Open gate
              </Link>
            </div>

            {g.result.blockers.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="text-secondary mono" style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Holding this gate
                </div>
                <ol style={{ margin: 0, paddingLeft: 20 }}>
                  {g.result.blockers.slice(0, 4).map((b, i) => (
                    <li key={i} style={{ fontSize: 13.5, color: 'var(--color-danger)', marginBottom: 4 }}>
                      {b}
                    </li>
                  ))}
                </ol>
                {g.result.blockers.length > 4 && (
                  <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 6, marginBottom: 0 }}>
                    and {g.result.blockers.length - 4} more — open the gate to see all of them.
                  </p>
                )}
              </div>
            )}

            {mayDelete && (
              <form action={deleteGate} style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={g.id} />
                <input type="hidden" name="label" value={g.name} />
                <button type="submit" className="btn-link" style={{ fontSize: 12.5 }}>
                  Remove gate
                </button>
              </form>
            )}
          </div>
        )
      })}
    </>
  )
}
