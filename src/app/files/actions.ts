'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

// Project-level documents — drawings, specs, manuals, contracts. These belong
// to the project rather than to any one check, which is why they live in their
// own table instead of `attachments`.
export async function uploadProjectFile(formData: FormData) {
  const project_id = str(formData, 'project_id')
  const file = formData.get('file')
  if (!project_id || !(file instanceof File) || file.size === 0) return

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `project/${project_id}/${Date.now()}-${safeName}`

  const { error } = await supabase.storage.from('documents').upload(path, file)
  if (error) return

  const { data: publicUrlData } = supabase.storage.from('documents').getPublicUrl(path)

  await supabase.from('project_files').insert({
    project_id,
    file_name: file.name,
    file_path: path,
    file_url: publicUrlData.publicUrl,
    category: str(formData, 'category'),
    description: str(formData, 'description'),
  })

  revalidatePath('/files')
}

export async function deleteProjectFile(formData: FormData) {
  const id = str(formData, 'id')
  const file_path = str(formData, 'file_path')
  if (!id) return

  if (file_path) await supabase.storage.from('documents').remove([file_path])
  await supabase.from('project_files').delete().eq('id', id)

  revalidatePath('/files')
}
