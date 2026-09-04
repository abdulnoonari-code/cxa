import { supabase } from '@/lib/supabase'
import { SETUP_STEPS, readProbeError, type StepResult } from '@/lib/setup-checks'

/**
 * Ask the database what it has.
 *
 * One SELECT per step, every one limited to a single row, so this costs about
 * as much as opening any other screen. The columns are named explicitly
 * rather than using `*` on purpose: `*` succeeds on a table that is missing
 * every column this step was supposed to add, which would report a step as
 * done when nothing had been run.
 */
export async function runSetupProbes(): Promise<StepResult[]> {
  return Promise.all(
    SETUP_STEPS.map(async (step): Promise<StepResult> => {
      try {
        const { error } = await supabase.from(step.probe.table).select(step.probe.columns.join(', ')).limit(1)
        if (!error) return { step, state: 'in place', detail: null }
        const verdict = readProbeError(error.message, (error as { code?: string }).code ?? null)
        return {
          step,
          state: verdict,
          detail: error.message,
        }
      } catch (e) {
        return {
          step,
          state: 'unknown',
          detail: e instanceof Error ? e.message : 'The check could not be run.',
        }
      }
    })
  )
}
