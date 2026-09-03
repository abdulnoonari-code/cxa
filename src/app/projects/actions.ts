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
    const store = await cookies()
    store.set(PROJECT_COOKIE, data.id, { path: '/', maxAge: 60 * 60 * 24 * 365 })
  }

  refreshEverything()
  redirect('/dashboard')
}

export async function selectProject(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

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

  return (data as { id: string; name: string } | null) ?? null
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
    const failed = result.problems.map((p) => p.table).join(', ').slice(0, 160)
    redirect(`/projects?purge=partial&n=${result.deleted}&failed=${encodeURIComponent(failed)}`)
  }

  const freshParam = fresh ? `&fresh=${encodeURIComponent(fresh.name)}` : ''
  redirect(`/projects?purge=ok&n=${result.deleted}&what=${encodeURIComponent(name)}${freshParam}`)
}
