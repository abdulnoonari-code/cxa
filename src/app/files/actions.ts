'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { outcomeParams } from '@/lib/uploads'
import { putFile, recordFile, safeStorageName } from '@/data/upload-file'

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

  const path = `project/${project_id}/${Date.now()}-${safeStorageName(file.name)}`
  const put = await putFile(file, path)
  if (!put.ok) {
    revalidatePath('/files')
    redirect(`/files?${outcomeParams(put.outcome)}`)
  }

  const outcome = await recordFile(
    'project_files',
    {
      project_id,
      file_name: file.name,
      file_path: put.stored.path,
      file_url: put.stored.url,
      category: str(formData, 'category'),
      description: str(formData, 'description'),
    },
    put.stored,
    str(formData, 'category') ?? undefined
  )

  revalidatePath('/files')
  redirect(`/files?${outcomeParams(outcome)}`)
}

export async function deleteProjectFile(formData: FormData) {
  const id = str(formData, 'id')
  const file_path = str(formData, 'file_path')
  if (!id) return

  if (file_path) await supabase.storage.from('documents').remove([file_path])
  await supabase.from('project_files').delete().eq('id', id)

  revalidatePath('/files')
}
