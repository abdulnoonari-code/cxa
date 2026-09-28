'use server'

import { requireActor } from '@/data/require-actor'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { actorCan, recordAudit } from '@/lib/audit'
import { planFromWorkbook, type JobPlan } from '@/lib/jobsheet-io'
import { encodeOutcome, IMPORT_COOKIE, IMPORT_COOKIE_SECONDS, type ImportOutcome } from '@/lib/import-result'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

/**
 * One sheet in, a whole job out.
 *
 * ── The order matters and it is the reason this is one action ───────────
 *
 * Systems, then subsystems, then equipment, then checks. Each one needs the
 * id of the thing above it. That ordering is exactly what a person had to
 * work out for themselves when this was four screens and four spreadsheets,
 * and getting it wrong meant an import that "worked" and attached nothing.
 *
 * ── Nothing is written until the whole sheet has been read ──────────────
 *
 * If a single row is wrong the file is refused, whole. A job half imported
 * is worse than one not imported: the half that is there looks finished,
 * and nobody goes looking for the rest.
 *
 * ── Re-importing is safe, and that is deliberate ────────────────────────
 *
 * A sheet is corrected and sent again. Everything is matched on its natural
 * key — a system by name, a tag by tag, a check by tag + level + wording —
 * so a second import updates what is there rather than doubling it. Nothing
 * is ever deleted: a row taken OUT of the sheet leaves its record alone,
 * because "I removed a line from a spreadsheet" must never mean "delete the
 * signed test record underneath it".
 */

async function report(outcome: ImportOutcome): Promise<never> {
  const jar = await cookies()
  jar.set(IMPORT_COOKIE, encodeOutcome(outcome), {
    maxAge: IMPORT_COOKIE_SECONDS,
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
  })
  redirect('/jobsheet')
}

type Named = { id: string; name: string }

