'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { getActor, actorCan, recordAudit } from '@/lib/audit'
import { roleLabel } from '@/lib/roles'
import { templateFor, GATE_TEMPLATES } from '@/lib/gates'
import { DECISIONS, decisionLabel, decisionStatement } from '@/lib/inspection'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

function refresh() {
  revalidatePath('/gates')
  revalidatePath('/assets')
  revalidatePath('/readiness')
  revalidatePath('/dashboard')
  revalidatePath('/audit')
}

export async function createGate(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('review', project.id))) return

  const key = str(formData, 'gate_key')
  const template = key ? templateFor(key) : null
  if (!template) return

  const raw = str(formData, 'subject')
  const [subjectType, subjectId] = raw && raw.includes(':') ? raw.split(':') : [null, null]

  const { data } = await supabase
    .from('gates')
    .insert({
      project_id: project.id,
      subject_type: subjectType,
      subject_id: subjectId,
      gate_key: template.key,
      name: str(formData, 'name') ?? template.name,
      stage_key: template.stage_key,
      sequence: GATE_TEMPLATES.findIndex((t) => t.key === template.key),
      planned_for: str(formData, 'planned_for'),
    })
    .select('id')
    .single()

  const gateId = (data as { id: string } | null)?.id
  if (!gateId) return

  // The rules are copied from the template rather than referenced, so editing
  // a template later never silently changes a gate somebody has already been
  // working through.
  await supabase.from('gate_rules').insert(
    template.rules.map((r, i) => ({
      gate_id: gateId,
      rule_kind: r.rule_kind,
      label: r.label,
      params: r.params ?? {},
      category: r.category ?? null,
      mandatory: r.mandatory !== false,
      sequence: i,
    }))
  )

  await recordAudit({
    projectId: project.id,
    action: 'created readiness gate',
    entity: 'gate',
    entityId: gateId,
    entityLabel: template.name,
    newValue: `${template.rules.length} rules`,
  })

  refresh()
}

// Only manual_confirmation rules can be answered by hand. Everything else is
// derived from the records and is deliberately not settable — otherwise the
// gate could be talked into passing without the records changing.
export async function confirmRule(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('record', project.id))) return

  const id = str(formData, 'rule_id')
  const status = str(formData, 'status') ?? 'pending'
  if (!id) return
  if (!['pending', 'satisfied', 'not_satisfied', 'na'].includes(status)) return

  const { data: rule } = await supabase.from('gate_rules').select('rule_kind, label, status').eq('id', id).single()
  const existing = rule as { rule_kind: string; label: string; status: string | null } | null
  if (!existing || existing.rule_kind !== 'manual_confirmation') return

  const actor = await getActor(project.id)

  await supabase
    .from('gate_rules')
    .update({
      status,
      evidence: str(formData, 'evidence'),
      confirmed_by: status === 'pending' ? null : actor.name || actor.email,
      confirmed_at: status === 'pending' ? null : new Date().toISOString(),
    })
    .eq('id', id)

  await recordAudit({
    projectId: project.id,
    action: 'answered gate prerequisite',
    entity: 'gate',
    entityId: str(formData, 'gate_id'),
    entityLabel: existing.label,
    oldValue: existing.status,
    newValue: status,
    comment: str(formData, 'evidence'),
  })

  refresh()
}

// Signing a gate is the human act the whole engine defers to. The app never
// authorises anything itself; it reports what the records say, and a person
// with approve rights puts their name to the decision.
export async function signGate(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('approve', project.id))) return

  const gateId = str(formData, 'gate_id')
  const decision = str(formData, 'decision')
  const signedName = str(formData, 'signed_name')
  if (!gateId || !decision || !signedName) return
  if (!DECISIONS.some((d) => d.value === decision)) return

  const actor = await getActor(project.id)
  const userAgent = (await headers()).get('user-agent')

  await supabase.from('signatures').insert({
    project_id: project.id,
    entity: 'gate',
    entity_id: gateId,
    entity_label: str(formData, 'label'),
    signer_email: actor.email,
    signer_name: actor.name,
    signer_role: str(formData, 'as_role') ?? roleLabel(actor.role),
    signer_company: str(formData, 'company'),
    decision,
    statement: decisionStatement(decision),
    comment: str(formData, 'comment'),
    signed_name: signedName,
    user_agent: userAgent,
  })

  await recordAudit({
    projectId: project.id,
    action: 'signed readiness gate',
    entity: 'gate',
    entityId: gateId,
    entityLabel: str(formData, 'label'),
    newValue: decisionLabel(decision),
    comment: str(formData, 'comment'),
  })

  refresh()
}

export async function deleteGate(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) return

  const id = str(formData, 'id')
  if (!id) return

  // Rules go with it. Signatures do not — they are permanent, and a gate that
  // was signed and later removed must still leave the signature on record.
  await supabase.from('gates').delete().eq('id', id)

  await recordAudit({
    projectId: project.id,
    action: 'removed readiness gate',
    entity: 'gate',
    entityId: id,
    entityLabel: str(formData, 'label'),
  })

  refresh()
}
