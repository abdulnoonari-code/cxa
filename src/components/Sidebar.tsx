import Link from 'next/link'
import { logout } from '@/app/login/actions'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProject, listProjects } from '@/lib/project'
import { selectProject } from '@/app/projects/actions'
import { getActor } from '@/lib/audit'
import { roleLabel } from '@/lib/roles'

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
  team: icon(
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16.5 5.4a3.2 3.2 0 0 1 0 5.6M21 20a5.9 5.9 0 0 0-2.6-4.6" />
    </>
  ),
  audit: icon(
    <>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5Z" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </>
  ),
  system: icon(
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="8.5" y="14" width="7" height="7" rx="1.5" />
      <path d="M6.5 10v2h11v-2M12 12v2" />
    </>
  ),
  readiness: icon(
    <>
      <path d="M12 3l7.5 3.4v5.2c0 4.3-3.1 7.6-7.5 9.1-4.4-1.5-7.5-4.8-7.5-9.1V6.4Z" />
      <path d="M8.8 12.2l2.1 2.1 4.3-4.6" />
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
  hold: icon(
    <>
      <path d="M4 4v16" />
      <path d="M8.5 8.5h9M8.5 15.5h9" />
      <circle cx="13" cy="12" r="2.2" />
    </>
  ),
  daily: icon(
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M8 3v3M16 3v3M3 9.5h18" />
      <path d="M7.5 13h4M7.5 16.5h8" />
    </>
  ),
  roles: icon(
    <>
      <circle cx="8.5" cy="8" r="3" />
      <path d="M3 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 8.5h5M16 12h5M16 15.5h3" opacity="0.6" />
    </>
  ),
  validity: icon(
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.4 15.4 21 21" />
      <path d="M8 10.5l2 2 3.5-3.5" />
    </>
  ),
  gate: icon(
    <>
      <path d="M3 4v16M21 4v16" />
      <path d="M6.5 8h11M6.5 12h11M6.5 16h11" opacity="0.55" />
      <path d="M12 6.2v11.6" />
    </>
  ),
  tree: icon(
    <>
      <rect x="9" y="2.5" width="6" height="4.5" rx="1" />
      <rect x="2.5" y="17" width="6" height="4.5" rx="1" />
      <rect x="15.5" y="17" width="6" height="4.5" rx="1" />
      <path d="M12 7v5M5.5 17v-2.5h13V17" />
    </>
  ),
  requirement: icon(
    <>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3h8L19 7.5v12a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5Z" />
      <path d="M14 3v5h5" />
      <path d="M8.5 12.6l1.4 1.4 3-3.2M8.5 17.1l1.4 1.4 3-3.2" />
    </>
  ),
  doccontrol: icon(
    <>
      <rect x="3" y="4" width="13" height="16" rx="1.6" />
      <path d="M18.5 7.5v11a2 2 0 0 1-2 2H7" opacity="0.5" />
      <path d="M6.5 8.5h6M6.5 12h6M6.5 15.5h3.5" />
    </>
  ),
  bell: icon(
    <>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" />
      <path d="M10.3 19a2 2 0 0 0 3.4 0" />
    </>
  ),
  contacts: icon(
    <>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5Z" />
      <circle cx="12" cy="10" r="2.2" />
      <path d="M8.5 16.5a3.6 3.6 0 0 1 7 0M2.5 8h2.5M2.5 12h2.5M2.5 16h2.5" />
    </>
  ),
}

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
        <Link href="/assets" className="nav-link">
          {ICONS.tree}
          Assets
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

        <div className="sidebar-section-label">Traceability</div>
        <Link href="/requirements" className="nav-link">
          {ICONS.requirement}
          Requirements
        </Link>
        <Link href="/doc-control" className="nav-link">
          {ICONS.doccontrol}
          Document Control
        </Link>

        <div className="sidebar-section-label">Assets &amp; Checks</div>
        <Link href="/systems" className="nav-link">
          {ICONS.system}
          Systems
        </Link>
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
        <Link href="/validity" className="nav-link">
          {ICONS.validity}
          Validity Review
        </Link>
        <Link href="/gates" className="nav-link">
          {ICONS.gate}
          Readiness Gates
        </Link>
        <Link href="/readiness" className="nav-link">
          {ICONS.readiness}
          Readiness
        </Link>
        <Link href="/issues" className="nav-link">
          {ICONS.issue}
          Punch List
        </Link>
        <Link href="/review" className="nav-link">
          {ICONS.review}
          Review &amp; Approvals
        </Link>
        <Link href="/documents" className="nav-link">
          {ICONS.document}
          Document Review
        </Link>
        <Link href="/holdpoints" className="nav-link">
          {ICONS.hold}
          Hold &amp; Witness Points
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

        <div className="sidebar-section-label">Governance</div>
        <Link href="/notifications" className="nav-link">
          {ICONS.bell}
          Alerts &amp; Notices
        </Link>
        <Link href="/contacts" className="nav-link">
          {ICONS.contacts}
          Contacts
        </Link>
        <Link href="/team" className="nav-link">
          {ICONS.team}
          Project Team
        </Link>
        <Link href="/roles" className="nav-link">
          {ICONS.roles}
          Roles
        </Link>
        <Link href="/audit" className="nav-link">
          {ICONS.audit}
          Audit Trail
        </Link>

        <div className="sidebar-section-label">Reports</div>
        <Link href="/reports/daily" className="nav-link">
          {ICONS.daily}
          Daily Report
        </Link>
        <Link href="/reports" className="nav-link">
          {ICONS.report}
          Progress Report
        </Link>
      </nav>

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
