'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { actorCan, recordAudit } from '@/lib/audit'
import { parseEquipmentWorkbook } from '@/lib/equipment-import'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

function refresh() {
  revalidatePath('/equipment')
  revalidatePath('/assets')
  revalidatePath('/systems')
  revalidatePath('/dashboard')
  revalidatePath('/audit')
}

export async function createEquipment(formData: FormData) {
  const project_id = str(formData, 'project_id')
  const tag_id = str(formData, 'tag_id')
  if (!project_id || !tag_id) return
  if (!(await actorCan('record', project_id))) return

  await supabase.from('equipment').insert({
    project_id,
    tag_id,
    description: str(formData, 'description'),
    category: str(formData, 'category'),
    install_status: str(formData, 'install_status') ?? 'not_delivered',
    manufacturer: str(formData, 'manufacturer'),
    model: str(formData, 'model'),
    location: str(formData, 'location'),
  })

  await recordAudit({
    projectId: project_id,
    action: 'added equipment',
    entity: 'equipment',
    entityLabel: tag_id,
    newValue: str(formData, 'description'),
  })

  refresh()
}

export async function deleteEquipment(formData: FormData) {
  const project = await getCurrentProject()
  const id = str(formData, 'id')
  if (!id) return
  if (project && !(await actorCan('manage', project.id))) return

  await supabase.from('equipment').delete().eq('id', id)

  await recordAudit({
    projectId: project?.id ?? null,
    action: 'removed equipment',
    entity: 'equipment',
    entityId: id,
    entityLabel: str(formData, 'label'),
  })

  refresh()
}

export async function updateEquipment(formData: FormData) {
  const project = await getCurrentProject()
  const id = str(formData, 'id')
  const tag_id = str(formData, 'tag_id')
  if (!id || !tag_id) return
  if (project && !(await actorCan('record', project.id))) return

  await supabase
    .from('equipment')
    .update({
      tag_id,
      description: str(formData, 'description'),
      category: str(formData, 'category'),
      install_status: str(formData, 'install_status') ?? 'not_delivered',
      manufacturer: str(formData, 'manufacturer'),
      model: str(formData, 'model'),
      location: str(formData, 'location'),
    })
    .eq('id', id)

  await recordAudit({
    projectId: project?.id ?? null,
    action: 'updated equipment',
    entity: 'equipment',
    entityId: id,
    entityLabel: tag_id,
  })

  refresh()
  redirect('/equipment')
}

