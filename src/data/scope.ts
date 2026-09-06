import { supabase } from '@/lib/supabase'
import { loadSubjectIndex } from '@/data/subjects'
import { descendantsOf, refKey, type SubjectType } from '@/lib/subjects'
import { systemPicture, splitIssues, type ScopedCheck, type ScopedIssue, type SystemView } from '@/lib/scope'

const COLUMNS = 'id, item, level, status, subject_type, subject_id'

/** Every check on the project, in the shape the scope rules read. */
export async function loadScopedChecks(projectId: string | null): Promise<{
  checks: ScopedCheck[]
  codeOf: (id: string | null) => string
}> {
  if (!projectId) return { checks: [], codeOf: () => '—' }

  const [{ data }, index] = await Promise.all([
    supabase.from('checklist_items').select(COLUMNS).eq('project_id', projectId),
    loadSubjectIndex(projectId),
  ])

  const typed = (data ?? []) as {
    id: string
    item: string | null
    level: string | null
    status: string | null
    subject_type: string | null
    subject_id: string | null
  }[]

  const typeById = new Map(typed.map((r) => [r.subject_id ?? '', r.subject_type ?? '']))
  const codeOf = (id: string | null): string => {
    if (!id) return 'Unassigned'
    const type = typeById.get(id)
    if (!type) return 'Unassigned'
    const s = index.byKey.get(refKey({ type, id }))
    return s?.code ?? s?.name ?? 'Unassigned'
  }

  return {
    checks: typed.map((r) => ({
      id: r.id,
      item: r.item,
      level: r.level,
      status: r.status,
      subjectType: r.subject_type,
      subjectId: r.subject_id,
    })),
    codeOf,
  }
}

/**
 * One system, with its equipment's work and its own kept apart.
 *
 * The tags are every equipment and component BELOW the system in the tree,
 * not just its direct children. A switchboard whose breakers hang off a
 * subsystem would otherwise show as having no devices at all — the commonest
 * shape on a real substation, and the one that would make this screen lie.
 */
export async function loadSystemView(
  projectId: string | null,
  system: { type: SubjectType; id: string }
): Promise<SystemView | null> {
  if (!projectId) return null

  const index = await loadSubjectIndex(projectId)
  const tags = descendantsOf(index, system)
    .filter((s) => s.type === 'equipment' || s.type === 'component')
    .map((s) => ({ id: s.id, code: s.code ?? s.name ?? '—' }))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))

  const ids = [system.id, ...tags.map((t) => t.id)]

  const [{ data: checkRows }, { data: issueRows }] = await Promise.all([
    supabase.from('checklist_items').select(COLUMNS).eq('project_id', projectId).in('subject_id', ids),
    supabase
      .from('issues')
      .select('id, ref, title, status, category, subject_id')
      .eq('project_id', projectId)
      .in('subject_id', ids),
  ])

  const checks: ScopedCheck[] = ((checkRows ?? []) as {
    id: string
    item: string | null
    level: string | null
    status: string | null
    subject_type: string | null
    subject_id: string | null
  }[]).map((r) => ({
    id: r.id,
    item: r.item,
    level: r.level,
    status: r.status,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
  }))

  const issues: ScopedIssue[] = ((issueRows ?? []) as {
    id: string
    ref: string | null
    title: string | null
    status: string | null
    category: string | null
    subject_id: string | null
  }[]).map((r) => ({
    id: r.id,
    ref: r.ref,
    title: r.title,
    status: r.status,
    category: r.category,
    subjectId: r.subject_id,
  }))
  const split = splitIssues(issues, system.id, tags.map((t) => t.id))

  const byId = new Map(tags.map((t) => [t.id, t.code]))
  const systemCode = index.byKey.get(refKey(system))?.code ?? 'this system'

  return {
    picture: systemPicture(system.id, tags, checks),
    own: split.own,
    fromTags: split.fromTags,
    codeOf: (id) => (id === system.id ? systemCode : (byId.get(id ?? '') ?? '—')),
  }
}
