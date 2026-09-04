'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { recordAudit } from '@/lib/audit'
import { getCurrentProject } from '@/lib/project'
import { STATUSES } from '@/lib/checklist'

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key)
  if (typeof v !== 'string' || v.trim() === '') return null
  return v.trim()
}

/**
 * Answer one line of a script.
 *
 * Separate from the checklist screen's save because it goes back to the
 * script, at the line you were on. A tester working down a two hundred line
 * procedure who is returned to the top of the page after every answer stops
 * using the screen by about line fifteen.
 *
 * The audit entry records the answer changing, not the line being "saved". A
 * trail that says somebody pressed a button is worth nothing; one that says
 * a check went from pass to fail is the record.
 */
export async function answerLine(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) redirect('/scripts')

  const id = str(formData, 'id')
  const sheet = str(formData, 'sheet') ?? ''
  // The query goes BEFORE the fragment. Appending "&saved=error" after a
  // "#check-..." puts it inside the fragment, where the server never sees it
  // and the browser scrolls to an anchor that does not exist.
  const path = `/scripts/${encodeURIComponent(sheet)}`
  const back = `${path}#check-${id ?? ''}`
  const backWith = (q: string) => `${path}?${q}#check-${id ?? ''}`
  if (!id) redirect(back)

  const status = str(formData, 'status')
  if (status && !STATUSES.some((s) => s.value === status)) redirect(back)

  const notes = formData.get('notes')
  const remark = typeof notes === 'string' ? notes.trim() : ''

  const { data: before } = await supabase
    .from('checklist_items')
    .select('status, notes, item, serial_no')
    .eq('id', id)
    .single()

  const was = (before ?? {}) as { status?: string | null; notes?: string | null; item?: string | null; serial_no?: string | null }

  const { error } = await supabase
    .from('checklist_items')
    .update({ status: status ?? 'pending', notes: remark === '' ? null : remark })
    .eq('id', id)

  if (error) redirect(backWith('saved=error'))

  // Only a real change is worth an entry. Somebody re-saving a line they did
  // not alter would otherwise fill the trail with noise, and the trail is
  // only useful while it can still be read.
  const statusChanged = (was.status ?? null) !== (status ?? 'pending')
  const remarkChanged = (was.notes ?? '') !== remark
  if (statusChanged || remarkChanged) {
    await recordAudit({
      projectId: project.id,
      action: statusChanged ? 'answered a script line' : 'changed a script remark',
      entity: 'checklist_item',
      entityId: id,
      entityLabel: `${sheet} line ${was.serial_no ?? '?'} — ${(was.item ?? '').slice(0, 60)}`,
      oldValue: statusChanged ? (was.status ?? 'pending') : (was.notes ?? ''),
      newValue: statusChanged ? (status ?? 'pending') : remark,
    })
  }

  revalidatePath(`/scripts/${sheet}`)
  revalidatePath('/checklists')
  revalidatePath('/rules')
  revalidatePath('/dashboard')
  redirect(back)
}
