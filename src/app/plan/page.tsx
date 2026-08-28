import { supabase } from '@/lib/supabase'
import { thStyle, tdStyle } from '../equipment/styles'
import { LEVELS } from '@/lib/checklist'

export const dynamic = 'force-dynamic'

export default async function PlanPage() {
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .order('created_at', { ascending: true })
    .limit(1)

  const project = projects?.[0]

  const { data: equipmentRows } = project
    ? await supabase.from('equipment').select('id').eq('project_id', project.id)
    : { data: [] }

  const equipmentIds = (equipmentRows ?? []).map((e) => e.id)

  const { data: items } =
    equipmentIds.length > 0
      ? await supabase.from('checklist_items').select('level, status').in('equipment_id', equipmentIds)
      : { data: [] }

  const rows = LEVELS.map((level) => {
    const levelItems = (items ?? []).filter((it) => it.level === level.value)
    const total = levelItems.length
    const pass = levelItems.filter((it) => it.status === 'pass').length
    const fail = levelItems.filter((it) => it.status === 'fail').length
    const na = levelItems.filter((it) => it.status === 'na').length
    const pending = levelItems.filter((it) => it.status === 'pending').length
    const percent = total > 0 ? Math.round((pass / total) * 100) : 0
    const blocked = fail > 0

    return { ...level, total, pass, fail, na, pending, percent, blocked }
  })

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ marginBottom: 8 }}>
        <a href="/equipment">&larr; Back to Equipment &amp; Tags</a>
      </p>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Project Plan &amp; Rollup</h1>
      <p style={{ color: '#555', marginBottom: 24 }}>
        Project: {project ? project.name : 'No project found — run the Week 2 SQL step first.'}
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #333' }}>
              <th style={thStyle}>Level</th>
              <th style={thStyle}>Total</th>
              <th style={thStyle}>Pass</th>
              <th style={thStyle}>Fail</th>
              <th style={thStyle}>Pending</th>
              <th style={thStyle}>N/A</th>
              <th style={thStyle}>% Complete</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.value} style={{ borderBottom: '1px solid #eee' }}>
                <td style={tdStyle}>{r.label}</td>
                <td style={tdStyle}>{r.total}</td>
                <td style={tdStyle}>{r.pass}</td>
                <td style={tdStyle}>{r.fail}</td>
                <td style={tdStyle}>{r.pending}</td>
                <td style={tdStyle}>{r.na}</td>
                <td style={tdStyle}>{r.percent}%</td>
                <td
                  style={{
                    ...tdStyle,
                    fontWeight: 600,
                    color: r.blocked ? '#b23a3a' : r.total === 0 ? '#888' : r.percent === 100 ? '#1a7a3c' : '#a67c00',
                  }}
                >
                  {r.blocked ? 'Blocked' : r.total === 0 ? 'Not started' : r.percent === 100 ? 'Complete' : 'In progress'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 20, fontSize: 13, color: '#888' }}>
        &quot;Blocked&quot; means at least one item at that level is marked Fail — resolve it (see the item&apos;s Check
        note) before that level can be considered ready.
      </p>
    </main>
  )
}
