// Reading a "that column does not exist" error well enough to carry on.
//
// ── Why this exists ──────────────────────────────────────────────────────
//
// The worked example was pressed for the first time on a real database and
// built a quarter of itself. Seven equipment tags became none, three punch
// items became none, and the page it landed on cheerfully reported five
// findings out of fourteen as though that were the answer. Nothing was
// wrong with the rules. Two inserts had been refused by the database and
// the code had not looked at the reply.
//
// A row is refused whole. One column the database has never heard of and
// the other twenty are thrown away with it — so a single spare column in a
// row of twenty is the difference between seven tags and none, and there is
// nothing on any screen afterwards to say so.
//
// Postgres, and PostgREST in front of it, both name the offending column in
// the error. That is enough to drop it and try again, and to say afterwards
// exactly what was dropped. Which is better than the two alternatives:
// writing the smallest row that every database is sure to accept (the
// example loses the columns that make it worth having) or failing whole
// (the person gets nothing and no idea why).
//
// ── What this is NOT ─────────────────────────────────────────────────────
//
// It is not a schema migration and it must never become one. It drops a
// column from ONE insert and reports it. The missing column is still
// missing, the SQL step that adds it still has to be run, and the report on
// the Setup page says so. Silently working around a missing column forever
// is how a project ends up with two half-schemas and no way to tell which
// one any given row came from.

/**
 * The column named in a "no such column" error, or null if that is not what
 * this error is.
 *
 * Both wordings are covered on purpose. PostgREST answers from a cached
 * picture of the schema and phrases it one way (PGRST204); Postgres itself,
 * reached when the cache is stale or bypassed, phrases it another (42703).
 * Matching only one of them would work on most days and fail on the day
 * somebody had just run a migration — which is exactly the day this runs.
 */
export function missingColumn(message: string | null | undefined): string | null {
  const m = message ?? ''

  // PostgREST: Could not find the 'system_id' column of 'equipment' in the schema cache
  const prest = m.match(/could not find the '([^']+)' column/i)
  if (prest) return prest[1]

  // Postgres 42703: column "system_id" of relation "equipment" does not exist
  const pg = m.match(/column "([^"]+)"(?: of relation "[^"]+")? does not exist/i)
  if (pg) return pg[1]

  // Postgres 42703, the other phrasing used when the column is in a RETURNING
  // or a filter rather than in the row: column equipment.system_id does not exist
  const dotted = m.match(/column [a-z_][a-z0-9_]*\.([a-z_][a-z0-9_]*) does not exist/i)
  if (dotted) return dotted[1]

  return null
}

/** The rows again, without one column. */
export function withoutColumn<T extends Record<string, unknown>>(rows: T[], column: string): Record<string, unknown>[] {
  return rows.map((r) => {
    const copy: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) if (k !== column) copy[k] = v
    return copy
  })
}

/** What one attempt at writing rows came back with. */
export type InsertAttempt = {
  data: Record<string, unknown>[] | null
  error: { message: string } | null
}

export type InsertOutcome = {
  table: string
  wrote: number
  of: number
  /** Columns this database does not have, dropped so the rest could be written. */
  dropped: string[]
  /** Set only when the rows could not be written at all. */
  error: string | null
}

/**
 * One sentence describing what happened, in words rather than error text.
 *
 * The database's own message is kept for the failure case and only for the
 * failure case — it is the single most useful thing on the screen when
 * something is wrong, and noise on every other line.
 */
export function outcomeSentence(o: InsertOutcome): string {
  if (o.error) return `Nothing written. The database refused it: ${o.error}`
  if (o.wrote === 0 && o.of === 0) return 'Nothing to write.'
  const head = o.wrote === o.of ? `${o.wrote} written.` : `${o.wrote} of ${o.of} written.`
  if (o.dropped.length === 0) return head
  return `${head} Written without ${o.dropped.join(', ')} — this database does not have ${
    o.dropped.length === 1 ? 'that column' : 'those columns'
  } yet, so ${o.dropped.length === 1 ? 'it is' : 'they are'} blank. Run the SQL step that adds ${
    o.dropped.length === 1 ? 'it' : 'them'
  } and press the button again.`
}

/**
 * Write rows, dropping any column this database does not have, and record
 * what happened either way.
 *
 * The database call is passed in rather than imported so that this — the part
 * that decides whether to give up, retry, or strip a field off somebody's
 * data — can be tested without a database. The first version of the worked
 * example did not check a single insert result, and the cost of that was a
 * project that looked built and was a quarter built. Logic that decides
 * whether to keep going has to be exercised against every answer it can get,
 * and it cannot be if the only way to reach it is a live Postgres.
 *
 * Five attempts. Five unknown columns in one row means the schema is a
 * different schema, and quietly writing a stripped-down row into it would be
 * worse than stopping and saying so.
 */
export async function insertWithFallback(
  table: string,
  rows: Record<string, unknown>[],
  run: (rows: Record<string, unknown>[]) => Promise<InsertAttempt>,
  outcomes: InsertOutcome[],
  maxAttempts = 5
): Promise<Record<string, unknown>[]> {
  const outcome: InsertOutcome = { table, wrote: 0, of: rows.length, dropped: [], error: null }
  outcomes.push(outcome)
  if (rows.length === 0) return []

  let current = rows

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await run(current)

    if (!error) {
      const written = data ?? []
      outcome.wrote = written.length
      return written
    }

    const column = missingColumn(error.message)

    // Not a missing column, or a column that is not in these rows. Retrying
    // would strip a field at random and loop against a database that is
    // refusing for some other reason entirely — a foreign key, a not-null,
    // a permission. Report the database's own words instead.
    if (!column || !Object.prototype.hasOwnProperty.call(current[0], column)) {
      outcome.error = error.message
      outcome.wrote = 0
      return []
    }

    outcome.dropped.push(column)
    current = withoutColumn(current, column)
  }

  outcome.error = `Too many unknown columns (${outcome.dropped.join(', ')}). This database is not the shape this example expects.`
  outcome.wrote = 0
  outcome.dropped = []
  return []
}
