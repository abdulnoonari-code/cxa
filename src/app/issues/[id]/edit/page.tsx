import { supabase } from '@/lib/supabase'
import { updateIssue } from '../../actions'
import { inputStyle, buttonStyle, labelStyle } from '../../../equipment/styles'
import { SEVERITIES, ISSUE_STATUSES } from '@/lib/issues'

export default async function EditIssuePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { data: issue } = await supabase.from('issues').select('*').eq('id', id).single()

  if (!issue) {
    return (
      <main style={{ maxWidth: 600, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
        <p>Issue not found.</p>
        <a href="/issues">Back to Issues &amp; Punchlist</a>
      </main>
    )
  }

  const { data: equipment } = await supabase
    .from('equipment')
    .select('tag_id')
    .eq('id', issue.equipment_id)
    .single()

  return (
    <main style={{ maxWidth: 600, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ marginBottom: 8 }}>
        <a href="/issues">&larr; Back to Issues &amp; Punchlist</a>
      </p>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>{issue.title}</h1>
      <p style={{ color: '#555', marginBottom: 20 }}>Equipment: {equipment?.tag_id ?? '—'}</p>

      <form action={updateIssue} style={{ display: 'grid', gap: 14 }}>
        <input type="hidden" name="id" value={issue.id} />
        <label style={labelStyle}>
          Severity
          <select name="severity" defaultValue={issue.severity} style={inputStyle}>
            {SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Status
          <select name="status" defaultValue={issue.status} style={inputStyle}>
            {ISSUE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Description
          <input name="description" defaultValue={issue.description ?? ''} style={inputStyle} />
        </label>
        <div style={{ display: 'flex', gap: 14, marginTop: 8, alignItems: 'center' }}>
          <button type="submit" style={buttonStyle}>
            Save changes
          </button>
          <a href="/issues">Cancel</a>
        </div>
      </form>
    </main>
  )
}
