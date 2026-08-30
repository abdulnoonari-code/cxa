'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { actorCan, recordAudit } from '@/lib/audit'
import { roleLabel } from '@/lib/roles'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

function refresh() {
  revalidatePath('/team')
  revalidatePath('/audit')
  revalidatePath('/review')
  revalidatePath('/tests')
}

export async function addMember(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) return

  const email = str(formData, 'email')
  const role = str(formData, 'role') ?? 'engineer'
  if (!email) return

  await supabase.from('project_members').insert({
    project_id: project.id,
    email,
    full_name: str(formData, 'full_name'),
    company: str(formData, 'company'),
    role,
  })

  await recordAudit({
    projectId: project.id,
    action: 'added to project team',
    entity: 'project_member',
    entityLabel: email,
    newValue: roleLabel(role),
  })

  refresh()
}

export async function updateMemberRole(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) return

  const id = str(formData, 'id')
  const role = str(formData, 'role') ?? 'viewer'
  const previous = str(formData, 'previous_role')
  const email = str(formData, 'email')
  if (!id) return

  await supabase.from('project_members').update({ role }).eq('id', id)

  await recordAudit({
    projectId: project.id,
    action: 'changed role',
    entity: 'project_member',
    entityId: id,
    entityLabel: email,
    oldValue: roleLabel(previous),
    newValue: roleLabel(role),
  })

  refresh()
}

export async function removeMember(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) return

  const id = str(formData, 'id')
  const email = str(formData, 'email')
  if (!id) return

  await supabase.from('project_members').delete().eq('id', id)

  await recordAudit({
    projectId: project.id,
    action: 'removed from project team',
    entity: 'project_member',
    entityId: id,
    entityLabel: email,
  })

  refresh()
}
