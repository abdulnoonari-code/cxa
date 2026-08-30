import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { getActor } from '@/lib/audit'
import { can } from '@/lib/roles'
import { loadSubjectIndex } from '@/data/subjects'
import { loadRequirementRegister } from '@/data/requirements'
import { breadcrumb, subjectTitle, subjectBadgeClass, subjectLabel, SUBJECT_TYPES } from '@/lib/subjects'
import {
  SOURCE_KINDS,
  VERIFICATION_METHODS,
  CRITICALITIES,
  sourceLabel,
  methodLabel,
  criticalityBadgeClass,
  criticalityLabel,
  statusLabel,
  statusBadgeClass,
  isBlocking,
  displayRef,
} from '@/lib/requirements'
import { addRequirement, deleteRequirement, linkVerification, unlinkVerification, acceptRevision } from './actions'

export const dynamic = 'force-dynamic'

export default async function RequirementsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; criticality?: string; source?: string }>
}) {
  const { status: statusFilter, criticality: critFilter, source: sourceFilter } = await searchParams

  const project = await getCurrentProject()
  const actor = await getActor(project?.id ?? null)
  const mayEdit = can(actor.role, 'review')
  const mayDelete = can(actor.role, 'manage')

  const [index, register] = await Promise.all([
    loadSubjectIndex(project?.id ?? null),
    loadRequirementRegister(project?.id ?? null),
  ])

  const { requirements, documents, revisionsByDocument } = register
  const docById = new Map(documents.map((d) => [d.id, d]))

  // Everything that could verify a requirement, offered in one picker.
  const { data: checkRows } = project
    ? await supabase
        .from('checklist_items')
        .select('id, item, level, equipment_id')
        .eq('project_id', project.id)
        .order('level')
        .limit(400)
    : { data: [] as { id: string; item: string; level: string; equipment_id: string | null }[] }

  const { data: testRows } = project
    ? await supabase
        .from('test_records')
        .select('id, name, test_ref, equipment_id')
        .eq('project_id', project.id)
        .order('created_at')
        .limit(400)
    : { data: [] as { id: string; name: string; test_ref: string | null; equipment_id: string | null }[] }

  const checks = checkRows ?? []
  const tests = testRows ?? []

  const subjectOptions = [...index.byKey.values()].sort(
    (a, b) =>
      SUBJECT_TYPES.findIndex((t) => t.value === a.type) - SUBJECT_TYPES.findIndex((t) => t.value === b.type) ||
      subjectTitle(a).localeCompare(subjectTitle(b))
  )

  const counts = {
    total: requirements.length,
    verified: requirements.filter((r) => r.status === 'verified').length,
    failed: requirements.filter((r) => r.status === 'failed').length,
    unplanned: requirements.filter((r) => r.status === 'not_planned').length,
    stale: requirements.filter((r) => r.staleSource).length,
    blocking: requirements.filter((r) => isBlocking(r.status, r.criticality)).length,
  }

  let listed = requirements
  if (statusFilter) listed = listed.filter((r) => r.status === statusFilter)
  if (critFilter) listed = listed.filter((r) => (r.criticality ?? 'normal') === critFilter)
  if (sourceFilter) listed = listed.filter((r) => r.source_kind === sourceFilter)

  const percent = counts.total > 0 ? Math.round((counts.verified / counts.total) * 100) : 0

  return (
    <>
      <h1 className="page-title">Requirements</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — every stated obligation on this project, where it came
        from, and what proves it has been met. This is the spine every check, test, gate and dossier hangs from.
      </p>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Requirements</div>
          <div className="stat-value">{counts.total}</div>
          <div className="stat-note">On the register</div>
        </div>
        <div className="stat">
          <div className="stat-label">Verified</div>
          <div className="stat-value" style={{ color: 'var(--color-success)' }}>
            {percent}%
          </div>
          <div className="stat-note">
            {counts.verified} of {counts.total} proven and approved
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Blocking</div>
          <div className="stat-value" style={{ color: counts.blocking > 0 ? 'var(--color-danger)' : undefined }}>
            {counts.blocking}
          </div>
          <div className="stat-note">Failed, or critical and unproven</div>
        </div>
        <div className="stat">
          <div className="stat-label">Source revised</div>
          <div className="stat-value" style={{ color: counts.stale > 0 ? 'var(--color-warning)' : undefined }}>
            {counts.stale}
          </div>
          <div className="stat-note">Cite a superseded revision</div>
        </div>
      </div>

      {counts.total === 0 && (
        <div className="alert alert-info" style={{ marginTop: 20 }}>
          <strong>The register is empty.</strong> A requirement is any statement your contract, specification, ITP
          or OEM manual makes about how something must be. Once one is here you can link the checks and tests that
          prove it, and the app can answer &ldquo;what proves this system is finished?&rdquo; instead of only
          &ldquo;what have we ticked?&rdquo; Add controlled documents first on{' '}
          <Link href="/doc-control" className="link">
            Document Control
          </Link>{' '}
          so each requirement can cite a source and a revision.
        </div>
      )}

      {counts.stale > 0 && (
        <div className="alert" style={{ marginTop: 20, background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
          <strong>
            {counts.stale} requirement{counts.stale === 1 ? '' : 's'} cite{counts.stale === 1 ? 's' : ''} a revision
            that is no longer the effective one.
          </strong>{' '}
          A newer revision of the source document has been issued. Each one needs re-reading against the new
          revision before it can still be relied on — they are marked below.
        </div>
      )}

      {mayEdit && (
        <details className="card" style={{ marginTop: 20 }} open={counts.total === 0}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 15 }}>Add a requirement</summary>
          <form action={addRequirement} style={{ display: 'grid', gap: 14, marginTop: 16 }}>
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '140px 1fr' }}>
              <label className="field">
                Reference
                <input name="ref" className="input" placeholder="REQ-001" />
              </label>
              <label className="field">
                Requirement *
                <input
                  name="statement"
                  required
                  className="input"
                  placeholder="Circuit breaker contact resistance shall not exceed the specified acceptance limit"
                />
              </label>
            </div>

            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr 1fr' }}>
              <label className="field">
                Applies to
                <select name="subject" className="input" defaultValue={index.root ? `project:${index.root.id}` : ''}>
                  <option value="">Not assigned</option>
                  {subjectOptions.map((s) => (
                    <option key={`${s.type}:${s.id}`} value={`${s.type}:${s.id}`}>
                      {subjectLabel(s.type)} · {subjectTitle(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Source
                <select name="source_kind" className="input" defaultValue="specification">
                  {SOURCE_KINDS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Source document
                <select name="document_id" className="input" defaultValue="">
                  <option value="">None cited</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.doc_number}
                      {d.title ? ` — ${d.title}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
              <label className="field">
                Revision
                <input name="source_revision" className="input" placeholder="Rev 4" />
              </label>
              <label className="field">
                Clause
                <input name="clause" className="input" placeholder="7.3.2" />
              </label>
              <label className="field">
                Verified by
                <select name="verification_method" className="input" defaultValue="test">
                  {VERIFICATION_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Criticality
                <select name="criticality" className="input" defaultValue="normal">
                  {CRITICALITIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field">
              Acceptance criteria
              <input name="acceptance" className="input" placeholder="≤ 50 µΩ per pole at 20°C" />
            </label>

            <div>
              <button type="submit" className="btn btn-primary" disabled={!project}>
                Add to register
              </button>
            </div>
          </form>
        </details>
      )}

      {/* ── Filters ──────────────────────────────────────────────── */}
      {counts.total > 0 && (
        <form method="get" style={{ display: 'flex', gap: 10, alignItems: 'flex-end', margin: '22px 0 8px' }}>
          <label className="field" style={{ minWidth: 190 }}>
            Status
            <select name="status" defaultValue={statusFilter ?? ''} className="input">
              <option value="">All statuses</option>
              <option value="verified">Verified</option>
              <option value="unapproved">Passed, awaiting approval</option>
              <option value="in_progress">In progress</option>
              <option value="planned">Planned</option>
              <option value="failed">Failed</option>
              <option value="not_planned">No verification planned</option>
            </select>
          </label>
          <label className="field" style={{ minWidth: 150 }}>
            Criticality
            <select name="criticality" defaultValue={critFilter ?? ''} className="input">
              <option value="">All</option>
              {CRITICALITIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ minWidth: 180 }}>
            Source
            <select name="source" defaultValue={sourceFilter ?? ''} className="input">
              <option value="">All sources</option>
              {SOURCE_KINDS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-secondary">
            Filter
          </button>
          {(statusFilter || critFilter || sourceFilter) && (
            <Link href="/requirements" className="btn-link">
              Clear
            </Link>
          )}
        </form>
      )}

      {/* ── The register ─────────────────────────────────────────── */}
      {listed.map((r, i) => {
        const doc = r.document_id ? docById.get(r.document_id) : null
        const revs = r.document_id ? revisionsByDocument.get(r.document_id) ?? [] : []
        const subject = r.subject_type && r.subject_id
          ? breadcrumb(index, { type: r.subject_type as never, id: r.subject_id })
          : []
        const blocking = isBlocking(r.status, r.criticality)

        return (
          <div
            key={r.id}
            className="card"
            style={{
              marginBottom: 14,
              borderLeft: `4px solid ${
                blocking
                  ? 'var(--color-danger-solid)'
                  : r.status === 'verified'
                    ? 'var(--color-success-solid)'
                    : 'var(--color-neutral-solid)'
              }`,
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <span className="mono tag-id">{displayRef(r, i)}</span>
              <span className={statusBadgeClass(r.status)}>{statusLabel(r.status)}</span>
              <span className={criticalityBadgeClass(r.criticality)}>{criticalityLabel(r.criticality)}</span>
              <span className="badge badge-neutral">{methodLabel(r.verification_method)}</span>
              {r.staleSource && <span className="badge badge-warning">Source revised</span>}
            </div>

            <div style={{ fontWeight: 600, fontSize: 15.5, lineHeight: 1.45 }}>{r.statement}</div>

            {r.acceptance && (
              <div className="text-secondary" style={{ fontSize: 13.5, marginTop: 6 }}>
                <strong>Acceptance:</strong> {r.acceptance}
              </div>
            )}

            {/* Where it came from, and what it is about */}
            <div className="text-secondary" style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.6 }}>
              <div>
                <strong>Source:</strong> {sourceLabel(r.source_kind)}
                {doc ? ` · ${doc.doc_number}` : ''}
                {r.source_revision ? ` · ${r.source_revision}` : ''}
                {r.clause ? ` · clause ${r.clause}` : ''}
              </div>
              {subject.length > 0 && (
                <div style={{ marginTop: 3 }}>
                  <strong>Applies to:</strong>{' '}
                  {subject.map((s, n) => (
                    <span key={`${s.type}:${s.id}`}>
                      {n > 0 && <span style={{ opacity: 0.45 }}> › </span>}
                      <span className={n === subject.length - 1 ? subjectBadgeClass(s.type) : ''}>
                        {subjectTitle(s)}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Stale revision — the §7 impact question, answered per requirement */}
            {r.staleSource && mayEdit && (
              <div
                style={{
                  marginTop: 12,
                  padding: '10px 12px',
                  borderRadius: 6,
                  background: 'var(--color-warning-bg)',
                }}
              >
                <div style={{ fontSize: 13, marginBottom: 8 }}>
                  This cites <strong>{r.source_revision}</strong>, but <strong>{r.effectiveRev}</strong> is now the
                  effective revision. Re-read the clause against the new revision before relying on this.
                </div>
                <form action={acceptRevision} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="previous" value={r.source_revision ?? ''} />
                  <input type="hidden" name="label" value={displayRef(r, i)} />
                  <select name="rev" className="input" defaultValue={r.effectiveRev ?? ''} style={{ maxWidth: 160 }}>
                    {revs.map((rev) => (
                      <option key={rev.id} value={rev.rev}>
                        {rev.rev}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn btn-secondary btn-sm">
                    Re-read &amp; accept
                  </button>
                </form>
              </div>
            )}

            {/* What proves it — the thread, forward */}
            <div style={{ marginTop: 14 }}>
              <div className="text-secondary mono" style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                Verified by
              </div>
              {r.activities.length > 0 ? (
                <div style={{ display: 'grid', gap: 5 }}>
                  {r.activities.map((a) => (
                    <div
                      key={`${a.kind}-${a.id}`}
                      style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, flexWrap: 'wrap' }}
                    >
                      <span className="badge badge-neutral">{a.kind === 'test_record' ? 'test' : 'check'}</span>
                      <span>{a.label}</span>
                      <span
                        className={
                          a.result === 'pass'
                            ? 'badge badge-success'
                            : a.result === 'fail'
                              ? 'badge badge-danger'
                              : 'badge badge-warning'
                        }
                      >
                        {a.result}
                      </span>
                      {a.approval === 'approved' && <span className="badge badge-info">approved</span>}
                      {mayEdit && (
                        <form action={unlinkVerification}>
                          <input type="hidden" name="requirement_id" value={r.id} />
                          <input type="hidden" name="activity_kind" value={a.kind} />
                          <input type="hidden" name="activity_id" value={a.id} />
                          <input type="hidden" name="label" value={displayRef(r, i)} />
                          <input type="hidden" name="activity_label" value={a.label} />
                          <button type="submit" className="btn-link" style={{ fontSize: 12 }}>
                            unlink
                          </button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-secondary" style={{ fontSize: 13, margin: 0 }}>
                  Nothing linked yet — so nothing proves this requirement. It will never show as verified until a
                  check or a test is linked to it.
                </p>
              )}

              {mayEdit && (checks.length > 0 || tests.length > 0) && (
                <form action={linkVerification} style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <input type="hidden" name="requirement_id" value={r.id} />
                  <input type="hidden" name="label" value={displayRef(r, i)} />
                  <select name="activity" className="input" defaultValue="" style={{ maxWidth: 420 }}>
                    <option value="">Link a check or test that proves this…</option>
                    {checks.length > 0 && (
                      <optgroup label="Checklist items">
                        {checks.map((c) => (
                          <option key={c.id} value={`checklist_item:${c.id}`}>
                            {c.item}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {tests.length > 0 && (
                      <optgroup label="Test records">
                        {tests.map((t) => (
                          <option key={t.id} value={`test_record:${t.id}`}>
                            {t.test_ref ? `${t.test_ref} · ${t.name}` : t.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <button type="submit" className="btn btn-secondary btn-sm">
                    Link
                  </button>
                </form>
              )}
            </div>

            {mayDelete && (
              <form action={deleteRequirement} style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="label" value={displayRef(r, i)} />
                <button type="submit" className="btn-link" style={{ fontSize: 12.5 }}>
                  Remove from register
                </button>
              </form>
            )}
          </div>
        )
      })}

      {counts.total > 0 && listed.length === 0 && (
        <div className="card">
          <p className="text-secondary" style={{ marginBottom: 0, fontSize: 14 }}>
            No requirements match that filter.{' '}
            <Link href="/requirements" className="link">
              Clear it
            </Link>
            .
          </p>
        </div>
      )}
    </>
  )
}
