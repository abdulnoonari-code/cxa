import { supabase } from '@/lib/supabase'
import { LEVELS, STATUSES, statusBadgeClass } from '@/lib/checklist'
import { addChecklistItem } from '@/app/equipment/[id]/checklist/actions'

export const dynamic = 'force-dynamic'

// Every checklist item on the project, across all equipment, in one place —
// so a checklist doesn't have to be reached by first finding its equipment.
export default async function ChecklistsPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; equipment?: string }>
}) {
  const { level, equipment: equipmentFilter } = await searchParams

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .order('created_at', { ascending: true })
    .limit(1)

  const project = projects?.[0]

  const { data: equipmentRows } = project
    ? await supabase.from('equipment').select('id, tag_id, description').eq('project_id', project.id).order('tag_id')
    : { data: [] }

  const equipment = equipmentRows ?? []
  const equipmentIds = equipment.map((e) => e.id)
  const tagById = new Map(equipment.map((e) => [e.id, e.tag_id]))

  let query = supabase
    .from('checklist_items')
    .select('id, level, item, status, notes, ai_comment, equipment_id')
    .order('level', { ascending: true })

  if (equipmentIds.length > 0) query = query.in('equipment_id', equipmentIds)
  if (level) query = query.eq('level', level)
  if (equipmentFilter) query = query.eq('equipment_id', equipmentFilter)

  const { data: itemsRaw } = equipmentIds.length > 0 ? await query : { data: [] }
  const items = itemsRaw ?? []
  const itemIds = items.map((it) => it.id)

  const { data: attachmentsRaw } =
    itemIds.length > 0
      ? await supabase.from('attachments').select('checklist_item_id').in('checklist_item_id', itemIds)
      : { data: [] as { checklist_item_id: string }[] }

  const evidenceCountFor = (itemId: string) =>
    (attachmentsRaw ?? []).filter((a) => a.checklist_item_id === itemId).length

  const levelLabel = (value: string) => LEVELS.find((l) => l.value === value)?.label ?? value
  const failed = items.filter((it) => it.status === 'fail').length
  const pending = items.filter((it) => it.status === 'pending').length

  return (
    <>
      <h1 className="page-title">Checklists</h1>
      <p className="page-subtitle" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>
          Project: {project ? project.name : 'No project found — run the Week 2 SQL step first.'} — every
          commissioning check on the project, at every level.
        </span>
        {failed > 0 && <span className="badge badge-danger">{failed} failed</span>}
        {pending > 0 && <span className="badge badge-warning">{pending} not started</span>}
      </p>

      <div className="card">
        <h2 className="section-title">Add a checklist item</h2>
        <form action={addChecklistItem} style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <label className="field">
            Equipment *
            <select name="equipment_id" required className="input" defaultValue="">
              <option value="" disabled>
                — choose —
              </option>
              {equipment.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.tag_id}
                  {e.description ? ` — ${e.description}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Level *
            <select name="level" required className="input" defaultValue="">
              <option value="" disabled>
                — choose —
              </option>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            Item to check *
            <input name="item" required placeholder="e.g. Verify fuel level above 75%" className="input" />
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="btn btn-primary" disabled={equipment.length === 0}>
              Add item
            </button>
          </div>
        </form>
        {equipment.length === 0 && (
          <p className="text-secondary" style={{ fontSize: 13, marginTop: 10 }}>
            Add equipment first — checks belong to a tag.
          </p>
        )}
      </div>

      <div style={{ margin: '24px 0 16px' }}>
        <form style={{ display: 'flex', gap: 10 }}>
          <select name="equipment" defaultValue={equipmentFilter ?? ''} className="input" style={{ maxWidth: 240 }}>
            <option value="">All equipment</option>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.tag_id}
              </option>
            ))}
          </select>
          <select name="level" defaultValue={level ?? ''} className="input" style={{ maxWidth: 300 }}>
            <option value="">All levels</option>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
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
              <th>Level</th>
              <th>Item</th>
              <th>Status</th>
              <th>Evidence</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? (
              items.map((it) => (
                <tr key={it.id}>
                  <td style={{ fontWeight: 600 }}>{tagById.get(it.equipment_id) ?? '—'}</td>
                  <td style={{ fontSize: 13 }}>{levelLabel(it.level)}</td>
                  <td>
                    {it.item}
                    {it.ai_comment && (
                      <div className="text-secondary" style={{ fontSize: 11, marginTop: 2, maxWidth: 340 }}>
                        {it.ai_comment}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={statusBadgeClass(it.status)}>
                      {STATUSES.find((s) => s.value === it.status)?.label ?? it.status}
                    </span>
                  </td>
                  <td>
                    {evidenceCountFor(it.id) > 0 ? (
                      <span className="badge badge-info">{evidenceCountFor(it.id)}</span>
                    ) : (
                      <span className="badge badge-neutral">None</span>
                    )}
                  </td>
                  <td>
                    <a href={`/equipment/${it.equipment_id}/checklist`} className="link">
                      Open
                    </a>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="empty-row">
                  No checklist items yet — add your first one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
