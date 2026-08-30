import { supabase } from '@/lib/supabase'
import { computeReadiness, type Readiness } from '@/lib/readiness'

export type SystemRow = {
  id: string
  system_id: string
  name: string
  discipline: string | null
  description: string | null
  boundary: string | null
  responsible: string | null
  stage: string | null
}

export type EquipmentRow = {
  id: string
  tag_id: string
  description: string | null
  system_id: string | null
  install_status: string | null
}

export type SystemWithReadiness = SystemRow & {
  equipment: EquipmentRow[]
  readiness: Readiness
  checkCount: number
  testCount: number
  openIssueCount: number
}

export type ProjectReadiness = {
  systems: SystemWithReadiness[]
  unassigned: EquipmentRow[]
  unassignedReadiness: Readiness
  overall: Readiness
  equipmentReadiness: Map<string, Readiness>
}

// Loads a project's whole commissioning picture in a fixed number of queries,
// then computes readiness in memory. Readiness is never stored, so it cannot
// go stale against the records it summarises.
export async function loadProjectReadiness(projectId: string | null): Promise<ProjectReadiness> {
  const empty = computeReadiness([], [], [])

  if (!projectId) {
    return {
      systems: [],
      unassigned: [],
      unassignedReadiness: empty,
      overall: empty,
      equipmentReadiness: new Map(),
    }
  }

  const { data: systemRows } = await supabase
    .from('systems')
    .select('id, system_id, name, discipline, description, boundary, responsible, stage')
    .eq('project_id', projectId)
    .order('system_id')

  const systems = (systemRows ?? []) as SystemRow[]

  const { data: equipmentRows } = await supabase
    .from('equipment')
    .select('id, tag_id, description, system_id, install_status')
    .eq('project_id', projectId)
    .order('tag_id')

  const equipment = (equipmentRows ?? []) as EquipmentRow[]
  const equipmentIds = equipment.map((e) => e.id)

  const { data: checkRows } =
    equipmentIds.length > 0
      ? await supabase
          .from('checklist_items')
          .select('id, status, review_state, equipment_id')
          .in('equipment_id', equipmentIds)
      : { data: [] as { id: string; status: string; review_state: string | null; equipment_id: string }[] }

  const checks = checkRows ?? []

  const { data: testRows } =
    equipmentIds.length > 0
      ? await supabase
          .from('test_records')
          .select('id, name, result, approval_state, instrument_id, equipment_id')
          .in('equipment_id', equipmentIds)
      : { data: [] as { id: string; name: string; result: string; approval_state: string | null; instrument_id: string | null; equipment_id: string }[] }

  const tests = testRows ?? []

  const { data: instrumentRows } = await supabase
    .from('instruments')
    .select('id, calibration_expiry')
    .eq('project_id', projectId)

  const expiryById = new Map((instrumentRows ?? []).map((i) => [i.id, i.calibration_expiry as string | null]))

  const { data: issueRows } =
    equipmentIds.length > 0
      ? await supabase
          .from('issues')
          .select('id, title, category, severity, status, equipment_id')
          .in('equipment_id', equipmentIds)
      : { data: [] as { id: string; title: string; category: string | null; severity: string; status: string; equipment_id: string }[] }

  const issues = issueRows ?? []

  const testsShaped = tests.map((t) => ({
    ...t,
    has_instrument: Boolean(t.instrument_id),
    instrument_expiry: t.instrument_id ? expiryById.get(t.instrument_id) ?? null : null,
  }))

  const readinessFor = (ids: string[]) =>
    computeReadiness(
      checks.filter((c) => ids.includes(c.equipment_id)),
      testsShaped.filter((t) => ids.includes(t.equipment_id)),
      issues.filter((i) => ids.includes(i.equipment_id))
    )

  const withReadiness: SystemWithReadiness[] = systems.map((s) => {
    const own = equipment.filter((e) => e.system_id === s.id)
    const ids = own.map((e) => e.id)
    return {
      ...s,
      equipment: own,
      readiness: readinessFor(ids),
      checkCount: checks.filter((c) => ids.includes(c.equipment_id)).length,
      testCount: testsShaped.filter((t) => ids.includes(t.equipment_id)).length,
      openIssueCount: issues.filter(
        (i) => ids.includes(i.equipment_id) && i.status !== 'closed' && i.status !== 'verified'
      ).length,
    }
  })

  const unassigned = equipment.filter((e) => !e.system_id)

  const equipmentReadiness = new Map<string, Readiness>()
  for (const e of equipment) {
    equipmentReadiness.set(e.id, readinessFor([e.id]))
  }

  return {
    systems: withReadiness,
    unassigned,
    unassignedReadiness: readinessFor(unassigned.map((e) => e.id)),
    overall: readinessFor(equipmentIds),
    equipmentReadiness,
  }
}
