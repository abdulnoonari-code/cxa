import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { loadProjectRollup, rollupFor } from '@/data/rollup'
import {
  breadcrumb,
  childrenOf,
  getSubject,
  subjectTitle,
  subjectLabel,
  subjectBadgeClass,
  SUBJECT_TYPES,
  type SubjectType,
} from '@/lib/subjects'
import { SubjectMeter, VerdictBadge } from '@/components/SubjectMeter'
import { statusBadgeClass, reviewBadgeClass, reviewLabel, LEVELS } from '@/lib/checklist'
import { resultBadgeClass } from '@/lib/tests'
import { severityBadgeClass, categoryBadgeClass, issueStatusBadgeClass } from '@/lib/issues'
import { inspectionCode, inspectionBadgeClass, releaseLabel, releaseBadgeClass, carriesRelease } from '@/lib/inspection'
import { statusLabel, statusBadgeClass as reqStatusBadge, criticalityBadgeClass, criticalityLabel, displayRef } from '@/lib/requirements'

export const dynamic = 'force-dynamic'

const LENSES = [
  { value: 'overview', label: 'Overview' },
  { value: 'requirements', label: 'Requirements' },
  { value: 'work', label: 'Checks & Tests' },
  { value: 'issues', label: 'Issues' },
  { value: 'history', label: 'History' },
]

