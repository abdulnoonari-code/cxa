'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'

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
}

export async function updateChecklistItem(formData: FormData) {
  const id = str(formData, 'id')
  const equipment_id = str(formData, 'equipment_id')
  const status = str(formData, 'status') ?? 'pending'
  const notes = str(formData, 'notes')
  if (!id || !equipment_id) return

  await supabase.from('checklist_items').update({ status, notes }).eq('id', id)

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

export async function checkItem(formData: FormData) {
  const id = str(formData, 'id')
  const equipment_id = str(formData, 'equipment_id')
  const status = str(formData, 'status') ?? 'pending'
  const notes = str(formData, 'notes')
  if (!id || !equipment_id) return

  const ai_comment = generateCheckComment(status, notes)

  await supabase.from('checklist_items').update({ status, notes, ai_comment }).eq('id', id)

  revalidatePath(`/equipment/${equipment_id}/checklist`)
}
