'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import ExcelJS from 'exceljs'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { recordAudit } from '@/lib/audit'
import { parseSystemWorkbook } from '@/lib/system-import'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

// Does this database have the building and floor columns yet (SQL part 33)?
//
// Asked rather than assumed, because sending a column Postgres has never
// heard of does not fail that field — it fails the WHOLE row. A person who
// typed a floor into the form would otherwise have the whole system refused,
// with a Postgres error message as the explanation.
async function hasPlaceColumns(): Promise<boolean> {
  const probe = await supabase.from('systems').select('building, floor').limit(1)
  return !probe.error
}

function refresh() {
  revalidatePath('/systems')
  revalidatePath('/readiness')
  revalidatePath('/equipment')
  revalidatePath('/dashboard')
}

export async function createSystem(formData: FormData) {
  const project_id = str(formData, 'project_id')
  const system_id = str(formData, 'system_id')
  const name = str(formData, 'name')
  if (!project_id || !system_id || !name) return

  const place = (await hasPlaceColumns())
    ? { building: str(formData, 'building'), floor: str(formData, 'floor') }
    : {}

  await supabase.from('systems').insert({
    project_id,
    system_id,
    name,
    discipline: str(formData, 'discipline'),
    description: str(formData, 'description'),
    boundary: str(formData, 'boundary'),
    responsible: str(formData, 'responsible'),
    stage: str(formData, 'stage') ?? 'construction',
    ...place,
  })

  refresh()
}

export async function updateSystem(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

  // A field the form did not send is left alone; a field it sent EMPTY is
  // cleared. On screen an empty box is something the person just emptied,
  // which is the opposite of an empty spreadsheet cell — but a form that
  // never carried the field at all has said nothing, and writing null for it
  // would silently wipe a building somebody set somewhere else.
  const place =
    (formData.has('building') || formData.has('floor')) && (await hasPlaceColumns())
      ? {
          ...(formData.has('building') ? { building: str(formData, 'building') } : {}),
          ...(formData.has('floor') ? { floor: str(formData, 'floor') } : {}),
        }
      : {}

  await supabase
    .from('systems')
    .update({
      stage: str(formData, 'stage') ?? 'construction',
      responsible: str(formData, 'responsible'),
      boundary: str(formData, 'boundary'),
      ...place,
    })
    .eq('id', id)

  refresh()
}

export async function deleteSystem(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return
  // Equipment is not deleted — it simply loses its system assignment.
  await supabase.from('equipment').update({ system_id: null, subsystem_id: null }).eq('system_id', id)
  await supabase.from('systems').delete().eq('id', id)
  refresh()
}

// Put a tag inside a system, or take it out again.
export async function assignEquipment(formData: FormData) {
  const equipment_id = str(formData, 'equipment_id')
  const system_id = str(formData, 'system_id')
  if (!equipment_id) return

  await supabase
    .from('equipment')
    .update({ system_id, subsystem_id: null })
    .eq('id', equipment_id)

  refresh()
}

/**
 * Import a list of systems from a spreadsheet.
 *
 * Two properties matter more than anything else here, and both are the same
 * ones the equipment importer has:
 *
 *   NOTHING IS HALF-DONE. If any row cannot be read, nothing is written. A
 *   register that is forty per cent imported is worse than one that is not
 *   imported, because the missing sixty per cent is invisible.
 *
 *   A SYSTEM THAT ALREADY EXISTS IS UPDATED, NOT DUPLICATED. Matched on the
 *   system code, case-insensitively. This is what makes it safe to run after
 *   an equipment import: the boards created from the System column have a
 *   name and nothing else, and this fills in their discipline, boundary and
 *   stage rather than creating a second copy of each one.
 */
