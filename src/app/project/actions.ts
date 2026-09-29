'use server'

import { mayOpenProject } from '@/lib/gate'
import { accessVerdict } from '@/data/gate'
import { requireActor } from '@/data/require-actor'
import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { actorCan, recordAudit } from '@/lib/audit'
import { hierarchyFromWorkbook, reconcileTree, type ExistingTree, type TagHome } from '@/lib/hierarchy-io'
import { encodeOutcome, IMPORT_COOKIE, IMPORT_COOKIE_SECONDS, type ImportOutcome } from '@/lib/import-result'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

export async function updateProject(formData: FormData) {
  await requireActor()

  const id = str(formData, 'id')
  const name = str(formData, 'name')
  if (!id || !name) return

  // ownedBy cannot help here — a project is not on a project. This is the
  // one place mayOpenProject is the right check, and it was missing: the id
  // is a form field, so any signed-in member of any job could rename any
  // other job on the database and rewrite its client and its dates.
  const verdict = await accessVerdict()
  if (!mayOpenProject(verdict, id)) return

  await supabase
    .from('projects')
    .update({
      name,
      client: str(formData, 'client'),
      location: str(formData, 'location'),
      start_date: str(formData, 'start_date'),
      target_date: str(formData, 'target_date'),
    })
    .eq('id', id)

  // The project name and dates show up on nearly every screen.
  revalidatePath('/project')
  revalidatePath('/dashboard')
  revalidatePath('/plan')
  revalidatePath('/equipment')
  revalidatePath('/checklists')
  revalidatePath('/issues')
  revalidatePath('/milestones')
  revalidatePath('/documents')
}

/**
 * The hierarchy, back in.
 *
 * Systems, then subsystems, then tags — each needs the id of the thing
 * above it, which is the ordering somebody had to work out for themselves
 * when this was three screens and three spreadsheets.
 *
 * NOTHING IS WRITTEN UNTIL THE WHOLE SHEET HAS BEEN READ. One bad row and
 * the file is refused whole: a job half imported is worse than one not
 * imported, because the half that is there looks finished and nobody goes
 * looking for the rest.
 *
 * NOTHING IS EVER DELETED. A tag taken out of the sheet keeps its record,
 * its checks and its signatures. Removing a line from a spreadsheet must
 * never delete a signed test record.
 */
