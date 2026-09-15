// Writing a punch item to a database that may be one SQL step behind.
//
// ── The failure this exists to prevent ─────────────────────────────────
//
// Somebody is standing in front of an open panel. They photograph a defect,
// type what is wrong and what must be done, and press Raise. The application
// sends a row with `required_action` in it. If SQL part 42 has not been run,
// Postgres refuses the WHOLE ROW — not the one column it does not recognise,
// the row — and the defect is gone. The photograph with it. The person walks
// away believing it is recorded.
//
// That is not hypothetical: it is precisely what happened when `system_id`
// was added to the equipment import, and it cost seven tags out of seven.
//
// So a write asks for everything, and if the database says it has never heard
// of a column, drops that one and asks again — and SAYS which, so the screen
// can tell the person that the item was raised and the remedy they typed was
// not kept. Never silently.
//
// ── Why the database call is passed in ─────────────────────────────────
//
// Same reason as lib/pg-columns.ts, and it is not ceremony. The part that
// decides whether to give up, retry, or strip a field off somebody's data has
// to be exercised against every answer it can get — a missing column, a
// missing column we did not send, a constraint violation, a permission
// refusal, four unknown columns in a row — and it cannot be if the only way
// to reach it is a live Postgres. The Supabase calls live in
// data/punch-write.ts; the decisions live here.

export type WriteAttempt = { id: string | null; error: { message: string } | null }

export type WriteOutcome = {
  id: string | null
  /** Columns this database does not have. The values sent for them were not kept. */
  dropped: string[]
  /** Set only when nothing was written at all. */
  error: string | null
}

import { missingColumn } from '@/lib/pg-columns'

function without(row: Record<string, unknown>, column: string): Record<string, unknown> {
  const copy: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) if (k !== column) copy[k] = v
  return copy
}

/**
 * Write one row, dropping columns this database does not have.
 *
 * Stops at the first refusal that is NOT a missing column. Retrying those
 * would strip a field at random and loop against a database refusing for a
 * completely different reason — a not-null, a check constraint, a foreign
 * key, a permission — and the person would be told the wrong thing about
 * why their defect did not save.
 */
export async function writeWithFallback(
  row: Record<string, unknown>,
  run: (row: Record<string, unknown>) => Promise<WriteAttempt>,
  maxAttempts = 4
): Promise<WriteOutcome> {
  let current = row
  const dropped: string[] = []

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { id, error } = await run(current)
    if (!error) return { id, dropped, error: null }

    const column = missingColumn(error.message)
    if (!column || !Object.prototype.hasOwnProperty.call(current, column)) {
      return { id: null, dropped, error: error.message }
    }

    dropped.push(column)
    current = without(current, column)

    // Every column we sent is unknown. This is not a database that is one
    // step behind; it is a different database, and writing a row with no
    // fields into it would be worse than stopping.
    if (Object.keys(current).length === 0) {
      return { id: null, dropped, error: `No column of ${Object.keys(row).join(', ')} exists here.` }
    }
  }

  return { id: null, dropped, error: `Too many unknown columns (${dropped.join(', ')}).` }
}

/**
 * What to tell somebody whose remedy was not kept.
 *
 * Named columns, in words, with the file to run. "Some fields could not be
 * saved" sends somebody to the audit trail; this sends them to the Setup page.
 */
export function droppedNote(dropped: string[], sqlFile: string): string | null {
  if (dropped.length === 0) return null
  const names: Record<string, string> = {
    required_action: 'what must be done',
    action_set_by: 'who recorded that action',
    action_set_at: 'when they recorded it',
  }
  const said = dropped.map((c) => names[c] ?? c)
  return `The item was saved, but “${said.join('”, “')}” ${
    said.length === 1 ? 'was' : 'were'
  } not kept — this database does not have ${said.length === 1 ? 'that column' : 'those columns'} yet. Run ${sqlFile} on the Setup page and write it again.`
}
