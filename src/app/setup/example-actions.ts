'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { recordAudit, getActor } from '@/lib/audit'
import { getCurrentProject } from '@/lib/project'
import { insertWithFallback, type InsertOutcome } from '@/lib/pg-columns'
import { EXAMPLE_REPORT_COOKIE, EXAMPLE_REPORT_MAX_AGE, encodeReport } from '@/lib/example-report'
import { EXAMPLE_TAGS, EXAMPLE_TAGS_B, EXAMPLE_VOCAB, EXAMPLE_MARK, buildExampleChecks } from '@/lib/example-plan'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * The example's rows, written through the shared fallback in lib/pg-columns.
 *
 * Chunked at 400 because a single insert of every checklist row is a request
 * big enough to be refused for its size, and a size refusal names no column,
 * so the fallback would report it as "the database refused it" and be right
 * but useless.
 */
async function insertRows(
  table: string,
  rows: Record<string, unknown>[],
  outcomes: InsertOutcome[]
): Promise<Record<string, unknown>[]> {
  return insertWithFallback(
    table,
    rows,
    async (attempt) => {
      const written: Record<string, unknown>[] = []
      for (const part of chunk(attempt, 400)) {
        const { data, error } = await supabase.from(table).insert(part).select()
        if (error) return { data: null, error: { message: error.message } }
        written.push(...((data ?? []) as Record<string, unknown>[]))
      }
      return { data: written, error: null }
    },
    outcomes
  )
}

/**
 * Add the worked example INSIDE the project that is open.
 *
 * It used to create a project of its own. That was wrong, and pressing the
 * button four times proved it — four identical projects called "Worked
 * example" sitting in the list beside real sites, each one looking exactly
 * like a job somebody is running.
 *
 * An example is not a project. It is two switchboards and a test script, and
 * a real project is where switchboards live. So it goes into the open one.
 *
 * The whole risk of that is telling the example apart from the work
 * afterwards, and it is handled in one way and one way only: every system and
 * every tag it creates is prefixed with EXAMPLE_MARK, and Remove deletes
 * exactly the rows carrying that prefix and nothing else. No date window, no
 * "created recently", no guessing — a prefix is the only thing that still
 * identifies these rows correctly six months from now, after somebody has
 * edited half of them.
 */