export async function importHierarchy(formData: FormData) {
  await requireActor()

  const project = await getCurrentProject()
  const file = formData.get('file')
  const fileName = file instanceof File ? file.name : 'the file'

  const say = async (outcome: ImportOutcome): Promise<never> => {
    const jar = await cookies()
    jar.set(IMPORT_COOKIE, encodeOutcome(outcome), {
      maxAge: IMPORT_COOKIE_SECONDS, path: '/', httpOnly: false, sameSite: 'lax',
    })
    redirect('/project')
  }

  if (!project) await say({ kind: 'refused', file: fileName, problems: ['No project is open.'] })
  if (!(await actorCan('manage', project!.id))) {
    await say({ kind: 'refused', file: fileName, problems: ['Your role on this project cannot change the register. Ask a project admin to import it.'] })
  }
  if (!(file instanceof File) || file.size === 0) {
    await say({ kind: 'empty', file: fileName, problems: ['No file was attached, or it was empty.'] })
  }

  let sheet
  try {
    sheet = await hierarchyFromWorkbook(await (file as File).arrayBuffer())
  } catch {
    await say({ kind: 'unreadable', file: fileName, problems: ['That file could not be opened as a spreadsheet. Save it from Excel as .xlsx and try again.'] })
    return
  }

  if (sheet.problems.length > 0) {
    await say({
      kind: 'refused',
      file: fileName,
      problems: [
        `Nothing was imported — the sheet has ${sheet.problems.length} problem${sheet.problems.length === 1 ? '' : 's'}.`,
        ...sheet.problems.map((p) => `Row ${p.row}, ${p.column}: ${p.message}`),
      ],
    })
  }

  const projectId = project!.id
  const k = (v: string) => v.trim().toLowerCase()

  const [{ data: assetRows }, { data: sysRows }, { data: typeRows }, { data: tagRows }] = await Promise.all([
    supabase.from('areas').select('id, name').eq('project_id', projectId),
    supabase.from('systems').select('id, name, area_id').eq('project_id', projectId),
    supabase.from('equipment_types').select('id, type_code').eq('project_id', projectId),
    supabase.from('equipment').select('id, tag_id').eq('project_id', projectId),
  ])
  const ourSystemIds = ((sysRows ?? []) as { id: string }[]).map((r) => r.id)
  // `subsystems` carries no project_id of its own, so it is scoped through
  // this project's systems. An unfiltered read would return every other
  // job's bays as well.
  const { data: subRows } = ourSystemIds.length
    ? await supabase.from('subsystems').select('id, name, system_id').in('system_id', ourSystemIds)
    : { data: [] as { id: string; name: string; system_id: string | null }[] }

  const existing: ExistingTree = {
    assets: (assetRows ?? []) as ExistingTree['assets'],
    systems: (sysRows ?? []) as ExistingTree['systems'],
    subsystems: (subRows ?? []) as ExistingTree['subsystems'],
    equipmentTypes: (typeRows ?? []) as ExistingTree['equipmentTypes'],
    tags: (tagRows ?? []) as ExistingTree['tags'],
  }
  const work = reconcileTree(sheet, existing)

  // ── Assets ──
  const assetIdByName = new Map(existing.assets.map((a) => [k(a.name), a.id]))
  if (work.assetsToAdd.length > 0) {
    const { data, error } = await supabase
      .from('areas')
      .insert(work.assetsToAdd.map((name) => ({ project_id: projectId, name })))
      .select('id, name')
    if (error) await say({ kind: 'refused', file: fileName, problems: [`The assets could not be written: ${error.message}`] })
    for (const a of (data ?? []) as { id: string; name: string }[]) assetIdByName.set(k(a.name), a.id)
  }

  // ── Systems ──
  //
  // Keyed by (asset, name), with the same no-asset fallback the reconcile
  // uses: a system loaded before assets existed must be found, not doubled.
  const sysKey = (asset: string, name: string) => `${k(asset)}\u0000${k(name)}`
  const systemIdByKey = new Map<string, string>()
  const looseSystemIdByName = new Map<string, string>()
  const assetNameById = new Map([...assetIdByName.entries()].map(([name, id]) => [id, name]))
  for (const s of existing.systems) {
    const a = s.area_id ? assetNameById.get(s.area_id) ?? null : null
    if (s.area_id && a === null) continue
    if (a === null) looseSystemIdByName.set(k(s.name), s.id)
    else systemIdByKey.set(`${a}\u0000${k(s.name)}`, s.id)
  }
  const systemIdFor = (asset: string, name: string) =>
    systemIdByKey.get(sysKey(asset, name)) ?? looseSystemIdByName.get(k(name))

  if (work.systemsToAdd.length > 0) {
    const { data, error } = await supabase
      .from('systems')
      .insert(work.systemsToAdd.map((s) => ({
        project_id: projectId,
        name: s.name,
        system_id: s.name,
        area_id: s.asset ? assetIdByName.get(k(s.asset)) ?? null : null,
      })))
      .select('id, name, area_id')
    if (error) await say({ kind: 'refused', file: fileName, problems: [`The systems could not be written: ${error.message}`] })
    for (const s of (data ?? []) as { id: string; name: string; area_id: string | null }[]) {
      const a = s.area_id ? assetNameById.get(s.area_id) ?? null : null
      if (a === null) looseSystemIdByName.set(k(s.name), s.id)
      else systemIdByKey.set(`${a}\u0000${k(s.name)}`, s.id)
    }
  }

  // ── Subsystems ──
  const subKey = (systemId: string, name: string) => `${systemId}\u0000${k(name)}`
  const subIdByKey = new Map(
    existing.subsystems.filter((s) => s.system_id).map((s) => [subKey(s.system_id!, s.name), s.id]),
  )
  if (work.subsystemsToAdd.length > 0) {
    const rows = work.subsystemsToAdd
      .map((s) => ({ system_id: systemIdFor(s.asset, s.system), name: s.name }))
      .filter((r) => r.system_id)
    if (rows.length > 0) {
      const { data, error } = await supabase.from('subsystems').insert(rows).select('id, name, system_id')
      if (error) await say({ kind: 'refused', file: fileName, problems: [`The subsystems could not be written: ${error.message}`] })
      for (const s of (data ?? []) as { id: string; name: string; system_id: string }[]) {
        subIdByKey.set(subKey(s.system_id, s.name), s.id)
      }
    }
  }

  // ── Equipment types ──
  //
  // A type the sheet names but the project does not have yet is created
  // with its code as its name and nothing else filled in. The point is that
  // the tag can be linked to it today; the manufacturer and rating are
  // filled in on the Equipment Types screen afterwards, by somebody who
  // knows them.
  const typeIdByCode = new Map(existing.equipmentTypes.map((t) => [k(t.type_code), t.id]))
  if (work.equipmentTypesToAdd.length > 0) {
    const { data, error } = await supabase
      .from('equipment_types')
      .insert(work.equipmentTypesToAdd.map((code) => ({ project_id: projectId, type_code: code, name: code })))
      .select('id, type_code')
    // A database without the equipment_types table must not lose the rest
    // of the import: the tree is worth having even with no types on it.
    if (!error) {
      for (const t of (data ?? []) as { id: string; type_code: string }[]) typeIdByCode.set(k(t.type_code), t.id)
    }
  }

  const rowFor = (t: TagHome) => {
    const systemId = systemIdFor(t.asset, t.system) ?? null
    return {
      project_id: projectId,
      tag_id: t.tag,
      description: t.description || null,
      system_id: systemId,
      subsystem_id: t.subsystem && systemId ? subIdByKey.get(subKey(systemId, t.subsystem)) ?? null : null,
      type_id: t.equipmentType ? typeIdByCode.get(k(t.equipmentType)) ?? null : null,
    }
  }

  for (const t of work.tagsToUpdate) {
    await supabase.from('equipment').update(rowFor(t)).eq('id', t.id).eq('project_id', projectId)
  }
  for (let i = 0; i < work.tagsToAdd.length; i += 400) {
    const { error } = await supabase.from('equipment').insert(work.tagsToAdd.slice(i, i + 400).map(rowFor))
    if (error) {
      await say({
        kind: 'refused',
        file: fileName,
        problems: [
          `The tags failed at row ${i + 1}: ${error.message}`,
          'Correct the sheet and import it again — re-importing updates rather than duplicates.',
        ],
      })
    }
  }

  await recordAudit({
    projectId,
    action: 'imported the hierarchy',
    entity: 'project',
    entityId: projectId,
    entityLabel: fileName,
    newValue: `${sheet.assets.length} assets · ${sheet.systems.length} systems · ${sheet.subsystems.length} subsystems · ${sheet.equipmentTypes.length} types · ${sheet.tags.length} tags`,
  })

  for (const path of ['/project', '/systems', '/equipment', '/assets', '/checklists', '/dashboard', '/plan']) {
    revalidatePath(path)
  }

  await say({
    kind: 'done',
    file: fileName,
    added: work.tagsToAdd.length,
    updated: work.tagsToUpdate.length,
    extra: [
      ...(work.assetsToAdd.length ? [`${work.assetsToAdd.length} asset${work.assetsToAdd.length === 1 ? '' : 's'}`] : []),
      ...(work.systemsToAdd.length ? [`${work.systemsToAdd.length} system${work.systemsToAdd.length === 1 ? '' : 's'}`] : []),
      ...(work.subsystemsToAdd.length ? [`${work.subsystemsToAdd.length} subsystem${work.subsystemsToAdd.length === 1 ? '' : 's'}`] : []),
      ...(work.equipmentTypesToAdd.length ? [`${work.equipmentTypesToAdd.length} equipment type${work.equipmentTypesToAdd.length === 1 ? '' : 's'}`] : []),
    ],
  })
}
