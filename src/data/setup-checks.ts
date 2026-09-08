import { supabase } from '@/lib/supabase'
import { SETUP_STEPS, readProbeError, isBucketProbe, type SetupStep, type StepResult } from '@/lib/setup-checks'

/**
 * Ask the database what it has.
 *
 * One SELECT per step, every one limited to a single row, so this costs about
 * as much as opening any other screen. The columns are named explicitly
 * rather than using `*` on purpose: `*` succeeds on a table that is missing
 * every column this step was supposed to add, which would report a step as
 * done when nothing had been run.
 */
async function probeColumns(step: SetupStep, table: string, columns: string[]): Promise<StepResult> {
  const { error } = await supabase.from(table).select(columns.join(', ')).limit(1)
  if (!error) return { step, state: 'in place', detail: null }
  return { step, state: readProbeError(error.message, (error as { code?: string }).code ?? null), detail: error.message }
}

/**
 * Ask storage whether the bucket is still open to the world.
 *
 * Step 38 adds no column, so there is nothing to SELECT. What it does is
 * flip one flag, and that flag is the difference between a client's site
 * photographs being private and being readable by anybody with the link.
 *
 * A public bucket is reported as MISSING rather than as some softer word,
 * because that is what it is: the step has not been done, and the
 * consequence is live. The wording is deliberately blunt — this is the one
 * line on the Setup page that somebody needs to act on the same day.
 */
async function probeBucket(step: SetupStep, bucket: string): Promise<StepResult> {
  const { data, error } = await supabase.storage.getBucket(bucket)

  if (error) {
    // "Bucket not found" means nothing has been uploaded yet, which is not
    // a fault and is not a security problem — there is nothing in there to
    // expose. Anything else and we genuinely do not know.
    if (/not found/i.test(error.message))
      return { step, state: 'in place', detail: 'No files have been uploaded yet, so there is no bucket to close.' }
    return { step, state: 'unknown', detail: error.message }
  }

  if (data?.public)
    return {
      step,
      state: 'missing',
      detail:
        'The documents bucket is PUBLIC. Every photograph and document in it can be opened by anybody holding the link, with no sign-in. Run this step today.',
    }

  return { step, state: 'in place', detail: null }
}

export async function runSetupProbes(): Promise<StepResult[]> {
  return Promise.all(
    SETUP_STEPS.map(async (step): Promise<StepResult> => {
      try {
        return isBucketProbe(step.probe)
          ? await probeBucket(step, step.probe.bucket)
          : await probeColumns(step, step.probe.table, step.probe.columns)
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
