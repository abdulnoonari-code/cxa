import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { accessVerdict } from '@/data/gate'
import { mayOpenProject, allowedProjects } from '@/lib/gate'

export const PROJECT_COOKIE = 'cx_project'

export type Project = {
  id: string
  name: string
  client: string | null
  location: string | null
  start_date: string | null
  target_date: string | null
}

const PROJECT_COLUMNS = 'id, name, client, location, start_date, target_date'

// Which project the app is currently looking at. The choice is kept in a
// cookie rather than the URL so every existing screen stays at its own address
// — /equipment is still /equipment — while showing only the selected project's
// data. Falls back to the oldest project so a fresh login always lands
// somewhere sensible.
//
// ── THE COOKIE IS A REQUEST, NOT A PERMISSION ───────────────────────────
//
// This function used to take the id out of the cookie and fetch that project,
// full stop. The cookie is set by the project switcher, but it is a cookie:
// anybody signed in can put any id in it. And because every other screen in
// the application asks this one function which project it is looking at,
// answering with a project the person is not on handed them the whole of it —
// tag register, punch list, test results, photographs, contracts — on every
// screen at once.
//
// So the id is now checked before it is honoured. A cookie pointing at a
// project this account is not on is ignored, exactly as if it were stale, and
// the fallback below lands them on one they are actually on.
//
// The two functions here are the single gate for project scope. Nothing else
// needs to change and nothing else should: 103 files call this, and the fix
// belongs in the one place they all go through.
export async function getCurrentProject(): Promise<Project | null> {
  const verdict = await accessVerdict()
  if (verdict.state === 'blocked') return null

  const store = await cookies()
  const selectedId = store.get(PROJECT_COOKIE)?.value

  if (selectedId && mayOpenProject(verdict, selectedId)) {
    const { data } = await supabase.from('projects').select(PROJECT_COLUMNS).eq('id', selectedId).single()
    if (data) return data as Project
  }

  // The oldest project THIS ACCOUNT MAY OPEN — not the oldest on the
  // database. Those were the same thing while every account could open
  // everything, and a fresh login for a member of one job would otherwise
  // land on somebody else's.
  let query = supabase
    .from('projects')
    .select(PROJECT_COLUMNS)
    .order('created_at', { ascending: true })
    .limit(1)

  if (verdict.state === 'member') query = query.in('id', verdict.projectIds)

  const { data: fallback } = await query
  return ((fallback ?? [])[0] as Project) ?? null
}

// Every project this account may open. The project switcher, the Manage
// screen and the cross-project register all read this, so filtering here is
// what stops another client's job being offered in a dropdown.
export async function listProjects(): Promise<Project[]> {
  const verdict = await accessVerdict()
  if (verdict.state === 'blocked') return []

  let query = supabase.from('projects').select(PROJECT_COLUMNS).order('created_at', { ascending: true })
  if (verdict.state === 'member') query = query.in('id', verdict.projectIds)

  const { data } = await query

  // Filtered twice on purpose: once in the query, once here. The query is the
  // efficient half; this is the half that still holds if somebody later edits
  // the query and forgets why the `.in()` was there.
  return allowedProjects(verdict, (data ?? []) as Project[])
}
