// What the worked example was actually able to build, carried back to the
// page that shows it.
//
// The example runs as a server action and the Setup page is a fresh request,
// so the outcome has to survive one redirect. It is deliberately NOT stored
// in a table: it describes one press of one button, it is worthless an hour
// later, and a record of it would be a record of the tool rather than of the
// job. A short-lived cookie is the right size of memory for it.
//
// The counts on the report are the counts the inserts returned, not counts
// read back afterwards. A read-back would be prettier and would lie in one
// specific case: if a row is written and then blocked from being read, a
// read-back reports it missing and sends somebody looking for an insert bug
// that is not there.

import type { InsertOutcome } from '@/lib/pg-columns'

export const EXAMPLE_REPORT_COOKIE = 'cxa_example_report'

/** Long enough to read the page it lands on, short enough not to reappear tomorrow. */
export const EXAMPLE_REPORT_MAX_AGE = 900

const MAX_ERROR = 180
const MAX_BYTES = 3500

/**
 * The outcomes as a cookie value.
 *
 * Trimmed twice: every error message first, and then whole entries if the
 * result is still too big for a cookie. A cookie over about 4KB is dropped
 * by the browser without a word, so an untrimmed report would not arrive at
 * all — the failure mode being an empty panel where the diagnosis should be.
 */
export function encodeReport(outcomes: InsertOutcome[]): string {
  const trimmed = outcomes.map((o) => ({
    ...o,
    error: o.error ? o.error.slice(0, MAX_ERROR) : null,
  }))

  let list = trimmed
  let json = JSON.stringify(list)
  // Drop the successful entries first — a report that has to lose something
  // should lose the good news.
  while (json.length > MAX_BYTES && list.some((o) => !o.error && o.dropped.length === 0)) {
    const i = list.findIndex((o) => !o.error && o.dropped.length === 0)
    list = [...list.slice(0, i), ...list.slice(i + 1)]
    json = JSON.stringify(list)
  }
  while (json.length > MAX_BYTES && list.length > 1) {
    list = list.slice(0, -1)
    json = JSON.stringify(list)
  }
  return json
}

/** The cookie value back as outcomes, or an empty list if it is anything else. */
export function decodeReport(value: string | undefined | null): InsertOutcome[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (o): o is InsertOutcome =>
        !!o &&
        typeof o === 'object' &&
        typeof (o as InsertOutcome).table === 'string' &&
        typeof (o as InsertOutcome).wrote === 'number' &&
        typeof (o as InsertOutcome).of === 'number' &&
        Array.isArray((o as InsertOutcome).dropped)
    )
  } catch {
    return []
  }
}

export type ReportVerdict = {
  level: 'good' | 'partial' | 'bad'
  title: string
  detail: string
}

/**
 * The sentence at the top of the panel.
 *
 * "Built" and "did not build" are separated because a half-built example is
 * the dangerous case: every screen works, every number is wrong, and nothing
 * says so. That is precisely what happened the first time this was pressed —
 * seven tags became none and the rule page reported five findings out of
 * fourteen as though five were the answer.
 */
export function reportVerdict(outcomes: InsertOutcome[]): ReportVerdict {
  if (outcomes.length === 0) {
    return { level: 'good', title: 'Nothing to report', detail: 'No example has been built in this browser recently.' }
  }

  const failed = outcomes.filter((o) => o.error)
  const short = outcomes.filter((o) => !o.error && o.wrote < o.of)
  const dropped = [...new Set(outcomes.flatMap((o) => o.dropped))]

  if (failed.length > 0 || short.length > 0) {
    const names = [...failed, ...short].map((o) => o.table).join(', ')
    return {
      level: 'bad',
      title: 'The example is incomplete — do not read the findings as an answer',
      detail: `Part of it was refused by the database (${names}). Every rule that depends on those records will report nothing, and reporting nothing is not the same as finding nothing. The rows below say what happened; send them to whoever is building this.`,
    }
  }

  if (dropped.length > 0) {
    return {
      level: 'partial',
      title: 'Built, but this database is missing some columns',
      detail: `Everything was written. ${dropped.length === 1 ? 'One column' : `${dropped.length} columns`} the example wanted (${dropped.join(', ')}) ${dropped.length === 1 ? 'does' : 'do'} not exist here, so ${dropped.length === 1 ? 'that field is' : 'those fields are'} blank and any rule that reads ${dropped.length === 1 ? 'it' : 'them'} will stay quiet. Run the SQL step that adds ${dropped.length === 1 ? 'it' : 'them'}, delete the example and press the button again.`,
    }
  }

  const total = outcomes.reduce((n, o) => n + o.wrote, 0)
  return {
    level: 'good',
    title: 'Built in full',
    detail: `${total} records written and nothing refused. Every rule has something to find, so a rule that reports nothing is a rule that is not working.`,
  }
}
