'use server'

import { getCurrentProject } from '@/lib/project'
import { ownedBy } from '@/data/owned'
import { requireActor } from '@/data/require-actor'
import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { generateAttachmentReview, generateCheckComment } from '@/lib/review'
import { parseChecklistWorkbook } from '@/lib/checklist-io'
import { FILE_ROUTE, encodePath } from '@/lib/file-url'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

// Every check must carry the project it belongs to. The project-wide screens
// filter on project_id and never walk up through equipment — that walk is what
// made them slow — so a check inserted without it is invisible everywhere but
// the tag it hangs off.
async function projectOf(equipmentId: string): Promise<string | null> {
  const { data } = await supabase.from('equipment').select('project_id').eq('id', equipmentId).single()
  return (data as { project_id: string | null } | null)?.project_id ?? null
}

export async function addChecklistItem(formData: FormData) {
  await requireActor()

  const equipment_id = str(formData, 'equipment_id')
  const level = str(formData, 'level')
  const item = str(formData, 'item')
  if (!equipment_id || !level || !item) return

  // project_id came from the TARGET tag, so posting another job's uuid
  // added a check to their register under their project.
  const project = await getCurrentProject()
  await ownedBy(project, 'equipment', equipment_id)

  await supabase.from('checklist_items').insert({
    equipment_id,
    project_id: project!.id,
    subject_type: 'equipment',
    subject_id: equipment_id,
    level,
    item,
  })

  revalidatePath(`/equipment/${equipment_id}/checklist`)
  revalidatePath('/checklists')
}

export async function updateChecklistItem(formData: FormData) {
  await requireActor()

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
  const project = await getCurrentProject()
  await ownedBy(project, 'checklist_items', id)


  await supabase.from('checklist_items').update({ status, notes, ai_comment }).eq('id', id)

  revalidatePath(`/equipment/${equipment_id}/checklist`)
}

export async function deleteChecklistItem(formData: FormData) {
  await requireActor()

  const id = str(formData, 'id')
  const equipment_id = str(formData, 'equipment_id')
  if (!id || !equipment_id) return
  const project = await getCurrentProject()
  await ownedBy(project, 'checklist_items', id)


  await supabase.from('checklist_items').delete().eq('id', id)

  revalidatePath(`/equipment/${equipment_id}/checklist`)
}

export async function uploadAttachment(formData: FormData) {
  await requireActor()

  const checklist_item_id = str(formData, 'checklist_item_id')
  const equipment_id = str(formData, 'equipment_id')
  const file = formData.get('file')

  if (!checklist_item_id || !equipment_id || !(file instanceof File) || file.size === 0) return

  // Both ids, because the row is keyed on the check and filed under the
  // tag. Unguarded, this uploaded a file into another project's evidence
  // register with a review verdict attached to it.
  const project = await getCurrentProject()
  await ownedBy(project, 'equipment', equipment_id)
  await ownedBy(project, 'checklist_items', checklist_item_id)

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${checklist_item_id}/${Date.now()}-${safeName}`

  const { error: uploadError } = await supabase.storage.from('documents').upload(path, file)
  if (uploadError) return

  // NOT getPublicUrl — see src/lib/file-url.ts.
  const publicUrlData = { publicUrl: `${FILE_ROUTE}/${encodePath(path)}` }

  const { data: equipment } = await supabase.from('equipment').select('tag_id').eq('id', equipment_id).single()
  const review = generateAttachmentReview(file.name, file.size, equipment?.tag_id ?? null)

  await supabase.from('attachments').insert({
    project_id: await projectOf(equipment_id),
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
  await requireActor()

  const id = str(formData, 'id')
  const equipment_id = str(formData, 'equipment_id')
  if (!id || !equipment_id) return

  const project = await getCurrentProject()
  await ownedBy(project, 'attachments', id)

  // The path is read back from the row. It used to be a form field handed
  // straight to storage.remove(), which deletes whatever it is given
  // anywhere in the bucket — so checking the row and deleting the path they
  // sent checked one thing and did another. Same fix as
  // src/app/files/actions.ts and src/app/documents/actions.ts; this is the
  // third of the three, and the assertion that found it sweeps for the
  // shape rather than for these three names.
  const { data: row } = await supabase
    .from('attachments')
    .select('file_path')
    .eq('id', id)
    .eq('project_id', project!.id)
    .maybeSingle()

  const stored = (row as { file_path: string | null } | null)?.file_path
  if (stored) await supabase.storage.from('documents').remove([stored])

  await supabase.from('attachments').delete().eq('id', id).eq('project_id', project!.id)

  revalidatePath(`/equipment/${equipment_id}/checklist`)
}

// Bulk-add checklist items from an uploaded .xlsx file. Parsing lives in
// lib/checklist-io.ts so the project-wide Checklists screen imports the exact
// same format.
//
// On one tag the file's own Tag column is ignored — you are standing on the
// tag already, and a sheet exported for a family of tags should still load
// onto the one in front of you. Rows that name an existing check are updated
// rather than duplicated, and rows the parser could not read are refused
// outright rather than half-applied.
export async function importChecklist(formData: FormData) {
  await requireActor()

  const equipment_id = str(formData, 'equipment_id')
  const file = formData.get('file')
  if (!equipment_id || !(file instanceof File) || file.size === 0) return

  // The tag is a form field and every row written, updated and deleted below
  // is keyed on it. Before parsing, not after: a refusal that arrives after
  // the workbook has been read is a refusal that has already done the work.
  const project = await getCurrentProject()
  await ownedBy(project, 'equipment', equipment_id)

  const parsed = await parseChecklistWorkbook(await file.arrayBuffer(), { fileName: file.name })
  if (parsed.errors.length > 0 || parsed.rows.length === 0) {
    revalidatePath(`/equipment/${equipment_id}/checklist`)
    return
  }

  const { data: existing } = await supabase.from('checklist_items').select('id').eq('equipment_id', equipment_id)
  const known = new Set((existing ?? []).map((r: { id: string }) => r.id))

  const fresh = parsed.rows.filter((r) => !r.id || !known.has(r.id))
  const named = parsed.rows.filter((r) => r.id && known.has(r.id))

  for (const r of named) {
    if (r.remove) {
      await supabase.from('checklist_items').delete().eq('id', r.id as string)
      continue
    }
    await supabase
      .from('checklist_items')
      .update({
        level: r.level,
        item: r.item,
        status: r.status,
        notes: r.notes,
        inspection_type: r.inspection_type,
        ai_comment: generateCheckComment(r.status, r.notes),
      })
      .eq('id', r.id as string)
  }

  const toAdd = fresh.filter((r) => !r.remove)
  if (toAdd.length > 0) {
    const project_id = await projectOf(equipment_id)
    await supabase.from('checklist_items').insert(
      toAdd.map((r) => ({
        equipment_id,
        project_id,
        subject_type: 'equipment',
        subject_id: equipment_id,
        level: r.level,
        item: r.item,
        status: r.status,
        notes: r.notes,
        inspection_type: r.inspection_type,
      }))
    )
  }

  revalidatePath(`/equipment/${equipment_id}/checklist`)
  revalidatePath('/checklists')
}
