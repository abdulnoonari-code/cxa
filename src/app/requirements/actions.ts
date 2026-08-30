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

// Subject pickers post a single "type:id" value, which keeps the two columns
// impossible to set inconsistently.
function subjectRef(formData: FormData, key = 'subject'): { type: string | null; id: string | null } {
  const raw = str(formData, key)
  if (!raw || !raw.includes(':')) return { type: null, id: null }
  const [type, id] = raw.split(':')
  return { type: type || null, id: id || null }
}

function refresh() {
  revalidatePath('/requirements')
  revalidatePath('/doc-control')
  revalidatePath('/audit')
}

export async function addRequirement(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('review', project.id))) return

  const statement = str(formData, 'statement')
  if (!statement) return

  const subject = subjectRef(formData)

  const { data } = await supabase
    .from('requirements')
    .insert({
      project_id: project.id,
      ref: str(formData, 'ref'),
      statement,
      subject_type: subject.type,
      subject_id: subject.id,
      source_kind: str(formData, 'source_kind') ?? 'specification',
      document_id: str(formData, 'document_id'),
      source_revision: str(formData, 'source_revision'),
      clause: str(formData, 'clause'),
      verification_method: str(formData, 'verification_method') ?? 'test',
      criticality: str(formData, 'criticality') ?? 'normal',
      acceptance: str(formData, 'acceptance'),
      notes: str(formData, 'notes'),
    })
    .select('id')
    .single()

  await recordAudit({
    projectId: project.id,
    action: 'added requirement',
    entity: 'requirement',
    entityId: (data as { id: string } | null)?.id,
    entityLabel: str(formData, 'ref') ?? statement.slice(0, 80),
    newValue: str(formData, 'source_revision'),
  })

  refresh()
}

export async function deleteRequirement(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) return

  const id = str(formData, 'id')
  if (!id) return

  await supabase.from('requirements').delete().eq('id', id)

  await recordAudit({
    projectId: project.id,
    action: 'deleted requirement',
    entity: 'requirement',
    entityId: id,
    entityLabel: str(formData, 'label'),
  })

  refresh()
}

// Linking a check or a test to a requirement is the act that creates the
// digital thread. Everything downstream — verification status, gate results,
// revision impact — reads these rows.
export async function linkVerification(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('review', project.id))) return

  const requirementId = str(formData, 'requirement_id')
  const raw = str(formData, 'activity')
  if (!requirementId || !raw || !raw.includes(':')) return

  const [kind, id] = raw.split(':')
  if (kind !== 'checklist_item' && kind !== 'test_record') return

  // The unique index makes a duplicate harmless, but catching it here keeps a
  // pointless error out of the log.
  const { data: existing } = await supabase
    .from('requirement_verifications')
    .select('id')
    .eq('requirement_id', requirementId)
    .eq('activity_kind', kind)
    .eq('activity_id', id)

  if ((existing ?? []).length > 0) return

  await supabase.from('requirement_verifications').insert({
    requirement_id: requirementId,
    activity_kind: kind,
    activity_id: id,
  })

  await recordAudit({
    projectId: project.id,
    action: 'linked verification to requirement',
    entity: 'requirement',
    entityId: requirementId,
    entityLabel: str(formData, 'label'),
    newValue: str(formData, 'activity_label'),
  })

  refresh()
}

export async function unlinkVerification(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('review', project.id))) return

  const requirementId = str(formData, 'requirement_id')
  const kind = str(formData, 'activity_kind')
  const activityId = str(formData, 'activity_id')
  if (!requirementId || !kind || !activityId) return

  await supabase
    .from('requirement_verifications')
    .delete()
    .eq('requirement_id', requirementId)
    .eq('activity_kind', kind)
    .eq('activity_id', activityId)

  await recordAudit({
    projectId: project.id,
    action: 'unlinked verification from requirement',
    entity: 'requirement',
    entityId: requirementId,
    entityLabel: str(formData, 'label'),
    oldValue: str(formData, 'activity_label'),
  })

  refresh()
}

// Accepting a new revision against a requirement: the statement stays, the
// cited revision moves forward, and the change is on the record.
export async function acceptRevision(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('review', project.id))) return

  const id = str(formData, 'id')
  const rev = str(formData, 'rev')
  const previous = str(formData, 'previous')
  if (!id || !rev) return

  await supabase.from('requirements').update({ source_revision: rev }).eq('id', id)

  await recordAudit({
    projectId: project.id,
    action: 'accepted source revision for requirement',
    entity: 'requirement',
    entityId: id,
    entityLabel: str(formData, 'label'),
    oldValue: previous,
    newValue: rev,
  })

  refresh()
}
