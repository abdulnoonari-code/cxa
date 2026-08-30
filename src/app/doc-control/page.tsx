import Link from 'next/link'
import { getCurrentProject } from '@/lib/project'
import { getActor } from '@/lib/audit'
import { can } from '@/lib/roles'
import { loadSubjectIndex } from '@/data/subjects'
import { loadDocuments, loadRequirementRegister } from '@/data/requirements'
import { subjectTitle, subjectLabel, SUBJECT_TYPES } from '@/lib/subjects'
import {
  DOC_TYPES,
  REVISION_STATUSES,
  docTypeLabel,
  revisionStatusLabel,
  revisionBadgeClass,
  effectiveRevision,
} from '@/lib/requirements'
import { addDocument, addRevision, deleteDocument } from './actions'

export const dynamic = 'force-dynamic'

function when(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
}

export default async function DocumentControlPage() {
  const project = await getCurrentProject()
  const actor = await getActor(project?.id ?? null)
  const mayEdit = can(actor.role, 'review')
  const mayDelete = can(actor.role, 'manage')

  const [index, docs, register] = await Promise.all([
    loadSubjectIndex(project?.id ?? null),
    loadDocuments(project?.id ?? null),
    loadRequirementRegister(project?.id ?? null),
  ])

  const { documents, revisionsByDocument } = docs

  // How many requirements each document carries, and how many of those are now
  // out of date — the reason this page exists rather than a plain file list.
  const citedBy = new Map<string, { total: number; stale: number }>()
  for (const r of register.requirements) {
    if (!r.document_id) continue
    const entry = citedBy.get(r.document_id) ?? { total: 0, stale: 0 }
    entry.total += 1
    if (r.staleSource) entry.stale += 1
    citedBy.set(r.document_id, entry)
  }

  const subjectOptions = [...index.byKey.values()].sort(
    (a, b) =>
      SUBJECT_TYPES.findIndex((t) => t.value === a.type) - SUBJECT_TYPES.findIndex((t) => t.value === b.type) ||
      subjectTitle(a).localeCompare(subjectTitle(b))
  )

  const totalRevisions = [...revisionsByDocument.values()].reduce((n, r) => n + r.length, 0)
  const totalStale = [...citedBy.values()].reduce((n, c) => n + c.stale, 0)

  return (
    <>
      <h1 className="page-title">Document Control</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — the numbered documents this project works to, and which
        revision of each is currently in force. Requirements cite a document <em>and</em> a revision, so issuing a
        new revision shows you exactly what has to be re-read.
      </p>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Documents</div>
          <div className="stat-value">{documents.length}</div>
          <div className="stat-note">Under revision control</div>
        </div>
        <div className="stat">
          <div className="stat-label">Revisions</div>
          <div className="stat-value">{totalRevisions}</div>
          <div className="stat-note">Issued across all documents</div>
        </div>
        <div className="stat">
          <div className="stat-label">Requirements affected</div>
          <div className="stat-value" style={{ color: totalStale > 0 ? 'var(--color-warning)' : undefined }}>
            {totalStale}
          </div>
          <div className="stat-note">Cite a superseded revision</div>
        </div>
      </div>

      {documents.length === 0 && (
        <div className="alert alert-info" style={{ marginTop: 20 }}>
          <strong>Nothing registered yet.</strong> This is not the same as the Files page. A controlled document is
          a <em>numbered</em> thing with revisions — a specification, an ITP, an SLD, a commissioning procedure —
          where it matters which revision you are working to. Register the ones your requirements will cite.
        </div>
      )}

      {mayEdit && (
        <details className="card" style={{ marginTop: 20 }} open={documents.length === 0}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 15 }}>Register a document</summary>
          <form action={addDocument} style={{ display: 'grid', gap: 14, marginTop: 16 }}>
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '200px 1fr' }}>
              <label className="field">
                Document number *
                <input name="doc_number" required className="input" placeholder="SPEC-EL-001" />
              </label>
              <label className="field">
                Title
                <input name="title" className="input" placeholder="115kV GIS Technical Specification" />
              </label>
            </div>
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
              <label className="field">
                Type
                <select name="doc_type" className="input" defaultValue="specification">
                  {DOC_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Discipline
                <input name="discipline" className="input" placeholder="Electrical" />
              </label>
              <label className="field">
                Owner
                <input name="owner" className="input" placeholder="Who controls it" />
              </label>
              <label className="field">
                Applies to
                <select name="subject" className="input" defaultValue="">
                  <option value="">Whole project</option>
                  {subjectOptions.map((s) => (
                    <option key={`${s.type}:${s.id}`} value={`${s.type}:${s.id}`}>
                      {subjectLabel(s.type)} · {subjectTitle(s)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr 1fr' }}>
              <label className="field">
                First revision
                <input name="first_rev" className="input" placeholder="Rev 0" defaultValue="Rev 0" />
              </label>
              <label className="field">
                Status
                <select name="first_status" className="input" defaultValue="approved">
                  {REVISION_STATUSES.filter((r) => r.value !== 'superseded').map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Issued
                <input name="first_issued" type="date" className="input" />
              </label>
            </div>
            <div>
              <button type="submit" className="btn btn-primary" disabled={!project}>
                Register document
              </button>
            </div>
          </form>
        </details>
      )}

      {documents.map((d) => {
        const revs = revisionsByDocument.get(d.id) ?? []
        const effective = effectiveRevision(revs)
        const cites = citedBy.get(d.id)

        return (
          <div key={d.id} className="card" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span className="mono tag-id">{d.doc_number}</span>
              <span style={{ fontWeight: 600, fontSize: 15.5 }}>{d.title ?? 'Untitled'}</span>
              <span className="badge badge-neutral">{docTypeLabel(d.doc_type)}</span>
              {effective ? (
                <span className="badge badge-success">Effective: {effective.rev}</span>
              ) : (
                <span className="badge badge-warning">No effective revision</span>
              )}
            </div>

            <div className="text-secondary" style={{ fontSize: 12.5, marginTop: 6 }}>
              {d.discipline ? `${d.discipline} · ` : ''}
              {d.owner ? `owner ${d.owner} · ` : ''}
              {cites ? (
                <>
                  cited by {cites.total} requirement{cites.total === 1 ? '' : 's'}
                  {cites.stale > 0 && (
                    <strong style={{ color: 'var(--color-warning)' }}> · {cites.stale} need re-reading</strong>
                  )}
                </>
              ) : (
                'not yet cited by any requirement'
              )}
            </div>

            {revs.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Revision</th>
                      <th>Status</th>
                      <th>Issued</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...revs].reverse().map((rev) => (
                      <tr key={rev.id}>
                        <td className="mono" style={{ fontWeight: 500 }}>
                          {rev.rev}
                        </td>
                        <td>
                          <span className={revisionBadgeClass(rev.status)}>{revisionStatusLabel(rev.status)}</span>
                        </td>
                        <td style={{ fontSize: 13 }}>{when(rev.issued_date)}</td>
                        <td className="text-secondary" style={{ fontSize: 12.5 }}>
                          {rev.id === effective?.id ? 'Work to this one' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {mayEdit && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}>Issue a new revision</summary>
                <form action={addRevision} style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                  <input type="hidden" name="document_id" value={d.id} />
                  <input type="hidden" name="label" value={d.doc_number} />
                  <input type="hidden" name="previous_rev" value={effective?.rev ?? ''} />
                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr' }}>
                    <label className="field">
                      Revision *
                      <input name="rev" required className="input" placeholder="Rev 1" />
                    </label>
                    <label className="field">
                      Status
                      <select name="status" className="input" defaultValue="approved">
                        {REVISION_STATUSES.filter((r) => r.value !== 'superseded').map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Issued
                      <input name="issued_date" type="date" className="input" />
                    </label>
                  </div>
                  <label className="field">
                    What changed
                    <input name="notes" className="input" placeholder="Protection philosophy updated, section 7" />
                  </label>
                  <p className="text-secondary" style={{ fontSize: 12, margin: 0 }}>
                    Issuing this supersedes the current revision. Every requirement citing the old one will be
                    flagged on the{' '}
                    <Link href="/requirements" className="link">
                      Requirements
                    </Link>{' '}
                    page as needing to be re-read — that is the point of registering documents here.
                  </p>
                  <div>
                    <button type="submit" className="btn btn-primary btn-sm">
                      Issue revision
                    </button>
                  </div>
                </form>
              </details>
            )}

            {mayDelete && (
              <form action={deleteDocument} style={{ marginTop: 10 }}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="label" value={d.doc_number} />
                <button type="submit" className="btn-link" style={{ fontSize: 12.5 }}>
                  Remove document
                </button>
              </form>
            )}
          </div>
        )
      })}
    </>
  )
}
