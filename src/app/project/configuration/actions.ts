'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getCurrentProject } from '@/lib/project'
import { saveProjectConfig } from '@/data/project-config'
// RESULT_COOKIE lives in @/lib/project-config, not here: a 'use server'
// file may export only async functions. A short-lived cookie rather than a
// query string, for the same reason the invite flow uses one — a result in
// the URL survives a bookmark, a share and a history entry, and this one
// should not.
import { configFromForm, RESULT_COOKIE } from '@/lib/project-config'

export async function saveConfiguration(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return

  const config = configFromForm(
    formData.getAll('levels').map(String),
    formData.getAll('disciplines').map(String),
    String(formData.get('standards') ?? ''),
    String(formData.get('ready_means') ?? '')
  )

  const outcome = await saveProjectConfig(project.id, config)

  const jar = await cookies()
  jar.set(RESULT_COOKIE, outcome.state, { maxAge: 30, httpOnly: true, sameSite: 'lax', path: '/' })

  // Every screen that counts levels is now answering a different question,
  // so none of them may keep a cached answer to the old one.
  revalidatePath('/project/configuration')
  revalidatePath('/project')
  revalidatePath('/levels')
  revalidatePath('/dashboard')
  revalidatePath('/readiness')
  redirect('/project/configuration')
}
