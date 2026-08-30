'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { actorCan, recordAudit } from '@/lib/audit'
import { reviewLabel } from '@/lib/checklist'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

// Move a check along the approval chain. Kept separate from the pass/fail
// result so a technician recording a result and an agent approving it are two
// distinct acts, each with their own record.
export async function setReviewState(formData: FormData) {
  const id = str(formData, 'id')
  const review_state = str(formData, 'review_state') ?? 'draft'
  const review_comment = str(formData, 'review_comment')
  if (!id) return

  const project = await getCurrentProject()

  // Approving or rejecting is the signature that closes a record out, so it is
  // the one action that genuinely needs the right role behind it.
  const capability = review_state === 'approved' || review_state === 'rejected' ? 'approve' : 'review'
  if (!(await actorCan(capability, project?.id ?? null))) return

  const { data: before } = await supabase
    .from('checklist_items')
    .select('item, review_state')
    .eq('id', id)
    .single()

  await supabase
    .from('checklist_items')
    .update({
      review_state,
      review_comment,
      reviewed_at: review_state === 'draft' ? null : new Date().toISOString(),
    })
    .eq('id', id)

  await recordAudit({
    projectId: project?.id ?? null,
    action: `set approval to ${reviewLabel(review_state)}`,
    entity: 'checklist_item',
    entityId: id,
    entityLabel: before?.item ?? null,
    oldValue: reviewLabel(before?.review_state ?? 'draft'),
    newValue: reviewLabel(review_state),
    comment: review_comment,
  })

  revalidatePath('/review')
  revalidatePath('/checklists')
  revalidatePath('/dashboard')
  revalidatePath('/readiness')
  revalidatePath('/audit')
}

// Approve or reject everything currently listed at one level in one go — what
// a commissioning agent actually does at the end of a level walkdown.
export async function bulkSetReviewState(formData: FormData) {
  const ids = formData.getAll('ids').filter((v): v is string => typeof v === 'string')
  const review_state = str(formData, 'review_state')
  if (ids.length === 0 || !review_state) return

  const project = await getCurrentProject()
  const capability = review_state === 'approved' || review_state === 'rejected' ? 'approve' : 'review'
  if (!(await actorCan(capability, project?.id ?? null))) return

  await supabase
    .from('checklist_items')
    .update({ review_state, reviewed_at: new Date().toISOString() })
    .in('id', ids)

  await recordAudit({
    projectId: project?.id ?? null,
    action: `set approval to ${reviewLabel(review_state)} in bulk`,
    entity: 'checklist_item',
    entityLabel: `${ids.length} check${ids.length === 1 ? '' : 's'}`,
    newValue: reviewLabel(review_state),
  })

  revalidatePath('/review')
  revalidatePath('/checklists')
  revalidatePath('/dashboard')
  revalidatePath('/readiness')
  revalidatePath('/audit')
}
