import { supabase } from '@/lib/supabase'
import { createIssue, deleteIssue } from './actions'
import { inputStyle, buttonStyle, labelStyle, thStyle, tdStyle } from '../equipment/styles'
import { SEVERITIES, ISSUE_STATUSES } from '@/lib/issues'
import { TopNav } from '@/components/TopNav'

export const dynamic = 'force-dynamic'

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string }>
}) {
  const { status, severity } = await searchParams

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .order('created_at', { ascending: true })
    .limit(1)

  const project = projects?.[0]

  const { data: equipmentRows } = project
    ? await supabase.from('equipment').select('id, tag_id').eq('project_id', project.id).order('tag_id')
    : { data: [] }

  const equipment = equipmentRows ?? []
  const equipmentIds = equipment.map((e) => e.id)
  const tagById = new Map(equipment.map((e) => [e.id, e.tag_id]))

  let query = supabase
    .from('issues')
    .select('id, equipment_id, title, description, severity, status, created_at')
    .order('created_at', { ascending: false })

  if (equipmentIds.length > 0) {
    query = query.in('equipment_id', equipmentIds)
  }
  if (status) query = query.eq('status', status)
  if (severity) query = query.eq('severity', severity)

  const { data: issuesRaw } = equipmentIds.length > 0 ? await query : { data: [] }
  const issues = issuesRaw ?? []

  const openCritical = issues.filter(
    (i) => i.status !== 'closed' && i.status !== 'verified' && (i.severity === 'critical' || i.severity === 'major')
  ).length

  const severityColor = (s: string) =>
    s === 'critical' ? '#b23a3a' : s === 'major' ? '#c1791f' : s === 'minor' ? '#a67c00' : '#666'

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <TopNav />
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Issues &amp; Punchlist</h1>
      <p style={{ color: '#555', marginBottom: 24 }}>
        Project: {project ? project.name : 'No project found — run the Week 2 SQL step first.'}
        {openCritical > 0 && (
          <span style={{ marginLeft: 12, color: '#b23a3a', fontWeight: 600 }}>
            {openCritical} open critical/major issue{openCritical > 1 ? 's' : ''}
          </span>
        )}
      </p>

      <section style={{ marginBottom: 32, padding: 20, border: '1px solid #ddd', borderRadius: 8 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Raise an issue</h2>
        <form action={createIssue} style={{ display: 'grid', gap: 12 }}>
          <label style={labelStyle}>
            Equipment *
            <select name="equipment_id" required style={inputStyle} defaultValue="">
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
          <label style={labelStyle}>
            Title *
            <input name="title" required placeholder="e.g. Loose terminal on breaker CB-04" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Severity
            <select name="severity" style={inputStyle} defaultValue="minor">
              {SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Description
            <input name="description" placeholder="What's wrong, and what needs to happen" style={inputStyle} />
          </label>
          <div>
            <button type="submit" style={buttonStyle} disabled={equipment.length === 0}>
              Raise issue
            </button>
          </div>
        </form>
        {equipment.length === 0 && (
          <p style={{ color: '#888', fontSize: 13, marginTop: 8 }}>Add equipment first before raising issues.</p>
        )}
      </section>

      <section style={{ marginBottom: 16 }}>
        <form style={{ display: 'flex', gap: 10 }}>
          <select name="status" defaultValue={status ?? ''} style={inputStyle}>
            <option value="">All statuses</option>
            {ISSUE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select name="severity" defaultValue={severity ?? ''} style={inputStyle}>
            <option value="">All severities</option>
            {SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="submit" style={buttonStyle}>
            Filter
          </button>
        </form>
      </section>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #333' }}>
              <th style={thStyle}>Equipment</th>
              <th style={thStyle}>Title</th>
              <th style={thStyle}>Severity</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {issues.length > 0 ? (
              issues.map((issue) => (
                <tr key={issue.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={tdStyle}>{tagById.get(issue.equipment_id) ?? '—'}</td>
                  <td style={tdStyle}>{issue.title}</td>
                  <td
                    style={{
                      ...tdStyle,
                      color: severityColor(issue.severity),
                      fontWeight: 600,
                      textTransform: 'capitalize',
                    }}
                  >
                    {issue.severity}
                  </td>
                  <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{issue.status.replace(/_/g, ' ')}</td>
                  <td style={tdStyle}>
                    <a href={`/issues/${issue.id}/edit`} style={{ marginRight: 12 }}>
                      Edit
                    </a>
                    <form action={deleteIssue} style={{ display: 'inline' }}>
                      <input type="hidden" name="id" value={issue.id} />
                      <button
                        type="submit"
                        style={{ color: '#b23a3a', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#888' }}>
                  No issues yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
