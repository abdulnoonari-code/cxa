'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { recordAudit, getActor } from '@/lib/audit'
import { getCurrentProject } from '@/lib/project'
import { LEVELS } from '@/lib/checklist'
import { loadLibrary } from '@/data/templates'
import { planApply, planEdit, candidatesFrom } from '@/lib/templates'

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key)
  if (typeof v !== 'string' || v.trim() === '') return null
  return v.trim()
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** Add a definition. It applies to nothing until somebody applies it. */
export async function createTemplate(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) redirect('/library')

  const title = str(formData, 'title')
  const level = str(formData, 'level')
  if (!title) redirect('/library?saved=notitle')
  if (!level || !LEVELS.some((l) => l.value === level)) redirect('/library?saved=nolevel')

  const actor = await getActor(project.id)
  const { error } = await supabase.from('check_templates').insert({
    project_id: project.id,
    code: str(formData, 'code'),
    title,
    level,
    section: str(formData, 'section'),
    answer_type: str(formData, 'answer_type') ?? 'Yes / No / N A',
    guidance: str(formData, 'guidance'),
    created_by: actor.name || actor.email || null,
  })
  if (error) redirect(`/library?saved=error&detail=${encodeURIComponent(error.message.slice(0, 200))}`)

  await recordAudit({
    projectId: project.id,
    action: 'added a check to the library',
    entity: 'check_template',
    entityLabel: title.slice(0, 80),
    newValue: level,
  })

  revalidatePath('/library')
  redirect('/library?saved=created')
}

/**
 * Change a definition.
 *
 * Rewrites every record still waiting to be done, and leaves every answered
 * one exactly as it was signed. See lib/templates.ts — a check marked Pass is
 * a statement by a person about a specific sentence, and rewriting it
 * afterwards changes what they put their name to.
 */
export async function editTemplate(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) redirect('/library')

  const id = str(formData, 'id')
  const title = str(formData, 'title')
  if (!id || !title) redirect('/library?saved=notitle')

  const lib = await loadLibrary(project.id)
  const template = lib.templates.find((t) => t.id === id)
  if (!template) redirect('/library?saved=gone')

  const plan = planEdit(template, lib.records)

  const { error } = await supabase
    .from('check_templates')
    .update({
      title,
      code: str(formData, 'code'),
      section: str(formData, 'section'),
      guidance: str(formData, 'guidance'),
    })
    .eq('id', id)
  if (error) redirect(`/library?saved=error&detail=${encodeURIComponent(error.message.slice(0, 200))}`)

  for (const part of chunk(plan.rewrite.map((r) => r.id), 200)) {
    await supabase
      .from('checklist_items')
      .update({ item: title, section_path: str(formData, 'section') })
      .in('id', part)
  }

  await recordAudit({
    projectId: project.id,
    action: 'changed a check in the library',
    entity: 'check_template',
    entityId: id,
    entityLabel: title.slice(0, 80),
    oldValue: template.title.slice(0, 120),
    newValue: title.slice(0, 120),
    comment: `${plan.rewrite.length} unanswered checks reworded. ${plan.leaveAlone.length} already answered were left exactly as signed and are reported as drifted.`,
  })

  revalidatePath('/library')
  revalidatePath('/checklists')
  redirect(`/library?saved=edited&rewrote=${plan.rewrite.length}&kept=${plan.leaveAlone.length}`)
}

/** Apply one definition to the ticked tags or systems. */
export async function applyTemplate(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) redirect('/library')

  const id = str(formData, 'id')
  if (!id) redirect('/library')

  const lib = await loadLibrary(project.id)
  const template = lib.templates.find((t) => t.id === id)
  if (!template) redirect('/library?applied=gone')

  const chosen = new Set(formData.getAll('target').map(String))
  const targets = lib.targets.filter((t) => chosen.has(t.id))
  if (targets.length === 0) redirect('/library?applied=none')

  const plan = planApply(template, targets, lib.records)
  if (plan.create.length === 0) {
    redirect(`/library?applied=nothing&have=${plan.alreadyHave.length}&wrong=${plan.wrongScope.length}`)
  }

  const rows = plan.create.map((t) => ({
    project_id: project.id,
    equipment_id: t.type === 'equipment' ? t.id : null,
    subject_type: t.type,
    subject_id: t.id,
    template_id: template.id,
    level: template.level,
    item: template.title,
    status: 'pending',
    inspection_type: 'surveillance',
    section_path: template.section,
    answer_type: template.answerType,
  }))

  for (const part of chunk(rows, 500)) {
    const { error } = await supabase.from('checklist_items').insert(part)
    if (error) redirect(`/library?applied=error&detail=${encodeURIComponent(error.message.slice(0, 200))}`)
  }

  await recordAudit({
    projectId: project.id,
    action: 'applied a library check',
    entity: 'checklist_item',
    entityLabel: template.title.slice(0, 80),
    newValue: `${plan.create.length} created`,
    comment: `${plan.create.map((t) => t.code).slice(0, 12).join(', ')}${plan.create.length > 12 ? ', …' : ''}${plan.alreadyHave.length > 0 ? ` — ${plan.alreadyHave.length} already had it` : ''}${plan.wrongScope.length > 0 ? ` — ${plan.wrongScope.length} skipped as the wrong scope for ${template.level}` : ''}`,
  })

  revalidatePath('/library')
  revalidatePath('/checklists')
  revalidatePath('/rules')
  redirect(`/library?applied=ok&n=${plan.create.length}&have=${plan.alreadyHave.length}&wrong=${plan.wrongScope.length}`)
}

/**
 * Turn checks that already exist into definitions.
 *
 * The other half of the duplicate rule: that one reports repetition, this one
 * offers to fix it. The existing records are LINKED to the new definition and
 * their wording is left exactly as it is — nothing is rewritten, because some
 * of them have been answered.
 */
export async function adoptCandidates(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) redirect('/library')

  const chosen = new Set(formData.getAll('candidate').map(String))
  if (chosen.size === 0) redirect('/library?adopt=none')

  const lib = await loadLibrary(project.id)
  const candidates = candidatesFrom(
    lib.records.map((r) => ({
      id: r.id,
      item: r.item,
      level: r.level,
      status: r.status,
      subjectId: r.subjectId,
      templateId: r.templateId,
    }))
  ).filter((c) => chosen.has(`${c.level}|${c.title}`))

  if (candidates.length === 0) redirect('/library?adopt=none')

  const actor = await getActor(project.id)
  let made = 0
  let linked = 0

  for (const c of candidates) {
    const { data, error } = await supabase
      .from('check_templates')
      .insert({
        project_id: project.id,
        title: c.title,
        level: c.level,
        section: c.section,
        answer_type: c.answerType ?? 'Yes / No / N A',
        created_by: actor.name || actor.email || null,
      })
      .select('id')
      .single()

    if (error || !data) continue
    made += 1

    for (const part of chunk(c.ids, 200)) {
      await supabase.from('checklist_items').update({ template_id: (data as { id: string }).id }).in('id', part)
      linked += part.length
    }
  }

  await recordAudit({
    projectId: project.id,
    action: 'made library checks from existing records',
    entity: 'check_template',
    entityLabel: `${made} definitions`,
    newValue: `${linked} existing checks linked`,
    comment:
      'The wording of every existing record was left exactly as it was — some have been answered. Only the link was added.',
  })

  revalidatePath('/library')
  redirect(`/library?adopt=ok&made=${made}&linked=${linked}`)
}
