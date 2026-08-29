'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'

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

  await supabase
    .from('checklist_items')
    .update({
      review_state,
      review_comment,
      reviewed_at: review_state === 'draft' ? null : new Date().toISOString(),
    })
    .eq('id', id)

  revalidatePath('/review')
  revalidatePath('/checklists')
  revalidatePath('/dashboard')
}

// Approve or reject everything currently listed at one level in one go — what
// a commissioning agent actually does at the end of a level walkdown.
export async function bulkSetReviewState(formData: FormData) {
  const ids = formData.getAll('ids').filter((v): v is string => typeof v === 'string')
  const review_state = str(formData, 'review_state')
  if (ids.length === 0 || !review_state) return

  await supabase
    .from('checklist_items')
    .update({ review_state, reviewed_at: new Date().toISOString() })
    .in('id', ids)

  revalidatePath('/review')
  revalidatePath('/checklists')
  revalidatePath('/dashboard')
}
