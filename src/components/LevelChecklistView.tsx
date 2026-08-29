import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { STATUSES, statusBadgeClass } from '@/lib/checklist'

// A cross-equipment view into one checklist level. Functional Tests and
// Integrated Functional Tests aren't a separate data model — L4 (Functional
// Performance Test) and L5 (Integrated Systems Test) already are exactly
// that, per equipment. This just rolls every equipment's items at that level
// up into one list, the way a dedicated "Functional Tests" screen would in
// Facility Grid/CxAlloy, without duplicating the checklist data.
export async function LevelChecklistView({
  level,
  title,
  blurb,
}: {
  level: string
  title: string
  blurb: string
}) {
  const project = await getCurrentProject()

  const { data: equipmentRows } = project
    ? await supabase.from('equipment').select('id, tag_id').eq('project_id', project.id).order('tag_id')
    : { data: [] }

  const equipment = equipmentRows ?? []
  const equipmentIds = equipment.map((e) => e.id)
  const tagById = new Map(equipment.map((e) => [e.id, e.tag_id]))

  const { data: itemsRaw } =
    equipmentIds.length > 0
      ? await supabase
          .from('checklist_items')
          .select('id, item, status, notes, ai_comment, equipment_id')
          .eq('level', level)
          .in('equipment_id', equipmentIds)
      : { data: [] as { id: string; item: string; status: string; notes: string | null; ai_comment: string | null; equipment_id: string }[] }

  const items = itemsRaw ?? []
  const itemIds = items.map((it) => it.id)

  const { data: attachmentsRaw } =
    itemIds.length > 0
      ? await supabase.from('attachments').select('checklist_item_id').in('checklist_item_id', itemIds)
      : { data: [] as { checklist_item_id: string }[] }

  const evidenceCountFor = (itemId: string) =>
    (attachmentsRaw ?? []).filter((a) => a.checklist_item_id === itemId).length

  const notStarted = items.filter((it) => it.status === 'pending').length
  const failed = items.filter((it) => it.status === 'fail').length

  return (
    <>
      <h1 className="page-title">{title}</h1>
      <p className="page-subtitle" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>{blurb}</span>
        {failed > 0 && <span className="badge badge-danger">{failed} failed</span>}
        {notStarted > 0 && <span className="badge badge-warning">{notStarted} not started</span>}
      </p>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Equipment</th>
              <th>Item</th>
              <th>Status</th>
              <th>Evidence</th>
              <th>Notes / check note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? (
              items.map((it) => (
                <tr key={it.id}>
                  <td style={{ fontWeight: 600 }}>{tagById.get(it.equipment_id) ?? '—'}</td>
                  <td>{it.item}</td>
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
                  <td style={{ maxWidth: 320 }}>
                    {it.notes && <div style={{ fontSize: 13 }}>{it.notes}</div>}
                    {it.ai_comment && (
                      <div className="text-secondary" style={{ fontSize: 12, marginTop: 2 }}>
                        {it.ai_comment}
                      </div>
                    )}
                  </td>
                  <td>
                    <a href={`/equipment/${it.equipment_id}/checklist`} className="link">
                      Open checklist
                    </a>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="empty-row">
                  No items at this level yet — they&apos;ll show up here as soon as they&apos;re added to an
                  equipment checklist.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
