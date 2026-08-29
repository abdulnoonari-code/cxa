'use server'

import { revalidatePath } from 'next/cache'
import ExcelJS from 'exceljs'
import { supabase } from '@/lib/supabase'
import { LEVELS } from '@/lib/checklist'
import { generateAttachmentReview } from '@/lib/review'

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

// Phase 0 "Check" is a simple rule-based reviewer, not a live AI call yet.
// It flags the most common commissioning-record gaps so the pattern is in
// place to swap in a real AI review later without changing the UI.
function generateCheckComment(status: string, notes: string | null): string {
  if (status === 'fail' && !notes) {
    return 'Flagged: marked Fail with no note explaining why or what corrective action is planned. Add a note before this can be treated as resolved.'
  }
  if (status === 'fail' && notes) {
    return 'Marked Fail with a note on file. Confirm a retest is scheduled once the corrective action is complete.'
  }
  if (status === 'pass' && !notes) {
    return 'Marked Pass with no supporting note. For audit traceability, add what was verified (a reading, a test result, or who witnessed it).'
  }
  if (status === 'pass' && notes) {
    return 'Looks complete — status and a supporting note are both present.'
  }
  if (status === 'na') {
    return 'Marked Not Applicable. Confirm this was a deliberate engineering decision, not a step that was skipped.'
  }
  return 'Not yet checked — no status has been recorded for this item.'
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

function findLevelValueByLabel(text: string): string | null {
  const normalized = text.trim().toLowerCase()
  const byValue = LEVELS.find((l) => l.value.toLowerCase() === normalized)
  if (byValue) return byValue.value
  const byLabel = LEVELS.find(
    (l) => l.label.toLowerCase() === normalized || l.label.toLowerCase().startsWith(normalized)
  )
  if (byLabel) return byLabel.value
  // Loose match: "L1", "L1 FAT", "Factory Acceptance", etc.
  const byContains = LEVELS.find((l) => l.label.toLowerCase().includes(normalized) || normalized.includes(l.value.toLowerCase().split('_')[0]))
  return byContains?.value ?? null
}

// Bulk-add checklist items from an uploaded .xlsx file (two columns: Level, Item —
// the same layout the Export button produces, so a downloaded sheet can be edited
// and re-imported). Unrecognized levels or blank rows are skipped, not rejected,
// so one bad row doesn't block the rest of the import.
export async function importChecklist(formData: FormData) {
  const equipment_id = str(formData, 'equipment_id')
  const file = formData.get('file')
  if (!equipment_id || !(file instanceof File) || file.size === 0) return

  const buffer = await file.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return

  const rows: { equipment_id: string; level: string; item: string }[] = []

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return // header row
    const levelCell = String(row.getCell(1).value ?? '').trim()
    const itemCell = String(row.getCell(2).value ?? '').trim()
    if (!levelCell || !itemCell) return

    const level = findLevelValueByLabel(levelCell)
    if (!level) return

    rows.push({ equipment_id, level, item: itemCell })
  })

  if (rows.length > 0) {
    await supabase.from('checklist_items').insert(rows)
  }

  revalidatePath(`/equipment/${equipment_id}/checklist`)
}
