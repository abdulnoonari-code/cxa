'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { actorCan, recordAudit } from '@/lib/audit'
import { loadSubjectIndex } from '@/data/subjects'
import { loadItp } from '@/data/itp'
import { parseItpWorkbook, reconcile, summariseImport, type ItpProblem, type ExistingActivity } from '@/lib/itp-io'
import { isParty, partyLabel, planPointChange, conventionAllowed } from '@/lib/itp'
import { INSPECTION_TYPES, inspectionLabel } from '@/lib/inspection'
import { LEVELS } from '@/lib/checklist'
import { levelLabel } from '@/lib/levels'

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

// ── Setting a holder from the screen ─────────────────────────────────────
//
// Until now the only two ways to say who holds a point were SQL and a
// round trip through Excel. Exporting a two-thousand-row workbook to correct
// one hold point is not a workflow, it is a punishment, so this is the third
// way and the one people will actually use.

/** Back to the scope the user was looking at, ready for one more parameter. */
function backTo(formData: FormData): string {
  const scope = formData.get('scope')
  return typeof scope === 'string' && scope ? `/itp?${scope}&` : '/itp?'
}

/**
 * Say who holds one inspection point, and optionally what kind of point it is.
 *
 * Both are decisions rather than data entry, so both are audited by name with
 * the old value beside the new one. A hold point quietly changing hands is
 * exactly the thing somebody argues about at handover.
 */
export async function setPointParty(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) redirect('/itp?set=noproject')
  if (!(await actorCan('review', project.id))) redirect('/itp?set=denied')

  const entity = String(formData.get('entity') ?? '')
  const id = String(formData.get('id') ?? '')
  const tag = String(formData.get('tag') ?? '')
  const activity = String(formData.get('activity') ?? '')
  const rawParty = String(formData.get('party') ?? '')
  const rawType = String(formData.get('inspection_type') ?? '')
  const wasParty = String(formData.get('was_party') ?? '')
  const wasType = String(formData.get('was_type') ?? '')

  if (!id || (entity !== 'checklist_item' && entity !== 'test_record')) redirect(`${backTo(formData)}set=badrow`)

  const table = entity === 'test_record' ? 'test_records' : 'checklist_items'

  // The decision is a rule and lives in lib/itp.ts so it can be asserted.
  // This function does the permission check, the write and the audit.
  const change = planPointChange({
    wasParty: wasParty || null,
    wasType,
    party: rawParty,
    type: rawType || null,
  })

  if (!change.ok) redirect(`${backTo(formData)}set=${change.reason === 'no_change' ? 'nochange' : change.reason === 'bad_party' ? 'badparty' : 'badtype'}`)

  const patch = change.patch as Record<string, unknown>

  const { error } = await supabase.from(table).update(patch).eq('id', id).eq('project_id', project.id)
  if (error) redirect(`${backTo(formData)}set=failed`)

  await recordAudit({
    projectId: project.id,
    action: 'inspection point changed',
    entity,
    entityId: id,
    entityLabel: tag,
    oldValue: `${inspectionLabel(wasType)}, held by ${wasParty ? partyLabel(wasParty) : 'nobody'}`,
    newValue: `${inspectionLabel(rawType || wasType)}, held by ${rawParty ? partyLabel(rawParty) : 'nobody'}`,
    comment: `${tag} — ${activity}: ${change.describe}`,
  })

  refresh()
  redirect(`${backTo(formData)}set=ok`)
}

// ── The project's standing defaults ──────────────────────────────────────

/**
 * Set a project default: at this level, this kind of point belongs to this
 * party.
 *
 * **It writes nothing onto any record.** A convention is a fallback the ITP
 * applies while it is being read, so removing it later puts every point that
 * leant on it straight back to unowned — visibly, on the screen, which is the
 * whole reason it is derived rather than stored. If adding a default silently
 * stamped a party onto two thousand rows, deleting it afterwards would leave
 * them all claiming an agreement nobody made.
 */
export async function addConvention(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) redirect('/itp?conv=noproject')
  if (!(await actorCan('manage', project.id))) redirect('/itp?conv=denied')

  const level = String(formData.get('level') ?? '')
  const inspectionType = String(formData.get('inspection_type') ?? '')
  const party = String(formData.get('party') ?? '')
  const note = String(formData.get('note') ?? '').trim()

  if (!LEVELS.some((l) => l.value === level)) redirect('/itp?conv=badlevel')
  if (!INSPECTION_TYPES.some((t) => t.value === inspectionType)) redirect('/itp?conv=badtype')
  if (!isParty(party)) redirect('/itp?conv=badparty')

  // Surveillance and review points carry no release, so nobody needs to hold
  // them. A default for one would put a party on four hundred rows that will
  // never be waiting on anybody.
  if (!conventionAllowed(inspectionType)) redirect('/itp?conv=norelease')

  const { error } = await supabase
    .from('itp_conventions')
    .upsert(
      {
        project_id: project.id,
        level,
        inspection_type: inspectionType,
        party,
        note: note || null,
      },
      { onConflict: 'project_id,level,inspection_type' }
    )
  if (error) redirect('/itp?conv=failed')

  await recordAudit({
    projectId: project.id,
    action: 'ITP default set',
    entity: 'itp_convention',
    entityLabel: `${level} ${inspectionType}`,
    newValue: partyLabel(party),
    comment: `At ${levelLabel(level)}, a ${inspectionLabel(inspectionType)} falls to the ${partyLabel(
      party
    )} unless the activity says otherwise. Nothing was written onto any record.`,
  })

  refresh()
  redirect('/itp?conv=ok')
}

export async function removeConvention(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) redirect('/itp?conv=noproject')
  if (!(await actorCan('manage', project.id))) redirect('/itp?conv=denied')

  const level = String(formData.get('level') ?? '')
  const inspectionType = String(formData.get('inspection_type') ?? '')

  const { error } = await supabase
    .from('itp_conventions')
    .delete()
    .eq('project_id', project.id)
    .eq('level', level)
    .eq('inspection_type', inspectionType)
  if (error) redirect('/itp?conv=failed')

  await recordAudit({
    projectId: project.id,
    action: 'ITP default removed',
    entity: 'itp_convention',
    entityLabel: `${level} ${inspectionType}`,
    comment: `Every point that was relying on this default now has no party, and the plan says so.`,
  })

  refresh()
  redirect('/itp?conv=removed')
}
