'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

export async function createMeeting(formData: FormData) {
  const project_id = str(formData, 'project_id')
  const title = str(formData, 'title')
  if (!project_id || !title) return

  await supabase.from('meetings').insert({
    project_id,
    title,
    meeting_date: str(formData, 'meeting_date'),
    attendees: str(formData, 'attendees'),
    notes: str(formData, 'notes'),
    decisions: str(formData, 'decisions'),
  })

  revalidatePath('/meetings')
}

export async function updateMeeting(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

  await supabase
    .from('meetings')
    .update({
      title: str(formData, 'title'),
      meeting_date: str(formData, 'meeting_date'),
      attendees: str(formData, 'attendees'),
      notes: str(formData, 'notes'),
      decisions: str(formData, 'decisions'),
    })
    .eq('id', id)

  revalidatePath('/meetings')
}

export async function deleteMeeting(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return
  await supabase.from('meetings').delete().eq('id', id)
  revalidatePath('/meetings')
}