export async function addWorkedExample() {
  const project = await getCurrentProject()
  if (!project) redirect('/projects')

  const outcomes: InsertOutcome[] = []
  const store = await cookies()
  const projectId = project.id

  const finish = async (): Promise<never> => {
    store.set(EXAMPLE_REPORT_COOKIE, encodeReport(outcomes), {
      path: '/',
      maxAge: EXAMPLE_REPORT_MAX_AGE,
      sameSite: 'lax',
    })
    revalidatePath('/', 'layout')
    redirect('/setup?example=done')
  }

  const systems = await insertRows(
    'systems',
    [
      {
        project_id: projectId,
        system_id: `${EXAMPLE_MARK}SWGR-A1`,
        name: 'Worked example — 11kV switchboard A1',
        discipline: 'Electrical',
        boundary: 'Incomer, four breakers, bus tie, PQM',
        stage: EXAMPLE_VOCAB.stageA,
      },
      {
        project_id: projectId,
        system_id: `${EXAMPLE_MARK}SWGR-B1`,
        name: 'Worked example — 11kV switchboard B1',
        discipline: 'Electrical',
        stage: EXAMPLE_VOCAB.stageB,
      },
    ],
    outcomes
  )
  const byCode = new Map(
    systems.map((s) => [String((s as { system_id?: string }).system_id ?? ''), String((s as { id: string }).id)])
  )
  const systemA = byCode.get(`${EXAMPLE_MARK}SWGR-A1`) ?? null
  const systemB = byCode.get(`${EXAMPLE_MARK}SWGR-B1`) ?? null
  if (!systemA || !systemB) await finish()

  const tagRows = [
    ...EXAMPLE_TAGS.map((t) => ({ ...t, system: systemA })),
    ...EXAMPLE_TAGS_B.map((t) => ({ ...t, system: systemB })),
  ]
  const tags = await insertRows(
    'equipment',
    tagRows.map((t) => ({
      project_id: projectId,
      tag_id: `${EXAMPLE_MARK}${t.tag}`,
      description: t.description,
      category: EXAMPLE_VOCAB.equipmentCategory,
      install_status: EXAMPLE_VOCAB.installStatus,
      system_id: t.system,
      location: 'MV switchroom',
    })),
    outcomes
  )
  const tagIds = new Map(
    tags.map((r) => [
      String((r as { tag_id?: string }).tag_id ?? '').slice(EXAMPLE_MARK.length),
      String((r as { id: string }).id),
    ])
  )
  if (tagIds.size === 0) await finish()

  const q1 = tagIds.get('SUDB-A1-Q1')
  const checks = buildExampleChecks((tag) => tagIds.get(tag), systemA!).map((r) => ({
    project_id: projectId,
    equipment_id: r.subjectType === 'equipment' ? r.subjectId : null,
    subject_type: r.subjectType,
    subject_id: r.subjectId,
    level: r.level,
    item: r.item,
    status: r.status,
    notes: r.notes ?? null,
    inspection_type: 'surveillance',
    section_path: r.sectionPath ?? null,
    answer_type: r.sourceRef ? 'Yes / No / N A' : null,
    serial_no: r.serial ?? null,
    source_line: r.serial ? Number(r.serial) : null,
    source_ref: r.sourceRef ?? null,
    evidence_ref: r.evidenceRef ?? null,
    links_to: r.linksTo ?? null,
  }))
  await insertRows('checklist_items', checks, outcomes)

  const actor = await getActor(projectId)
  const who = actor.name || actor.email || 'Example'
  await insertRows(
    'issues',
    [
      {
        // FAULT: Category A, past its date, no photograph.
        project_id: projectId,
        ref: `${EXAMPLE_MARK}P-0001`,
        subject_type: 'system',
        subject_id: systemA,
        title: 'Bus tie interlock does not hold with the Kirk key removed',
        description: 'CB Q1 closed onto a closed earthing switch during interlock testing. Witnessed by the client.',
        category: EXAMPLE_VOCAB.punchA,
        severity: EXAMPLE_VOCAB.severityCritical,
        status: EXAMPLE_VOCAB.statusOpen,
        level: 'L4_fpt',
        due_date: daysAgo(6),
        raised_by: who,
      },
      {
        // FAULT: closed with no photograph at all.
        project_id: projectId,
        ref: `${EXAMPLE_MARK}P-0002`,
        equipment_id: q1 ?? null,
        subject_type: 'equipment',
        subject_id: q1 ?? null,
        title: 'Two lugs in cubicle 3 have no second torque mark',
        description: 'Found during installation verification. Re-torqued and marked.',
        category: EXAMPLE_VOCAB.punchB,
        severity: EXAMPLE_VOCAB.severityMinor,
        status: EXAMPLE_VOCAB.statusClosed,
        level: 'L2_iv',
        closed_at: daysAgo(20),
        closed_by: who,
        raised_by: who,
      },
      {
        // FAULT: two words, uncategorised, and no date.
        project_id: projectId,
        ref: `${EXAMPLE_MARK}P-0003`,
        equipment_id: tagIds.get('SUDB-A1-Q3') ?? null,
        subject_type: 'equipment',
        subject_id: tagIds.get('SUDB-A1-Q3') ?? null,
        title: 'Dust',
        status: EXAMPLE_VOCAB.statusOpen,
        level: 'L2_iv',
        raised_by: who,
      },
    ],
    outcomes
  )

  const wrote = outcomes.reduce((n, o) => n + o.wrote, 0)
  await recordAudit({
    projectId,
    action: 'added the worked example to this project',
    entity: 'project',
    entityId: projectId,
    entityLabel: project.name,
    newValue: `${wrote} records, every one prefixed ${EXAMPLE_MARK}`,
    comment:
      'Sample records built to fail in specific ways, one for each rule, so Rule Checks shows what every finding looks like. Remove them from Setup when you are done.',
  })

  await finish()
}

/**
 * Take the worked example back out of this project.
 *
 * Deletes only rows whose tag, system id or reference begins with the prefix.
 * Checks go first, then equipment, then systems, then punch items — a child
 * before its parent, because the database refuses a parent that something
 * still points at and a half-removed example is worse than one left in.
 */
export async function removeWorkedExample() {
  const project = await getCurrentProject()
  if (!project) redirect('/projects')
  const projectId = project.id

  const like = `${EXAMPLE_MARK}%`

  const [{ data: sysRows }, { data: tagRows }] = await Promise.all([
    supabase.from('systems').select('id').eq('project_id', projectId).like('system_id', like),
    supabase.from('equipment').select('id').eq('project_id', projectId).like('tag_id', like),
  ])
  const systemIds = (sysRows ?? []).map((r) => (r as { id: string }).id)
  const tagIds = (tagRows ?? []).map((r) => (r as { id: string }).id)
  const subjectIds = [...systemIds, ...tagIds]

  let removed = 0
  const count = (n: number | null) => {
    removed += n ?? 0
  }

  if (subjectIds.length > 0) {
    const checks = await supabase
      .from('checklist_items')
      .delete({ count: 'exact' })
      .eq('project_id', projectId)
      .in('subject_id', subjectIds)
    count(checks.count)
  }

  const punch = await supabase
    .from('issues')
    .delete({ count: 'exact' })
    .eq('project_id', projectId)
    .like('ref', like)
  count(punch.count)

  if (tagIds.length > 0) {
    const tags = await supabase.from('equipment').delete({ count: 'exact' }).in('id', tagIds)
    count(tags.count)
  }
  if (systemIds.length > 0) {
    const sys = await supabase.from('systems').delete({ count: 'exact' }).in('id', systemIds)
    count(sys.count)
  }

  await recordAudit({
    projectId,
    action: 'removed the worked example from this project',
    entity: 'project',
    entityId: projectId,
    entityLabel: project.name,
    oldValue: `${removed} records`,
    comment: `Only rows prefixed ${EXAMPLE_MARK} were removed. Nothing else was touched.`,
  })

  revalidatePath('/', 'layout')
  redirect(`/setup?example=removed&n=${removed}`)
}
