'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { PROJECT_COOKIE } from '@/lib/project'

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
  if (!id) return

  // Equipment, checks, documents, issues and milestones all cascade from the
  // project row, so this removes the whole project's data.
  await supabase.from('projects').delete().eq('id', id)

  const store = await cookies()
  if (store.get(PROJECT_COOKIE)?.value === id) {
    store.delete(PROJECT_COOKIE)
  }

  refreshEverything()
  redirect('/projects')
}
