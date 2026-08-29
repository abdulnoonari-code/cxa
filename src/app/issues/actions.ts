'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

// Phase 0 punch list review is the same kind of rule-based, free, automatic
// check the checklist items get — not a live AI call yet, but the pattern is
// in place so a real Claude API call can extend it later (Part 2) without
// changing where it's called from.
function generateIssueReview(
  severity: string,
  category: string | null,
  status: string,
  description: string | null
): string {
  if (category === 'A' && !description && status !== 'closed' && status !== 'verified') {
    return 'Category A (must-fix) item with no description on file — add what needs to happen before this can be verified closed.'
  }
  if ((severity === 'critical' || severity === 'major') && !description) {
    return `Marked ${severity} with no description — add detail so the corrective action is clear.`
  }
  if (status === 'ready_for_retest' && !description) {
    return 'Marked ready for retest with no note on what corrective action was taken — add one for traceability.'
  }
  if (status === 'closed' || status === 'verified') {
    return description
      ? 'Closed/verified with a description on file — looks complete.'
      : 'Closed/verified with no description — consider adding one for the record.'
  }
  return description
    ? 'Looks complete — severity/category and a description are on file.'
    : 'No description on file yet — add one for audit traceability.'
}

export async function createIssue(formData: FormData) {
  const equipment_id = str(formData, 'equipment_id')
  const title = str(formData, 'title')
  if (!equipment_id || !title) return

  const checklist_item_id = str(formData, 'checklist_item_id')
  const severity = str(formData, 'severity') ?? 'minor'
  const category = str(formData, 'category')
  const description = str(formData, 'description')
  const ai_comment = generateIssueReview(severity, category, 'open', description)

  await supabase.from('issues').insert({
    equipment_id,
    checklist_item_id,
    title,
    description,
    severity,
    category,
    status: 'open',
    ai_comment,
  })

  revalidatePath('/issues')
  // When raised directly from a checklist item, also refresh that page so the
  // new link shows up without a manual reload.
  if (checklist_item_id) {
    revalidatePath(`/equipment/${equipment_id}/checklist`)
  }
}

export async function updateIssue(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

  const severity = str(formData, 'severity') ?? 'minor'
  const category = str(formData, 'category')
  const status = str(formData, 'status') ?? 'open'
  const description = str(formData, 'description')
  const ai_comment = generateIssueReview(severity, category, status, description)

  await supabase
    .from('issues')
    .update({
      severity,
      category,
      status,
      description,
      ai_comment,
    })
    .eq('id', id)

  revalidatePath('/issues')
  redirect('/issues')
}

export async function deleteIssue(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return
  await supabase.from('issues').delete().eq('id', id)
  revalidatePath('/issues')
}
