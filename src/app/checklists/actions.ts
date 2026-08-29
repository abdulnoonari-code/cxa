'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { parseChecklistWorkbook } from '@/lib/checklist-import'
import { generateAttachmentReview, generateCheckComment } from '@/lib/review'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

function refresh(equipmentId?: string | null) {
  revalidatePath('/checklists')
  revalidatePath('/dashboard')
  revalidatePath('/documents')
  if (equipmentId) revalidatePath(`/equipment/${equipmentId}/checklist`)
}

// Import one checklist file and apply it to every equipment tag that was
// ticked — the same L2 checklist usually applies to a whole family of tags,
// so uploading it once and fanning it out is the normal case, not the
// exception.
export async function importProjectChecklist(formData: FormData) {
  const file = formData.get('file')
  const equipmentIds = formData.getAll('equipment_ids').filter((v): v is string => typeof v === 'string')
  const defaultLevel = str(formData, 'default_level')

  if (!(file instanceof File) || file.size === 0 || equipmentIds.length === 0) {
    redirect('/checklists?import=nofile')
  }

  const parsed = await parseChecklistWorkbook(await file.arrayBuffer(), {
    defaultLevel,
    fileName: file.name,
  })

  if (parsed.rows.length === 0) {
    const found = parsed.headings.slice(0, 8).join(', ')
    redirect(`/checklists?import=empty&headings=${encodeURIComponent(found)}`)
  }

  const rows = equipmentIds.flatMap((equipment_id) =>
    parsed.rows.map((r) => ({ equipment_id, level: r.level, item: r.item, notes: r.notes }))
  )

  await supabase.from('checklist_items').insert(rows)

  for (const id of equipmentIds) refresh(id)

  redirect(
    `/checklists?import=ok&checks=${parsed.rows.length}&tags=${equipmentIds.length}&total=${rows.length}&skipped=${parsed.skipped}`
  )
}

// Record the yes/no and the comment for one check. The rule-based reviewer
// runs on every save, so there is no separate "check" step to remember.
export async function saveCheck(formData: FormData) {
  const id = str(formData, 'id')
  const equipment_id = str(formData, 'equipment_id')
  const status = str(formData, 'status') ?? 'pending'
  const notes = str(formData, 'notes')
  if (!id) return

  await supabase
    .from('checklist_items')
    .update({ status, notes, ai_comment: generateCheckComment(status, notes) })
    .eq('id', id)

  refresh(equipment_id)
}

export async function deleteCheck(formData: FormData) {
  const id = str(formData, 'id')
  const equipment_id = str(formData, 'equipment_id')
  if (!id) return

  await supabase.from('checklist_items').delete().eq('id', id)
  refresh(equipment_id)
}

// Attach evidence to a check without leaving the checklist screen.
export async function attachEvidence(formData: FormData) {
  const checklist_item_id = str(formData, 'checklist_item_id')
  const equipment_id = str(formData, 'equipment_id')
  const tag_id = str(formData, 'tag_id')
  const file = formData.get('file')

  if (!checklist_item_id || !(file instanceof File) || file.size === 0) return

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${checklist_item_id}/${Date.now()}-${safeName}`

  const { error: uploadError } = await supabase.storage.from('documents').upload(path, file)
  if (uploadError) return

  const { data: publicUrlData } = supabase.storage.from('documents').getPublicUrl(path)
  const review = generateAttachmentReview(file.name, file.size, tag_id)

  await supabase.from('attachments').insert({
    checklist_item_id,
    file_name: file.name,
    file_path: path,
    file_url: publicUrlData.publicUrl,
    review_status: review.status,
    review_note: review.note,
  })

  refresh(equipment_id)
}
