'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { recordAudit, getActor } from '@/lib/audit'
import { PROJECT_COOKIE } from '@/lib/project'
import { insertWithFallback, type InsertOutcome } from '@/lib/pg-columns'
import { EXAMPLE_REPORT_COOKIE, EXAMPLE_REPORT_MAX_AGE, encodeReport } from '@/lib/example-report'
import { EXAMPLE_PROJECT, EXAMPLE_TAGS, EXAMPLE_TAGS_B, buildExampleChecks } from '@/lib/example-plan'

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
 * The project's rows, written through the shared fallback in lib/pg-columns.
 *
 * Chunked at 400 because a single insert of every checklist row is a request
 * big enough to be refused for its size, and a size refusal names no column,
 * so the fallback would report it as "the database refused it" and be right
 * but useless. Each chunk is a separate attempt at the same set of columns —
 * a column dropped for one chunk is dropped for the rest by re-running.
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

async function insertOne(
  table: string,
  row: Record<string, unknown>,
  outcomes: InsertOutcome[]
): Promise<string | null> {
  const written = await insertRows(table, [row], outcomes)
  return (written[0] as { id?: string } | undefined)?.id ?? null
}

/**
 * Build the worked example, in its own project.
 *
 * Its own project, always — never into whatever is open. Seed data mixed into
 * somebody's real records is not removable afterwards: every screen would show
 * a plausible mixture of what happened on site and what a computer invented,
 * and there would be no way to tell which was which. A separate project is
 * deleted whole, by the button that already exists.
 *
 * Everything here is written with the ordinary tables and the ordinary
 * columns. Nothing is special-cased, which is the point — if this runs, the
 * chain works. And when part of it does not run, the report says which part.
 */
