import { supabase } from '@/lib/supabase'
import { loadSubjectIndex } from '@/data/subjects'
import { buildHierarchy, type HierarchyNode, type HierarchyCheck, type HierarchyIssue } from '@/lib/hierarchy'

/**
 * The whole project's tree and every check and defect on it, in three queries.
 *
 * Three, not three-per-system. The per-system loader already in data/scope.ts
 * is right for one screen about one system; used here it would be a query for
 * every branch on the tree, and the dashboard is the screen everybody opens
 * first every morning.
 */
export async function loadHierarchy(projectId: string | null): Promise<HierarchyNode[]> {
  if (!projectId) return []

  const [index, checks, issues] = await Promise.all([
    loadSubjectIndex(projectId),
    supabase.from('checklist_items').select('subject_id, level, status').eq('project_id', projectId),
    supabase.from('issues').select('subject_id, category, status').eq('project_id', projectId),
  ])

  const c: HierarchyCheck[] = ((checks.data ?? []) as {
    subject_id: string | null
    level: string | null
    status: string | null
  }[]).map((r) => ({ subjectId: r.subject_id, level: r.level, status: r.status }))

  const i: HierarchyIssue[] = ((issues.data ?? []) as {
    subject_id: string | null
    category: string | null
    status: string | null
  }[]).map((r) => ({ subjectId: r.subject_id, category: r.category, status: r.status }))

  return buildHierarchy(index, c, i)
}
