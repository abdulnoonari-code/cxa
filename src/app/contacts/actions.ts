'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { actorCan, recordAudit } from '@/lib/audit'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

function refresh() {
  revalidatePath('/contacts')
  revalidatePath('/holdpoints')
  revalidatePath('/notifications')
  revalidatePath('/audit')
}

export async function addContact(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) return

  const name = str(formData, 'full_name')
  if (!name) return

  await supabase.from('project_contacts').insert({
    project_id: project.id,
    full_name: name,
    company: str(formData, 'company'),
    email: str(formData, 'email'),
    phone: str(formData, 'phone'),
    party: str(formData, 'party') ?? 'client',
    job_title: str(formData, 'job_title'),
    discipline: str(formData, 'discipline'),
    is_witness: formData.get('is_witness') === 'on',
  })

  await recordAudit({
    projectId: project.id,
    action: 'added contact',
    entity: 'project_contact',
    entityLabel: name,
    newValue: str(formData, 'company'),
  })

  refresh()
}

// One toggle rather than a full edit form: whether this person gets invited to
// witness and hold points is the field that actually changes week to week.
export async function toggleWitness(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) return

  const id = str(formData, 'id')
  const next = formData.get('next') === 'true'
  if (!id) return

  await supabase.from('project_contacts').update({ is_witness: next }).eq('id', id)

  await recordAudit({
    projectId: project.id,
    action: next ? 'marked as inspection witness' : 'removed from inspection witnesses',
    entity: 'project_contact',
    entityId: id,
    entityLabel: str(formData, 'label'),
  })

  refresh()
}

export async function removeContact(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) return

  const id = str(formData, 'id')
  if (!id) return

  await supabase.from('project_contacts').delete().eq('id', id)

  await recordAudit({
    projectId: project.id,
    action: 'removed contact',
    entity: 'project_contact',
    entityId: id,
    entityLabel: str(formData, 'label'),
  })

  refresh()
}
