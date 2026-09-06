import Link from 'next/link'
import { logout } from '@/app/login/actions'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProject, listProjects } from '@/lib/project'
import { selectProject } from '@/app/projects/actions'
import { getActor } from '@/lib/audit'
import { roleLabel } from '@/lib/roles'
import { NavLinks } from '@/components/NavLinks'

// The rail is two things with different needs. The brand, the project switcher
// and the footer need the database, so this stays a server component. The
// links need to know which page you are on, which only the client knows — so
// they live in NavLinks, rendered from the model in lib/nav.ts.
export async function Sidebar() {
  const [projects, current] = await Promise.all([listProjects(), getCurrentProject()])
  const actor = await getActor(current?.id ?? null)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let displayName: string | null = null
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
    displayName = profile?.full_name || user.email || null
  }

  return (
    <div className="sidebar">
      <Link href="/projects" className="brand">
        <span className="brand-mark">CX</span>
        CxSentinel
      </Link>

      {/* Which site you're looking at. Changing it re-scopes every screen.
          Hidden until a project is open, because a switcher offering to
          change something that is not set reads as a broken control — and
          the register behind it is the whole front door now. */}
      {current ? (
        <form action={selectProject} className="project-switch">
          <span className="project-switch-label">Project</span>
          <select name="id" defaultValue={current.id} className="project-switch-select">
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="submit" className="project-switch-go">
            Open
          </button>
        </form>
      ) : (
        <div className="project-switch">
          <span className="project-switch-label">Project</span>
          <div style={{ fontSize: 12.5, opacity: 0.8, padding: '2px 0 4px' }}>
            None open — choose one from the register.
          </div>
        </div>
      )}

      <NavLinks projectOpen={!!current} />

      {current && (
        <Link
          href="/projects"
          className="sidebar-section-label"
          style={{ display: 'block', padding: '10px 0 0', textDecoration: 'none' }}
        >
          ← All projects
        </Link>
      )}

      <div className="sidebar-footer">
        {displayName && (
          <div className="nav-user">
            {displayName}
            <div style={{ fontSize: 11, opacity: 0.72, marginTop: 2 }}>{roleLabel(actor.role)}</div>
          </div>
        )}
        <form action={logout}>
          <button type="submit" className="btn-link">
            Log out
          </button>
        </form>
      </div>
    </div>
  )
}
