import { supabase } from '@/lib/supabase'
import { loadRegister } from '@/data/register'
import { registerNote } from '@/lib/access'
import { getCurrentProject } from '@/lib/project'
import { createProject, selectProject, deleteProject } from './actions'

export const dynamic = 'force-dynamic'

// The screen you land on, and the only screen with no rail.
//
// It answers one question — which project — and it must not answer any other.
// The version before this carried the full twenty-one-item rail down the left,
// showing the contents of whichever project happened to be open last, beside a
// list asking which project you wanted. Choosing and working are two different
// activities and this screen is only the first of them.
//
// Creating and deleting are still here, because they have to live somewhere
// and this is where projects are. They are folded away underneath, so the top
// of the screen is projects and nothing else.

type Stat = { tags: number; checks: number; percent: number }

function Box({
  id,
  name,
  client,
  location,
  start,
  target,
  stat,
  current,
}: {
  id: string
  name: string
  client: string | null
  location: string | null
  start: string | null
  target: string | null
  stat: Stat
  current: boolean
}) {
  const where = [client, location].filter(Boolean).join(' · ')
  return (
    <form action={selectProject} className={`project-card${current ? ' is-open' : ''}`}>
      <input type="hidden" name="id" value={id} />
      <div className="project-card-accent" />

      <div className="project-card-body">
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'space-between' }}>
            <span className="project-card-name">{name}</span>
            {current && (
              <span className="badge badge-info" style={{ flexShrink: 0, marginTop: 2 }}>
                Open
              </span>
            )}
          </div>
          <div className="project-card-meta">{where || 'No client or location set'}</div>
          {(start || target) && (
            <div className="project-card-meta mono" style={{ fontSize: 11.5 }}>
              {start ?? '—'} → {target ?? '—'}
            </div>
          )}
        </div>

        <div className="project-stats">
          <div>
            <div className="stat-label">Tags</div>
            <div className="project-stat-value mono">{stat.tags}</div>
          </div>
          <div>
            <div className="stat-label">Checks</div>
            <div className="project-stat-value mono">{stat.checks}</div>
          </div>
          <div>
            <div className="stat-label">Resolved</div>
            {/* A dash, not 0%. Zero per cent is a statement about work that
                exists and has not been done; a dash is no work recorded. */}
            <div className="project-stat-value mono">{stat.checks > 0 ? `${stat.percent}%` : '—'}</div>
          </div>
        </div>

        <div className="project-progress" aria-hidden="true">
          <div className="project-progress-fill" style={{ width: `${stat.checks > 0 ? stat.percent : 0}%` }} />
        </div>

        <button type="submit" className="btn btn-primary" style={{ marginTop: 'auto', width: '100%' }}>
          {current ? 'Continue' : 'Open project'}
        </button>
      </div>
    </form>
  )
}

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

  const [reg, current] = await Promise.all([loadRegister(), getCurrentProject()])
  const projects = reg.entries.map((e) => e.project)

  // One pass over every tag and check, counted per project in memory — cheaper
  // than a query per project once there are a few of them. Counted by
  // project_id rather than through equipment, because a system-level check has
  // no equipment and the old count silently left every L4 and L5 record out.
  const [equipmentRows, itemRows] = await Promise.all([
    supabase.from('equipment').select('id, project_id'),
    supabase.from('checklist_items').select('status, project_id'),
  ])
  const equipment = equipmentRows.data ?? []
  const items = (itemRows.data ?? []) as { status: string | null; project_id: string | null }[]

  const statFor = (projectId: string): Stat => {
    const own = items.filter((i) => i.project_id === projectId)
    const resolved = own.filter((i) => i.status === 'pass' || i.status === 'na').length
    return {
      tags: equipment.filter((e) => e.project_id === projectId).length,
      checks: own.length,
      percent: own.length > 0 ? Math.round((resolved / own.length) * 100) : 0,
    }
  }

  return (
    <>
      <div className="picker-head">
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>
            Projects
          </h1>
          <p className="text-secondary" style={{ fontSize: 13, margin: 0, maxWidth: '68ch' }}>
            {registerNote(reg, reg.email)}
          </p>
        </div>
      </div>

      {purge === 'ok' && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          <strong>{one('what')}</strong> was deleted, along with {one('n')} record
          {one('n') === '1' ? '' : 's'}.
          {one('fresh') && ` That was the last project, so an empty one called ${one('fresh')} was created.`}
        </div>
      )}
      {purge === 'partial' && (
        <div className="alert alert-danger" style={{ marginBottom: 16 }}>
          <strong>Only partly deleted.</strong> {one('n')} records were removed and the database refused the rest:{' '}
          <span className="mono" style={{ fontSize: 11.5 }}>
            {one('failed')}
          </span>
        </div>
      )}
      {purge === 'badpassword' && (
        <div className="alert alert-danger" style={{ marginBottom: 16 }}>
          <strong>Nothing was deleted.</strong> {one('why')}
        </div>
      )}
      {purge === 'gone' && (
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          That project no longer exists.
        </div>
      )}

      {projects.length === 0 ? (
        <div className="card">
          <h2 className="section-title">No projects</h2>
          <p style={{ fontSize: 13, margin: 0 }}>
            {reg.hidden > 0
              ? 'Projects exist on this account but your address is not on any of their teams. Whoever runs the project can add you on its Project Team page.'
              : 'Create one below. Everything in CxSentinel is scoped to a project, so this is the first step.'}
          </p>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((p) => (
            <Box
              key={p.id}
              id={p.id}
              name={p.name}
              client={p.client}
              location={p.location}
              start={p.start_date}
              target={p.target_date}
              stat={statFor(p.id)}
              current={current?.id === p.id}
            />
          ))}
        </div>
      )}

      {/* Folded away on purpose. Creating a project is rare and deleting one is
          rarer still; neither belongs in the way of the thing done every day. */}
      <details style={{ marginTop: 30 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}>Add or remove a project</summary>

        <div className="card" style={{ marginTop: 12 }}>
          <h2 className="section-title">New project</h2>
          <form action={createProject} style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              Name
              <input name="name" required className="input" placeholder="BKK-05 — MV distribution" />
            </label>
            <label className="field">
              Client
              <input name="client" className="input" />
            </label>
            <label className="field">
              Location
              <input name="location" className="input" />
            </label>
            <label className="field">
              Start date
              <input type="date" name="start_date" className="input" />
            </label>
            <label className="field">
              Target date
              <input type="date" name="target_date" className="input" />
            </label>
            <div style={{ gridColumn: '1 / -1' }}>
              <button type="submit" className="btn btn-primary">
                Create project
              </button>
            </div>
          </form>
        </div>

        {projects.length > 0 && (
          <div className="card" style={{ marginTop: 12, borderLeft: '4px solid var(--color-danger)' }}>
            <h2 className="section-title">Delete a project</h2>
            <p className="text-secondary" style={{ fontSize: 12.5, margin: '0 0 4px' }}>
              This removes the project and every record in it — equipment, checks, documents, punch items. It
              cannot be undone, so it asks for your login password at the moment of deletion. Being logged in is
              not authority to destroy a project.
            </p>
            {projects.map((p) => (
              <form
                key={p.id}
                action={deleteProject}
                style={{
                  display: 'grid',
                  gap: 10,
                  gridTemplateColumns: 'minmax(160px, 1fr) minmax(150px, 1fr) auto',
                  alignItems: 'end',
                  paddingTop: 10,
                  borderTop: '1px solid var(--color-border)',
                  marginTop: 10,
                }}
              >
                <input type="hidden" name="id" value={p.id} />
                <div style={{ fontSize: 13, fontWeight: 600, paddingBottom: 8 }}>{p.name}</div>
                <label className="field" style={{ fontSize: 11 }}>
                  Your password
                  <input type="password" name="password" className="input" autoComplete="current-password" />
                </label>
                <button type="submit" className="btn btn-danger">
                  Delete
                </button>
              </form>
            ))}
          </div>
        )}
      </details>
    </>
  )
}
