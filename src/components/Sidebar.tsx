import Link from 'next/link'
import { logout } from '@/app/login/actions'
import { createClient } from '@/lib/supabase/server'

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
        <div className="sidebar-section-label">Project</div>
        <Link href="/plan" className="nav-link">
          Project Plan
        </Link>
        <Link href="/milestones" className="nav-link">
          Milestones &amp; Timeline
        </Link>

        <div className="sidebar-section-label">Delivery</div>
        <Link href="/equipment" className="nav-link">
          Equipment &amp; Tags
        </Link>
        <Link href="/functional-tests" className="nav-link">
          Functional Tests
        </Link>
        <Link href="/integrated-tests" className="nav-link">
          Integrated Functional Tests
        </Link>
        <Link href="/issues" className="nav-link">
          Issues &amp; Punch List
        </Link>

        <div className="sidebar-section-label">Quality</div>
        <Link href="/documents" className="nav-link">
          Document Review
        </Link>
      </nav>

      <div className="sidebar-footer">
        {displayName && <div className="nav-user">Hi, {displayName}</div>}
        <form action={logout}>
          <button type="submit" className="btn-link" style={{ padding: '0 10px' }}>
            Log out
          </button>
        </form>
      </div>
    </div>
  )
}
