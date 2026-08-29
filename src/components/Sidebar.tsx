import Link from 'next/link'
import { logout } from '@/app/login/actions'
import { createClient } from '@/lib/supabase/server'

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

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Overview</div>
        <Link href="/dashboard" className="nav-link">
          {ICONS.dashboard}
          Dashboard
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

        <div className="sidebar-section-label">Delivery</div>
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
        <Link href="/issues" className="nav-link">
          {ICONS.issue}
          Issues &amp; Punch List
        </Link>

        <div className="sidebar-section-label">Quality</div>
        <Link href="/documents" className="nav-link">
          {ICONS.document}
          Document Review
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
