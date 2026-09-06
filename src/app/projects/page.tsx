import Link from 'next/link'
import { getCurrentProject } from '@/lib/project'
import { loadRegister } from '@/data/register'
import { registerNote } from '@/lib/access'
import { roleLabel } from '@/lib/roles'
import { selectProject } from '@/app/projects/actions'

export const dynamic = 'force-dynamic'

// The front door.
//
// Logging in used to land on a page of four buttons that opened project
// screens scoped to whatever project happened to be in a cookie — so the
// first thing anybody saw was a project, possibly not theirs, and the list
// of projects was an item called "All Projects" five places down a menu.
//
// This is the register instead: what exists, who is on it, and one way in.
// Creating and deleting are not here on purpose. They belong to whoever
// administers the account, and a delete button on the screen everybody lands
// on after logging in is a delete button somebody eventually presses.

function Card({
  href,
  name,
  client,
  location,
  target,
  role,
  members,
  openToAll,
  current,
  id,
}: {
  href: string
  name: string
  client: string | null
  location: string | null
  target: string | null
  role: string | null
  members: number
  openToAll: boolean
  current: boolean
  id: string
}) {
  return (
    <div
      className="card"
      style={{
        margin: 0,
        borderLeft: current ? '4px solid var(--color-primary)' : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{name}</div>
        <div className="text-secondary" style={{ fontSize: 12.5 }}>
          {[client, location].filter(Boolean).join(' · ') || 'No client or location recorded'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11.5 }}>
        {current && <span className="badge badge-success">Open now</span>}
        {openToAll ? (
          <span className="badge badge-warning" title="No team list on this project, so everyone can see it">
            No team list
          </span>
        ) : (
          <span className="badge">{roleLabel(role)}</span>
        )}
        <span className="badge">
          {members} {members === 1 ? 'person' : 'people'}
        </span>
        {target && <span className="badge">Target {target}</span>}
      </div>

      <form action={selectProject} style={{ marginTop: 'auto', paddingTop: 6 }}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" className={current ? 'btn btn-secondary' : 'btn btn-primary'}>
          {current ? 'Continue' : 'Open this project'}
        </button>
      </form>
      <Link href={href} className="text-secondary" style={{ fontSize: 11.5 }}>
        Details and settings
      </Link>
    </div>
  )
}

export default async function ProjectRegisterPage() {
  const [reg, current] = await Promise.all([loadRegister(), getCurrentProject()])

  return (
    <>
      <h1 className="page-title">Project register</h1>
      <p className="page-subtitle">{registerNote(reg, reg.email)}</p>

      {reg.unrestricted && reg.entries.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          <strong>Access has not been set up yet.</strong> Nobody is listed on the team of any project, so everyone
          who can log in sees everything here. Add people under Administrator → People &amp; Roles, and this list
          becomes the projects each person is actually on.
        </div>
      )}

      {reg.entries.length === 0 ? (
        <div className="card">
          <h2 className="section-title">Nothing to open</h2>
          <p style={{ fontSize: 13, margin: '0 0 12px' }}>
            {reg.hidden > 0
              ? 'Projects are registered on this account, but your address is not on any of their teams. Whoever runs the project can add you.'
              : 'No project has been created yet. Everything else in this application is scoped to a project, so this is the first step.'}
          </p>
          {reg.hidden === 0 && (
            <Link href="/projects/manage" className="btn btn-primary">
              Create the first project
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {reg.entries.map((e) => (
            <Card
              key={e.project.id}
              id={e.project.id}
              href="/project"
              name={e.project.name}
              client={e.project.client}
              location={e.project.location}
              target={e.project.target_date}
              role={e.role}
              members={e.members}
              openToAll={e.openToAll}
              current={current?.id === e.project.id}
            />
          ))}
        </div>
      )}

      <p className="text-secondary" style={{ margin: '22px 0 0', fontSize: 11.5, fontStyle: 'italic' }}>
        This list decides what is shown, not what is permitted. Until the database is locked down, anybody with the
        site address can still reach the data directly — Administrator → Set-up says whether that is still true.
      </p>
    </>
  )
}
