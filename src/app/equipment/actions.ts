'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

export async function createEquipment(formData: FormData) {
  const project_id = str(formData, 'project_id')
  const tag_id = str(formData, 'tag_id')
  if (!project_id || !tag_id) return

  await supabase.from('equipment').insert({
    project_id,
    tag_id,
    description: str(formData, 'description'),
    category: str(formData, 'category'),
    install_status: str(formData, 'install_status') ?? 'not_delivered',
    manufacturer: str(formData, 'manufacturer'),
    model: str(formData, 'model'),
    location: str(formData, 'location'),
  })

  revalidatePath('/equipment')
}

export async function deleteEquipment(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return
  await supabase.from('equipment').delete().eq('id', id)
  revalidatePath('/equipment')
}

export async function updateEquipment(formData: FormData) {
  const id = str(formData, 'id')
  const tag_id = str(formData, 'tag_id')
  if (!id || !tag_id) return

  await supabase
    .from('equipment')
    .update({
      tag_id,
      description: str(formData, 'description'),
      category: str(formData, 'category'),
      install_status: str(formData, 'install_status') ?? 'not_delivered',
      manufacturer: str(formData, 'manufacturer'),
      model: str(formData, 'model'),
      location: str(formData, 'location'),
    })
    .eq('id', id)

  revalidatePath('/equipment')
  redirect('/equipment')
}
