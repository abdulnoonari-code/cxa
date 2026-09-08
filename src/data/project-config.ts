import { supabase } from '@/lib/supabase'
import { selectWithFallback, missingColumn } from '@/lib/pg-columns'
import { parseConfig, serialiseConfig, DEFAULT_CONFIG, type ProjectConfig } from '@/lib/project-config'
import { LEVELS } from '@/lib/checklist'

export type ConfigLoad = {
  config: ProjectConfig
  /** True when `projects.config` does not exist on this database yet. */
  columnMissing: boolean
  error: string | null
}

/**
 * The project's configuration.
 *
 * `projects.config` arrives with SQL step 37. Until it is run, this returns
 * the default — EVERYTHING IN SCOPE — and says the column is missing, so
 * the screen can show the setting greyed out with a reason rather than
 * silently pretending a project has narrowed its scope when nobody has
 * chosen anything.
 *
 * Failing open matters more here than anywhere else in the application: a
 * missing column that read as "no levels in scope" would empty a
 * commissioning programme.
 */
export async function loadProjectConfig(projectId: string | null): Promise<ConfigLoad> {
  if (!projectId) return { config: { ...DEFAULT_CONFIG }, columnMissing: false, error: null }

  const res = await selectWithFallback<{ config?: unknown }>(['config'], async (cols) => {
    const r = await supabase.from('projects').select(cols.join(', ')).eq('id', projectId).limit(1)
    return { data: r.data as unknown as { config?: unknown }[] | null, error: r.error }
  })

  if (res.missing.includes('config'))
    return { config: { ...DEFAULT_CONFIG }, columnMissing: true, error: null }

  return {
    config: parseConfig(res.rows[0]?.config),
    columnMissing: false,
    error: res.error,
  }
}

export type SaveOutcome =
  | { state: 'saved'; config: ProjectConfig }
  | { state: 'no-column' }
  | { state: 'failed'; message: string }

/**
 * Write it back, and say what happened.
 *
 * A save that silently does nothing is the worst outcome available here:
 * somebody chooses three levels, presses the button, sees no error, and
 * carries on believing the job is configured. So a missing column is
 * reported as its own state and the screen says which SQL step to run.
 */
export async function saveProjectConfig(projectId: string, config: ProjectConfig): Promise<SaveOutcome> {
  const clean = serialiseConfig(config)
  const { error } = await supabase.from('projects').update({ config: clean }).eq('id', projectId)
  if (!error) return { state: 'saved', config: clean }
  if (missingColumn(error.message) === 'config') return { state: 'no-column' }
  return { state: 'failed', message: error.message }
}

/**
 * How many records sit at each level, for the out-of-scope warning.
 *
 * Punch items and tasks both carry a level. Checks do too, but they are
 * counted in the hundreds and this is a warning banner, not a report — the
 * two that a person creates by hand are the two worth counting, because
 * they are the ones somebody would notice going quiet.
 */
export async function recordsByLevel(projectId: string | null): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const l of LEVELS) counts[l.value] = 0
  if (!projectId) return counts

  const [issues, tasks] = await Promise.all([
    selectWithFallback<{ level?: string | null }>(['level'], async (cols) => {
      const r = await supabase.from('issues').select(cols.join(', ')).eq('project_id', projectId)
      return { data: r.data as unknown as { level?: string | null }[] | null, error: r.error }
    }),
    selectWithFallback<{ level?: string | null }>(['level'], async (cols) => {
      const r = await supabase.from('tasks').select(cols.join(', ')).eq('project_id', projectId)
      return { data: r.data as unknown as { level?: string | null }[] | null, error: r.error }
    }),
  ])

  for (const row of [...issues.rows, ...tasks.rows]) {
    const l = (row.level ?? '').trim()
    if (l && l in counts) counts[l] += 1
  }
  return counts
}
