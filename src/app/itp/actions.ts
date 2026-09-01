'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { actorCan, recordAudit } from '@/lib/audit'
import { loadSubjectIndex } from '@/data/subjects'
import { loadItp } from '@/data/itp'
import { parseItpWorkbook, reconcile, summariseImport, type ItpProblem, type ExistingActivity } from '@/lib/itp-io'

function refresh() {
  revalidatePath('/itp')
  revalidatePath('/holdpoints')
  revalidatePath('/checklists')
  revalidatePath('/tests')
  revalidatePath('/dossier')
  revalidatePath('/audit')
}

/**
 * Read a marked-up ITP back in.
 *
 * All-or-nothing, like every other importer here: one unreadable row and
 * nothing at all is written, with every problem reported by sheet and row
 * number to the audit log. A half-applied plan is worse than a rejected one,
 * because nobody can tell afterwards which half took.
 *
 * The one thing this import will never do is create an activity. The ITP is a
 * view of the checklist and test registers, so a plan row with no record
 * behind it means either the file is for another project or somebody typed a
 * new line into a spreadsheet — and turning that into a checklist item would
 * put a check into the system that nobody performed.
 */
export async function importItp(formData: FormData) {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) redirect('/itp?import=nofile')

  const project = await getCurrentProject()
  if (!project) redirect('/itp?import=noproject')
  if (!(await actorCan('review', project.id))) redirect('/itp?import=denied')

  const parsed = await parseItpWorkbook(await file.arrayBuffer(), { fileName: file.name })

  if (parsed.rows.length === 0 && parsed.errors.length === 0) {
    await recordAudit({
      projectId: project.id,
      action: 'ITP import failed',
      entity: 'itp',
      entityLabel: file.name,
      comment:
        parsed.headingsSeen.length > 0
          ? `No plan found. Headings seen: ${parsed.headingsSeen.slice(0, 15).join(', ')}`
          : 'The file had nothing readable in it.',
    })
    redirect(`/itp?import=empty&headings=${encodeURIComponent(parsed.headingsSeen.slice(0, 8).join(', '))}`)
  }

  // The plan the app already holds, which is what every row is matched against.
  const index = await loadSubjectIndex(project.id)
  const plan = await loadItp(project.id, index, null)
  const existing: ExistingActivity[] = (plan?.activities ?? []).map((a) => ({
    entity: a.entity,
    id: a.id,
    tag: a.tag,
    activity: a.activity,
    level: a.level,
    inspectionType: a.inspectionType,
    // Only what is written against the record. A party the project convention
    // supplied is not a change the file has to repeat, and treating it as one
    // would rewrite every defaulted row into an explicit assignment.
    explicitParty: a.holder.source === 'explicit' ? a.holder.party : null,
  }))

  const result = reconcile(parsed.rows, existing)
  const errors: ItpProblem[] = [...parsed.errors, ...result.errors]

  if (errors.length > 0) {
    await recordAudit({
      projectId: project.id,
      action: 'ITP import rejected',
      entity: 'itp',
      entityLabel: file.name,
      comment: `${errors.length} problem${errors.length === 1 ? '' : 's'}; nothing was saved. ${errors
        .slice(0, 12)
        .map((e) => `Row ${e.row} (${e.column}): ${e.message}`)
        .join(' | ')}`,
    })
    redirect(`/itp?import=errors&count=${errors.length}&first=${encodeURIComponent(errors[0].message.slice(0, 160))}`)
  }

  if (result.updates.length === 0) {
    await recordAudit({
      projectId: project.id,
      action: 'ITP imported with no changes',
      entity: 'itp',
      entityLabel: file.name,
      comment: `${result.unchanged} row${result.unchanged === 1 ? '' : 's'} already said what the file says.`,
    })
    redirect(`/itp?import=nochange&unchanged=${result.unchanged}`)
  }

  // Written one record at a time. A plan of two thousand rows produces a
  // handful of updates, so there is nothing to batch, and doing it row by row
  // means the audit trail says which activity changed rather than "an import
  // happened".
  for (const u of result.updates) {
    const table = u.entity === 'test_record' ? 'test_records' : 'checklist_items'
    const patch: Record<string, unknown> = {}
    if (u.inspectionType !== null) patch.inspection_type = u.inspectionType
    if (u.party !== undefined) patch.point_party = u.party
    if (Object.keys(patch).length === 0) continue

    const { error } = await supabase.from(table).update(patch).eq('id', u.id).eq('project_id', project.id)
    if (error) {
      await recordAudit({
        projectId: project.id,
        action: 'ITP import failed part way',
        entity: 'itp',
        entityLabel: file.name,
        comment: `${u.describe} — ${error.message}. Earlier rows in this file were saved.`,
      })
      redirect(`/itp?import=failed&at=${encodeURIComponent(u.tag)}`)
    }

    await recordAudit({
      projectId: project.id,
      action: 'inspection point changed by ITP import',
      entity: u.entity,
      entityId: u.id,
      entityLabel: u.tag,
      comment: u.describe,
    })
  }

  await recordAudit({
    projectId: project.id,
    action: 'ITP imported',
    entity: 'itp',
    entityLabel: file.name,
    comment: summariseImport(result),
  })

  refresh()
  redirect(`/itp?import=ok&changed=${result.updates.length}&unchanged=${result.unchanged}`)
}
