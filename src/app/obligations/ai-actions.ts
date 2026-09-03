'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ask } from '@/lib/ai'
import { getActor, recordAudit } from '@/lib/audit'
import { getCurrentProject } from '@/lib/project'
import { partyLabel, typeLabel, statusLabel } from '@/lib/obligations'
import {
  OBLIGATION_SYSTEM,
  obligationPrompt,
  readObligationReview,
  claimsDischarged,
  inventsAPeriod,
  tooThinToAssess,
} from '@/lib/obligation-review'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

const back = (q: string) => `/obligations?${q}`

/**
 * Ask an AI to read one obligation.
 *
 * The order matters and mirrors the defect assessment: refuse cheaply before
 * spending anything, then call, then check what came back BEFORE storing it,
 * then write the audit entry whatever happened. A paid call that produced
 * something unusable is still a thing that happened and still belongs in the
 * trail.
 */
export async function assessObligation(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

  const project = await getCurrentProject()
  if (!project) redirect(back('assess=noproject'))

  const { data } = await supabase
    .from('obligations')
    .select('id, ref, statement, clause, party, obligation_type, status, due_date, evidence, source_name')
    .eq('id', id)
    .eq('project_id', project.id)
    .single()

  const obligation = data as {
    id: string
    ref: string | null
    statement: string
    clause: string | null
    party: string | null
    obligation_type: string | null
    status: string
    due_date: string | null
    evidence: string | null
    source_name: string | null
  } | null

  if (!obligation) redirect(back('assess=gone'))

  // Cheap refusal first. Five words of obligation produce an invented
  // assessment, and charging for one is worse than declining.
  const thin = tooThinToAssess({ statement: obligation.statement, clause: obligation.clause })
  if (thin) {
    await supabase
      .from('obligations')
      .update({
        ai_model: null,
        ai_reviewed_at: new Date().toISOString(),
        ai_confidence: 'cannot_tell',
        ai_discharge: '',
        ai_standing: thin,
        ai_risk: '',
        ai_disagreement: '',
        ai_ask: '',
        ai_raw: null,
      })
      .eq('id', id)
      .eq('project_id', project.id)
    revalidatePath('/obligations')
    redirect(back('assess=thin'))
  }

  const outcome = await ask({
    system: OBLIGATION_SYSTEM,
    prompt: obligationPrompt({
      statement: obligation.statement,
      clause: obligation.clause,
      party: obligation.party ? partyLabel(obligation.party) : null,
      type: obligation.obligation_type ? typeLabel(obligation.obligation_type) : null,
      dueDate: obligation.due_date,
      status: statusLabel(obligation.status),
      evidence: obligation.evidence,
      source: obligation.source_name,
    }),
    maxTokens: 900,
  })

  if (!outcome.ok) {
    await recordAudit({
      projectId: project.id,
      action: 'obligation assessment failed',
      entity: 'obligation',
      entityId: id,
      entityLabel: obligation.ref ?? id,
      comment: `${outcome.reason}${outcome.hint ? ` — ${outcome.hint}` : ''}`,
    })
    redirect(back(`assess=failed&reason=${encodeURIComponent(outcome.reason.slice(0, 200))}`))
  }

  const reading = readObligationReview(outcome.value)
  if (!reading) {
    await recordAudit({
      projectId: project.id,
      action: 'obligation assessment unreadable',
      entity: 'obligation',
      entityId: id,
      entityLabel: obligation.ref ?? id,
      comment: `The model replied but not in a form this app could read. First 200 characters: ${outcome.value.slice(0, 200)}`,
    })
    redirect(back('assess=unreadable'))
  }

  const actor = await getActor(project.id)
  const decided = claimsDischarged(reading)
  const invented = inventsAPeriod(reading, `${obligation.statement} ${obligation.clause ?? ''}`)

  await supabase
    .from('obligations')
    .update({
      ai_model: outcome.model,
      ai_reviewed_at: new Date().toISOString(),
      ai_reviewed_by_name: actor.name,
      ai_confidence: reading.confidence,
      ai_discharge: reading.discharge,
      ai_standing: reading.standing,
      ai_risk: reading.risk,
      ai_disagreement: reading.disagreement,
      ai_ask: reading.ask,
      ai_raw: outcome.value.slice(0, 8000),
    })
    .eq('id', id)
    .eq('project_id', project.id)

  // The overreach goes in the audit trail, not just on screen. A reading that
  // decided a contractual question is worth being able to find later.
  await recordAudit({
    projectId: project.id,
    action: decided || invented ? 'obligation assessed — flagged' : 'obligation assessed',
    entity: 'obligation',
    entityId: id,
    entityLabel: obligation.ref ?? id,
    newValue: reading.confidence,
    comment: [
      `Model: ${outcome.model}.`,
      decided ? 'FLAGGED: claimed the obligation is discharged, which only the parties may decide.' : '',
      invented ? 'FLAGGED: gave a time period the clause does not state.' : '',
      reading.discharge ? `Would be discharged by: ${reading.discharge.slice(0, 200)}` : '',
    ]
      .filter(Boolean)
      .join(' '),
  })

  revalidatePath('/obligations')
  redirect(back(`assess=ok${decided || invented ? '&flagged=1' : ''}`))
}

/** Clear a reading. Nothing derived should be permanent against somebody's wishes. */
export async function clearObligationAssessment(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return
  const project = await getCurrentProject()
  if (!project) return

  await supabase
    .from('obligations')
    .update({
      ai_model: null,
      ai_reviewed_at: null,
      ai_reviewed_by_name: null,
      ai_confidence: null,
      ai_discharge: null,
      ai_standing: null,
      ai_risk: null,
      ai_disagreement: null,
      ai_ask: null,
      ai_raw: null,
    })
    .eq('id', id)
    .eq('project_id', project.id)

  revalidatePath('/obligations')
}
