import { supabase } from '@/lib/supabase'
import { loadSubjectIndex } from '@/data/subjects'
import { ancestorsOf, type Subject } from '@/lib/subjects'
import type { CoverageCheck, CoverageSubject } from '@/lib/coverage'

export type CoverageLoad = {
  subjects: CoverageSubject[]
  checks: CoverageCheck[]
  titleOf: (templateId: string) => string
}

/**
 * The project flattened into "which tag sits in which system".
 *
 * The system is found by walking UP from each tag rather than down from each
 * system, because a breaker can hang off a subsystem, or off a panel inside
 * one. Taking a tag's direct parent would put half a real substation's
 * equipment in no system at all — and a tag in no system is compared against
 * nothing and never reported, so the gaps would quietly disappear.
 */
/**
 * The checks, with the library link if the library is installed.
 *
 * `template_id` arrives with SQL part 30. Selecting a column that does not
 * exist fails the WHOLE query, so on a database without part 30 this would
 * have returned nothing — and the two rules that have no interest in the
 * library, the ones that find a tag left out of a level and a system with no
 * functional test, would have gone silent along with it.
 *
 * Silently reporting no gaps on a project full of them is the exact failure
 * these rules exist to prevent, so the query steps back to the columns that
 * have always existed rather than giving up.
 */
async function loadChecks(projectId: string): Promise<{
  subject_id: string | null
  level: string | null
  status: string | null
  template_id?: string | null
}[]> {
  const withLink = await supabase
    .from('checklist_items')
    .select('subject_id, level, status, template_id')
    .eq('project_id', projectId)
  if (!withLink.error) return (withLink.data ?? []) as never

  const plain = await supabase
    .from('checklist_items')
    .select('subject_id, level, status')
    .eq('project_id', projectId)
  return (plain.data ?? []) as never
}

export async function loadCoverage(projectId: string | null): Promise<CoverageLoad> {
  const empty: CoverageLoad = { subjects: [], checks: [], titleOf: () => '' }
  if (!projectId) return empty

  const [index, checkResult, tpl] = await Promise.all([
    loadSubjectIndex(projectId),
    loadChecks(projectId),
    supabase.from('check_templates').select('id, title').eq('project_id', projectId),
  ])
  const checkRows = checkResult

  const systemOf = (s: Subject): Subject | null => {
    for (const a of ancestorsOf(index, { type: s.type, id: s.id })) {
      if (a.type === 'system' || a.type === 'subsystem') return a
    }
    return null
  }

  const subjects: CoverageSubject[] = []
  for (const s of index.byKey.values()) {
    if (s.type === 'system' || s.type === 'subsystem') {
      subjects.push({ id: s.id, code: s.code ?? s.name ?? '—', kind: 'system', systemId: null, systemCode: null })
      continue
    }
    if (s.type !== 'equipment' && s.type !== 'component') continue
    const parent = systemOf(s)
    subjects.push({
      id: s.id,
      code: s.code ?? s.name ?? '—',
      kind: 'tag',
      systemId: parent?.id ?? null,
      systemCode: parent?.code ?? parent?.name ?? null,
    })
  }

  const checks: CoverageCheck[] = ((checkRows ?? []) as {
    subject_id: string | null
    level: string | null
    status: string | null
    template_id?: string | null
  }[]).map((r) => ({
    subjectId: r.subject_id,
    level: r.level,
    status: r.status,
    templateId: r.template_id ?? null,
  }))

  const titles = new Map(((tpl.data ?? []) as { id: string; title: string }[]).map((t) => [t.id, t.title]))

  return { subjects, checks, titleOf: (id) => titles.get(id) ?? 'a library check' }
}
