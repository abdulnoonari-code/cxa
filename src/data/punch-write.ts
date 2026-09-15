// The Supabase half of writing a punch item. The decisions are in
// lib/punch-write.ts, where they can be asserted without a database.

import { supabase } from '@/lib/supabase'
import { writeWithFallback, type WriteOutcome } from '@/lib/punch-write'

export { droppedNote } from '@/lib/punch-write'
export type { WriteOutcome } from '@/lib/punch-write'

/** Insert one punch item, dropping columns this database does not have. */
export async function insertIssue(row: Record<string, unknown>): Promise<WriteOutcome> {
  return writeWithFallback(row, async (attempt) => {
    const { data, error } = await supabase.from('issues').insert(attempt).select('id').single()
    return { id: (data as { id: string } | null)?.id ?? null, error }
  })
}

/** Update one punch item, dropping columns this database does not have. */
export async function patchIssue(id: string, patch: Record<string, unknown>): Promise<WriteOutcome> {
  return writeWithFallback(patch, async (attempt) => {
    const { error } = await supabase.from('issues').update(attempt).eq('id', id)
    return { id: error ? null : id, error }
  })
}
