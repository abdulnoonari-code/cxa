'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { getActor, recordAudit } from '@/lib/audit'
import { loadSubjectIndex } from '@/data/subjects'
import { buildTextIndex, findSubjectByText, subjectLabel } from '@/lib/subjects'
import { loadPunchRefs } from '@/data/punchlist'
import { nextRef, refSeries } from '@/lib/punchlist'
import { parsePunchWorkbook, type PunchProblem } from '@/lib/punchlist-io'
import { storeIssuePhoto } from '@/data/photo-store'
import { outcomeParams } from '@/lib/uploads'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

function refresh(equipmentId?: string | null) {
  revalidatePath('/issues')
  revalidatePath('/dashboard')
  revalidatePath('/assets')
  revalidatePath('/readiness')
  if (equipmentId) revalidatePath(`/equipment/${equipmentId}/checklist`)
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

// Clearing a defect and accepting that it is cleared are two different events
// with two different signatures. These stamps record which of them happened
// and who says so, rather than letting one field stand for both.
function stamps(
  status: string,
  actorName: string,
  previous: { closed_at: string | null; closed_by?: string | null; verified_at: string | null }
) {
  const now = new Date().toISOString()
  // The contractor says the work is done; the commissioning agent says it is
  // accepted. Reopening an item clears both, because a stamp that survives a
  // reopen says an item was accepted when it is sitting there open.
  const cleared = status === 'ready_for_retest' || status === 'verified' || status === 'closed'
  const accepted = status === 'verified' || status === 'closed'
  return {
    closed_at: cleared ? previous.closed_at ?? now : null,
    closed_by: cleared ? previous.closed_by ?? actorName : null,
    verified_at: accepted ? previous.verified_at ?? now : null,
    verified_by: accepted ? actorName : null,
  }
}

export async function createIssue(formData: FormData) {
  const project = await getCurrentProject()
  const title = str(formData, 'title')
  if (!project || !title) return

  // A punch item may be raised against a tag or against a system. It used to
  // be a tag or nothing, which meant "the earthing across the whole 115 kV
  // yard" had to be filed against whichever tag happened to be nearest.
  const subjectRef = str(formData, 'subject') // "type:id" from the picker
  const equipment_id = str(formData, 'equipment_id')

  let subject_type: string | null = null
  let subject_id: string | null = null
  let equipment: string | null = equipment_id

  if (subjectRef && subjectRef.includes(':')) {
    const [type, id] = subjectRef.split(':')
    subject_type = type
    subject_id = id
    equipment = type === 'equipment' ? id : null
  } else if (equipment_id) {
    subject_type = 'equipment'
    subject_id = equipment_id
  }

  if (!subject_id) return

  const severity = str(formData, 'severity') ?? 'minor'
  const category = str(formData, 'category')
  const description = str(formData, 'description')
  const checklist_item_id = str(formData, 'checklist_item_id')
  const actor = await getActor(project.id)

  const ref = nextRef(await loadPunchRefs(project.id))

  const { data: created } = await supabase.from('issues').insert({
    // Without this the item is invisible on every project screen — they all
    // filter on project_id and none of them walk up through equipment.
    project_id: project.id,
    ref,
    equipment_id: equipment,
    subject_type,
    subject_id,
    checklist_item_id,
    title,
    description,
    severity,
    category,
    status: 'open',
    level: str(formData, 'level'),
    raised_by: str(formData, 'raised_by') ?? actor.name ?? null,
    responsible_party: str(formData, 'responsible_party'),
    discipline: str(formData, 'discipline'),
    location: str(formData, 'location'),
    due_date: str(formData, 'due_date'),
    ai_comment: generateIssueReview(severity, category, 'open', description),
  }).select('id').single()

  const newId = (created as { id: string } | null)?.id ?? null

  await recordAudit({
    projectId: project.id,
    action: 'raised punch item',
    entity: 'issue',
    entityLabel: `${ref} — ${title}`,
    newValue: category ? `Category ${category}` : 'Uncategorised',
  })

  // ── The photo, if one came with it ─────────────────────────────────────
  //
  // Somebody raising a punch item is standing in front of the defect with the
  // photograph already on their phone. Making them save the item, find it in
  // the list, open it and scroll down is three steps too many.
  //
  // The order here is deliberate and is the whole point: **the item is created
  // first, and a photo that fails never takes it with it.** Losing a raised
  // defect because the file was a HEIC off an iPhone would be far worse than
  // a punch item with no picture — the defect is the thing that matters, the
  // photograph is evidence for it.
  const photo = formData.get('photo')
  let photoNote: string | null = null
  const photoAttempted = photo instanceof File && photo.size > 0
  const photoName = photo instanceof File ? photo.name : 'the photograph'

  if (newId && photo instanceof File && photo.size > 0) {
    const stored = await storeIssuePhoto({
      projectId: project.id,
      issueId: newId,
      file: photo,
      kind: 'defect',
      caption: str(formData, 'photo_caption'),
      uploadedByName: actor.name ?? actor.email ?? null,
    })

    if (stored.ok) {
      await recordAudit({
        projectId: project.id,
        action: 'defect photo attached',
        entity: 'issue',
        entityId: newId,
        entityLabel: `${ref} — ${photo.name}`,
        comment: 'Attached when the item was raised.',
      })
    } else {
      photoNote = `${stored.reason} ${stored.hint}`
      await recordAudit({
        projectId: project.id,
        action: 'photo not attached to new punch item',
        entity: 'issue',
        entityId: newId,
        entityLabel: `${ref} — ${photo.name}`,
        comment: `${photoNote} The punch item itself was raised and is not affected.`,
      })
    }
  }

  refresh(equipment)
  if (checklist_item_id && equipment) revalidatePath(`/equipment/${equipment}/checklist`)

  // Both outcomes are reported, not just the failure. A successful upload
  // that says nothing is indistinguishable from one that silently failed —
  // which is how a punch photograph came to be missing without anybody
  // knowing until a report was generated weeks later.
  if (photoAttempted) {
    const outcome = photoNote
      ? { ok: false, file: photoName, reason: photoNote, hint: 'The punch item itself was raised and is fine — open it and attach the photograph there once this is sorted.' }
      : { ok: true, file: photoName, against: ref }
    redirect(`/issues?raised=${encodeURIComponent(ref)}&${outcomeParams(outcome)}`)
  }
}

export async function updateIssue(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

  const project = await getCurrentProject()
  const actor = await getActor(project?.id ?? null)

  const { data: before } = await supabase
    .from('issues')
    .select('status, category, closed_at, closed_by, verified_at, equipment_id, ref, title')
    .eq('id', id)
    .single()

  const previous = (before ?? { closed_at: null, closed_by: null, verified_at: null }) as {
    status?: string
    category?: string | null
    closed_at: string | null
    closed_by: string | null
    verified_at: string | null
    equipment_id?: string | null
    ref?: string | null
    title?: string
  }

  const severity = str(formData, 'severity') ?? 'minor'
  const category = str(formData, 'category')
  const status = str(formData, 'status') ?? 'open'
  const description = str(formData, 'description')
  const mark = stamps(status, actor.name ?? 'Unknown', previous)

  await supabase
    .from('issues')
    .update({
      severity,
      category,
      status,
      description,
      level: str(formData, 'level'),
      responsible_party: str(formData, 'responsible_party'),
      discipline: str(formData, 'discipline'),
      location: str(formData, 'location'),
      due_date: str(formData, 'due_date'),
      closed_at: mark.closed_at,
      closed_by: mark.closed_by,
      verified_at: mark.verified_at,
      verified_by: mark.verified_by,
      ai_comment: generateIssueReview(severity, category, status, description),
    })
    .eq('id', id)

  if (project && previous.status !== status) {
    await recordAudit({
      projectId: project.id,
      action: 'changed punch item status',
      entity: 'issue',
      entityLabel: `${previous.ref ?? ''} — ${previous.title ?? ''}`.trim(),
      oldValue: previous.status ?? null,
      newValue: status,
    })
  }

  refresh(previous.equipment_id ?? null)
  redirect('/issues')
}

export async function deleteIssue(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

  const project = await getCurrentProject()
  const { data: before } = await supabase.from('issues').select('ref, title').eq('id', id).single()

  await supabase.from('issues').delete().eq('id', id)

  if (project) {
    const row = before as { ref: string | null; title: string } | null
    await recordAudit({
      projectId: project.id,
      action: 'deleted punch item',
      entity: 'issue',
      entityLabel: row ? `${row.ref ?? ''} — ${row.title}`.trim() : id,
      comment: 'The punch number is not reused.',
    })
  }

  refresh()
}

// ── Import ───────────────────────────────────────────────────────────────

function describe(p: PunchProblem): string {
  return `Row ${p.row} · ${p.column}: ${p.message}${p.value ? ` (found "${p.value}")` : ''}`
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * Import a marked-up punch list.
 *
 * This is the file that goes back and forth with the client, so a row is
 * matched in the order that loses the least: the CXA ID first, then the punch
 * number, then — for a row that has neither — a new item with a new number.
 * If any row cannot be read, nothing is written at all.
 */
export async function importPunchList(formData: FormData) {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) redirect('/issues?import=nofile')

  const project = await getCurrentProject()
  if (!project) redirect('/issues?import=noproject')

  const parsed = await parsePunchWorkbook(await file.arrayBuffer(), { fileName: file.name })

  if (parsed.rows.length === 0 && parsed.errors.length === 0) {
    await recordAudit({
      projectId: project.id,
      action: 'punch list import failed',
      entity: 'issue',
      entityLabel: file.name,
      comment:
        parsed.headingsSeen.length > 0
          ? `No punch item column found. Headings seen: ${parsed.headingsSeen.slice(0, 15).join(', ')}`
          : 'The file had nothing readable in it.',
    })
    redirect(`/issues?import=empty&headings=${encodeURIComponent(parsed.headingsSeen.slice(0, 8).join(', '))}`)
  }

  const index = await loadSubjectIndex(project.id)
  const text = buildTextIndex(index)
  const errors: PunchProblem[] = [...parsed.errors]

  // Everything already on the project, keyed both ways, so matching is two
  // lookups rather than a query per row.
  const { data: existingRows } = await supabase
    .from('issues')
    .select('id, ref')
    .eq('project_id', project.id)
  const existing = (existingRows ?? []) as { id: string; ref: string | null }[]
  const byId = new Map(existing.map((r) => [r.id, r]))
  const byRef = new Map(existing.filter((r) => r.ref).map((r) => [r.ref as string, r]))

  type Plan = {
    row: (typeof parsed.rows)[number]
    targetId: string | null
    subject: { equipment_id: string | null; subject_type: string | null; subject_id: string | null }
  }
  const plans: Plan[] = []
  const seenRefs = new Set<string>()

  for (const row of parsed.rows) {
    let targetId: string | null = null

    if (row.id) {
      if (!byId.has(row.id)) {
        errors.push({
          row: row.row,
          column: 'CXA ID',
          value: row.id,
          message: 'No punch item on this project has that ID. Clear the cell to raise a new one instead.',
        })
        continue
      }
      targetId = row.id
    } else if (row.ref) {
      const found = byRef.get(row.ref)
      if (found) targetId = found.id
      // A punch number that does not exist yet is not an error — the client
      // may have added rows and numbered them themselves. It is honoured if
      // it is free, and reported if the same file uses it twice.
      else if (seenRefs.has(row.ref)) {
        errors.push({
          row: row.row,
          column: 'Punch no',
          value: row.ref,
          message: 'This punch number appears more than once in the file. Every item needs its own.',
        })
        continue
      }
    }
    if (row.ref) seenRefs.add(row.ref)

    if (row.remove && !targetId) {
      errors.push({
        row: row.row,
        column: 'Remove',
        value: 'Y',
        message: 'Only an item already on the project can be removed — there is nothing to identify this row by.',
      })
      continue
    }

    let subject: Plan['subject'] = { equipment_id: null, subject_type: null, subject_id: null }
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
              : 'Not a tag, system or area on this project. Add it first, or clear the cell.',
        })
        continue
      }
      const s = match.subject
      subject = {
        equipment_id: s.type === 'equipment' ? s.id : null,
        subject_type: s.type,
        subject_id: s.id,
      }
    } else if (!targetId) {
      errors.push({
        row: row.row,
        column: 'Tag / System',
        value: '',
        message: 'A new punch item has to say what it is against. Put a tag or a system name in this column.',
      })
      continue
    }

    plans.push({ row, targetId, subject })
  }

  if (errors.length > 0) {
    await recordAudit({
      projectId: project.id,
      action: 'punch list import rejected',
      entity: 'issue',
      entityLabel: file.name,
      newValue: `${errors.length} problems, nothing imported`,
      comment: errors.slice(0, 12).map(describe).join(' | '),
    })
    const detail = errors.slice(0, 3).map(describe).join(' · ')
    redirect(`/issues?import=rejected&errors=${errors.length}&detail=${encodeURIComponent(detail.slice(0, 400))}`)
  }

  const removals = plans.filter((p) => p.row.remove && p.targetId)
  const updates = plans.filter((p) => p.targetId && !p.row.remove)
  const additions = plans.filter((p) => !p.targetId && !p.row.remove)

  for (const part of chunk(removals.map((p) => p.targetId as string), 200)) {
    await supabase.from('issues').delete().in('id', part)
  }

  const actor = await getActor(project.id)

  for (const p of updates) {
    const { data: before } = await supabase
      .from('issues')
      .select('closed_at, closed_by, verified_at')
      .eq('id', p.targetId as string)
      .single()
    const mark = stamps(p.row.status, actor.name ?? 'Import', (before ?? {
      closed_at: null,
      closed_by: null,
      verified_at: null,
    }) as { closed_at: string | null; closed_by: string | null; verified_at: string | null })

    await supabase
      .from('issues')
      .update({
        title: p.row.title,
        description: p.row.description,
        severity: p.row.severity,
        category: p.row.category,
        status: p.row.status,
        level: p.row.level,
        raised_by: p.row.raised_by,
        responsible_party: p.row.responsible_party,
        discipline: p.row.discipline,
        location: p.row.location,
        due_date: p.row.due_date,
        closed_at: mark.closed_at,
        closed_by: mark.closed_by,
        verified_at: mark.verified_at,
        verified_by: mark.verified_by,
        ai_comment: generateIssueReview(p.row.severity, p.row.category, p.row.status, p.row.description),
        // A subject is only overwritten when the file names one. A blank cell
        // on an existing item means "unchanged", not "detach it".
        ...(p.subject.subject_id ? p.subject : {}),
      })
      .eq('id', p.targetId as string)
  }

  // New items take the numbers the file gave them where it gave them, and the
  // next free ones otherwise — issued as one run so a batch cannot collide
  // with itself.
  const needNumbers = additions.filter((p) => !p.row.ref).length
  const series = refSeries(
    [...existing.map((r) => r.ref), ...additions.map((p) => p.row.ref)],
    needNumbers
  )
  let nextIndex = 0

  const newRows = additions.map((p) => ({
    project_id: project.id,
    ref: p.row.ref ?? series[nextIndex++],
    equipment_id: p.subject.equipment_id,
    subject_type: p.subject.subject_type,
    subject_id: p.subject.subject_id,
    title: p.row.title,
    description: p.row.description,
    severity: p.row.severity,
    category: p.row.category,
    status: p.row.status,
    level: p.row.level,
    raised_by: p.row.raised_by,
    responsible_party: p.row.responsible_party,
    discipline: p.row.discipline,
    location: p.row.location,
    due_date: p.row.due_date,
    ai_comment: generateIssueReview(p.row.severity, p.row.category, p.row.status, p.row.description),
  }))

  for (const part of chunk(newRows, 500)) {
    await supabase.from('issues').insert(part)
  }

  await recordAudit({
    projectId: project.id,
    action: 'imported punch list',
    entity: 'issue',
    entityLabel: file.name,
    newValue: `${newRows.length} raised, ${updates.length} updated, ${removals.length} removed`,
    comment:
      `Read from ${parsed.sheetName ?? 'sheet'}, header row ${parsed.headerRow}. Columns used: ${parsed.detectedColumns.join(', ')}.` +
      (parsed.warnings.length > 0
        ? ` ${parsed.warnings.length} warnings: ${parsed.warnings.slice(0, 6).map(describe).join(' | ')}`
        : ''),
  })

  refresh()
  redirect(
    `/issues?import=ok&added=${newRows.length}&updated=${updates.length}&removed=${removals.length}` +
      `&rows=${parsed.rows.length}&warnings=${parsed.warnings.length}`
  )
}
