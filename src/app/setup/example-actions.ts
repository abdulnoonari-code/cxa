'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { recordAudit, getActor } from '@/lib/audit'
import { PROJECT_COOKIE } from '@/lib/project'
import { EXAMPLE_PROJECT, EXAMPLE_TAGS, EXAMPLE_TAGS_B, buildExampleChecks } from '@/lib/example-plan'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

async function insertOne<T extends Record<string, unknown>>(table: string, row: T): Promise<string | null> {
  const { data } = await supabase.from(table).insert(row).select('id').single()
  return (data as { id: string } | null)?.id ?? null
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
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
 * chain works.
 */
export async function createWorkedExample() {
  const projectId = await insertOne('projects', {
    name: EXAMPLE_PROJECT.name,
    client: EXAMPLE_PROJECT.client,
    location: EXAMPLE_PROJECT.location,
    start_date: daysAgo(120),
    // FAULT: past its completion date, with defects still open.
    target_date: daysAgo(9),
  })
  if (!projectId) redirect('/setup?example=failed')

  // ── The asset tree ────────────────────────────────────────────────────
  const siteId = await insertOne('sites', { project_id: projectId, name: 'BKK1 substation', code: 'BKK1' })
  const areaId = await insertOne('areas', { project_id: projectId, name: 'MV switchroom', code: 'MV-01', site_id: siteId })

  const systemA = await insertOne('systems', {
    project_id: projectId,
    system_id: 'SWGR-A1',
    name: '11kV switchboard A1',
    discipline: 'Electrical',
    boundary: 'Incomer, four breakers, bus tie, PQM',
    stage: 'functional_testing',
  })
  const systemB = await insertOne('systems', {
    project_id: projectId,
    system_id: 'SWGR-B1',
    name: '11kV switchboard B1',
    discipline: 'Electrical',
    stage: 'prefunctional',
  })
  if (!systemA || !systemB) redirect('/setup?example=failed')

  await supabase.from('systems').update({ area_id: areaId }).in('id', [systemA, systemB])

  const tagIds = new Map<string, string>()
  for (const [list, systemId] of [
    [EXAMPLE_TAGS, systemA],
    [EXAMPLE_TAGS_B, systemB],
  ] as const) {
    for (const t of list) {
      const id = await insertOne('equipment', {
        project_id: projectId,
        tag_id: t.tag,
        description: t.description,
        category: 'Switchgear',
        install_status: 'installed',
        system_id: systemId,
        location: 'MV switchroom',
      })
      if (id) tagIds.set(t.tag, id)
    }
  }

  // ── The rows, decided in lib/example-plan.ts ─────────────────────────
  //
  // Built there and inserted here, so the promise on the screen — fourteen
  // faults, one per rule — can be fed straight into the rule functions by the
  // assertions. A claim like that is worth nothing unless something proves it.
  const q1 = tagIds.get('SUDB-A1-Q1')
  const checks = buildExampleChecks((tag) => tagIds.get(tag), systemA).map((r) => ({
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

  for (const part of chunk(checks, 400)) {
    const { error } = await supabase.from('checklist_items').insert(part)
    if (error) {
      // The script columns arrive with parts 28 and 29. Without them the
      // insert fails whole, so the example falls back to the columns every
      // database has — a smaller example is worth more than none.
      const SCRIPT_ONLY = [
        'section_path',
        'answer_type',
        'serial_no',
        'source_line',
        'source_ref',
        'evidence_ref',
        'links_to',
      ]
      const plain = part.map((r) =>
        Object.fromEntries(Object.entries(r as Record<string, unknown>).filter(([k]) => !SCRIPT_ONLY.includes(k)))
      )
      await supabase.from('checklist_items').insert(plain)
    }
  }

  // ── Requirements, so a script link resolves ───────────────────────────
  await supabase.from('requirements').insert({
    project_id: projectId,
    ref: 'REQ-014',
    title: 'Protection discrimination per the approved study',
    description: 'Breaker settings shall be loaded and verified against the approved discrimination study.',
  })

  // ── Punch items ───────────────────────────────────────────────────────
  const actor = await getActor(projectId)
  await supabase.from('issues').insert([
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
      raised_by: actor.name || actor.email || 'Example',
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
      closed_by: actor.name || actor.email || 'Example',
      raised_by: actor.name || actor.email || 'Example',
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
      raised_by: actor.name || actor.email || 'Example',
    },
  ])

  // ── Dates ─────────────────────────────────────────────────────────────
  await supabase.from('milestones').insert({
    project_id: projectId,
    name: 'Energisation of switchboard A1',
    target_date: daysAgo(21),
    status: 'on_track',
    notes: 'Held by the bus tie interlock defect.',
  })

  await supabase.from('obligations').insert({
    project_id: projectId,
    ref: 'OBL-0001',
    statement: 'The contractor shall submit as-built drawings within 14 days of energisation.',
    party: 'contractor',
    status: 'submitted',
    due_date: daysAgo(11),
  })

  await recordAudit({
    projectId,
    action: 'created the worked example project',
    entity: 'project',
    entityId: projectId,
    entityLabel: EXAMPLE_PROJECT.name,
    newValue: `${checks.length} checks, 3 punch items, 2 systems, 7 tags`,
    comment:
      'Built to fail in fourteen specific ways, one for each rule, so that Rule Checks shows what every finding looks like on real records. Delete the whole project when you are done.',
  })

  // Open it, because that is what somebody wants after pressing the button.
  const store = await cookies()
  store.set(PROJECT_COOKIE, projectId, { path: '/', maxAge: 60 * 60 * 24 * 365 })

  revalidatePath('/', 'layout')
  redirect('/rules?example=created')
}
