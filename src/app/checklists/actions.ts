'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { parseChecklistWorkbook, type ParsedCheck, type CheckProblem } from '@/lib/checklist-io'
import { generateAttachmentReview, generateCheckComment } from '@/lib/review'
import { getCurrentProject } from '@/lib/project'
import { recordAudit } from '@/lib/audit'
import { loadSubjectIndex } from '@/data/subjects'
import { buildTextIndex, findSubjectByText, subjectLabel, type Subject } from '@/lib/subjects'

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

function describe(p: CheckProblem): string {
  return `Row ${p.row} · ${p.column}: ${p.message}${p.value ? ` (found "${p.value}")` : ''}`
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

// What one parsed row is going to do to the database, worked out before
// anything is written. Nothing touches a table until every row has produced
// one of these without complaint.
type Plan = {
  row: ParsedCheck
  targets: { equipment_id: string | null; subject_type: string; subject_id: string }[]
}

// Import one checklist file.
//
// Three things can happen to a row, and which one is decided by the row
// itself, not by a mode chosen on the screen:
//
//   • it carries a CXA ID     → that exact check is updated, or removed
//   • it names a tag or system → the check is created against that subject
//   • it names nothing         → it fans out to the tags ticked on the form,
//                                because one L2 checklist normally applies to
//                                a whole family of identical tags
//
// If any row cannot be read, nothing at all is written. A half-applied
// checklist is worse than none, because nobody can tell which half applied.
export async function importProjectChecklist(formData: FormData) {
  const file = formData.get('file')
  const equipmentIds = formData.getAll('equipment_ids').filter((v): v is string => typeof v === 'string')
  const defaultLevel = str(formData, 'default_level')

  if (!(file instanceof File) || file.size === 0) {
    redirect('/checklists?import=nofile')
  }

  const project = await getCurrentProject()
  if (!project) redirect('/checklists?import=noproject')

  const parsed = await parseChecklistWorkbook(await file.arrayBuffer(), {
    defaultLevel: defaultLevel ?? undefined,
    fileName: file.name,
  })

  if (parsed.rows.length === 0 && parsed.errors.length === 0) {
    await recordAudit({
      projectId: project.id,
      action: 'checklist import failed',
      entity: 'checklist_item',
      entityLabel: file.name,
      comment:
        parsed.headingsSeen.length > 0
          ? `No item column found. Headings seen: ${parsed.headingsSeen.slice(0, 15).join(', ')}`
          : 'The file had nothing readable in it.',
    })
    const found = parsed.headingsSeen.slice(0, 8).join(', ')
    redirect(`/checklists?import=empty&headings=${encodeURIComponent(found)}`)
  }

  // ── Resolve every row against the project ──────────────────────────────
  const index = await loadSubjectIndex(project.id)
  const text = buildTextIndex(index)

  const errors: CheckProblem[] = [...parsed.errors]

  // Existing checks named by CXA ID. Fetched in one go, in chunks, so a
  // three-thousand-row file is a handful of queries rather than three
  // thousand of them.
  const namedIds = [...new Set(parsed.rows.map((r) => r.id).filter((v): v is string => !!v))]
  const known = new Map<string, { id: string; item: string }>()
  for (const part of chunk(namedIds, 200)) {
    const { data } = await supabase
      .from('checklist_items')
      .select('id, item')
      .eq('project_id', project.id)
      .in('id', part)
    for (const row of (data ?? []) as { id: string; item: string }[]) known.set(row.id, row)
  }

  const plans: Plan[] = []

  for (const row of parsed.rows) {
    if (row.id) {
      if (!known.has(row.id)) {
        errors.push({
          row: row.row,
          column: 'CXA ID',
          value: row.id,
          message: 'No check on this project has that ID. Clear the cell to create a new one instead.',
        })
        continue
      }
      plans.push({ row, targets: [] })
      continue
    }

    if (row.remove) {
      errors.push({
        row: row.row,
        column: 'Remove',
        value: 'Y',
        message: 'Only a row with a CXA ID can be removed — there is nothing to identify this one by.',
      })
      continue
    }

    if (row.subject) {
      const match = findSubjectByText(text, row.subject)
      if (!match.subject) {
        errors.push({
          row: row.row,
          column: 'Tag / System',
          value: row.subject,
          message:
            match.candidates.length > 1
              ? `More than one thing on the project is called that (${match.candidates
                  .map((c) => subjectLabel(c.type))
                  .join(', ')}). Use the tag or system code instead.`
              : 'Not a tag, system or area on this project. Add it first, or clear the cell to use the ticked tags.',
        })
        continue
      }
      const s: Subject = match.subject
      plans.push({
        row,
        targets: [
          { equipment_id: s.type === 'equipment' ? s.id : null, subject_type: s.type, subject_id: s.id },
        ],
      })
      continue
    }

    if (equipmentIds.length === 0) {
      errors.push({
        row: row.row,
        column: 'Tag / System',
        value: '',
        message: 'No tag or system on this row, and no tags ticked below. One or the other is needed.',
      })
      continue
    }

    plans.push({
      row,
      targets: equipmentIds.map((id) => ({ equipment_id: id, subject_type: 'equipment', subject_id: id })),
    })
  }

  if (errors.length > 0) {
    await recordAudit({
      projectId: project.id,
      action: 'checklist import rejected',
      entity: 'checklist_item',
      entityLabel: file.name,
      newValue: `${errors.length} problems, nothing imported`,
      comment: errors.slice(0, 12).map(describe).join(' | '),
    })
    const detail = errors.slice(0, 3).map(describe).join(' · ')
    redirect(`/checklists?import=rejected&errors=${errors.length}&detail=${encodeURIComponent(detail.slice(0, 400))}`)
  }

  // ── Nothing was wrong, so write ────────────────────────────────────────
  const removeIds = plans.filter((p) => p.row.remove).map((p) => p.row.id as string)
  const updates = plans.filter((p) => p.row.id && !p.row.remove)
  const inserts = plans.filter((p) => !p.row.id)

  for (const part of chunk(removeIds, 200)) {
    await supabase.from('checklist_items').delete().in('id', part)
  }

  for (const p of updates) {
    await supabase
      .from('checklist_items')
      .update({
        level: p.row.level,
        item: p.row.item,
        status: p.row.status,
        notes: p.row.notes,
        inspection_type: p.row.inspection_type,
        ai_comment: generateCheckComment(p.row.status, p.row.notes),
      })
      .eq('id', p.row.id as string)
  }

  const newRows = inserts.flatMap((p) =>
    p.targets.map((t) => ({
      project_id: project.id,
      equipment_id: t.equipment_id,
      subject_type: t.subject_type,
      subject_id: t.subject_id,
      level: p.row.level,
      item: p.row.item,
      status: p.row.status,
      notes: p.row.notes,
      inspection_type: p.row.inspection_type,
    }))
  )

  for (const part of chunk(newRows, 500)) {
    await supabase.from('checklist_items').insert(part)
  }

  await recordAudit({
    projectId: project.id,
    action: 'imported checklist',
    entity: 'checklist_item',
    entityLabel: file.name,
    newValue: `${newRows.length} added, ${updates.length} updated, ${removeIds.length} removed`,
    comment:
      `Read from ${parsed.sheetName ?? 'sheet'}, header row ${parsed.headerRow}. Columns used: ${parsed.detectedColumns.join(', ')}.` +
      (parsed.warnings.length > 0
        ? ` ${parsed.warnings.length} warnings: ${parsed.warnings.slice(0, 6).map(describe).join(' | ')}`
        : ''),
  })

  refresh()
  for (const id of equipmentIds) refresh(id)

  redirect(
    `/checklists?import=ok&added=${newRows.length}&updated=${updates.length}&removed=${removeIds.length}` +
      `&rows=${parsed.rows.length}&warnings=${parsed.warnings.length}`
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

  const project = await getCurrentProject()

  await supabase.from('attachments').insert({
    project_id: project?.id ?? null,
    checklist_item_id,
    file_name: file.name,
    file_path: path,
    file_url: publicUrlData.publicUrl,
    review_status: review.status,
    review_note: review.note,
  })

  refresh(equipment_id)
}
