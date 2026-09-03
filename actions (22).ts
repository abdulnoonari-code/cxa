'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { outcomeParams } from '@/lib/uploads'
import { putFile, recordFile, safeStorageName } from '@/data/upload-file'
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

  const path = `${checklist_item_id}/${Date.now()}-${safeStorageName(file.name)}`
  const put = await putFile(file, path)
  if (!put.ok) {
    revalidatePath('/documents')
    redirect(`/documents?${outcomeParams(put.outcome)}`)
  }

  const review = generateAttachmentReview(file.name, file.size, equipment?.tag_id ?? null)

  const outcome = await recordFile(
    'attachments',
    {
      checklist_item_id,
      file_name: file.name,
      file_path: put.stored.path,
      file_url: put.stored.url,
      review_status: review.status,
      review_note: review.note,
    },
    put.stored,
    equipment?.tag_id ?? undefined
  )

  revalidatePath('/documents')
  revalidatePath(`/equipment/${item.equipment_id}/checklist`)
  redirect(`/documents?${outcomeParams(outcome)}`)
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
