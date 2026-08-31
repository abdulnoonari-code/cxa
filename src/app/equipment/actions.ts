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

  let areasCreated = 0
  let systemsCreated = 0
  let subsystemsCreated = 0

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

  let inserted = 0
  let updated = 0
  let removed = 0

  for (const row of parsed.rows) {
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

    const values = {
      tag_id: row.tag_id,
      description: row.description,
      category: row.category,
      location: row.location,
      manufacturer: row.manufacturer,
      model: row.model,
      serial_number: row.serial_number,
      install_status: row.install_status,
      ...(systemId ? { system_id: systemId } : {}),
      ...(subsystemId ? { subsystem_id: subsystemId } : {}),
    }

    const existingId = row.id ?? existingByTag.get(row.tag_id.toLowerCase())

    if (existingId) {
      await supabase.from('equipment').update(values).eq('id', existingId)
      updated += 1
    } else {
      await supabase.from('equipment').insert({ project_id: project.id, ...values })
      inserted += 1
    }
  }

  const created: string[] = []
  if (areasCreated) created.push(`${areasCreated} area${areasCreated === 1 ? '' : 's'}`)
  if (systemsCreated) created.push(`${systemsCreated} system${systemsCreated === 1 ? '' : 's'}`)
  if (subsystemsCreated) created.push(`${subsystemsCreated} subsystem${subsystemsCreated === 1 ? '' : 's'}`)

  await recordAudit({
    projectId: project.id,
    action: 'imported equipment',
    entity: 'equipment',
    entityLabel: file.name,
    newValue: `${inserted} added, ${updated} updated, ${removed} removed${created.length ? `, plus ${created.join(', ')}` : ''}`,
    comment:
      `Read from ${parsed.sheetName ?? 'sheet'}, header row ${parsed.headerRow}. Columns used: ${parsed.detectedColumns.join(', ')}.` +
      (parsed.warnings.length > 0
        ? ` ${parsed.warnings.length} warnings: ${parsed.warnings
            .slice(0, 6)
            .map((w) => `row ${w.row} ${w.column}`)
            .join(', ')}`
        : ''),
  })

  refresh()
}
