import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { refKey, subjectLabel } from '@/lib/subjects'
import { LEVELS } from '@/lib/checklist'
import { updateIssue } from '../../actions'
import { SEVERITIES, CATEGORIES, ISSUE_STATUSES } from '@/lib/issues'
import { CATEGORY_BLOCKS, daysOverdue, ageInDays, isOpen } from '@/lib/punchlist'
import { IssuePhotos } from '@/components/IssuePhotos'
import { loadIssuePhotos } from '@/data/photos'
import { aiConfigured } from '@/lib/ai'

export const dynamic = 'force-dynamic'

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

export default async function EditIssuePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ photo?: string; ai?: string; reason?: string; hint?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const { data: issueRow } = await supabase.from('issues').select('*').eq('id', id).single()

  if (!issueRow) {
    return (
      <div style={{ maxWidth: 640 }}>
        <p style={{ marginBottom: 8 }}>Punch item not found.</p>
        <Link href="/issues" className="link">
          Back to the punch list
        </Link>
      </div>
    )
  }

  const issue = issueRow as {
    id: string
    ref: string | null
    title: string
    description: string | null
    severity: string
    category: string | null
    status: string
    level: string | null
    raised_by: string | null
    responsible_party: string | null
    discipline: string | null
    location: string | null
    due_date: string | null
    closed_at: string | null
    closed_by: string | null
    verified_at: string | null
    verified_by: string | null
    created_at: string | null
    ai_comment: string | null
    equipment_id: string | null
    subject_type: string | null
    subject_id: string | null
    checklist_item_id: string | null
  }

  const project = await getCurrentProject()
  const photoLoad = await loadIssuePhotos(project?.id ?? null)
  const photos = photoLoad.byIssue.get(id) ?? []
  const index = await loadSubjectIndex(project?.id ?? null)
  const subject =
    issue.subject_type && issue.subject_id
      ? index.byKey.get(refKey({ type: issue.subject_type, id: issue.subject_id }))
      : issue.equipment_id
        ? index.byKey.get(refKey({ type: 'equipment', id: issue.equipment_id }))
        : undefined

  const { data: linkedItem } = issue.checklist_item_id
    ? await supabase.from('checklist_items').select('id, level, item').eq('id', issue.checklist_item_id).single()
    : { data: null }

  const late = daysOverdue(issue)
  const age = ageInDays(issue)
  const open = isOpen(issue.status)

  return (
    <div style={{ maxWidth: 760 }}>
      <p style={{ marginBottom: 8 }}>
        <Link href="/issues" className="link">
          &larr; Back to the punch list
        </Link>
      </p>

      <h1 className="page-title" style={{ marginBottom: 4 }}>
        <span className="mono text-secondary" style={{ fontSize: 18 }}>
          {issue.ref ?? '—'}
        </span>{' '}
        {issue.title}
      </h1>
      <p className="page-subtitle" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>
          Against{' '}
          {subject ? (
            <Link href={`/assets/${subject.type}/${subject.id}`} className="link">
              {subject.code ?? subject.name}
            </Link>
          ) : (
            'nothing on the asset tree'
          )}
          {subject ? ` (${subjectLabel(subject.type)})` : ''}
        </span>
        {late !== null && <span className="badge badge-danger">{late} days late</span>}
        {open && age !== null && <span className="badge badge-neutral">open {age} days</span>}
      </p>

      {linkedItem && (
        <p className="text-secondary" style={{ fontSize: 13, marginTop: -8, marginBottom: 16 }}>
          Raised from checklist item: {(linkedItem as { item: string }).item}
          {issue.equipment_id && (
            <>
              {' — '}
              <Link href={`/equipment/${issue.equipment_id}/checklist`} className="link">
                view on the checklist
              </Link>
            </>
          )}
        </p>
      )}

      {issue.ai_comment && (
        <p className="alert alert-info" style={{ fontSize: 13, marginBottom: 16 }}>
          <strong>Automatic check:</strong> {issue.ai_comment}
        </p>
      )}

      <div className="card">
        <form action={updateIssue} style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
          <input type="hidden" name="id" value={issue.id} />

          <label className="field">
            Category
            <select name="category" defaultValue={issue.category ?? ''} className="input">
              <option value="">— not assessed yet —</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <span className="text-secondary" style={{ fontSize: 12, fontWeight: 400, marginTop: 4, display: 'block' }}>
              {issue.category
                ? CATEGORY_BLOCKS[issue.category]
                : 'Until somebody says what it blocks, it is counted as blocking.'}
            </span>
          </label>

          <label className="field">
            Severity
            <select name="severity" defaultValue={issue.severity} className="input">
              {SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <span className="text-secondary" style={{ fontSize: 12, fontWeight: 400, marginTop: 4, display: 'block' }}>
              How bad it is. What it holds up is the category, not this.
            </span>
          </label>

          <label className="field">
            Status
            <select name="status" defaultValue={issue.status} className="input">
              {ISSUE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <span className="text-secondary" style={{ fontSize: 12, fontWeight: 400, marginTop: 4, display: 'block' }}>
              Ready for Retest is the contractor saying it is done. Verified is somebody accepting that.
            </span>
          </label>

          <label className="field">
            Raised at level
            <select name="level" defaultValue={issue.level ?? ''} className="input">
              <option value="">— not tied to a level —</option>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field" style={{ gridColumn: '1 / -1' }}>
            Detail
            <input
              name="description"
              defaultValue={issue.description ?? ''}
              placeholder="What has to happen before it can be closed"
              className="input"
            />
          </label>

          <label className="field">
            Responsible party
            <input name="responsible_party" defaultValue={issue.responsible_party ?? ''} className="input" />
          </label>

          <label className="field">
            Due date
            <input type="date" name="due_date" defaultValue={issue.due_date ?? ''} className="input" />
          </label>

          <label className="field">
            Discipline
            <input name="discipline" defaultValue={issue.discipline ?? ''} className="input" />
          </label>

          <label className="field">
            Location
            <input name="location" defaultValue={issue.location ?? ''} className="input" />
          </label>

          <div style={{ display: 'flex', gap: 16, marginTop: 8, alignItems: 'center', gridColumn: '1 / -1' }}>
            <button type="submit" className="btn btn-primary">
              Save changes
            </button>
            <Link href="/issues" className="link">
              Cancel
            </Link>
          </div>
        </form>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title">Record</h2>
        <table className="table">
          <tbody>
            <tr>
              <td style={{ width: 190 }}>Raised</td>
              <td>
                {when(issue.created_at)}
                {issue.raised_by ? ` by ${issue.raised_by}` : ''}
              </td>
            </tr>
            <tr>
              <td>Cleared by the contractor</td>
              <td>
                {when(issue.closed_at)}
                {issue.closed_by ? ` by ${issue.closed_by}` : ''}
              </td>
            </tr>
            <tr>
              <td>Accepted</td>
              <td>
                {when(issue.verified_at)}
                {issue.verified_by ? ` by ${issue.verified_by}` : ''}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 10, marginBottom: 0 }}>
          Cleared and accepted are recorded separately on purpose. Reopening the item clears both, because a
          stamp that survived a reopen would say the item was accepted while it is sitting there open.
        </p>
      </div>

      <IssuePhotos
        issueId={id}
        photos={photos}
        schemaReady={photoLoad.schemaReady}
        aiConfigured={aiConfigured()}
        notice={{ photo: sp.photo, ai: sp.ai, reason: sp.reason, hint: sp.hint }}
      />
    </div>
  )
}
