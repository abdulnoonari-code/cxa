'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { PROJECT_COOKIE } from '@/lib/project'
import { FALLBACK_PROJECT_NAME } from '@/lib/purge'
import { projectImpact, purgeProject, projectCount } from '@/data/purge'
import { verifyPassword } from '@/lib/reauth'
import { recordAudit } from '@/lib/audit'
import { accessVerdict } from '@/data/gate'
import { mayOpenProject } from '@/lib/gate'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

// Switching project changes what every other screen shows, so the whole app
// has to be revalidated, not just this page.
function refreshEverything() {
  for (const path of [
    '/projects',
    '/project',
    '/dashboard',
    '/plan',
    '/milestones',
    '/equipment',
    '/checklists',
    '/functional-tests',
    '/integrated-tests',
    '/review',
    '/issues',
    '/documents',
  ]) {
    revalidatePath(path)
  }
}

export async function createProject(formData: FormData) {
  const name = str(formData, 'name')
  if (!name) return

  const { data } = await supabase
    .from('projects')
    .insert({
      name,
      client: str(formData, 'client'),
      location: str(formData, 'location'),
      start_date: str(formData, 'start_date'),
      target_date: str(formData, 'target_date'),
    })
    .select('id')
    .single()

  // Open the new project straight away — that's almost always what you want
  // after creating one.
  if (data?.id) {
    // THE PERSON WHO MADE IT GOES ON THE TEAM, FIRST.
    //
    // Project access is now decided by the team list. A project created with
    // an empty team is a project its own author cannot open: they would be
    // redirected to configuration for a job that, one query later, they are
    // not on. Owners would not notice — they can open anything — which is
    // exactly how this would have shipped broken for everybody else.
    //
    // project_admin, not engineer: whoever starts a job can manage its team,
    // otherwise nobody can add the second person to it.
    const verdict = await accessVerdict()
    if (verdict.email) {
      await supabase
        .from('project_members')
        .insert({ project_id: data.id, email: verdict.email, role: 'project_admin' })
    }

    const store = await cookies()
    store.set(PROJECT_COOKIE, data.id, { path: '/', maxAge: 60 * 60 * 24 * 365 })
  }

  refreshEverything()

  // A brand new project has nothing in it, so a dashboard of zeroes is not
  // where anybody wants to be dropped. Configuration is the first real
  // decision on a job — which rungs of the ladder it climbs, which
  // disciplines, against which standards — and every other screen counts
  // against the answer. So that is where a new project opens.
  //
  // If the insert did not come back with an id then no project was made, and
  // sending somebody to a configuration screen for a project that does not
  // exist would be worse than useless. The list is where the form is.
  redirect(data?.id ? '/project/configuration' : '/projects')
}

// Choosing an EXISTING project is a different act: that project has already
// been configured and has records in it, so the dashboard is exactly right.
export async function selectProject(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

  // A server action is reachable by anybody signed in, with any id they like
  // — the switcher on screen is not the only way to call this. getCurrentProject
  // already refuses to honour a cookie for a project this account is not on,
  // so setting one would achieve nothing; refusing here as well means the
  // cookie never carries a lie in the first place, and the person lands back
  // on the project list rather than silently on somebody else's job.
  const verdict = await accessVerdict()
  if (!mayOpenProject(verdict, id)) redirect('/projects')

  const store = await cookies()
  store.set(PROJECT_COOKIE, id, { path: '/', maxAge: 60 * 60 * 24 * 365 })

  refreshEverything()
  redirect('/dashboard')
}


async function ensureAProjectExists(): Promise<{ id: string; name: string } | null> {
  if ((await projectCount()) > 0) return null

  const { data } = await supabase
    .from('projects')
    .insert({ name: FALLBACK_PROJECT_NAME })
    .select('id, name')
    .single()

  const fresh = (data as { id: string; name: string } | null) ?? null

  // On the team of it, for the same reason as a project somebody creates by
  // hand: this one is made automatically after the last project is deleted,
  // and a replacement its own author cannot open is worse than no
  // replacement — the cookie would point at a project that answers "no
  // project selected" on every screen.
  if (fresh) {
    const verdict = await accessVerdict()
    if (verdict.email) {
      await supabase
        .from('project_members')
        .insert({ project_id: fresh.id, email: verdict.email, role: 'project_admin' })
    }
  }

  return fresh
}

export async function deleteProject(formData: FormData) {
  const id = str(formData, 'id')
  const password = str(formData, 'password')
  if (!id) return

  const { data: project } = await supabase.from('projects').select('id, name').eq('id', id).single()
  if (!project) redirect('/projects?purge=gone')
  const name = (project as { name: string }).name

  // Your login password, checked at the moment of deletion. Being logged in
  // is not authority to destroy a project — a session can be hours old on an
  // unlocked laptop in a site office.
  const auth = await verifyPassword(password)
  if (!auth.ok) {
    redirect(`/projects?purge=badpassword&why=${encodeURIComponent(auth.reason)}`)
  }

  // Counted first, so the confirmation can say what actually went.
  const impact = await projectImpact(id)

  await recordAudit({
    projectId: id,
    action: 'project deleted',
    entity: 'project',
    entityLabel: name,
    oldValue: `${impact.total} records`,
    comment: `Confirmed by ${auth.email}. ${impact.removes.map((r) => `${r.count} ${r.label.toLowerCase()}`).join(', ') || 'No records.'}`,
  })

  const result = await purgeProject(id)

  // If that was the last one, put a fresh empty project underneath before
  // anybody lands on a screen that has nothing to scope itself to.
  const fresh = await ensureAProjectExists()

  const store = await cookies()
  if (fresh) {
    store.set(PROJECT_COOKIE, fresh.id, { path: '/', maxAge: 60 * 60 * 24 * 365 })
  } else if (store.get(PROJECT_COOKIE)?.value === id) {
    store.delete(PROJECT_COOKIE)
  }

  refreshEverything()

  if (!result.ok) {
    // Partial deletion is reported as partial. Saying "deleted" when four
    // tables refused would leave somebody believing a project is gone while
    // its records are still being counted by every rollup in the application.
    // The database's own words, not just the table name. "Audit entries would
    // not go" is not something anybody can act on; "violates foreign key
    // constraint audit_log_project_id_fkey" is.
    const failed = result.problems.map((p) => `${p.table}: ${p.message}`).join(' — ').slice(0, 400)
    redirect(`/projects?purge=partial&n=${result.deleted}&failed=${encodeURIComponent(failed)}`)
  }

  const freshParam = fresh ? `&fresh=${encodeURIComponent(fresh.name)}` : ''
  redirect(`/projects?purge=ok&n=${result.deleted}&what=${encodeURIComponent(name)}${freshParam}`)
}
