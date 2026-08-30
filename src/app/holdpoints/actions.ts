'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { getActor, actorCan, recordAudit } from '@/lib/audit'
import { roleLabel } from '@/lib/roles'
import { inspectionLabel, decisionLabel, decisionStatement, DECISIONS } from '@/lib/inspection'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

// The two things a hold point can hang off. Anything else is rejected rather
// than written, so a bad form post cannot invent a table name.
const TABLES: Record<string, { table: string; entity: string; labelColumn: string }> = {
  check: { table: 'checklist_items', entity: 'checklist_item', labelColumn: 'item' },
  test: { table: 'test_records', entity: 'test_record', labelColumn: 'name' },
}

function refresh() {
  revalidatePath('/holdpoints')
  revalidatePath('/readiness')
  revalidatePath('/dashboard')
  revalidatePath('/systems')
  revalidatePath('/checklists')
  revalidatePath('/tests')
  revalidatePath('/audit')
}

export async function setInspectionType(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('review', project.id))) return

  const kind = str(formData, 'kind') ?? ''
  const target = TABLES[kind]
  const id = str(formData, 'id')
  const value = str(formData, 'inspection_type') ?? 'surveillance'
  const previous = str(formData, 'previous')
  if (!target || !id) return
  if (value === previous) return

  await supabase.from(target.table).update({ inspection_type: value }).eq('id', id)

  await recordAudit({
    projectId: project.id,
    action: 'changed ITP activity type',
    entity: target.entity,
    entityId: id,
    entityLabel: str(formData, 'label'),
    oldValue: inspectionLabel(previous),
    newValue: inspectionLabel(value),
  })

  refresh()
}

// Giving notice is a record in its own right: on a witness point, whether the
// client was invited is exactly the thing that gets argued about later.
export async function giveNotice(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('record', project.id))) return

  const kind = str(formData, 'kind') ?? ''
  const target = TABLES[kind]
  const id = str(formData, 'id')
  if (!target || !id) return

  const now = new Date().toISOString()
  await supabase.from(target.table).update({ notified_at: now }).eq('id', id)

  await recordAudit({
    projectId: project.id,
    action: 'gave notice for inspection',
    entity: target.entity,
    entityId: id,
    entityLabel: str(formData, 'label'),
    newValue: now,
  })

  refresh()
}

export async function signHoldPoint(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('approve', project.id))) return

  const kind = str(formData, 'kind') ?? ''
  const target = TABLES[kind]
  const id = str(formData, 'id')
  const decision = str(formData, 'decision')
  const signedName = str(formData, 'signed_name')
  if (!target || !id || !decision) return

  // A signature with nobody's name on it is not a signature.
  if (!signedName) return
  if (!DECISIONS.some((d) => d.value === decision)) return

  const actor = await getActor(project.id)
  const userAgent = (await headers()).get('user-agent')

  await supabase.from('signatures').insert({
    project_id: project.id,
    entity: target.entity,
    entity_id: id,
    entity_label: str(formData, 'label'),
    signer_email: actor.email,
    signer_name: actor.name,
    signer_role: roleLabel(actor.role),
    signer_company: str(formData, 'company'),
    decision,
    statement: decisionStatement(decision),
    comment: str(formData, 'comment'),
    signed_name: signedName,
    user_agent: userAgent,
  })

  await recordAudit({
    projectId: project.id,
    action: 'signed inspection point',
    entity: target.entity,
    entityId: id,
    entityLabel: str(formData, 'label'),
    newValue: decisionLabel(decision),
    comment: str(formData, 'comment'),
  })

  refresh()
}
