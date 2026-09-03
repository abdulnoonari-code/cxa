import { supabase } from '@/lib/supabase'
import { getCurrentProject, listProjects } from '@/lib/project'
import { createProject, selectProject, deleteProject } from './actions'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const one = (k: string): string | undefined => {
    const v = sp[k]
    return Array.isArray(v) ? v[0] : v
  }
  const purge = one('purge')
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

  const purgeBanner =
    purge === 'ok' ? (
      <div className="card" style={{ borderLeft: '4px solid var(--color-success-solid, #16a34a)', marginBottom: 14 }} role="status">
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>
          {one('what')} was deleted, along with {one('n')} record{one('n') === '1' ? '' : 's'}.
        </p>
        {one('fresh') && (
          <p style={{ margin: '5px 0 0', fontSize: 12.5 }}>
            That was the last project, so a fresh empty one called <strong>{one('fresh')}</strong> was created and
            opened. Nothing is in it — rename it in Project Details if you want it called something else.
          </p>
        )}
      </div>
    ) : purge === 'partial' ? (
      <div className="card" style={{ borderLeft: '4px solid var(--color-danger)', marginBottom: 14 }} role="alert">
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--color-danger)' }}>
          The project was only partly deleted.
        </p>
        <p style={{ margin: '5px 0 0', fontSize: 12.5 }}>
          {one('n')} records were removed, but these would not go: {one('failed')}. Their rows are still in the
          database and may still be counted somewhere. Try again, or clear them in Supabase.
        </p>
      </div>
    ) : purge === 'badpassword' ? (
      <div className="card" style={{ borderLeft: '4px solid var(--color-danger)', marginBottom: 14 }} role="alert">
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--color-danger)' }}>Nothing was deleted.</p>
        <p style={{ margin: '5px 0 0', fontSize: 12.5 }}>{one('why')}</p>
      </div>
    ) : purge === 'unconfirmed' ? (
      <div className="card" style={{ borderLeft: '4px solid var(--color-warning-solid, #d97706)', marginBottom: 14 }} role="alert">
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>Nothing was deleted.</p>
        <p style={{ margin: '5px 0 0', fontSize: 12.5 }}>
          The confirmation did not match. Type <span className="mono">{one('want')}</span> exactly.
        </p>
      </div>
    ) : null

  return (
    <>
      {purgeBanner}
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
                    {/* A disclosure rather than a bare button. Deleting a
                        project removes every record in it across thirty
                        tables, and the old version of this did it on one
                        click with no confirmation at all. */}
                    <details>
                      <summary className="btn btn-danger-outline btn-sm" style={{ cursor: 'pointer' }}>
                        Delete
                      </summary>
                      <form
                        action={deleteProject}
                        style={{
                          marginTop: 10,
                          padding: 12,
                          border: '1px solid var(--color-border)',
                          borderLeft: '4px solid var(--color-danger)',
                          borderRadius: 6,
                          maxWidth: 460,
                        }}
                      >
                        <input type="hidden" name="id" value={p.id} />
                        <p style={{ margin: 0, fontSize: 12.5 }}>
                          This permanently deletes <strong>{p.name}</strong> and everything recorded in it — every
                          tag, check, test, punch item, photograph, document and signature. It cannot be undone.
                        </p>
                        {projects.length <= 1 && (
                          <p className="text-secondary" style={{ margin: '6px 0 0', fontSize: 12.5 }}>
                            This is your last project. Deleting it creates a fresh, empty one called{' '}
                            <strong>My Site</strong> in its place, so you end up with a clean slate rather than an
                            application with nothing to open.
                          </p>
                        )}
                        <label
                          className="text-secondary"
                          style={{ display: 'block', margin: '10px 0 4px', fontSize: 12 }}
                        >
                          Your password
                        </label>
                        {/* `required` so the browser refuses an empty submit
                            itself, and `autoComplete="off"` so it does not
                            fill this in for you. Both are deliberate: the
                            question this field asks is "are you here, right
                            now, and did you mean this", and a password the
                            browser remembered answers none of that. It also
                            filled every delete box on the page at once, which
                            made it impossible to tell whether the one you
                            pressed had anything in it. */}
                        <input
                          type="password"
                          name="password"
                          className="input"
                          required
                          autoComplete="off"
                          data-lpignore="true"
                          placeholder="Type it — this box is not auto-filled"
                          style={{ fontSize: 13 }}
                        />
                        <p className="text-secondary" style={{ margin: '5px 0 0', fontSize: 11.5 }}>
                          The same password you sign in with. Being signed in is not authority to destroy a project —
                          a session can be hours old on a laptop somebody else is now sitting at.
                        </p>
                        <button type="submit" className="btn btn-danger btn-sm" style={{ marginTop: 10 }}>
                          Delete this project permanently
                        </button>
                      </form>
                    </details>
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