export async function importSystems(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) redirect('/projects')

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    redirect('/systems?import=nofile')
  }

  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(await file.arrayBuffer())
  } catch {
    redirect('/systems?import=unreadable')
  }

  const parsed = parseSystemWorkbook(wb)
  if (parsed.error || parsed.rows.length === 0) {
    await recordAudit({
      projectId: project.id,
      action: 'system import refused',
      entity: 'system',
      entityLabel: file.name,
      comment: parsed.error ?? 'No rows.',
    })
    redirect(`/systems?import=refused&why=${encodeURIComponent(parsed.error ?? 'No rows were found.')}`)
  }

  // Existing systems and areas, read once. Matching is case-insensitive
  // because "SWGR-A1" and "swgr-a1" are the same board to everybody except a
  // string comparison.
  const [{ data: existing }, { data: areaRows }] = await Promise.all([
    supabase.from('systems').select('id, system_id').eq('project_id', project.id),
    supabase.from('areas').select('id, name, code').eq('project_id', project.id),
  ])
  const byCode = new Map(
    ((existing ?? []) as { id: string; system_id: string | null }[]).map((s) => [
      (s.system_id ?? '').toLowerCase(),
      s.id,
    ])
  )
  const areaByName = new Map(
    ((areaRows ?? []) as { id: string; name: string | null; code: string | null }[]).flatMap((a) =>
      [a.name, a.code].filter(Boolean).map((n) => [String(n).toLowerCase(), a.id] as const)
    )
  )

  // Ask ONCE, before the loop, whether this database has the place columns.
  // Sending a column the database has never heard of does not fail that
  // field — it fails the WHOLE row. Before SQL part 33, a sheet with a Floor
  // heading would have imported nothing at all and said nothing useful about
  // why. Asked once and not per row, because a per-row retry turns forty
  // systems into eighty requests and the answer cannot change halfway.
  const placeProbe = await supabase.from('systems').select('building, floor').limit(1)
  const hasPlace = !placeProbe.error

  let areasCreated = 0
  const ensureArea = async (name: string): Promise<string | null> => {
    const hit = areaByName.get(name.toLowerCase())
    if (hit) return hit
    const { data } = await supabase
      .from('areas')
      .insert({ project_id: project.id, name, code: name.length <= 12 ? name : null })
      .select('id')
      .single()
    const id = (data as { id: string } | null)?.id ?? null
    if (id) {
      areaByName.set(name.toLowerCase(), id)
      areasCreated += 1
    }
    return id
  }

  let inserted = 0
  let updated = 0

  for (const row of parsed.rows) {
    const areaId = row.area ? await ensureArea(row.area) : null

    // Only fields the file actually carried. A blank cell in a spreadsheet
    // means "I did not say", not "set this to nothing" — overwriting a
    // boundary somebody typed on screen with an empty cell is data loss with
    // no undo.
    const values: Record<string, unknown> = { system_id: row.system_id, name: row.name }
    if (row.discipline) values.discipline = row.discipline
    if (row.boundary) values.boundary = row.boundary
    if (row.responsible) values.responsible = row.responsible
    if (row.description) values.description = row.description
    if (row.stage) values.stage = row.stage
    if (areaId) values.area_id = areaId
    if (hasPlace) {
      if (row.building) values.building = row.building
      if (row.floor) values.floor = row.floor
    }

    const id = byCode.get(row.system_id.toLowerCase())
    if (id) {
      await supabase.from('systems').update(values).eq('id', id)
      updated += 1
    } else {
      await supabase
        .from('systems')
        .insert({ project_id: project.id, stage: row.stage ?? 'construction', ...values })
      inserted += 1
    }
  }

  // A column that was in the file and could not be stored has to be said out
  // loud. Silently dropping it is how somebody spends a morning filling in
  // floors and never finds out they were thrown away.
  const placeIgnored = !hasPlace && parsed.rows.some((r) => r.building || r.floor)

  await recordAudit({
    projectId: project.id,
    action: 'imported systems',
    entity: 'system',
    entityLabel: file.name,
    newValue: `${inserted} added, ${updated} updated${areasCreated ? `, plus ${areasCreated} area${areasCreated === 1 ? '' : 's'}` : ''}${placeIgnored ? ' — Building and Floor IGNORED' : ''}`,
    comment:
      `Read from ${parsed.sheetName ?? 'sheet'}, header row ${parsed.headerRow}. Columns used: ${parsed.detectedColumns.join(', ')}.` +
      (placeIgnored
        ? ' The file has Building or Floor values and this database has nowhere to put them. Run SQL part 33 and import again.'
        : '') +
      (parsed.warnings.length > 0
        ? ` ${parsed.warnings.length} warning(s): ${parsed.warnings
            .slice(0, 6)
            .map((w) => `row ${w.row} ${w.column} "${w.value}" — ${w.message}`)
            .join('; ')}`
        : ''),
  })

  refresh()
  redirect(
    `/systems?import=ok&added=${inserted}&updated=${updated}&warn=${parsed.warnings.length}${placeIgnored ? '&lost=place' : ''}`
  )
}
