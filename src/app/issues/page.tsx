import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { createIssue, deleteIssue } from './actions'
import {
  SEVERITIES,
  CATEGORIES,
  ISSUE_STATUSES,
  severityBadgeClass,
  categoryBadgeClass,
  issueStatusBadgeClass,
} from '@/lib/issues'

export const dynamic = 'force-dynamic'

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string; category?: string }>
}) {
  const { status, severity, category } = await searchParams

  const project = await getCurrentProject()

  const { data: equipmentRows } = project
    ? await supabase.from('equipment').select('id, tag_id').eq('project_id', project.id).order('tag_id')
    : { data: [] }

  const equipment = equipmentRows ?? []
  const equipmentIds = equipment.map((e) => e.id)
  const tagById = new Map(equipment.map((e) => [e.id, e.tag_id]))

  let query = supabase
    .from('issues')
    .select('id, equipment_id, checklist_item_id, title, description, severity, category, status, ai_comment, created_at')
    .order('created_at', { ascending: false })

  if (equipmentIds.length > 0) {
    query = query.in('equipment_id', equipmentIds)
  }
  if (status) query = query.eq('status', status)
  if (severity) query = query.eq('severity', severity)
  if (category) query = query.eq('category', category)

  const { data: issuesRaw } = equipmentIds.length > 0 ? await query : { data: [] }
  const issues = issuesRaw ?? []

  const openCritical = issues.filter(
    (i) => i.status !== 'closed' && i.status !== 'verified' && (i.severity === 'critical' || i.severity === 'major')
  ).length

  return (
    <>
      <h1 className="page-title">Issues &amp; Punchlist</h1>
        <p className="page-subtitle" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Project: {project ? project.name : 'No project found — run the Week 2 SQL step first.'}</span>
          {openCritical > 0 && (
            <span className="badge badge-danger">
              {openCritical} open critical/major issue{openCritical > 1 ? 's' : ''}
            </span>
          )}
        </p>

        <div className="card">
          <h2 className="section-title">Raise an issue</h2>
          <form action={createIssue} style={{ display: 'grid', gap: 12 }}>
            <label className="field">
              Equipment *
              <select name="equipment_id" required className="input" defaultValue="">
                <option value="" disabled>
                  — choose —
                </option>
                {equipment.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.tag_id}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Title *
              <input name="title" required placeholder="e.g. Loose terminal on breaker CB-04" className="input" />
            </label>
            <label className="field">
              Severity
              <select name="severity" className="input" defaultValue="minor">
                {SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Punch list category
              <select name="category" className="input" defaultValue="">
                <option value="">— none —</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Description
              <input name="description" placeholder="What's wrong, and what needs to happen" className="input" />
            </label>
            <div>
              <button type="submit" className="btn btn-primary" disabled={equipment.length === 0}>
                Raise issue
              </button>
            </div>
          </form>
          {equipment.length === 0 && (
            <p className="text-secondary" style={{ fontSize: 13, marginTop: 10 }}>
              Add equipment first before raising issues.
            </p>
          )}
        </div>

        <div style={{ margin: '24px 0 16px' }}>
          <form style={{ display: 'flex', gap: 10 }}>
            <select name="status" defaultValue={status ?? ''} className="input">
              <option value="">All statuses</option>
              {ISSUE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select name="severity" defaultValue={severity ?? ''} className="input">
              <option value="">All severities</option>
              {SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select name="category" defaultValue={category ?? ''} className="input">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-secondary">
              Filter
            </button>
          </form>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Equipment</th>
                <th>Title</th>
                <th>Severity</th>
                <th>Category</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {issues.length > 0 ? (
                issues.map((issue) => (
                  <tr key={issue.id}>
                    <td style={{ fontWeight: 600 }}>{tagById.get(issue.equipment_id) ?? '—'}</td>
                    <td>
                      {issue.title}
                      {issue.checklist_item_id && (
                        <span className="text-secondary" style={{ fontSize: 11, display: 'block' }}>
                          Linked to a checklist item
                        </span>
                      )}
                      {issue.ai_comment && (
                        <span className="text-secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
                          {issue.ai_comment}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={severityBadgeClass(issue.severity)}>{issue.severity}</span>
                    </td>
                    <td>
                      {issue.category ? (
                        <span className={categoryBadgeClass(issue.category)}>Category {issue.category}</span>
                      ) : (
                        <span className="text-secondary" style={{ fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={issueStatusBadgeClass(issue.status)}>
                        {issue.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                        <a href={`/issues/${issue.id}/edit`} className="link">
                          Edit
                        </a>
                        <form action={deleteIssue}>
                          <input type="hidden" name="id" value={issue.id} />
                          <button type="submit" className="btn-link">
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty-row">
                    No issues yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
      </div>
    </>
  )
}
