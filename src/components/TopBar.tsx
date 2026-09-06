import Link from 'next/link'
import { logout } from '@/app/login/actions'
import { createClient } from '@/lib/supabase/server'

// The frame for the screens that have no rail.
//
// Without it the project picker was a white page with a heading on it —
// no product name, no sign-out, no indication of who was signed in or that
// this was an application at all. Every commissioning platform this sits
// beside puts the account bar across the top and the picker underneath, and
// for a good reason: the picker is the only screen where you are outside a
// project, so it is the only screen where the frame has to say where you are
// instead of the rail saying it.
export async function TopBar() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let name: string | null = null
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
    name = profile?.full_name || user.email || null
  }

  return (
    <header className="topbar">
      <Link href="/projects" className="topbar-brand">
        <span className="topbar-mark">CX</span>
        <span className="topbar-name">CxSentinel</span>
      </Link>

      <nav className="topbar-links">
        <Link href="/about#manual">Manual</Link>
        <Link href="/about#contact">Contact</Link>
      </nav>

      {user && (
        <div className="topbar-user">
          <span className="topbar-who" title={user.email ?? ''}>
            {name}
          </span>
          <form action={logout}>
            <button type="submit" className="topbar-signout">
              Sign out
            </button>
          </form>
        </div>
      )}
    </header>
  )
}
