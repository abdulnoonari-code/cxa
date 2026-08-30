// Data access for the subject spine.
//
// This is the first module of the data layer. Pages call functions here and
// never touch `supabase` themselves, so a schema change lands in one file
// instead of thirty-five, and the same query is not written out five times
// across five screens.

import { supabase } from '@/lib/supabase'
import { buildIndex, type Subject, type SubjectIndex, type SubjectRef } from '@/lib/subjects'

// The whole asset tree for one project, in five queries regardless of size.
// Bounded per project rather than paginated: a project's structure is
// hundreds of rows, not the hundreds of thousands that its records are.
export async function loadSubjectIndex(projectId: string | null): Promise<SubjectIndex> {
  if (!projectId) return buildIndex([], null)

  const [projectRes, siteRes, areaRes, systemRes, subsystemRes, equipmentRes] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', projectId).single(),
    supabase.from('sites').select('id, name, code').eq('project_id', projectId).order('name'),
    supabase.from('areas').select('id, name, code, site_id').eq('project_id', projectId).order('name'),
    supabase
      .from('systems')
      .select('id, name, system_id, area_id')
      .eq('project_id', projectId)
      .order('system_id'),
    supabase.from('subsystems').select('id, name, code, system_id').order('name'),
    supabase
      .from('equipment')
      .select('id, tag_id, description, system_id, subsystem_id')
      .eq('project_id', projectId)
      .order('tag_id'),
  ])

  const projectRow = projectRes.data as { id: string; name: string } | null
  const root: Subject | null = projectRow
    ? { type: 'project', id: projectRow.id, code: null, name: projectRow.name, parent: null }
    : null

  const subjects: Subject[] = []
  if (root) subjects.push(root)

  const projectRef: SubjectRef | null = root ? { type: 'project', id: root.id } : null

  for (const s of (siteRes.data ?? []) as { id: string; name: string; code: string | null }[]) {
    subjects.push({ type: 'site', id: s.id, code: s.code, name: s.name, parent: projectRef })
  }

  const siteIds = new Set((siteRes.data ?? []).map((s: { id: string }) => s.id))

  for (const a of (areaRes.data ?? []) as {
    id: string
    name: string
    code: string | null
    site_id: string | null
  }[]) {
    // An area may sit under a site, or straight under the project if the
    // project has no sites — which is how every existing project looks.
    const parent: SubjectRef | null =
      a.site_id && siteIds.has(a.site_id) ? { type: 'site', id: a.site_id } : projectRef
    subjects.push({ type: 'area', id: a.id, code: a.code, name: a.name, parent })
  }

  const areaIds = new Set((areaRes.data ?? []).map((a: { id: string }) => a.id))

  const systems = (systemRes.data ?? []) as {
    id: string
    name: string
    system_id: string
    area_id: string | null
  }[]
  const systemIds = new Set(systems.map((s) => s.id))

  for (const s of systems) {
    const parent: SubjectRef | null =
      s.area_id && areaIds.has(s.area_id) ? { type: 'area', id: s.area_id } : projectRef
    subjects.push({ type: 'system', id: s.id, code: s.system_id, name: s.name, parent })
  }

  // Subsystems are not scoped by project in the schema, so they are filtered
  // here against the systems this project actually owns.
  const subsystems = ((subsystemRes.data ?? []) as {
    id: string
    name: string
    code: string | null
    system_id: string
  }[]).filter((s) => systemIds.has(s.system_id))

  const subsystemIds = new Set(subsystems.map((s) => s.id))

  for (const s of subsystems) {
    subjects.push({
      type: 'subsystem',
      id: s.id,
      code: s.code,
      name: s.name,
      parent: { type: 'system', id: s.system_id },
    })
  }

  const equipment = (equipmentRes.data ?? []) as {
    id: string
    tag_id: string
    description: string | null
    system_id: string | null
    subsystem_id: string | null
  }[]

  for (const e of equipment) {
    // Prefer the subsystem when there is one, fall back to the system, then to
    // the project — so equipment that has never been assigned still appears in
    // the tree rather than vanishing.
    const parent: SubjectRef | null =
      e.subsystem_id && subsystemIds.has(e.subsystem_id)
        ? { type: 'subsystem', id: e.subsystem_id }
        : e.system_id && systemIds.has(e.system_id)
          ? { type: 'system', id: e.system_id }
          : projectRef
    subjects.push({
      type: 'equipment',
      id: e.id,
      code: e.tag_id,
      name: e.description ?? e.tag_id,
      parent,
    })
  }

  const equipmentIds = equipment.map((e) => e.id)

  if (equipmentIds.length > 0) {
    const { data: componentRows } = await supabase
      .from('components')
      .select('id, tag_id, description, equipment_id')
      .in('equipment_id', equipmentIds)
      .order('tag_id')

    for (const c of (componentRows ?? []) as {
      id: string
      tag_id: string
      description: string | null
      equipment_id: string
    }[]) {
      subjects.push({
        type: 'component',
        id: c.id,
        code: c.tag_id,
        name: c.description ?? c.tag_id,
        parent: { type: 'equipment', id: c.equipment_id },
      })
    }
  }

  return buildIndex(subjects, root)
}
