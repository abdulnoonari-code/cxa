'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

export async function createIssue(formData: FormData) {
  const equipment_id = str(formData, 'equipment_id')
  const title = str(formData, 'title')
  if (!equipment_id || !title) return

  await supabase.from('issues').insert({
    equipment_id,
    title,
    description: str(formData, 'description'),
    severity: str(formData, 'severity') ?? 'minor',
    status: 'open',
  })

  revalidatePath('/issues')
}

export async function updateIssue(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

  await supabase
    .from('issues')
    .update({
      severity: str(formData, 'severity') ?? 'minor',
      status: str(formData, 'status') ?? 'open',
      description: str(formData, 'description'),
    })
    .eq('id', id)

  revalidatePath('/issues')
  redirect('/issues')
}

export async function deleteIssue(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return
  await supabase.from('issues').delete().eq('id', id)
  revalidatePath('/issues')
}
