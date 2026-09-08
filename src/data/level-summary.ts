import { supabase } from '@/lib/supabase'
import { buildLevelSummary, type LevelSummary, type TaskLike, type IssueLike } from '@/lib/level-summary'
import { selectWithFallback } from '@/lib/pg-columns'

export type LevelSummaryLoad = {
  summary: LevelSummary
  /** Columns this database has not got yet. Shown, never swallowed. */
  missing: string[]
  /** Set only when a query failed outright. */
  error: string | null
}

/**
 * Tasks and punch items for a project, bucketed by commissioning level.
 *
 * Two queries, both through `selectWithFallback`, because `tasks.level` is
 * new. Asking for a column the database has not got does not return it as
 * null — it fails the whole query, so without this the Level Summary would
 * be a blank screen on every database where the SQL step has not been run,
 * and nothing on the page would say why. This is the bug that has bitten
 * this application more than any other.
 */
export async function loadLevelSummary(projectId: string | null, today: string): Promise<LevelSummaryLoad> {
  if (!projectId)
    return { summary: buildLevelSummary([], [], today), missing: [], error: null }

  const [taskRes, issueRes] = await Promise.all([
    selectWithFallback<TaskLike>(['level', 'status', 'due_date'], async (cols) => {
      const r = await supabase.from('tasks').select(cols.join(', ')).eq('project_id', projectId)
      return { data: r.data as unknown as TaskLike[] | null, error: r.error }
    }),
    selectWithFallback<IssueLike>(['level', 'status', 'severity', 'due_date'], async (cols) => {
      const r = await supabase.from('issues').select(cols.join(', ')).eq('project_id', projectId)
      return { data: r.data as unknown as IssueLike[] | null, error: r.error }
    }),
  ])

  // A row that came back without a `level` column has no level, which is
  // exactly what the summary already knows how to say — it lands in the
  // "No level recorded" row and the banner above says the column is
  // missing. That is honest in a way that hiding the row would not be.
  const tasks = taskRes.rows.map((t) => ({ level: t.level ?? null, status: t.status ?? null, due_date: t.due_date ?? null }))
  const issues = issueRes.rows.map((i) => ({
    level: i.level ?? null,
    status: i.status ?? null,
    severity: i.severity ?? null,
    due_date: i.due_date ?? null,
  }))

  return {
    summary: buildLevelSummary(tasks, issues, today),
    missing: Array.from(new Set([...taskRes.missing, ...issueRes.missing])),
    error: taskRes.error ?? issueRes.error,
  }
}