export async function createWorkedExample() {
  const outcomes: InsertOutcome[] = []
  const store = await cookies()

  const stop = async (): Promise<never> => {
    store.set(EXAMPLE_REPORT_COOKIE, encodeReport(outcomes), {
      path: '/',
      maxAge: EXAMPLE_REPORT_MAX_AGE,
      sameSite: 'lax',
    })
    revalidatePath('/', 'layout')
    redirect('/setup?example=partial')
  }

  const projectId = await insertOne(
    'projects',
    {
      name: EXAMPLE_PROJECT.name,
      client: EXAMPLE_PROJECT.client,
      location: EXAMPLE_PROJECT.location,
      start_date: daysAgo(120),
      // FAULT: past its completion date, with defects still open.
      target_date: daysAgo(9),
    },
    outcomes
  )
  if (!projectId) await stop()

  // Opened now rather than at the end. If a later insert fails, the report
  // has to be readable with the example project open, otherwise the person is
  // told something is missing from a project they cannot see.
  store.set(PROJECT_COOKIE, projectId!, { path: '/', maxAge: 60 * 60 * 24 * 365 })

  // ── The asset tree ────────────────────────────────────────────────────
  const siteId = await insertOne('sites', { project_id: projectId, name: 'BKK1 substation', code: 'BKK1' }, outcomes)
  const areaId = await insertOne(
    'areas',
    { project_id: projectId, name: 'MV switchroom', code: 'MV-01', site_id: siteId },
    outcomes
  )

  const systems = await insertRows(
    'systems',
    [
      {
        project_id: projectId,
        system_id: 'SWGR-A1',
        name: '11kV switchboard A1',
        discipline: 'Electrical',
        boundary: 'Incomer, four breakers, bus tie, PQM',
        stage: 'functional_testing',
        area_id: areaId,
      },
      {
        project_id: projectId,
        system_id: 'SWGR-B1',
        name: '11kV switchboard B1',
        discipline: 'Electrical',
        stage: 'prefunctional',
        area_id: areaId,
      },
    ],
    outcomes
  )
  const byCode = new Map(
    systems.map((s) => [String((s as { system_id?: string }).system_id ?? ''), String((s as { id: string }).id)])
  )
  const systemA = byCode.get('SWGR-A1') ?? null
  const systemB = byCode.get('SWGR-B1') ?? null
  if (!systemA || !systemB) await stop()

  const tagRows = [
    ...EXAMPLE_TAGS.map((t) => ({ ...t, system: systemA })),
    ...EXAMPLE_TAGS_B.map((t) => ({ ...t, system: systemB })),
  ]
  const tags = await insertRows(
    'equipment',
    tagRows.map((t) => ({
      project_id: projectId,
      tag_id: t.tag,
      description: t.description,
      category: 'Switchgear',
      install_status: 'installed',
      system_id: t.system,
      location: 'MV switchroom',
    })),
    outcomes
  )
  const tagIds = new Map(
    tags.map((r) => [String((r as { tag_id?: string }).tag_id ?? ''), String((r as { id: string }).id)])
  )
  if (tagIds.size === 0) await stop()

  // ── The rows, decided in lib/example-plan.ts ─────────────────────────
  //
  // Built there and inserted here, so the promise on the screen — fourteen
  // faults, one per rule — can be fed straight into the rule functions by the
  // assertions. A claim like that is worth nothing unless something proves it.
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

  // ── Requirements, so a script link resolves ───────────────────────────
  await insertRows(
    'requirements',
    [
      {
        project_id: projectId,
        ref: 'REQ-014',
        title: 'Protection discrimination per the approved study',
        description: 'Breaker settings shall be loaded and verified against the approved discrimination study.',
      },
    ],
    outcomes
  )

  // ── Punch items ───────────────────────────────────────────────────────
  const actor = await getActor(projectId!)
  const who = actor.name || actor.email || 'Example'
  await insertRows(
    'issues',
    [
      {
        // FAULT: Category A, past its date, no photograph.
        project_id: projectId,
        ref: 'P-0001',
        subject_type: 'system',
        subject_id: systemA,
        title: 'Bus tie interlock does not hold with the Kirk key removed',
        description: 'CB Q1 closed onto a closed earthing switch during interlock testing. Witnessed by the client.',
        category: 'A',
        severity: 'critical',
        status: 'open',
        level: 'L4_fpt',
        due_date: daysAgo(6),
        raised_by: who,
      },
      {
        // FAULT: closed with no photograph at all.
        project_id: projectId,
        ref: 'P-0002',
        equipment_id: q1 ?? null,
        subject_type: 'equipment',
        subject_id: q1 ?? null,
        title: 'Two lugs in cubicle 3 have no second torque mark',
        description: 'Found during installation verification. Re-torqued and marked.',
        category: 'B',
        severity: 'minor',
        status: 'closed',
        level: 'L2_iv',
        closed_at: daysAgo(20),
        closed_by: who,
        raised_by: who,
      },
      {
        // FAULT: two words, uncategorised, and no date.
        project_id: projectId,
        ref: 'P-0003',
        equipment_id: tagIds.get('SUDB-A1-Q3') ?? null,
        subject_type: 'equipment',
        subject_id: tagIds.get('SUDB-A1-Q3') ?? null,
        title: 'Dust',
        status: 'open',
        level: 'L2_iv',
        raised_by: who,
      },
    ],
    outcomes
  )

  // ── Dates ─────────────────────────────────────────────────────────────
  await insertRows(
    'milestones',
    [
      {
        project_id: projectId,
        name: 'Energisation of switchboard A1',
        target_date: daysAgo(21),
        status: 'on_track',
        notes: 'Held by the bus tie interlock defect.',
      },
    ],
    outcomes
  )

  await insertRows(
    'obligations',
    [
      {
        project_id: projectId,
        ref: 'OBL-0001',
        statement: 'The contractor shall submit as-built drawings within 14 days of energisation.',
        party: 'contractor',
        status: 'submitted',
        due_date: daysAgo(11),
      },
    ],
    outcomes
  )

  const wrote = outcomes.reduce((n, o) => n + o.wrote, 0)
  const trouble = outcomes.filter((o) => o.error || o.dropped.length > 0)

  await recordAudit({
    projectId: projectId!,
    action: 'created the worked example project',
    entity: 'project',
    entityId: projectId!,
    entityLabel: EXAMPLE_PROJECT.name,
    newValue: `${wrote} records written${trouble.length > 0 ? `, ${trouble.length} table(s) with trouble` : ''}`,
    comment:
      'Built to fail in fourteen specific ways, one for each rule, so that Rule Checks shows what every finding looks like on real records. Delete the whole project when you are done.',
  })

  store.set(EXAMPLE_REPORT_COOKIE, encodeReport(outcomes), {
    path: '/',
    maxAge: EXAMPLE_REPORT_MAX_AGE,
    sameSite: 'lax',
  })

  revalidatePath('/', 'layout')

  // Straight to the findings when it built cleanly; back to the report when it
  // did not, because findings from a half-built example are worse than none.
  redirect(trouble.length > 0 ? '/setup?example=partial' : '/rules?example=created')
}
