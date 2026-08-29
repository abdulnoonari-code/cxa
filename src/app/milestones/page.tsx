import { supabase } from '@/lib/supabase'
import { createMilestone, updateMilestone, deleteMilestone } from './actions'
import { MILESTONE_STATUSES, milestoneBadgeClass, isOverdue } from '@/lib/milestones'

export const dynamic = 'force-dynamic'

export default async function MilestonesPage() {
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .order('created_at', { ascending: true })
    .limit(1)

  const project = projects?.[0]

  const { data: milestonesRaw } = project
    ? await supabase
        .from('milestones')
        .select('id, name, target_date, status, notes, checklist_item_id')
        .eq('project_id', project.id)
        .order('target_date', { ascending: true, nullsFirst: false })
    : { data: [] }

  const milestones = milestonesRaw ?? []
  const overdueCount = milestones.filter((m) => isOverdue(m.target_date, m.status)).length

  const linkedItemIds = milestones.map((m) => m.checklist_item_id).filter((v): v is string => Boolean(v))
  const { data: linkedItemsRaw } =
    linkedItemIds.length > 0
      ? await supabase.from('checklist_items').select('id, item, equipment_id').in('id', linkedItemIds)
      : { data: [] as { id: string; item: string; equipment_id: string }[] }
  const linkedItemById = new Map((linkedItemsRaw ?? []).map((it) => [it.id, it]))

  return (
    <>
      <h1 className="page-title">Milestones &amp; Timeline</h1>
        <p className="page-subtitle" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Project: {project ? project.name : 'No project found — run the Week 2 SQL step first.'}</span>
          {overdueCount > 0 && (
            <span className="badge badge-danger">
              {overdueCount} overdue milestone{overdueCount > 1 ? 's' : ''}
            </span>
          )}
        </p>

        <div className="card">
          <h2 className="section-title">Add milestone</h2>
          <form action={createMilestone} style={{ display: 'grid', gap: 12, gridTemplateColumns: '2fr 1fr 1fr' }}>
            <input type="hidden" name="project_id" value={project?.id ?? ''} />
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              Milestone *
              <input name="name" required placeholder="e.g. Substation energization" className="input" />
            </label>
            <label className="field">
              Target date
              <input type="date" name="target_date" className="input" />
            </label>
            <label className="field">
              Status
              <select name="status" className="input" defaultValue="planned">
                {MILESTONE_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ alignSelf: 'end' }}>
              <button type="submit" className="btn btn-primary" disabled={!project}>
                Add milestone
              </button>
            </div>
          </form>
        </div>

        {milestones.length > 0 ? (
          <div style={{ display: 'grid', gap: 14, marginTop: 24 }}>
            {milestones.map((m) => {
              const overdue = isOverdue(m.target_date, m.status)
              return (
                <div key={m.id} className="card">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: 12,
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{m.name}</div>
                      {m.checklist_item_id && linkedItemById.get(m.checklist_item_id) && (
                        <a
                          href={`/equipment/${linkedItemById.get(m.checklist_item_id)!.equipment_id}/checklist`}
                          className="link"
                          style={{ fontSize: 12 }}
                        >
                          Linked to: {linkedItemById.get(m.checklist_item_id)!.item}
                        </a>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {overdue && <span className="badge badge-danger">Overdue</span>}
                      <span className={milestoneBadgeClass(m.status)}>
                        {MILESTONE_STATUSES.find((s) => s.value === m.status)?.label ?? m.status}
                      </span>
                    </div>
                  </div>

                  <form style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 2fr' }}>
                    <input type="hidden" name="id" value={m.id} />
                    <label className="field">
                      Target date
                      <input
                        key={`date-${m.id}-${m.target_date ?? ''}`}
                        type="date"
                        name="target_date"
                        defaultValue={m.target_date ?? ''}
                        className="input"
                      />
                    </label>
                    <label className="field">
                      Status
                      <select
                        key={`status-${m.id}-${m.status}`}
                        name="status"
                        defaultValue={m.status}
                        className="input"
                      >
                        {MILESTONE_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Notes
                      <input
                        key={`notes-${m.id}-${m.notes ?? ''}`}
                        name="notes"
                        defaultValue={m.notes ?? ''}
                        placeholder="What's blocking it, who owns it"
                        className="input"
                      />
                    </label>
                    <input type="hidden" name="name" value={m.name} />
                    <div style={{ display: 'flex', gap: 10, gridColumn: '1 / -1' }}>
                      <button formAction={updateMilestone} type="submit" className="btn btn-secondary btn-sm">
                        Save
                      </button>
                      <button formAction={deleteMilestone} type="submit" className="btn btn-danger-outline btn-sm">
                        Delete
                      </button>
                    </div>
                  </form>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-secondary" style={{ marginTop: 24 }}>
            No milestones yet — add your first one above (e.g. FAT complete, Energization date, Handover).
          </p>
      )}
    </>
  )
}