export async function importJobSheet(formData: FormData) {
  await requireActor()

  const project = await getCurrentProject()
  const file = formData.get('file')
  const fileName = file instanceof File ? file.name : 'the file'

  if (!project) {
    await report({ kind: 'refused', file: fileName, problems: ['No project is open. Choose a project first.'] })
  }
  if (!(await actorCan('manage', project!.id))) {
    await report({
      kind: 'refused',
      file: fileName,
      problems: ['Your role on this project cannot change the register, so nothing was imported. Ask a project admin to run it.'],
    })
  }
  if (!(file instanceof File) || file.size === 0) {
    await report({ kind: 'empty', file: fileName, problems: ['No file was attached, or it was empty.'] })
  }

  let plan: JobPlan
  try {
    plan = await planFromWorkbook(await (file as File).arrayBuffer())
  } catch {
    await report({
      kind: 'refused',
      file: fileName,
      problems: ['That file could not be opened as a spreadsheet. Save it from Excel as .xlsx and try again.'],
    })
    return
  }

  if (plan.problems.length > 0) {
    await report({
      kind: 'refused',
      file: fileName,
      problems: [
        `Nothing was imported — the sheet has ${plan.problems.length} problem${plan.problems.length === 1 ? '' : 's'} and a job half imported is worse than one not imported.`,
        ...plan.problems.map((p) => `Row ${p.row}, ${p.column}: ${p.message}`),
      ],
    })
  }

  const projectId = project!.id
  const extra: string[] = []

  // ── Systems ───────────────────────────────────────────────────────
  const { data: existingSystems } = await supabase
    .from('systems').select('id, name').eq('project_id', projectId)
  const systemByName = new Map<string, string>(
    ((existingSystems ?? []) as Named[]).map((s) => [s.name.trim().toLowerCase(), s.id]),
  )
  const newSystems = plan.systems.filter((n) => !systemByName.has(n.toLowerCase()))
  if (newSystems.length > 0) {
    const { data, error } = await supabase
      .from('systems')
      .insert(newSystems.map((name) => ({ project_id: projectId, name })))
      .select('id, name')
    if (error) await report({ kind: 'refused', file: fileName, problems: [`The systems could not be written: ${error.message}`] })
    for (const s of (data ?? []) as Named[]) systemByName.set(s.name.trim().toLowerCase(), s.id)
    extra.push(`${newSystems.length} system${newSystems.length === 1 ? '' : 's'}`)
  }

  // ── Subsystems ────────────────────────────────────────────────────
  //
  // A subsystem name is only unique inside its system: "Incomer" under two
  // switchboards is two different subsystems, and matching on name alone
  // would file the second board's checks under the first board's bay.
  // ── Scoped through the systems, because subsystems has no project_id ──
  //
  // This read had no filter on it at all. It returned every subsystem on
  // the database, and a name match against that set could file one job's
  // tag under another job's bay — a cross-project WRITE, arrived at
  // through an unscoped read.
  //
  // Harmless today, with one project on the database. Not harmless on the
  // day there are two, and by then nothing would point at this line.
  //
  // `subsystems` is one of the six tables with no project_id of its own
  // (see src/data/owned.ts), so it is scoped through its parent system —
  // and only the systems of this project are in that list.
  const ourSystemIds = [...systemByName.values()]
  const { data: existingSubs } = ourSystemIds.length
    ? await supabase.from('subsystems').select('id, name, system_id').in('system_id', ourSystemIds)
    : { data: [] as { id: string; name: string; system_id: string | null }[] }
  const subKey = (systemId: string, name: string) => `${systemId}\u0000${name.trim().toLowerCase()}`
  const subByKey = new Map<string, string>(
    ((existingSubs ?? []) as { id: string; name: string; system_id: string | null }[])
      .filter((s) => s.system_id)
      .map((s) => [subKey(s.system_id!, s.name), s.id]),
  )
  const wantSubs = plan.subsystems
    .map((s) => ({ ...s, systemId: systemByName.get(s.system.toLowerCase()) }))
    .filter((s) => s.systemId && !subByKey.has(subKey(s.systemId!, s.name)))
  if (wantSubs.length > 0) {
    const { data, error } = await supabase
      .from('subsystems')
      .insert(wantSubs.map((s) => ({ system_id: s.systemId, name: s.name })))
      .select('id, name, system_id')
    if (error) await report({ kind: 'refused', file: fileName, problems: [`The subsystems could not be written: ${error.message}`] })
    for (const s of (data ?? []) as { id: string; name: string; system_id: string }[]) subByKey.set(subKey(s.system_id, s.name), s.id)
    extra.push(`${wantSubs.length} subsystem${wantSubs.length === 1 ? '' : 's'}`)
  }

  // ── Tags ──────────────────────────────────────────────────────────
  const { data: existingTags } = await supabase
    .from('equipment').select('id, tag_id').eq('project_id', projectId)
  const tagById = new Map<string, string>(
    ((existingTags ?? []) as { id: string; tag_id: string }[]).map((e) => [e.tag_id.trim().toLowerCase(), e.id]),
  )
  let tagsAdded = 0
  let tagsUpdated = 0
  for (const t of plan.tags) {
    const systemId = systemByName.get(t.system.toLowerCase()) ?? null
    const subsystemId = t.subsystem && systemId ? subByKey.get(subKey(systemId, t.subsystem)) ?? null : null
    const row = {
      project_id: projectId,
      tag_id: t.tag,
      description: t.description || null,
      system_id: systemId,
      subsystem_id: subsystemId,
    }
    const existing = tagById.get(t.tag.toLowerCase())
    if (existing) {
      await supabase.from('equipment').update(row).eq('id', existing).eq('project_id', projectId)
      tagsUpdated++
    } else {
      const { data, error } = await supabase.from('equipment').insert(row).select('id, tag_id').single()
      if (error) await report({ kind: 'refused', file: fileName, problems: [`${t.tag} could not be written: ${error.message}`] })
      if (data) tagById.set((data as { tag_id: string }).tag_id.toLowerCase(), (data as { id: string }).id)
      tagsAdded++
    }
  }

  // ── Checks ────────────────────────────────────────────────────────
  //
  // Matched on tag + level + wording. Re-running the same sheet updates
  // rather than duplicates; a row removed from the sheet is LEFT ALONE,
  // because a deleted spreadsheet line must never delete a signed record.
  const { data: existingChecks } = await supabase
    .from('checklist_items').select('id, equipment_id, level, item').eq('project_id', projectId)
  const checkKey = (equipmentId: string, level: string, item: string) =>
    `${equipmentId}\u0000${level}\u0000${item.trim().toLowerCase()}`
  const checkByKey = new Map<string, string>(
    ((existingChecks ?? []) as { id: string; equipment_id: string | null; level: string; item: string }[])
      .filter((c) => c.equipment_id)
      .map((c) => [checkKey(c.equipment_id!, c.level, c.item), c.id]),
  )

  const toInsert: Record<string, unknown>[] = []
  let checksUpdated = 0
  for (const c of plan.checks) {
    const equipmentId = tagById.get(c.tag.toLowerCase())
    if (!equipmentId) continue
    const existing = checkByKey.get(checkKey(equipmentId, c.level, c.item))
    if (existing) {
      if (c.notes || c.itp) {
        const patch: Record<string, unknown> = {}
        if (c.notes) patch.notes = c.notes
        if (c.itp) patch.inspection_type = c.itp
        await supabase.from('checklist_items').update(patch).eq('id', existing).eq('project_id', projectId)
        checksUpdated++
      }
      continue
    }
    toInsert.push({
      project_id: projectId,
      equipment_id: equipmentId,
      level: c.level,
      item: c.item,
      status: 'pending',
      notes: c.notes || null,
      inspection_type: c.itp ?? null,
      subject_type: 'equipment',
      subject_id: equipmentId,
    })
  }

  // In batches: a single insert of several thousand rows is refused by the
  // API, and a sheet for a substation is several thousand rows.
  for (let i = 0; i < toInsert.length; i += 400) {
    const { error } = await supabase.from('checklist_items').insert(toInsert.slice(i, i + 400))
    if (error) {
      await report({
        kind: 'refused',
        file: fileName,
        problems: [
          `The tags were written but the checks failed at row ${i + 1}: ${error.message}`,
          'Correct the sheet and import it again — re-importing updates rather than duplicates.',
        ],
      })
    }
  }

  await recordAudit({
    projectId,
    action: 'imported a job sheet',
    entity: 'project',
    entityId: projectId,
    entityLabel: fileName,
    newValue: `${plan.systems.length} systems · ${plan.tags.length} tags · ${plan.checks.length} checks`,
  })

  for (const path of ['/jobsheet', '/checklists', '/equipment', '/systems', '/plan', '/dashboard']) revalidatePath(path)

  await report({
    kind: 'done',
    file: fileName,
    added: toInsert.length,
    updated: checksUpdated,
    extra: [...extra, `${tagsAdded} tag${tagsAdded === 1 ? '' : 's'} added`, ...(tagsUpdated ? [`${tagsUpdated} updated`] : [])],
  })
}
