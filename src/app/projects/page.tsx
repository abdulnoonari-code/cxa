import { supabase } from '@/lib/supabase'
import { getCurrentProject, listProjects } from '@/lib/project'
import { createProject, selectProject, deleteProject } from './actions'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  const projects = await listProjects()
  const current = await getCurrentProject()

  // One pass over every tag and check on the account, then counted per project
  // in memory — cheaper than a query per project once there are a few of them.
  const { data: equipmentRows } = await supabase.from('equipment').select('id, project_id')
  const equipment = equipmentRows ?? []

  const { data: itemRows } =
    equipment.length > 0
      ? await supabase
          .from('checklist_items')
          .select('id, status, equipment_id')
          .in(
            'equipment_id',
            equipment.map((e) => e.id)
          )
      : { data: [] as { id: string; status: string; equipment_id: string }[] }

  const items = itemRows ?? []
  const projectIdByEquipment = new Map(equipment.map((e) => [e.id, e.project_id]))

  const statsFor = (projectId: string) => {
    const tags = equipment.filter((e) => e.project_id === projectId).length
    const own = items.filter((it) => projectIdByEquipment.get(it.equipment_id) === projectId)
    const resolved = own.filter((it) => it.status === 'pass' || it.status === 'na').length
    return {
      tags,
      checks: own.length,
      percent: own.length > 0 ? Math.round((resolved / own.length) * 100) : 0,
    }
  }

  return (
    <>
      <h1 className="page-title">Projects</h1>
      <p className="page-subtitle">
        Every site you&apos;re commissioning. Open one and the whole app — equipment, checks, documents, punch
        list, milestones — shows that project only.
      </p>

      <div style={{ display: 'grid', gap: 14, marginBottom: 26 }}>
        {projects.map((p) => {
          const s = statsFor(p.id)
          const isCurrent = current?.id === p.id
          return (
            <div
              key={p.id}
              className="card"
              style={{
                borderColor: isCurrent ? 'var(--color-primary)' : undefined,
                boxShadow: isCurrent ? '0 0 0 3px rgba(37, 99, 255, 0.12)' : undefined,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em' }}>{p.name}</span>
                    {isCurrent && <span className="badge badge-info">Open now</span>}
                  </div>
                  <div className="text-secondary" style={{ fontSize: 13 }}>
                    {[p.client, p.location].filter(Boolean).join(' · ') || 'No client or location set'}
                  </div>
                  {(p.start_date || p.target_date) && (
                    <div className="text-secondary mono" style={{ fontSize: 12, marginTop: 4 }}>
                      {p.start_date ?? '—'} → {p.target_date ?? '—'}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 26, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <div className="stat-label">Tags</div>
                    <div style={{ fontSize: 20, fontWeight: 600 }} className="mono">
                      {s.tags}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Checks</div>
                    <div style={{ fontSize: 20, fontWeight: 600 }} className="mono">
                      {s.checks}
                    </div>
                  </div>
                  <div style={{ minWidth: 120 }}>
                    <div className="stat-label">Resolved</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="mono" style={{ fontSize: 20, fontWeight: 600 }}>
                        {s.percent}%
                      </span>
                      <span className="bar-track" style={{ width: 70 }}>
                        <span
                          className="bar-seg"
                          style={{ width: `${s.percent}%`, background: 'var(--color-success-solid)' }}
                        />
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {!isCurrent && (
                      <form action={selectProject}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="btn btn-primary btn-sm">
                          Open
                        </button>
                      </form>
                    )}
                    <form action={deleteProject}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="btn btn-danger-outline btn-sm">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {projects.length === 0 && (
          <div className="card">
            <p className="text-secondary" style={{ fontSize: 14 }}>
              No projects yet — create your first one below.
            </p>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="section-title">New project</h2>
        <form action={createProject} style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            Project name *
            <input
              name="name"
              required
              placeholder="e.g. Rayong Substation — Bay Extension"
              className="input"
            />
          </label>
          <label className="field">
            Client
            <input name="client" placeholder="Owner or client name" className="input" />
          </label>
          <label className="field">
            Location
            <input name="location" placeholder="e.g. Rayong, Thailand" className="input" />
          </label>
          <label className="field">
            Start date
            <input type="date" name="start_date" className="input" />
          </label>
          <label className="field">
            Target completion
            <input type="date" name="target_date" className="input" />
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="btn btn-primary">
              Create project
            </button>
          </div>
        </form>
        <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
          Deleting a project removes its equipment, checks, documents, punch list items and milestones as well.
        </p>
      </div>
    </>
  )
}
