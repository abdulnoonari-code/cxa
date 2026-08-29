'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { generateAttachmentReview, generateCheckComment } from '@/lib/review'
import { parseChecklistWorkbook } from '@/lib/checklist-import'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

export async function addChecklistItem(formData: FormData) {
  const equipment_id = str(formData, 'equipment_id')
  const level = str(formData, 'level')
  const item = str(formData, 'item')
  if (!equipment_id || !level || !item) return

  await supabase.from('checklist_items').insert({
    equipment_id,
    level,
    item,
  })

  revalidatePath(`/equipment/${equipment_id}/checklist`)
  revalidatePath('/checklists')
}

export async function updateChecklistItem(formData: FormData) {
  const id = str(formData, 'id')
  const equipment_id = str(formData, 'equipment_id')
  const status = str(formData, 'status') ?? 'pending'
  const notes = str(formData, 'notes')
  if (!id || !equipment_id) return

  // Every Save now runs the rule-based check automatically — no separate
  // "Check" click needed. This is what "AI checks everything automatically"
  // means today (rule-based, free); Part 2 swaps this for a real API call
  // without changing this call site.
  const ai_comment = generateCheckComment(status, notes)

  await supabase.from('checklist_items').update({ status, notes, ai_comment }).eq('id', id)

  revalidatePath(`/equipment/${equipment_id}/checklist`)
}

export async function deleteChecklistItem(formData: FormData) {
  const id = str(formData, 'id')
  const equipment_id = str(formData, 'equipment_id')
  if (!id || !equipment_id) return

  await supabase.from('checklist_items').delete().eq('id', id)

  revalidatePath(`/equipment/${equipment_id}/checklist`)
}

export async function uploadAttachment(formData: FormData) {
  const checklist_item_id = str(formData, 'checklist_item_id')
  const equipment_id = str(formData, 'equipment_id')
  const file = formData.get('file')

  if (!checklist_item_id || !equipment_id || !(file instanceof File) || file.size === 0) return

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${checklist_item_id}/${Date.now()}-${safeName}`

  const { error: uploadError } = await supabase.storage.from('documents').upload(path, file)
  if (uploadError) return

  const { data: publicUrlData } = supabase.storage.from('documents').getPublicUrl(path)

  const { data: equipment } = await supabase.from('equipment').select('tag_id').eq('id', equipment_id).single()
  const review = generateAttachmentReview(file.name, file.size, equipment?.tag_id ?? null)

  await supabase.from('attachments').insert({
    checklist_item_id,
    file_name: file.name,
    file_path: path,
    file_url: publicUrlData.publicUrl,
    review_status: review.status,
    review_note: review.note,
  })

  revalidatePath(`/equipment/${equipment_id}/checklist`)
}

export async function deleteAttachment(formData: FormData) {
  const id = str(formData, 'id')
  const file_path = str(formData, 'file_path')
  const equipment_id = str(formData, 'equipment_id')
  if (!id || !equipment_id) return

  if (file_path) {
    await supabase.storage.from('documents').remove([file_path])
  }
  await supabase.from('attachments').delete().eq('id', id)

  revalidatePath(`/equipment/${equipment_id}/checklist`)
}

// Bulk-add checklist items from an uploaded .xlsx file. Parsing lives in
// lib/checklist-import.ts so the project-wide Checklists screen imports the
// exact same format.
export async function importChecklist(formData: FormData) {
  const equipment_id = str(formData, 'equipment_id')
  const file = formData.get('file')
  if (!equipment_id || !(file instanceof File) || file.size === 0) return

  const parsed = await parseChecklistWorkbook(await file.arrayBuffer(), { fileName: file.name })
  if (parsed.rows.length > 0) {
    await supabase.from('checklist_items').insert(
      parsed.rows.map((r) => ({ equipment_id, level: r.level, item: r.item, notes: r.notes }))
    )
  }

  revalidatePath(`/equipment/${equipment_id}/checklist`)
  revalidatePath('/checklists')
}
