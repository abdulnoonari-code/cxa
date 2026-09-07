'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import ExcelJS from 'exceljs'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { recordAudit } from '@/lib/audit'
import { parseTypeWorkbook } from '@/lib/type-import'

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key)
  if (typeof v !== 'string' || v.trim() === '') return null
  return v.trim()
}

function refresh() {
  revalidatePath('/equipment-types')
  revalidatePath('/equipment')
  revalidatePath('/assets')
}

export async function createType(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  const type_code = str(formData, 'type_code')
  if (!type_code) return

  await supabase.from('equipment_types').insert({
    project_id: project.id,
    type_code,
    name: str(formData, 'name') ?? type_code,
    category: str(formData, 'category'),
    manufacturer: str(formData, 'manufacturer'),
    model: str(formData, 'model'),
    rating: str(formData, 'rating'),
    description: str(formData, 'description'),
  })

  refresh()
}

export async function updateType(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

  // A field the form did not send is left alone; a field it sent empty is
  // cleared. The same rule as every other edit form here.
  const values: Record<string, unknown> = {}
  for (const key of ['name', 'category', 'manufacturer', 'model', 'rating', 'description']) {
    if (formData.has(key)) values[key] = str(formData, key)
  }
  if (Object.keys(values).length === 0) return

  await supabase.from('equipment_types').update(values).eq('id', id)
  refresh()
}

export async function deleteType(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return
  // The tags that referenced it are NOT deleted — the database sets their
  // type_id to null. Deleting a catalogue entry must never delete plant.
  await supabase.from('equipment_types').delete().eq('id', id)
  refresh()
}

export async function importTypes(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) redirect('/projects')

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) redirect('/equipment-types?import=nofile')

  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(await file.arrayBuffer())
  } catch {
    redirect('/equipment-types?import=unreadable')
  }

  const parsed = parseTypeWorkbook(wb)
  if (parsed.error || parsed.rows.length === 0) {
    await recordAudit({
      projectId: project.id,
      action: 'type import refused',
      entity: 'equipment_type',
      entityLabel: file.name,
      comment: parsed.error ?? 'No rows.',
    })
    redirect(`/equipment-types?import=refused&why=${encodeURIComponent(parsed.error ?? 'No rows were found.')}`)
  }

  // Does this database have the catalogue yet (SQL part 35)? Asked once,
  // before anything is written: a file that cannot be stored is refused
  // whole rather than half-imported.
  const probe = await supabase.from('equipment_types').select('id').limit(1)
  if (probe.error) {
    await recordAudit({
      projectId: project.id,
      action: 'type import refused — no catalogue table',
      entity: 'equipment_type',
      entityLabel: file.name,
      comment: 'This database has no equipment_types table. Run SQL part 35 and import the same file again.',
    })
    redirect('/equipment-types?import=notable')
  }

  const { data: existing } = await supabase
    .from('equipment_types')
    .select('id, type_code')
    .eq('project_id', project.id)

  const byCode = new Map(
    ((existing ?? []) as { id: string; type_code: string | null }[]).map((t) => [
      (t.type_code ?? '').toLowerCase(),
      t.id,
    ])
  )

  let inserted = 0
  let updated = 0

  for (const row of parsed.rows) {
    // Only what the file actually carried. A blank cell means "I did not
    // say", so importing a sheet without a Rating column cannot wipe the
    // ratings somebody typed on screen.
    const has = (label: string) => parsed.detectedColumns.includes(label)
    const values: Record<string, unknown> = { type_code: row.type_code, name: row.name }
    if (has('Category') && row.category) values.category = row.category
    if (has('Manufacturer') && row.manufacturer) values.manufacturer = row.manufacturer
    if (has('Model') && row.model) values.model = row.model
    if (has('Rating') && row.rating) values.rating = row.rating
    if (has('Notes') && row.description) values.description = row.description

    const id = byCode.get(row.type_code.toLowerCase())
    if (id) {
      await supabase.from('equipment_types').update(values).eq('id', id)
      updated += 1
    } else {
      await supabase.from('equipment_types').insert({ project_id: project.id, ...values })
      inserted += 1
    }
  }

  await recordAudit({
    projectId: project.id,
    action: 'imported equipment types',
    entity: 'equipment_type',
    entityLabel: file.name,
    newValue: `${inserted} added, ${updated} updated`,
    comment:
      `Read from ${parsed.sheetName ?? 'sheet'}, header row ${parsed.headerRow}. Columns used: ${parsed.detectedColumns.join(', ')}.` +
      (parsed.warnings.length > 0
        ? ` ${parsed.warnings.length} warning(s): ${parsed.warnings
            .slice(0, 6)
            .map((w) => `row ${w.row} ${w.column} "${w.value}" — ${w.message}`)
            .join('; ')}`
        : ''),
  })

  refresh()
  redirect(`/equipment-types?import=ok&added=${inserted}&updated=${updated}&warn=${parsed.warnings.length}`)
}
