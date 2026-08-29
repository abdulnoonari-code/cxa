'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { generateAttachmentReview } from '@/lib/review'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

// Upload a document straight from the Document Review page, choosing which
// checklist item it belongs to, instead of having to navigate to that item's
// equipment checklist first.
export async function uploadDocument(formData: FormData) {
  const checklist_item_id = str(formData, 'checklist_item_id')
  const file = formData.get('file')

  if (!checklist_item_id || !(file instanceof File) || file.size === 0) return

  const { data: item } = await supabase
    .from('checklist_items')
    .select('id, equipment_id')
    .eq('id', checklist_item_id)
    .single()

  if (!item) return

  const { data: equipment } = await supabase
    .from('equipment')
    .select('tag_id')
    .eq('id', item.equipment_id)
    .single()

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${checklist_item_id}/${Date.now()}-${safeName}`

  const { error: uploadError } = await supabase.storage.from('documents').upload(path, file)
  if (uploadError) return

  const { data: publicUrlData } = supabase.storage.from('documents').getPublicUrl(path)
  const review = generateAttachmentReview(file.name, file.size, equipment?.tag_id ?? null)

  await supabase.from('attachments').insert({
    checklist_item_id,
    file_name: file.name,
    file_path: path,
    file_url: publicUrlData.publicUrl,
    review_status: review.status,
    review_note: review.note,
  })

  revalidatePath('/documents')
  revalidatePath(`/equipment/${item.equipment_id}/checklist`)
}

export async function deleteDocument(formData: FormData) {
  const id = str(formData, 'id')
  const file_path = str(formData, 'file_path')
  if (!id) return

  if (file_path) {
    await supabase.storage.from('documents').remove([file_path])
  }
  await supabase.from('attachments').delete().eq('id', id)

  revalidatePath('/documents')
}
