'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

export async function createMilestone(formData: FormData) {
  const project_id = str(formData, 'project_id')
  const name = str(formData, 'name')
  if (!project_id || !name) return

  const checklist_item_id = str(formData, 'checklist_item_id')
  // equipment_id is only used to know which checklist page to refresh — it is
  // not stored on the milestones table.
  const equipment_id = str(formData, 'equipment_id')

  await supabase.from('milestones').insert({
    project_id,
    checklist_item_id,
    name,
    target_date: str(formData, 'target_date'),
    status: str(formData, 'status') ?? 'planned',
    notes: str(formData, 'notes'),
  })

  revalidatePath('/milestones')
  if (checklist_item_id && equipment_id) {
    revalidatePath(`/equipment/${equipment_id}/checklist`)
  }
}

export async function updateMilestone(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

  await supabase
    .from('milestones')
    .update({
      name: str(formData, 'name'),
      target_date: str(formData, 'target_date'),
      status: str(formData, 'status') ?? 'planned',
      notes: str(formData, 'notes'),
    })
    .eq('id', id)

  revalidatePath('/milestones')
}

export async function deleteMilestone(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return
  await supabase.from('milestones').delete().eq('id', id)
  revalidatePath('/milestones')
}
