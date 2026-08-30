'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { actorCan, recordAudit } from '@/lib/audit'
import { parseCaps, formatCaps, toRoleKey, PROTECTED_KEYS, isBuiltInKey, builtInFor } from '@/lib/project-roles'
import { parseRoleWorkbook } from '@/lib/role-import'
import type { Capability } from '@/lib/roles'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

function refresh() {
  revalidatePath('/roles')
  revalidatePath('/team')
  revalidatePath('/audit')
}

// Capabilities arrive as one checkbox per capability.
function capsFrom(formData: FormData): Capability[] {
  const picked = formData
    .getAll('caps')
    .filter((v): v is string => typeof v === 'string')
    .join(',')
  const caps = parseCaps(picked)
  // Everybody can at least see the project.
  if (!caps.includes('view')) caps.unshift('view')
  return caps
}

export async function saveRole(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) return

  const label = str(formData, 'label')
  if (!label) return

  const key = toRoleKey(str(formData, 'role_key') ?? label)
  if (!key) return

  const caps = capsFrom(formData)
  const active = formData.get('active') !== null ? formData.get('active') === 'on' : true

  // Project Admin and Super Admin keep every capability whatever the form
  // says, and cannot be switched off. Without this one bad edit removes the
  // last person able to undo it.
  const builtIn = builtInFor(key)
  const finalCaps = PROTECTED_KEYS.has(key) && builtIn ? builtIn.caps : caps
  const finalActive = PROTECTED_KEYS.has(key) ? true : active

  const { data: existing } = await supabase
    .from('project_roles')
    .select('id, caps, label')
    .eq('project_id', project.id)
    .eq('role_key', key)

  const previous = (existing ?? [])[0] as { id: string; caps: string; label: string } | undefined

  if (previous) {
    await supabase
      .from('project_roles')
      .update({
        label,
        note: str(formData, 'note'),
        caps: formatCaps(finalCaps),
        active: finalActive,
      })
      .eq('id', previous.id)
  } else {
    await supabase.from('project_roles').insert({
      project_id: project.id,
      role_key: key,
      label,
      note: str(formData, 'note'),
      caps: formatCaps(finalCaps),
      sequence: Number(str(formData, 'sequence') ?? '0') || 0,
      active: finalActive,
    })
  }

  await recordAudit({
    projectId: project.id,
    action: previous ? 'changed project role' : 'added project role',
    entity: 'project_role',
    entityLabel: label,
    oldValue: previous?.caps ?? null,
    newValue: formatCaps(finalCaps),
  })

  refresh()
}

// Removing a project row restores the built-in definition rather than
// deleting the role, so a project can always get back to the defaults.
export async function resetRole(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) return

  const key = str(formData, 'role_key')
  if (!key) return

  await supabase.from('project_roles').delete().eq('project_id', project.id).eq('role_key', key)

  await recordAudit({
    projectId: project.id,
    action: isBuiltInKey(key) ? 'restored built-in role' : 'removed project role',
    entity: 'project_role',
    entityLabel: str(formData, 'label') ?? key,
  })

  refresh()
}

export type ImportOutcome = {
  ok: boolean
  message: string
  detected?: string[]
  errors?: { row: number; column: string; value: string; message: string }[]
  warnings?: { row: number; column: string; value: string; message: string }[]
  inserted?: number
  updated?: number
}

// Import is all-or-nothing when there are errors: a half-applied role list is
// worse than none, because nobody can tell which half applied.
export async function importRoles(formData: FormData): Promise<void> {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) return

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return

  const parsed = await parseRoleWorkbook(await file.arrayBuffer(), { fileName: file.name })

  const problems = [
    ...parsed.errors.map((e) => `Row ${e.row} · ${e.column}: ${e.message}${e.value ? ` (found "${e.value}")` : ''}`),
    ...parsed.warnings.map((w) => `Row ${w.row} · ${w.column}: ${w.message}${w.value ? ` (found "${w.value}")` : ''}`),
  ]

  if (parsed.rows.length === 0) {
    await recordAudit({
      projectId: project.id,
      action: 'role import failed',
      entity: 'project_role',
      entityLabel: file.name,
      comment:
        parsed.headingsSeen.length > 0
          ? `No role column found. Headings seen: ${parsed.headingsSeen.slice(0, 15).join(', ')}`
          : 'The file had nothing readable in it.',
    })
    refresh()
    return
  }

  if (parsed.errors.length > 0) {
    await recordAudit({
      projectId: project.id,
      action: 'role import rejected',
      entity: 'project_role',
      entityLabel: file.name,
      newValue: `${parsed.errors.length} errors`,
      comment: problems.slice(0, 10).join(' | '),
    })
    refresh()
    return
  }

  let inserted = 0
  let updated = 0

  for (const row of parsed.rows) {
    const caps = PROTECTED_KEYS.has(row.role_key)
      ? formatCaps(builtInFor(row.role_key)?.caps ?? (['view'] as Capability[]))
      : row.caps

    const { data: existing } = await supabase
      .from('project_roles')
      .select('id')
      .eq('project_id', project.id)
      .eq('role_key', row.role_key)

    if ((existing ?? []).length > 0) {
      await supabase
        .from('project_roles')
        .update({ label: row.label, note: row.note, caps, active: PROTECTED_KEYS.has(row.role_key) ? true : row.active })
        .eq('id', (existing as { id: string }[])[0].id)
      updated += 1
    } else {
      await supabase.from('project_roles').insert({
        project_id: project.id,
        role_key: row.role_key,
        label: row.label,
        note: row.note,
        caps,
        sequence: row.row,
        active: PROTECTED_KEYS.has(row.role_key) ? true : row.active,
      })
      inserted += 1
    }
  }

  await recordAudit({
    projectId: project.id,
    action: 'imported roles',
    entity: 'project_role',
    entityLabel: file.name,
    newValue: `${inserted} added, ${updated} updated`,
    comment:
      parsed.warnings.length > 0
        ? `Read from ${parsed.sheetName ?? 'sheet'}, header row ${parsed.headerRow}. ${parsed.warnings.length} warnings: ${parsed.warnings
            .slice(0, 6)
            .map((w) => `row ${w.row} ${w.column}`)
            .join(', ')}`
        : `Read from ${parsed.sheetName ?? 'sheet'}, header row ${parsed.headerRow}. Columns used: ${parsed.detectedColumns.join(', ')}`,
  })

  refresh()
}
