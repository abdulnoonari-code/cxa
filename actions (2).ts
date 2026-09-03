'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { PROJECT_COOKIE } from '@/lib/project'
import { confirmationMatches } from '@/lib/purge'
import { projectImpact, purgeProject, projectCount } from '@/data/purge'
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

export async function deleteProject(formData: FormData) {
  const id = str(formData, 'id')
  const typed = str(formData, 'confirm')
  if (!id) return

  const { data: project } = await supabase.from('projects').select('id, name').eq('id', id).single()
  if (!project) redirect('/projects?purge=gone')
  const name = (project as { name: string }).name

  // The name, typed out. Not a checkbox — a checkbox sits one click from the
  // button that caused the problem.
  if (!confirmationMatches(typed, name)) {
    redirect(`/projects?purge=unconfirmed&want=${encodeURIComponent(name)}`)
  }

  // The last project is not deletable. Every screen in this application is
  // scoped to a current project, so an installation with none is not a clean
  // slate — it is an application where nothing works and no screen explains
  // why. Rename it and empty it instead; the interface says so.
  if ((await projectCount()) <= 1) {
    redirect(`/projects?purge=lastone&want=${encodeURIComponent(name)}`)
  }

  // Counted first, so the confirmation can say what actually went.
  const impact = await projectImpact(id)

  await recordAudit({
    projectId: id,
    action: 'project deleted',
    entity: 'project',
    entityLabel: name,
    oldValue: `${impact.total} records`,
    comment: impact.removes.map((r) => `${r.count} ${r.label.toLowerCase()}`).join(', ') || 'No records.',
  })

  const result = await purgeProject(id)

  const store = await cookies()
  if (store.get(PROJECT_COOKIE)?.value === id) {
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

  redirect(`/projects?purge=ok&n=${result.deleted}&what=${encodeURIComponent(name)}`)
}
