import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { roleLabel, roleBadgeClass } from '@/lib/roles'

export const dynamic = 'force-dynamic'

const ENTITY_LABELS: Record<string, string> = {
  checklist_item: 'Check',
  test_record: 'Test',
  project_member: 'Team',
  issue: 'Punch item',
  project: 'Project',
  system: 'System',
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; actor?: string }>
}) {
  const { entity, actor: actorFilter } = await searchParams
  const project = await getCurrentProject()

  let query = supabase
    .from('audit_log')
    .select('id, actor_email, actor_name, actor_role, action, entity, entity_label, old_value, new_value, comment, created_at')
    .order('created_at', { ascending: false })
    .limit(300)

  if (project) query = query.eq('project_id', project.id)
  if (entity) query = query.eq('entity', entity)
  if (actorFilter) query = query.eq('actor_email', actorFilter)

  const { data: rows } = project ? await query : { data: [] }
  const entries = rows ?? []

  const { data: allRows } = project
    ? await supabase.from('audit_log').select('entity, actor_email, actor_name').eq('project_id', project.id)
    : { data: [] as { entity: string; actor_email: string | null; actor_name: string | null }[] }

  const all = allRows ?? []
  const entities = Array.from(new Set(all.map((a) => a.entity))).sort()
  const people = Array.from(
    new Map(all.filter((a) => a.actor_email).map((a) => [a.actor_email, a.actor_name || a.actor_email])).entries()
  )

  return (
    <>
      <h1 className="page-title">Audit Trail</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — who changed what, and when. Entries are append-only:
        the database itself refuses any attempt to alter or delete one, including from the SQL editor.
      </p>

      <div style={{ margin: '0 0 18px' }}>
        <form style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select name="entity" defaultValue={entity ?? ''} className="input" style={{ maxWidth: 210 }}>
            <option value="">Everything</option>
            {entities.map((e) => (
              <option key={e} value={e}>
                {ENTITY_LABELS[e] ?? e}
              </option>
            ))}
          </select>
          <select name="actor" defaultValue={actorFilter ?? ''} className="input" style={{ maxWidth: 240 }}>
            <option value="">Everyone</option>
            {people.map(([email, name]) => (
              <option key={email as string} value={email as string}>
                {name as string}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary">
            Filter
          </button>
          {(entity || actorFilter) && (
            <a href="/audit" className="btn btn-secondary">
              Clear
            </a>
          )}
        </form>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>Record</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {entries.length > 0 ? (
              entries.map((e) => (
                <tr key={e.id}>
                  <td className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {e.created_at?.slice(0, 10)}
                    <div className="text-secondary">{e.created_at?.slice(11, 16)}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500, fontSize: 13.5 }}>{e.actor_name || e.actor_email || 'Unknown'}</div>
                    {e.actor_role && (
                      <span className={roleBadgeClass(e.actor_role)} style={{ marginTop: 3 }}>
                        {roleLabel(e.actor_role)}
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: 13.5 }}>
                    {e.action}
                    <div className="text-secondary" style={{ fontSize: 12 }}>
                      {ENTITY_LABELS[e.entity] ?? e.entity}
                    </div>
                  </td>
                  <td style={{ fontSize: 13.5, maxWidth: 260 }}>{e.entity_label ?? '—'}</td>
                  <td style={{ fontSize: 13 }}>
                    {e.old_value || e.new_value ? (
                      <span>
                        <span className="text-secondary">{e.old_value ?? '—'}</span>
                        {' → '}
                        <strong>{e.new_value ?? '—'}</strong>
                      </span>
                    ) : (
                      <span className="text-secondary">—</span>
                    )}
                    {e.comment && (
                      <div className="text-secondary" style={{ fontSize: 12, marginTop: 3 }}>
                        {e.comment}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="empty-row">
                  Nothing recorded yet. Approvals, test results and team changes appear here as they happen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {entries.length === 300 && (
        <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 12 }}>
          Showing the most recent 300 entries.
        </p>
      )}
    </>
  )
}
