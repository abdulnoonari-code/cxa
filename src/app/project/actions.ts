'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

export async function updateProject(formData: FormData) {
  const id = str(formData, 'id')
  const name = str(formData, 'name')
  if (!id || !name) return

  await supabase
    .from('projects')
    .update({
      name,
      client: str(formData, 'client'),
      location: str(formData, 'location'),
      start_date: str(formData, 'start_date'),
      target_date: str(formData, 'target_date'),
    })
    .eq('id', id)

  // The project name and dates show up on nearly every screen.
  revalidatePath('/project')
  revalidatePath('/dashboard')
  revalidatePath('/plan')
  revalidatePath('/equipment')
  revalidatePath('/checklists')
  revalidatePath('/issues')
  revalidatePath('/milestones')
  revalidatePath('/documents')
}
