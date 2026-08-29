import { supabase } from '@/lib/supabase'
import { updateIssue } from '../../actions'
import { SEVERITIES, CATEGORIES, ISSUE_STATUSES } from '@/lib/issues'

export default async function EditIssuePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { data: issue } = await supabase.from('issues').select('*').eq('id', id).single()

  if (!issue) {
    return (
      <div style={{ maxWidth: 600 }}>
        <p style={{ marginBottom: 8 }}>Issue not found.</p>
        <a href="/issues" className="link">
          Back to Issues &amp; Punchlist
        </a>
      </div>
    )
  }

  const { data: equipment } = await supabase
    .from('equipment')
    .select('tag_id')
    .eq('id', issue.equipment_id)
    .single()

  const { data: linkedItem } = issue.checklist_item_id
    ? await supabase.from('checklist_items').select('id, level, item').eq('id', issue.checklist_item_id).single()
    : { data: null }

  return (
    <div style={{ maxWidth: 600 }}>
      <p style={{ marginBottom: 8 }}>
        <a href="/issues" className="link">
          &larr; Back to Issues &amp; Punchlist
        </a>
      </p>
      <h1 className="page-title">{issue.title}</h1>
      <p className="page-subtitle">Equipment: {equipment?.tag_id ?? '—'}</p>
      {linkedItem && (
        <p className="text-secondary" style={{ fontSize: 13, marginTop: -8, marginBottom: 16 }}>
          Linked to checklist item: {linkedItem.item} —{' '}
          <a href={`/equipment/${issue.equipment_id}/checklist`} className="link">
            view on checklist
          </a>
        </p>
      )}

      {issue.ai_comment && (
        <p className="alert alert-info" style={{ fontSize: 13, marginBottom: 16 }}>
          <strong>Automatic check:</strong> {issue.ai_comment}
        </p>
      )}

      <div className="card">
        <form action={updateIssue} style={{ display: 'grid', gap: 14 }}>
          <input type="hidden" name="id" value={issue.id} />
          <label className="field">
            Severity
            <select name="severity" defaultValue={issue.severity} className="input">
              {SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Punch list category
            <select name="category" defaultValue={issue.category ?? ''} className="input">
              <option value="">— none —</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
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
          </label>
          <label className="field">
            Description
            <input name="description" defaultValue={issue.description ?? ''} className="input" />
          </label>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, alignItems: 'center' }}>
            <button type="submit" className="btn btn-primary">
              Save changes
            </button>
            <a href="/issues" className="link">
              Cancel
            </a>
          </div>
        </form>
      </div>
    </div>
  )
}
