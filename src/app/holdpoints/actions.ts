'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { getActor, actorCan, recordAudit } from '@/lib/audit'
import { roleLabel } from '@/lib/roles'
import { inspectionLabel, decisionLabel, decisionStatement, DECISIONS } from '@/lib/inspection'
import { noticeSubject, noticeBody, type NoticeInput } from '@/lib/notify'

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
  revalidatePath('/notifications')
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
// client was invited is exactly the thing that gets argued about later. So
// this writes the full wording and the recipient list into `notifications`,
// where neither can be rewritten afterwards, as well as stamping notified_at.
export async function giveNotice(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('record', project.id))) return

  const kind = str(formData, 'kind') ?? ''
  const target = TABLES[kind]
  const id = str(formData, 'id')
  if (!target || !id) return

  const actor = await getActor(project.id)
  const label = str(formData, 'label')

  // Recipients arrive as one checkbox per contact, value "email|name".
  const picked = formData
    .getAll('recipient')
    .filter((v): v is string => typeof v === 'string' && v.includes('|'))
    .map((v) => {
      const [email, ...rest] = v.split('|')
      return { email: email.trim(), name: rest.join('|').trim() }
    })
    .filter((r) => r.email.includes('@'))

  const scheduledFor = str(formData, 'scheduled_for')

  const notice: NoticeInput = {
    projectName: project.name,
    projectNumber: null,
    equipmentTag: str(formData, 'tag') ?? '',
    activity: str(formData, 'activity') ?? label ?? '',
    inspectionType: str(formData, 'inspection_type') ?? 'hold',
    scheduledFor,
    location: str(formData, 'location'),
    procedureRef: str(formData, 'procedure_ref'),
    acceptanceCriteria: str(formData, 'acceptance'),
    note: str(formData, 'note'),
    fromName: actor.name || actor.email,
    fromRole: roleLabel(actor.role),
    fromCompany: str(formData, 'from_company'),
  }

  const subject = noticeSubject(notice)
  const body = noticeBody(notice)
  const now = new Date().toISOString()

  await supabase.from('notifications').insert({
    project_id: project.id,
    kind: 'inspection_notice',
    entity: target.entity,
    entity_id: id,
    entity_label: label,
    subject,
    body,
    recipients: picked.map((r) => r.email).join(', '),
    recipient_names: picked.map((r) => r.name).filter(Boolean).join(', '),
    scheduled_for: scheduledFor,
    channel: 'manual_email',
    status: 'composed',
    created_by_email: actor.email,
    created_by_name: actor.name,
  })

  await supabase.from(target.table).update({ notified_at: now }).eq('id', id)

  await recordAudit({
    projectId: project.id,
    action: 'issued inspection notice',
    entity: target.entity,
    entityId: id,
    entityLabel: label,
    newValue: picked.map((r) => r.email).join(', ') || 'no recipients',
    comment: scheduledFor ? `Scheduled for ${scheduledFor}` : null,
  })

  refresh()
}

// The app writes the notice; the engineer's own email client sends it. This
// records that it actually went out, so the register distinguishes a notice
// that was merely prepared from one that was issued.
export async function markNoticeSent(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('record', project.id))) return

  const id = str(formData, 'notification_id')
  if (!id) return

  await supabase
    .from('notifications')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id)

  await recordAudit({
    projectId: project.id,
    action: 'confirmed notice sent',
    entity: 'notification',
    entityId: id,
    entityLabel: str(formData, 'label'),
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
