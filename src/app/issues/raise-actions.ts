'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { recordAudit, getActor } from '@/lib/audit'
import { getCurrentProject } from '@/lib/project'
import { loadPunchRefs } from '@/data/punchlist'
import { refSeries } from '@/lib/punchlist'
import { loadFailedChecks } from '@/data/failed-checks'
import { unraised, draftFrom } from '@/lib/failed-checks'

/**
 * Raise a punch item for every failed check that has none.
 *
 * One button rather than a row of checkboxes, because the answer to "which of
 * these twenty failed checks should become defects" is always "all of them".
 * A check that failed and is not a defect is a check somebody should re-run
 * or mark N/A, and that is an edit to the check, not a decision to make on a
 * punch list screen.
 *
 * Each item is linked back to its check, so the two stay tied together: the
 * punch list can say which check found the defect, and the check can be shown
 * with what it produced.
 *
 * Category, severity, responsible party and date are all left empty. They are
 * decisions, and every one of them has money attached.
 */
export async function raiseFromFailedChecks() {
  const project = await getCurrentProject()
  if (!project) redirect('/issues?raise=noproject')

  const actor = await getActor(project.id)
  const { checks, raisedFor } = await loadFailedChecks(project.id)
  const todo = unraised(checks, raisedFor)

  if (todo.length === 0) {
    redirect('/issues?raise=none')
  }

  const refs = refSeries(await loadPunchRefs(project.id), todo.length)

  const rows = todo.map((c, i) => {
    const draft = draftFrom(c)
    return {
      project_id: project.id,
      ref: refs[i],
      equipment_id: draft.equipmentId,
      subject_type: draft.subjectType,
      subject_id: draft.subjectId,
      checklist_item_id: draft.checkId,
      title: draft.title,
      description: draft.description,
      // Left unset on purpose. See lib/failed-checks.ts — the category is a
      // commercial position, not something a failed check implies.
      severity: null,
      category: null,
      status: 'open',
      level: draft.level,
      raised_by: actor.name || actor.email || null,
    }
  })

  const { error } = await supabase.from('issues').insert(rows)
  if (error) {
    await recordAudit({
      projectId: project.id,
      action: 'raising punch items from failed checks failed',
      entity: 'issue',
      entityLabel: `${todo.length} checks`,
      newValue: error.message,
    })
    redirect(`/issues?raise=error&detail=${encodeURIComponent(error.message.slice(0, 300))}`)
  }

  await recordAudit({
    projectId: project.id,
    action: 'raised punch items from failed checks',
    entity: 'issue',
    entityLabel: `${rows.length} items`,
    newValue: `${refs[0]} to ${refs[refs.length - 1]}`,
    comment:
      'Every one is uncategorised: A, B or C is a commercial position and is not implied by a failed check. ' +
      todo
        .slice(0, 6)
        .map((c) => `${c.serial ? `${c.serial}. ` : ''}${(c.item ?? '').slice(0, 40)}`)
        .join(' | '),
  })

  revalidatePath('/issues')
  revalidatePath('/checklists')
  revalidatePath('/rules')
  revalidatePath('/dashboard')

  redirect(`/issues?raise=ok&n=${rows.length}&from=${refs[0]}&to=${refs[refs.length - 1]}`)
}