function when(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function SubjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; id: string }>
  searchParams: Promise<{ lens?: string }>
}) {
  const { type, id } = await params
  const { lens: lensParam } = await searchParams
  const lens = LENSES.some((l) => l.value === lensParam) ? (lensParam as string) : 'overview'

  const known = SUBJECT_TYPES.some((t) => t.value === type)
  const project = await getCurrentProject()
  const index = await loadSubjectIndex(project?.id ?? null)

  const ref = known ? { type: type as SubjectType, id } : null
  const subject = getSubject(index, ref)

  if (!subject || !ref) {
    return (
      <>
        <h1 className="page-title">Not found</h1>
        <p className="page-subtitle">
          Nothing on this project matches that. It may belong to a different project, or it may have been removed.{' '}
          <Link href="/assets" className="link">
            Back to Assets
          </Link>
          .
        </p>
      </>
    )
  }

  const rollup = await loadProjectRollup(project?.id ?? null, index)
  const r = rollupFor(rollup, ref)
  const trail = breadcrumb(index, ref)
  const children = childrenOf(index, ref)

  // History is drawn from the append-only records, which is what makes it a
  // history rather than a summary: nothing in it can have been edited.
  const { data: auditRows } =
    lens === 'history' && project
      ? await supabase
          .from('audit_log')
          .select('id, actor_name, actor_email, actor_role, action, entity, entity_id, entity_label, old_value, new_value, comment, created_at')
          .eq('project_id', project.id)
          .order('created_at', { ascending: false })
          .limit(400)
      : { data: [] as {
          id: string
          actor_name: string | null
          actor_email: string | null
          actor_role: string | null
          action: string
          entity: string
          entity_id: string | null
          entity_label: string | null
          old_value: string | null
          new_value: string | null
          comment: string | null
          created_at: string
        }[] }

  // An audit line belongs to this subject if it names a record that rolls up
  // into it, or the subject itself.
  const ownIds = new Set<string>([
    subject.id,
    ...r.checks.map((c) => c.id),
    ...r.tests.map((t) => t.id),
    ...r.issues.map((i) => i.id),
    ...r.requirements.map((q) => q.id),
  ])
  const history = (auditRows ?? []).filter((a) => a.entity_id && ownIds.has(a.entity_id))

  const critical = r.readiness.blockers
  const warnings = r.readiness.warnings

  return (
    <>
      {/* ── Breadcrumb ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10, fontSize: 13 }}>
        <Link href="/assets" className="link">
          Assets
        </Link>
        {trail.map((s, n) => (
          <span key={`${s.type}:${s.id}`} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ opacity: 0.4 }}>›</span>
            {n === trail.length - 1 ? (
              <span style={{ fontWeight: 600 }}>{subjectTitle(s)}</span>
            ) : (
              <Link href={`/assets/${s.type}/${s.id}`} className="link">
                {subjectTitle(s)}
              </Link>
            )}
          </span>
        ))}
      </div>

      {/* ── Subject header ─────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span className={subjectBadgeClass(subject.type)}>{subjectLabel(subject.type)}</span>
              {subject.code && <span className="mono tag-id">{subject.code}</span>}
            </div>
            <h1 className="page-title" style={{ margin: 0, fontSize: 27 }}>
              {subject.name}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <VerdictBadge readiness={r.readiness} />
            <SubjectMeter readiness={r.readiness} width={180} />
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 14,
            marginTop: 18,
            paddingTop: 16,
            borderTop: '1px solid var(--color-border, rgba(0,0,0,.08))',
          }}
        >
          {[
            { label: 'Requirements', value: `${r.requirementsVerified}/${r.requirements.length}`, danger: r.requirementsBlocking > 0 },
            { label: 'Checks', value: r.checks.length },
            { label: 'Tests', value: r.tests.length },
            { label: 'Open issues', value: r.openIssues, danger: r.categoryA > 0 },
            { label: 'Held points', value: r.heldPoints, danger: r.heldPoints > 0 },
            { label: 'Beneath this', value: children.length },
          ].map((tile) => (
            <div key={tile.label}>
              <div className="text-secondary mono" style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase' }}>
                {tile.label}
              </div>
              <div
                style={{
                  fontSize: 19,
                  fontWeight: 600,
                  marginTop: 2,
                  color: tile.danger ? 'var(--color-danger)' : undefined,
                }}
              >
                {tile.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Lens tabs ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {LENSES.map((l) => (
          <Link
            key={l.value}
            href={`/assets/${subject.type}/${subject.id}?lens=${l.value}`}
            className={l.value === lens ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
          >
            {l.label}
          </Link>
        ))}
      </div>

      {/* ── OVERVIEW ───────────────────────────────────────────────── */}
      {lens === 'overview' && (
        <>
          {critical.length === 0 && warnings.length === 0 && r.readiness.requirementsTotal === 0 && (
            <div className="alert alert-info">
              Nothing has been recorded against this yet, or anything beneath it. That is not the same as being
              ready — there is simply nothing to assess.
            </div>
          )}

          {critical.length > 0 && (
            <div className="card" style={{ borderLeft: '4px solid var(--color-danger-solid)' }}>
              <h2 className="section-title" style={{ marginTop: 0 }}>
                Why this is blocked
              </h2>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                {critical.map((b, i) => (
                  <li key={i} style={{ color: 'var(--color-danger)', marginBottom: 6, fontSize: 14 }}>
                    {b.text}
                  </li>
                ))}
              </ol>
              <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
                Each of these comes from a record beneath this level. Clear the record and the blocker disappears by
                itself — there is nothing here to tick off.
              </p>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="card" style={{ marginTop: 16, borderLeft: '4px solid var(--color-warning-solid, #d97706)' }}>
              <h2 className="section-title" style={{ marginTop: 0 }}>
                Worth seeing
              </h2>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {warnings.map((w, i) => (
                  <li key={i} style={{ marginBottom: 6, fontSize: 14 }}>
                    {w.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {children.length > 0 && (
            <>
              <h2 className="section-title" style={{ marginTop: 26 }}>
                Beneath this
              </h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>State</th>
                      <th style={{ minWidth: 160 }}>Readiness</th>
                      <th style={{ textAlign: 'right' }}>Open issues</th>
                      <th style={{ textAlign: 'right' }}>Held</th>
                    </tr>
                  </thead>
                  <tbody>
                    {children.map((c) => {
                      const cr = rollupFor(rollup, { type: c.type, id: c.id })
                      return (
                        <tr key={`${c.type}:${c.id}`}>
                          <td>
                            <Link href={`/assets/${c.type}/${c.id}`} className="link" style={{ fontWeight: 500 }}>
                              {subjectTitle(c)}
                            </Link>
                            <div>
                              <span className={subjectBadgeClass(c.type)} style={{ fontSize: 10 }}>
                                {subjectLabel(c.type)}
                              </span>
                            </div>
                          </td>
                          <td>
                            <VerdictBadge readiness={cr.readiness} />
                          </td>
                          <td>
                            <SubjectMeter readiness={cr.readiness} width={100} />
                          </td>
                          <td className="mono" style={{ textAlign: 'right', fontSize: 12.5 }}>
                            {cr.openIssues || '—'}
                          </td>
                          <td className="mono" style={{ textAlign: 'right', fontSize: 12.5 }}>
                            {cr.heldPoints || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ── REQUIREMENTS ───────────────────────────────────────────── */}
      {lens === 'requirements' && (
        <>
          {r.requirements.length === 0 ? (
            <div className="card">
              <p className="text-secondary" style={{ marginBottom: 0, fontSize: 14 }}>
                No requirements recorded against this or anything beneath it. Add them on the{' '}
                <Link href="/requirements" className="link">
                  Requirements
                </Link>{' '}
                page — until an obligation is written down, nothing can prove it has been met.
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th style={{ minWidth: 320 }}>Requirement</th>
                    <th>Criticality</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {r.requirements.map((q, i) => (
                    <tr key={q.id}>
                      <td className="mono" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        {displayRef(q, i)}
                      </td>
                      <td style={{ fontSize: 13.5 }}>{q.statement}</td>
                      <td>
                        <span className={criticalityBadgeClass(q.criticality)}>{criticalityLabel(q.criticality)}</span>
                      </td>
                      <td>
                        <span className={reqStatusBadge(q.status)}>{statusLabel(q.status)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── WORK ───────────────────────────────────────────────────── */}
      {lens === 'work' && (
        <>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            Checks ({r.checks.length})
          </h2>
          {r.checks.length === 0 ? (
            <div className="card">
              <p className="text-secondary" style={{ marginBottom: 0, fontSize: 14 }}>
                No checklist items here yet.
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th style={{ minWidth: 280 }}>Item</th>
                    <th>Level</th>
                    <th>Result</th>
                    <th>Review</th>
                    <th>ITP</th>
                  </tr>
                </thead>
                <tbody>
                  {r.checks.slice(0, 300).map((c) => (
                    <tr key={c.id}>
                      <td className="mono tag-id" style={{ fontSize: 12 }}>
                        {c.tag}
                      </td>
                      <td style={{ fontSize: 13.5 }}>{c.item}</td>
                      <td className="text-secondary" style={{ fontSize: 12 }}>
                        {LEVELS.find((l) => l.value === c.level)?.label.split(' — ')[0] ?? c.level}
                      </td>
                      <td>
                        <span className={statusBadgeClass(c.status)}>{c.status}</span>
                      </td>
                      <td>
                        <span className={reviewBadgeClass(c.review_state)}>{reviewLabel(c.review_state)}</span>
                      </td>
                      <td>
                        {carriesRelease(c.inspection_type) ? (
                          <>
                            <span className={inspectionBadgeClass(c.inspection_type)}>
                              {inspectionCode(c.inspection_type)}
                            </span>{' '}
                            <span className={releaseBadgeClass(c.release)}>{releaseLabel(c.release)}</span>
                          </>
                        ) : (
                          <span className="text-secondary">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="section-title" style={{ marginTop: 28 }}>
            Tests ({r.tests.length})
          </h2>
          {r.tests.length === 0 ? (
            <div className="card">
              <p className="text-secondary" style={{ marginBottom: 0, fontSize: 14 }}>
                No test records here yet.
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th style={{ minWidth: 280 }}>Test</th>
                    <th>Result</th>
                    <th>Approval</th>
                    <th>ITP</th>
                  </tr>
                </thead>
                <tbody>
                  {r.tests.slice(0, 300).map((t) => (
                    <tr key={t.id}>
                      <td className="mono tag-id" style={{ fontSize: 12 }}>
                        {t.tag}
                      </td>
                      <td style={{ fontSize: 13.5 }}>
                        {t.test_ref ? <span className="mono">{t.test_ref} · </span> : ''}
                        {t.name}
                      </td>
                      <td>
                        <span className={resultBadgeClass(t.result)}>{t.result}</span>
                      </td>
                      <td>
                        <span className={reviewBadgeClass(t.approval_state)}>{reviewLabel(t.approval_state)}</span>
                      </td>
                      <td>
                        {carriesRelease(t.inspection_type) ? (
                          <>
                            <span className={inspectionBadgeClass(t.inspection_type)}>
                              {inspectionCode(t.inspection_type)}
                            </span>{' '}
                            <span className={releaseBadgeClass(t.release)}>{releaseLabel(t.release)}</span>
                          </>
                        ) : (
                          <span className="text-secondary">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── ISSUES ─────────────────────────────────────────────────── */}
      {lens === 'issues' && (
        <>
          {r.issues.length === 0 ? (
            <div className="card">
              <p className="text-secondary" style={{ marginBottom: 0, fontSize: 14 }}>
                No issues raised against this or anything beneath it.
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 320 }}>Issue</th>
                    <th>Category</th>
                    <th>Severity</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {r.issues.map((i) => (
                    <tr key={i.id}>
                      <td style={{ fontSize: 13.5 }}>{i.title}</td>
                      <td>
                        {i.category ? (
                          <span className={categoryBadgeClass(i.category)}>{i.category}</span>
                        ) : (
                          <span className="badge badge-neutral">none</span>
                        )}
                      </td>
                      <td>
                        <span className={severityBadgeClass(i.severity)}>{i.severity}</span>
                      </td>
                      <td>
                        <span className={issueStatusBadgeClass(i.status)}>{i.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── HISTORY ────────────────────────────────────────────────── */}
      {lens === 'history' && (
        <>
          <p className="text-secondary" style={{ fontSize: 13, marginTop: -6 }}>
            Everything that has happened to this and everything beneath it, newest first. Drawn from the audit log,
            which the database will not allow anyone to edit or delete.
          </p>
          {history.length === 0 ? (
            <div className="card">
              <p className="text-secondary" style={{ marginBottom: 0, fontSize: 14 }}>
                Nothing recorded against this yet.
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ whiteSpace: 'nowrap' }}>When</th>
                    <th>Who</th>
                    <th>What</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 200).map((h) => (
                    <tr key={h.id}>
                      <td className="mono" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                        {when(h.created_at)}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        <div>{h.actor_name || h.actor_email}</div>
                        <div className="text-secondary" style={{ fontSize: 11 }}>
                          {h.actor_role}
                        </div>
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {h.action}
                        {h.entity_label && (
                          <div className="text-secondary" style={{ fontSize: 11.5 }}>
                            {h.entity_label}
                          </div>
                        )}
                      </td>
                      <td className="text-secondary" style={{ fontSize: 12 }}>
                        {h.old_value && h.new_value
                          ? `${h.old_value} → ${h.new_value}`
                          : h.new_value ?? h.old_value ?? '—'}
                        {h.comment && <div style={{ marginTop: 3 }}>{h.comment}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}