// ── The EPC tag list ──────────────────────────────────────────────────────
//
// This is the one import that matters most, because it is how a project
// starts. The sheet almost always carries a System column, and often an Area
// and a Bay — so the import builds the asset hierarchy from it rather than
// leaving somebody to key it in twice.
//
// Areas, systems and subsystems named in the file are created if they do not
// exist and matched by code or name if they do. Nothing is ever renamed or
// deleted by an import.
export async function importEquipment(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) return

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return

  const parsed = await parseEquipmentWorkbook(await file.arrayBuffer(), { fileName: file.name })

  if (parsed.rows.length === 0 && parsed.errors.length === 0) {
    await recordAudit({
      projectId: project.id,
      action: 'equipment import failed',
      entity: 'equipment',
      entityLabel: file.name,
      comment:
        parsed.headingsSeen.length > 0
          ? `No tag column found. Headings seen: ${parsed.headingsSeen.slice(0, 15).join(', ')}`
          : 'The file had nothing readable in it.',
    })
    refresh()
    return
  }

  // Existing tags, so a re-import updates rather than duplicates.
  const { data: existingRows } = await supabase
    .from('equipment')
    .select('id, tag_id')
    .eq('project_id', project.id)

  const existingByTag = new Map(
    ((existingRows ?? []) as { id: string; tag_id: string }[]).map((e) => [e.tag_id.toLowerCase(), e.id])
  )
  const existingIds = new Set(existingByTag.values())

  const errors = [...parsed.errors]
  for (const row of parsed.rows) {
    if (row.id && !existingIds.has(row.id)) {
      errors.push({
        row: row.row,
        column: 'CXA ID',
        value: row.id,
        message: 'No equipment on this project has that ID. Leave the cell blank to add a new tag.',
      })
    }
  }

  if (errors.length > 0) {
    await recordAudit({
      projectId: project.id,
      action: 'equipment import rejected',
      entity: 'equipment',
      entityLabel: file.name,
      newValue: `${errors.length} errors — nothing imported`,
      comment: errors
        .slice(0, 10)
        .map((e) => `Row ${e.row} · ${e.column}: ${e.message}${e.value ? ` (found "${e.value}")` : ''}`)
        .join(' | '),
    })
    refresh()
    return
  }

  // ── Build the hierarchy the sheet describes ────────────────────────────
  const [{ data: areaRows }, { data: systemRows }, { data: subsystemRows }] = await Promise.all([
    supabase.from('areas').select('id, name, code').eq('project_id', project.id),
    supabase.from('systems').select('id, name, system_id').eq('project_id', project.id),
    supabase.from('subsystems').select('id, name, code, system_id'),
  ])

  const areaKey = new Map<string, string>()
  for (const a of (areaRows ?? []) as { id: string; name: string; code: string | null }[]) {
    areaKey.set(a.name.toLowerCase(), a.id)
    if (a.code) areaKey.set(a.code.toLowerCase(), a.id)
  }

  const systemKey = new Map<string, string>()
  for (const s of (systemRows ?? []) as { id: string; name: string; system_id: string }[]) {
    systemKey.set(s.name.toLowerCase(), s.id)
    systemKey.set(s.system_id.toLowerCase(), s.id)
  }
  const projectSystemIds = new Set(systemKey.values())

  const subsystemKey = new Map<string, string>()
  for (const s of (subsystemRows ?? []) as { id: string; name: string; code: string | null; system_id: string }[]) {
    if (!projectSystemIds.has(s.system_id)) continue
    subsystemKey.set(`${s.system_id}|${s.name.toLowerCase()}`, s.id)
    if (s.code) subsystemKey.set(`${s.system_id}|${s.code.toLowerCase()}`, s.id)
  }

  // Ask once, before the loop, whether this database has the floor column.
  // Once, not per row: a per-row retry turns a 400-tag import into 800
  // requests, and the answer cannot change halfway through.
  const floorProbe = await supabase.from('equipment').select('floor, building, critical').limit(1)
  const hasFloor = !floorProbe.error

  // A Project column in the file is a GUARD, not a destination.
  //
  // Equipment always goes into the project that is open — the file cannot
  // send it somewhere else, and pretending otherwise would be worse than not
  // reading the column at all. But a file that names a different project is
  // almost certainly the wrong file, and importing four hundred of BKK-05's
  // tags into BKK-03 is not something anybody unpicks by hand afterwards.
  //
  // So: if the column is there and disagrees, nothing is imported.
  const named = parsed.rows.map((r) => (r.project ?? '').trim()).filter((p) => p !== '')
  const mismatched = [...new Set(named.filter((p) => p.toLowerCase() !== project.name.trim().toLowerCase()))]
  if (mismatched.length > 0) {
    await recordAudit({
      projectId: project.id,
      action: 'equipment import refused — wrong project',
      entity: 'equipment',
      entityLabel: file.name,
      comment: `The file names ${mismatched.map((m) => `"${m}"`).join(', ')} in its Project column and the open project is "${project.name}". Nothing was imported. Open the right project, or remove the Project column.`,
    })
    redirect(
      `/equipment?import=wrongproject&named=${encodeURIComponent(mismatched.slice(0, 3).join(', '))}&open=${encodeURIComponent(project.name)}`
    )
  }

  let areasCreated = 0
  let systemsCreated = 0
  let subsystemsCreated = 0
  let typesCreated = 0

  // The catalogue, read once. A tag list with a Type column creates the
  // catalogue entries it names — bare, with just a code — in the same way it
  // already creates systems and areas. The Equipment Types import then fills
  // in their manufacturer, rating and discipline rather than making a second
  // copy of each one.
  //
  // Arrives with SQL part 35. On a database without it the probe errors, the
  // map stays empty and the Type column is read and reported rather than
  // silently thrown away.
  const typeProbe = await supabase.from('equipment_types').select('id, type_code').eq('project_id', project.id)
  const hasTypes = !typeProbe.error
  const typeKey = new Map(
    ((typeProbe.data ?? []) as { id: string; type_code: string | null }[]).map((t) => [
      (t.type_code ?? '').toLowerCase(),
      t.id,
    ])
  )

  const ensureType = async (code: string): Promise<string | null> => {
    const key = code.toLowerCase()
    const found = typeKey.get(key)
    if (found) return found
    const { data } = await supabase
      .from('equipment_types')
      .insert({ project_id: project.id, type_code: code, name: code })
      .select('id')
      .single()
    const id = (data as { id: string } | null)?.id ?? null
    if (id) {
      typeKey.set(key, id)
      typesCreated += 1
    }
    return id
  }

  const ensureArea = async (name: string): Promise<string | null> => {
    const key = name.toLowerCase()
    const found = areaKey.get(key)
    if (found) return found
    const { data } = await supabase
      .from('areas')
      .insert({ project_id: project.id, name, code: name.length <= 12 ? name : null })
      .select('id')
      .single()
    const id = (data as { id: string } | null)?.id ?? null
    if (id) {
      areaKey.set(key, id)
      areasCreated += 1
    }
    return id
  }

  const ensureSystem = async (name: string, areaId: string | null): Promise<string | null> => {
    const key = name.toLowerCase()
    const found = systemKey.get(key)
    if (found) return found
    const { data } = await supabase
      .from('systems')
      .insert({ project_id: project.id, area_id: areaId, system_id: name, name, stage: 'construction' })
      .select('id')
      .single()
    const id = (data as { id: string } | null)?.id ?? null
    if (id) {
      systemKey.set(key, id)
      systemsCreated += 1
    }
    return id
  }

  const ensureSubsystem = async (name: string, systemId: string): Promise<string | null> => {
    const key = `${systemId}|${name.toLowerCase()}`
    const found = subsystemKey.get(key)
    if (found) return found
    const { data } = await supabase
      .from('subsystems')
      .insert({ system_id: systemId, name, code: name.length <= 12 ? name : null })
      .select('id')
      .single()
    const id = (data as { id: string } | null)?.id ?? null
    if (id) {
      subsystemKey.set(key, id)
      subsystemsCreated += 1
    }
    return id
  }

  // ── Two levels in one sheet ───────────────────────────────────────────
  //
  // A row with a "Part of tag" is a component of that item, not a piece of
  // equipment. The equipment rows are done FIRST and in full, because a
  // component's parent may be created by this same file — a tag list sorted
  // alphabetically puts SUDB-Q01 above SUDB-SWGR.
  const componentRows = parsed.rows.filter((r) => r.parent_tag && !r.remove)
  const equipmentRows = parsed.rows.filter((r) => !r.parent_tag || r.remove)

  // Does this database have the components table (SQL part 34)?
  //
  // Asked before anything is written, and a file that carries components for
  // a database that cannot hold them is REFUSED ENTIRELY rather than half
  // imported. Half of a tag list is worse than none: the boards would be in,
  // the cubicles would not, and the register would look finished.
  const componentProbe = await supabase.from('components').select('id').limit(1)
  const hasComponents = !componentProbe.error

  if (componentRows.length > 0 && !hasComponents) {
    await recordAudit({
      projectId: project.id,
      action: 'equipment import refused — no components table',
      entity: 'equipment',
      entityLabel: file.name,
      comment: `The file has ${componentRows.length} row(s) with a "Part of tag" and this database has no components table. Nothing was imported. Run SQL part 34 and import the same file again.`,
    })
    redirect(`/equipment?import=nocomponents&rows=${componentRows.length}`)
  }

  let inserted = 0
  let updated = 0
  let removed = 0

  for (const row of equipmentRows) {
    if (row.remove) {
      const id = row.id ?? existingByTag.get(row.tag_id.toLowerCase())
      if (id) {
        await supabase.from('equipment').delete().eq('id', id)
        removed += 1
      }
      continue
    }

    const areaId = row.area ? await ensureArea(row.area) : null
    const systemId = row.system ? await ensureSystem(row.system, areaId) : null
    const subsystemId = row.subsystem && systemId ? await ensureSubsystem(row.subsystem, systemId) : null
    const typeId = hasTypes && row.type_code ? await ensureType(row.type_code) : null

    // A column that is NOT IN THE FILE must not be written.
    //
    // This was a real way to lose data and it took the components work to
    // find it. The export did not carry Building, Floor or Critical; import
    // that export back and every one of them was set to null on every tag,
    // silently, because the code wrote each field whether or not the sheet
    // had ever mentioned it. Somebody would have spent a morning on floors,
    // exported to check them, re-imported, and lost the lot.
    //
    // The rule now: the COLUMN is the statement. A column the file does not
    // have says nothing and the stored value is left alone. A column that is
    // there with an empty cell does say something — the person has the column
    // in front of them and left it blank — and clears the field.
    const has = (label: string) => parsed.detectedColumns.includes(label)
    const ifSaid = <T,>(label: string, key: string, value: T) => (has(label) ? { [key]: value } : {})

    const values = {
      tag_id: row.tag_id,
      // Only when the database has the columns. Sending a column Postgres has
      // never heard of does not fail that field — it fails the WHOLE row, so
      // one spreadsheet with a Floor heading, uploaded before SQL part 31,
      // would import nothing at all and say nothing useful about why.
      ...(hasFloor
        ? {
            ...ifSaid('Floor', 'floor', row.floor),
            ...ifSaid('Building', 'building', row.building),
            ...ifSaid('Critical', 'critical', row.critical),
          }
        : {}),
      ...ifSaid('Description', 'description', row.description),
      ...ifSaid('Category', 'category', row.category),
      ...ifSaid('Location', 'location', row.location),
      ...ifSaid('Manufacturer', 'manufacturer', row.manufacturer),
      ...ifSaid('Model', 'model', row.model),
      ...ifSaid('Serial', 'serial_number', row.serial_number),
      ...ifSaid('Status', 'install_status', row.install_status),
      ...(systemId ? { system_id: systemId } : {}),
      ...(subsystemId ? { subsystem_id: subsystemId } : {}),
      ...(typeId ? { type_id: typeId } : {}),
    }

    const existingId = row.id ?? existingByTag.get(row.tag_id.toLowerCase())

    if (existingId) {
      await supabase.from('equipment').update(values).eq('id', existingId)
      updated += 1
    } else {
      await supabase
        .from('equipment')
        .insert({ project_id: project.id, install_status: row.install_status, ...values })
      inserted += 1
    }
  }

  // ── Now the components, with every parent guaranteed to exist ─────────
  //
  // The register is re-read rather than trusted from memory: a parent may
  // have been created by the loop above, or may have been in the database
  // before this file was ever opened.
  let componentsIn = 0
  let componentsUpdated = 0
  const orphans: { row: number; tag: string; parent: string }[] = []

  if (componentRows.length > 0) {
    const { data: allTags } = await supabase
      .from('equipment')
      .select('id, tag_id')
      .eq('project_id', project.id)
    const tagToId = new Map(
      ((allTags ?? []) as { id: string; tag_id: string }[]).map((e) => [e.tag_id.toLowerCase(), e.id])
    )

    const { data: existingComponents } = await supabase
      .from('components')
      .select('id, tag_id, equipment_id')
      .eq('project_id', project.id)
    const componentKey = new Map(
      ((existingComponents ?? []) as { id: string; tag_id: string; equipment_id: string }[]).map((c) => [
        `${c.equipment_id}|${c.tag_id.toLowerCase()}`,
        c.id,
      ])
    )

    for (const row of componentRows) {
      const parentId = tagToId.get((row.parent_tag ?? '').toLowerCase())
      if (!parentId) {
        // Recorded, not guessed at and not silently dropped. Creating the
        // missing board would invent a piece of plant nobody listed.
        orphans.push({ row: row.row, tag: row.tag_id, parent: row.parent_tag ?? '' })
        continue
      }

      // Same rule as above: a column the file does not have says nothing.
      const has = (label: string) => parsed.detectedColumns.includes(label)
      const ifSaid = <T,>(label: string, key: string, value: T) => (has(label) ? { [key]: value } : {})

      const values = {
        tag_id: row.tag_id,
        ...ifSaid('Description', 'description', row.description),
        ...ifSaid('Category', 'category', row.category),
        ...ifSaid('Floor', 'floor', row.floor),
        ...ifSaid('Location', 'location', row.location),
        ...ifSaid('Manufacturer', 'manufacturer', row.manufacturer),
        ...ifSaid('Model', 'model', row.model),
        ...ifSaid('Serial', 'serial_number', row.serial_number),
        ...ifSaid('Critical', 'critical', row.critical),
        ...ifSaid('Status', 'install_status', row.install_status),
      }

      const existing = componentKey.get(`${parentId}|${row.tag_id.toLowerCase()}`)
      if (existing) {
        await supabase.from('components').update(values).eq('id', existing)
        componentsUpdated += 1
      } else {
        await supabase
          .from('components')
          .insert({ project_id: project.id, equipment_id: parentId, install_status: row.install_status, ...values })
        componentsIn += 1
      }
    }
  }

  const created: string[] = []
  if (areasCreated) created.push(`${areasCreated} area${areasCreated === 1 ? '' : 's'}`)
  if (systemsCreated) created.push(`${systemsCreated} system${systemsCreated === 1 ? '' : 's'}`)
  if (subsystemsCreated) created.push(`${subsystemsCreated} subsystem${subsystemsCreated === 1 ? '' : 's'}`)
  if (componentsIn) created.push(`${componentsIn} component${componentsIn === 1 ? '' : 's'}`)
  if (typesCreated) created.push(`${typesCreated} equipment type${typesCreated === 1 ? '' : 's'}`)

  // A column that was in the file and could not be stored has to be said out
  // loud. Silently dropping it is how somebody spends a morning filling in
  // floors and never finds out they were thrown away.
  const floorIgnored = !hasFloor && parsed.rows.some((r) => r.floor || r.building || r.critical !== null)
  const typesIgnored = !hasTypes && parsed.rows.some((r) => r.type_code)

  await recordAudit({
    projectId: project.id,
    action: 'imported equipment',
    entity: 'equipment',
    entityLabel: file.name,
    newValue: `${inserted} added, ${updated} updated, ${removed} removed${created.length ? `, plus ${created.join(', ')}` : ''}${componentsUpdated ? `, ${componentsUpdated} component${componentsUpdated === 1 ? '' : 's'} updated` : ''}${floorIgnored ? ' — Floor column IGNORED' : ''}${typesIgnored ? ' — Type column IGNORED' : ''}${orphans.length ? ` — ${orphans.length} part(s) NOT filed` : ''}`,
    comment:
      `Read from ${parsed.sheetName ?? 'sheet'}, header row ${parsed.headerRow}. Columns used: ${parsed.detectedColumns.join(', ')}.` +
      (floorIgnored
        ? ' The file has Floor, Building or Critical values and this database has nowhere to put them. Run SQL part 32 and import again — nothing else was affected.'
        : '') +
      (typesIgnored
        ? ' The file has a Type column and this database has no equipment_types table. Run SQL part 35 and import again — nothing else was affected.'
        : '') +
      (orphans.length > 0
        ? ` ${orphans.length} row(s) name a "Part of tag" that is not in this project and were NOT filed: ${orphans
            .slice(0, 8)
            .map((o) => `row ${o.row} "${o.tag}" → "${o.parent}"`)
            .join('; ')}. The parent tag was not created, because inventing a piece of plant nobody listed is worse than leaving the part unfiled. Add the parent and import again.`
        : '') +
      (parsed.warnings.length > 0
        ? ` ${parsed.warnings.length} warnings: ${parsed.warnings
            .slice(0, 6)
            .map((w) => `row ${w.row} ${w.column}`)
            .join(', ')}`
        : ''),
  })

  refresh()
  if (orphans.length > 0) {
    redirect(`/equipment?import=orphans&rows=${orphans.length}`)
  }
}
