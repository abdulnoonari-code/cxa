import { supabase } from '@/lib/supabase'
import { loadIssuePhotos } from '@/data/photos'
import type {
  CheckInput,
  MilestoneInput,
  ObligationInput,
  ProjectInput,
  PunchInput,
  TaskInput,
} from '@/lib/site-rules'

export type RuleInputs = {
  punch: PunchInput[]
  checks: CheckInput[]
  milestones: MilestoneInput[]
  tasks: TaskInput[]
  obligations: ObligationInput[]
  project: ProjectInput | null
  /** False when SQL part 21 has not been run, so photo counts are unknown. */
  photosReady: boolean
}

const EMPTY: RuleInputs = {
  punch: [],
  checks: [],
  milestones: [],
  tasks: [],
  obligations: [],
  project: null,
  photosReady: true,
}

/**
 * Everything the free rules read, in one pass.
 *
 * Six small queries rather than one clever join, because each of these is a
 * few columns over a few thousand rows and Postgres does not care, while a
 * join across six registers is the kind of query that works fine until the
 * day somebody has forty thousand punch items.
 *
 * Nothing is computed here. This loads; `site-rules.ts` decides.
 */
export async function loadRuleInputs(
  projectId: string | null,
  project: { name: string | null; target_date: string | null } | null
): Promise<RuleInputs> {
  if (!projectId) return EMPTY

  const [issues, checks, milestones, tasks, obligations, photos] = await Promise.all([
    supabase
      .from('issues')
      .select('id, ref, title, description, category, status, level, due_date, closed_at, closed_by, created_at')
      .eq('project_id', projectId),
    supabase.from('checklist_items').select('level, status').eq('project_id', projectId),
    supabase.from('milestones').select('name, target_date, status').eq('project_id', projectId),
    supabase.from('tasks').select('title, assignee, due_date, status').eq('project_id', projectId),
    supabase.from('obligations').select('ref, statement, due_date, status').eq('project_id', projectId),
    loadIssuePhotos(projectId),
  ])

  const punch: PunchInput[] = ((issues.data ?? []) as Omit<PunchInput, 'photos' | 'fixPhotos'>[]).map((i) => {
    const list = photos.byIssue.get(i.id) ?? []
    return {
      ...i,
      photos: list.length,
      fixPhotos: list.filter((p) => p.kind === 'fix').length,
    }
  })

  return {
    punch,
    checks: (checks.data ?? []) as CheckInput[],
    milestones: (milestones.data ?? []) as MilestoneInput[],
    tasks: (tasks.data ?? []) as TaskInput[],
    obligations: (obligations.data ?? []) as ObligationInput[],
    project: project as ProjectInput | null,
    photosReady: photos.schemaReady,
  }
}
