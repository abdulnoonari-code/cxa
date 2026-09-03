'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { getActor, actorCan, recordAudit } from '@/lib/audit'
import { ask, askAboutImages } from '@/lib/ai'
import { loadSubjectIndex } from '@/data/subjects'
import {
  DEFECT_SYSTEM,
  defectPrompt,
  readDefectReview,
  tooThinToAssess,
  unsafeAdvice,
  suppliesALimit,
  kindLabel,
} from '@/lib/defect-review'
import { loadPhoto } from '@/data/photos'
import {
  checkFile,
  readReview,
  overreaches,
  reviewPrompt,
  comparePrompt,
  REVIEW_SYSTEM,
  type PhotoKind,
} from '@/lib/photo'

function refresh(issueId?: string) {
  revalidatePath('/issues')
  if (issueId) revalidatePath(`/issues/${issueId}/edit`)
  revalidatePath('/dashboard')
  revalidatePath('/audit')
}

function back(issueId: string, params: string): string {
  return `/issues/${issueId}/edit?${params}`
}

/**
 * Attach a photograph to a punch item.
 *
 * The file is checked before anything is uploaded, so a HEIC straight off an
 * iPhone fails with a sentence somebody can act on rather than a broken image
 * on the punch list six weeks later.
 */
export async function uploadIssuePhoto(formData: FormData) {
  const issueId = String(formData.get('issue_id') ?? '')
  if (!issueId) redirect('/issues?photo=badrow')

  const project = await getCurrentProject()
  if (!project) redirect('/issues?photo=noproject')
  if (!(await actorCan('review', project.id))) redirect(back(issueId, 'photo=denied'))

  const file = formData.get('file')
  if (!(file instanceof File)) redirect(back(issueId, 'photo=nofile'))

  const problem = checkFile({ name: file.name, type: file.type, size: file.size })
  if (problem) {
    redirect(
      back(
        issueId,
        `photo=badfile&reason=${encodeURIComponent(problem.reason)}&hint=${encodeURIComponent(problem.hint)}`
      )
    )
  }

  const kindRaw = String(formData.get('kind') ?? 'defect')
  const kind: PhotoKind = kindRaw === 'fix' ? 'fix' : 'defect'
  const caption = String(formData.get('caption') ?? '').trim() || null

  const actor = await getActor(project.id)
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_')
  const path = `punch/${issueId}/${kind}-${Date.now()}-${safeName}`

  const { error: uploadError } = await supabase.storage.from('documents').upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (uploadError) redirect(back(issueId, `photo=upload&reason=${encodeURIComponent(uploadError.message)}`))

  const { data: publicUrl } = supabase.storage.from('documents').getPublicUrl(path)

  const { error } = await supabase.from('issue_photos').insert({
    project_id: project.id,
    issue_id: issueId,
    kind,
    file_name: file.name,
    file_path: path,
    file_url: publicUrl.publicUrl,
    content_type: file.type,
    size_bytes: file.size,
    caption,
    uploaded_by_name: actor.name ?? actor.email ?? null,
  })
  if (error) redirect(back(issueId, `photo=save&reason=${encodeURIComponent(error.message)}`))

  await recordAudit({
    projectId: project.id,
    action: kind === 'fix' ? 'fix photo attached' : 'defect photo attached',
    entity: 'issue',
    entityId: issueId,
    entityLabel: file.name,
    comment: caption ? `${file.name} — "${caption}"` : file.name,
  })

  refresh(issueId)
  redirect(back(issueId, 'photo=ok'))
}

export async function deleteIssuePhoto(formData: FormData) {
  const issueId = String(formData.get('issue_id') ?? '')
  const id = String(formData.get('id') ?? '')
  const project = await getCurrentProject()
  if (!project) redirect('/issues?photo=noproject')
  // Removing evidence is a bigger act than adding it.
  if (!(await actorCan('manage', project.id))) redirect(back(issueId, 'photo=denied'))

  const photo = await loadPhoto(id, project.id)
  if (!photo) redirect(back(issueId, 'photo=gone'))

  if (photo.file_path) await supabase.storage.from('documents').remove([photo.file_path])
  await supabase.from('issue_photos').delete().eq('id', id).eq('project_id', project.id)

  await recordAudit({
    projectId: project.id,
    action: 'photo removed from punch item',
    entity: 'issue',
    entityId: issueId,
    entityLabel: photo.file_name ?? id,
    oldValue: photo.caption ?? null,
    comment: 'The photograph and any AI reading of it were deleted. The audit entry is the only record it existed.',
  })

  refresh(issueId)
  redirect(back(issueId, 'photo=removed'))
}

