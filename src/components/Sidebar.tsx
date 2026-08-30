import Link from 'next/link'
import { logout } from '@/app/login/actions'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProject, listProjects } from '@/lib/project'
import { selectProject } from '@/app/projects/actions'

// Small line icons, drawn inline so the rail needs no icon library and nothing
// to download. 16px grid, 1.6 stroke to match the type weight.
const icon = (paths: React.ReactNode) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {paths}
  </svg>
)

const ICONS = {
  dashboard: icon(
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  projects: icon(
    <>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5Z" />
      <path d="M21 9v9a2 2 0 0 1-2 2H6" opacity="0.55" />
    </>
  ),
  review: icon(
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9L20 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5Z" />
      <path d="M14 4v6h6" />
      <path d="M8.2 15.4l2 2 4-4.6" />
    </>
  ),
  testrec: icon(
    <>
      <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z" />
      <path d="M7.5 9.5h5M7.5 13h3" />
      <path d="M14 14.6l1.5 1.5 3-3.4" />
    </>
  ),
  gauge: icon(
    <>
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="M12 17l4.2-4.6" />
      <circle cx="12" cy="17" r="1.4" />
    </>
  ),
  task: icon(
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M8 3v3M16 3v3M3 9.5h18" />
      <path d="M8.5 14.2l1.6 1.6 3.4-3.6" />
    </>
  ),
  files: icon(
    <>
      <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h3.2l1.8 2.2h8A1.5 1.5 0 0 1 20 8.7V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18Z" />
    </>
  ),
  report: icon(
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M8 16.5V11M12 16.5V7.5M16 16.5v-3.5" />
    </>
  ),
  meeting: icon(
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.4M17.5 19.5a5.4 5.4 0 0 0-2-4.2" />
    </>
  ),
  settings: icon(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 14.5a1.6 1.6 0 0 0 .32 1.77l.06.05a2 2 0 1 1-2.83 2.83l-.05-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.77.32l-.05.06a2 2 0 1 1-2.83-2.83l.06-.05A1.6 1.6 0 0 0 4.6 15a1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.32-1.77l-.06-.05a2 2 0 1 1 2.83-2.83l.05.06A1.6 1.6 0 0 0 9 4.6h.06A1.6 1.6 0 0 0 10 3.13V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.05-.06a2 2 0 1 1 2.83 2.83l-.06.05A1.6 1.6 0 0 0 19.4 9v.06a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.44Z" />
    </>
  ),
  plan: icon(
    <>
      <path d="M4 5h16M4 12h10M4 19h13" />
      <circle cx="18" cy="12" r="2" />
    </>
  ),
  milestone: icon(
    <>
      <path d="M5 21V4" />
      <path d="M5 5h11l-2 3 2 3H5" />
    </>
  ),
  equipment: icon(
    <>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
    </>
  ),
  checklist: icon(
    <>
      <path d="M9 5h9M9 12h9M9 19h9" />
      <path d="M3.5 5.2l1 1 2-2.2M3.5 12.2l1 1 2-2.2M3.5 19.2l1 1 2-2.2" />
    </>
  ),
  test: icon(
    <>
      <path d="M9 3v6.5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L15 9.5V3" />
      <path d="M8 3h8M7.5 14h9" />
    </>
  ),
  integrated: icon(
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M7.6 8L11 15.6M16.4 8L13 15.6M8.5 6h7" />
    </>
  ),
  issue: icon(
    <>
      <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" />
      <path d="M12 10v4M12 17.2v.1" />
    </>
  ),
  document: icon(
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
}

export async function Sidebar() {
  const [projects, current] = await Promise.all([listProjects(), getCurrentProject()])
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
      <Link href="/" className="brand">
        <span className="brand-mark">CX</span>
        CxSentinel
      </Link>

      {/* Which site you're looking at. Changing it re-scopes every screen. */}
      <form action={selectProject} className="project-switch">
        <span className="project-switch-label">Project</span>
        <select name="id" defaultValue={current?.id ?? ''} className="project-switch-select">
          {projects.length === 0 && <option value="">No projects yet</option>}
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

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Project</div>
        <Link href="/dashboard" className="nav-link">
          {ICONS.dashboard}
          Dashboard
        </Link>
        <Link href="/projects" className="nav-link">
          {ICONS.projects}
          All Projects
        </Link>
        <Link href="/project" className="nav-link">
          {ICONS.settings}
          Project Details
        </Link>
        <Link href="/plan" className="nav-link">
          {ICONS.plan}
          Project Plan
        </Link>
        <Link href="/milestones" className="nav-link">
          {ICONS.milestone}
          Milestones &amp; Timeline
        </Link>

        <div className="sidebar-section-label">Assets &amp; Checks</div>
        <Link href="/equipment" className="nav-link">
          {ICONS.equipment}
          Equipment &amp; Tags
        </Link>
        <Link href="/checklists" className="nav-link">
          {ICONS.checklist}
          Checklists
        </Link>
        <Link href="/functional-tests" className="nav-link">
          {ICONS.test}
          Functional Tests
        </Link>
        <Link href="/integrated-tests" className="nav-link">
          {ICONS.integrated}
          Integrated Functional Tests
        </Link>
        <Link href="/tests" className="nav-link">
          {ICONS.testrec}
          Test Records
        </Link>
        <Link href="/instruments" className="nav-link">
          {ICONS.gauge}
          Test Instruments
        </Link>

        <div className="sidebar-section-label">Quality</div>
        <Link href="/issues" className="nav-link">
          {ICONS.issue}
          Issues &amp; Punch List
        </Link>
        <Link href="/review" className="nav-link">
          {ICONS.review}
          Review &amp; Approvals
        </Link>
        <Link href="/documents" className="nav-link">
          {ICONS.document}
          Document Review
        </Link>

        <div className="sidebar-section-label">Manage</div>
        <Link href="/tasks" className="nav-link">
          {ICONS.task}
          Tasks
        </Link>
        <Link href="/meetings" className="nav-link">
          {ICONS.meeting}
          Meetings
        </Link>
        <Link href="/files" className="nav-link">
          {ICONS.files}
          Files
        </Link>

        <div className="sidebar-section-label">Reports</div>
        <Link href="/reports" className="nav-link">
          {ICONS.report}
          Progress Report
        </Link>
      </nav>

      <div className="sidebar-footer">
        {displayName && <div className="nav-user">{displayName}</div>}
        <form action={logout}>
          <button type="submit" className="btn-link">
            Log out
          </button>
        </form>
      </div>
    </div>
  )
}