// ── Asking the AI to look ────────────────────────────────────────────────

async function fetchBytes(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

/**
 * Ask Claude what it can see in one photograph.
 *
 * The reading is stored on the photo, which is a deliberate exception to this
 * application's rule that nothing derived is ever stored: it cannot be
 * reproduced identically, it costs money, and the audit trail needs the exact
 * words that were on screen in front of whoever acted on them.
 *
 * It changes nothing else. It never touches the punch item's status, and a
 * reading that claims a defect is fixed is flagged rather than believed.
 */
export async function reviewIssuePhoto(formData: FormData) {
  const issueId = String(formData.get('issue_id') ?? '')
  const id = String(formData.get('id') ?? '')
  const project = await getCurrentProject()
  if (!project) redirect('/issues?photo=noproject')
  if (!(await actorCan('review', project.id))) redirect(back(issueId, 'ai=denied'))

  const photo = await loadPhoto(id, project.id)
  if (!photo?.file_url) redirect(back(issueId, 'ai=gone'))

  const { data: issueRow } = await supabase
    .from('issues')
    .select('title, description, category, equipment_id, subject_type, subject_id, ref')
    .eq('id', issueId)
    .eq('project_id', project.id)
    .single()
  const issue = (issueRow ?? {}) as {
    title?: string
    description?: string | null
    category?: string | null
    ref?: string | null
  }

  const bytes = await fetchBytes(photo.file_url)
  if (!bytes) redirect(back(issueId, 'ai=unreachable'))

  const outcome = await askAboutImages({
    system: REVIEW_SYSTEM,
    prompt: reviewPrompt({
      title: issue.title ?? 'A punch item',
      description: issue.description ?? null,
      tag: photo.file_name ?? 'this equipment',
      category: issue.category ?? null,
      kind: photo.kind,
      caption: photo.caption,
    }),
    images: [{ mediaType: photo.content_type ?? 'image/jpeg', bytes }],
  })

  if (!outcome.ok) {
    await recordAudit({
      projectId: project.id,
      action: 'photo review failed',
      entity: 'issue',
      entityId: issueId,
      entityLabel: photo.file_name ?? id,
      comment: `${outcome.reason}${outcome.hint ? ` — ${outcome.hint}` : ''}`,
    })
    redirect(back(issueId, `ai=failed&reason=${encodeURIComponent(outcome.reason.slice(0, 200))}`))
  }

  const reading = readReview(outcome.value)
  if (!reading) {
    await recordAudit({
      projectId: project.id,
      action: 'photo review unreadable',
      entity: 'issue',
      entityId: issueId,
      entityLabel: photo.file_name ?? id,
      comment: `The model replied but not in a form this app could read. First 200 characters: ${outcome.value.slice(0, 200)}`,
    })
    redirect(back(issueId, 'ai=unreadable'))
  }

  const actor = await getActor(project.id)

  await supabase
    .from('issue_photos')
    .update({
      ai_model: outcome.model,
      ai_reviewed_at: new Date().toISOString(),
      ai_reviewed_by_name: actor.name ?? actor.email ?? null,
      ai_confidence: reading.confidence,
      ai_problem: reading.problem,
      ai_recommendation: reading.recommendation,
      ai_raw: outcome.value.slice(0, 8000),
    })
    .eq('id', id)
    .eq('project_id', project.id)

  await recordAudit({
    projectId: project.id,
    action: 'photo reviewed by AI',
    entity: 'issue',
    entityId: issueId,
    entityLabel: photo.file_name ?? id,
    newValue: reading.confidence,
    comment:
      `${outcome.model}: ${reading.problem} Recommendation: ${reading.recommendation}` +
      (overreaches(reading)
        ? ' — NOTE: this reading claims something only a person may decide, and was flagged as such on screen.'
        : ''),
  })

  refresh(issueId)
  redirect(back(issueId, 'ai=ok'))
}

/**
 * Ask Claude whether the after-photo shows the same place as the before-photo.
 *
 * This is the question worth asking. "What is wrong in this photo" is a party
 * trick; a fix photo of a different panel is the commonest way a punch list
 * gets closed out without the work being done, and nothing else in this
 * application can catch it.
 *
 * The answer is written against the FIX photo, because that is the one whose
 * trustworthiness is in question.
 */
export async function comparePhotos(formData: FormData) {
  const issueId = String(formData.get('issue_id') ?? '')
  const defectId = String(formData.get('defect_id') ?? '')
  const fixId = String(formData.get('fix_id') ?? '')
  const project = await getCurrentProject()
  if (!project) redirect('/issues?photo=noproject')
  if (!(await actorCan('review', project.id))) redirect(back(issueId, 'ai=denied'))

  const [defect, fix] = await Promise.all([loadPhoto(defectId, project.id), loadPhoto(fixId, project.id)])
  if (!defect?.file_url || !fix?.file_url) redirect(back(issueId, 'ai=gone'))

  const { data: issueRow } = await supabase
    .from('issues')
    .select('title, description, ref')
    .eq('id', issueId)
    .eq('project_id', project.id)
    .single()
  const issue = (issueRow ?? {}) as { title?: string; description?: string | null }

  const [defectBytes, fixBytes] = await Promise.all([fetchBytes(defect.file_url), fetchBytes(fix.file_url)])
  if (!defectBytes || !fixBytes) redirect(back(issueId, 'ai=unreachable'))

  const outcome = await askAboutImages({
    system: REVIEW_SYSTEM,
    prompt: comparePrompt({
      title: issue.title ?? 'A punch item',
      description: issue.description ?? null,
      tag: fix.file_name ?? 'this equipment',
    }),
    // Order matters: the prompt says "the first" and "the second".
    images: [
      { mediaType: defect.content_type ?? 'image/jpeg', bytes: defectBytes },
      { mediaType: fix.content_type ?? 'image/jpeg', bytes: fixBytes },
    ],
  })

  if (!outcome.ok) {
    await recordAudit({
      projectId: project.id,
      action: 'before-and-after review failed',
      entity: 'issue',
      entityId: issueId,
      entityLabel: fix.file_name ?? fixId,
      comment: `${outcome.reason}${outcome.hint ? ` — ${outcome.hint}` : ''}`,
    })
    redirect(back(issueId, `ai=failed&reason=${encodeURIComponent(outcome.reason.slice(0, 200))}`))
  }

  const reading = readReview(outcome.value)
  if (!reading) redirect(back(issueId, 'ai=unreadable'))

  const actor = await getActor(project.id)

  await supabase
    .from('issue_photos')
    .update({
      ai_model: outcome.model,
      ai_reviewed_at: new Date().toISOString(),
      ai_reviewed_by_name: actor.name ?? actor.email ?? null,
      ai_confidence: reading.confidence,
      ai_problem: reading.problem,
      ai_recommendation: reading.recommendation,
      ai_raw: outcome.value.slice(0, 8000),
    })
    .eq('id', fixId)
    .eq('project_id', project.id)

  await recordAudit({
    projectId: project.id,
    action: 'before and after compared by AI',
    entity: 'issue',
    entityId: issueId,
    entityLabel: fix.file_name ?? fixId,
    oldValue: defect.file_name ?? defectId,
    newValue: reading.confidence,
    comment: `${outcome.model}: ${reading.problem} Recommendation: ${reading.recommendation}`,
  })

  refresh(issueId)
  redirect(back(issueId, 'ai=compared'))
}

// ── Assessing the defect itself ──────────────────────────────────────────

/**
 * Ask Claude what it makes of the punch item as described.
 *
 * Distinct from `issues.ai_comment`, which is a rules stub shown as
 * "Automatic check" and only ever notices a missing description. Distinct
 * again from the photo review, which needs a photograph most items do not
 * have. This is the one that works on a punch item raised on a phone with one
 * sentence in it — and if that sentence is too thin, it says so for free
 * without spending a call.
 */
export async function reviewDefect(formData: FormData) {
  const issueId = String(formData.get('issue_id') ?? '')
  const project = await getCurrentProject()
  if (!project) redirect('/issues?assess=noproject')
  if (!(await actorCan('review', project.id))) redirect(back(issueId, 'assess=denied'))

  const { data: row } = await supabase
    .from('issues')
    .select('ref, title, description, category, severity, level, discipline, location, equipment_id, subject_type, subject_id')
    .eq('id', issueId)
    .eq('project_id', project.id)
    .single()

  const issue = (row ?? {}) as {
    ref?: string | null
    title?: string
    description?: string | null
    category?: string | null
    severity?: string | null
    level?: string | null
    discipline?: string | null
    location?: string | null
    equipment_id?: string | null
  }
  if (!issue.title) redirect(back(issueId, 'assess=gone'))

  // Free and instant, and a better thing to put in front of somebody than a
  // paid round trip that comes back saying the same.
  const thin = tooThinToAssess({ title: issue.title, description: issue.description ?? null })
  if (thin) {
    await supabase
      .from('issues')
      .update({
        ai_model: null,
        ai_reviewed_at: new Date().toISOString(),
        ai_reviewed_by_name: null,
        ai_confidence: 'cannot_tell',
        ai_kind: 'unclear',
        ai_problem: thin,
        ai_likely_cause: '',
        ai_verification: '',
        ai_blocks: '',
        ai_recommendation: 'Add the detail above and ask again.',
        ai_raw: null,
      })
      .eq('id', issueId)
      .eq('project_id', project.id)
    refresh(issueId)
    redirect(back(issueId, 'assess=thin'))
  }

  // The tag it was raised against, in the words the model should see.
  const index = await loadSubjectIndex(project.id)
  const subject =
    issue.equipment_id ? index.byKey.get(`equipment:${issue.equipment_id}`) : undefined
  const tag = subject?.code ?? subject?.name ?? 'the equipment named on the item'

  const outcome = await ask({
    system: DEFECT_SYSTEM,
    prompt: defectPrompt({
      ref: issue.ref ?? null,
      title: issue.title,
      description: issue.description ?? null,
      tag,
      level: issue.level ?? null,
      category: issue.category ?? null,
      severity: issue.severity ?? null,
      discipline: issue.discipline ?? null,
      location: issue.location ?? null,
    }),
    maxTokens: 900,
  })

  if (!outcome.ok) {
    await recordAudit({
      projectId: project.id,
      action: 'defect assessment failed',
      entity: 'issue',
      entityId: issueId,
      entityLabel: issue.ref ?? issueId,
      comment: `${outcome.reason}${outcome.hint ? ` — ${outcome.hint}` : ''}`,
    })
    redirect(back(issueId, `assess=failed&reason=${encodeURIComponent(outcome.reason.slice(0, 200))}`))
  }

  const reading = readDefectReview(outcome.value)
  if (!reading) {
    await recordAudit({
      projectId: project.id,
      action: 'defect assessment unreadable',
      entity: 'issue',
      entityId: issueId,
      entityLabel: issue.ref ?? issueId,
      comment: `The model replied but not in a form this app could read. First 200 characters: ${outcome.value.slice(0, 200)}`,
    })
    redirect(back(issueId, 'assess=unreadable'))
  }

  const actor = await getActor(project.id)
  const unsafe = unsafeAdvice(reading)

  await supabase
    .from('issues')
    .update({
      ai_model: outcome.model,
      ai_reviewed_at: new Date().toISOString(),
      ai_reviewed_by_name: actor.name ?? actor.email ?? null,
      ai_confidence: reading.confidence,
      ai_kind: reading.kind,
      ai_problem: reading.problem,
      ai_likely_cause: reading.likelyCause,
      ai_verification: reading.verification,
      ai_blocks: reading.blocks,
      ai_recommendation: reading.recommendation,
      ai_raw: outcome.value.slice(0, 8000),
    })
    .eq('id', issueId)
    .eq('project_id', project.id)

  await recordAudit({
    projectId: project.id,
    action: 'defect assessed by AI',
    entity: 'issue',
    entityId: issueId,
    entityLabel: issue.ref ?? issueId,
    newValue: reading.confidence,
    oldValue: kindLabel(reading.kind),
    comment:
      `${outcome.model} [${kindLabel(reading.kind)}]: ${reading.problem}` +
      (reading.likelyCause ? ` Mechanism: ${reading.likelyCause}` : '') +
      (reading.verification ? ` Verify by: ${reading.verification}` : '') +
      (reading.blocks ? ` Blocks: ${reading.blocks}` : '') +
      ` Recommendation: ${reading.recommendation}` +
      (suppliesALimit(reading) ? ' — FLAGGED: appears to supply an acceptance figure it cannot know.' : '') +
      (unsafe ? ' — FLAGGED: this reading suggests live or unprotected working and was marked as such on screen.' : '') +
      (overreaches(reading) ? ' — NOTE: this reading claims something only a person may decide.' : ''),
  })

  refresh(issueId)
  redirect(back(issueId, unsafe ? 'assess=unsafe' : 'assess=ok'))
}
