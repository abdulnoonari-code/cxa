// Where a check came from, and how to act on all of them at once.
//
// ── The gap this fills ───────────────────────────────────────────────────
//
// A check knows its source: the test script importer writes
// `SCRIPT:<sheet>:<serial>` into `source_ref`, and the Test Scripts screen
// reads it back to show each procedure in order. That much worked.
//
// Two things did not. The PLAIN checklist importer wrote no source at all,
// so a file of two hundred checks scattered under two hundred tags with
// nothing to say they arrived together — and nothing to gather them by if
// the file turned out to be the wrong revision. And nothing anywhere could
// delete a batch: the only choices were one tag's checklist, or the whole
// project behind a password.
//
// So somebody imports the wrong revision of a test sheet and the only way
// back is to delete every check on the project and start again.
//
// ── One convention, two kinds ────────────────────────────────────────────
//
//     SCRIPT:<sheet name>:<serial>     a line of a test procedure
//     FILE:<file name>:<row>           a check from a checklist file
//
// The middle part may itself contain colons — an EPC calls a sheet
// "SUDB: MV SWGR" often enough — so the name is everything BETWEEN the
// first and last colon, never `split(':')[1]`.
//
// This file is pure. It parses and groups; it does not know what a database
// is. That is what lets the delete be asserted without one.

export type CheckGroupKind = 'script' | 'file'

export type ParsedRef = {
  kind: CheckGroupKind
  /** The sheet or file this check came from. */
  name: string
  /** The serial or row within it. Kept as text: "1.2.a" is a serial. */
  line: string
}

const PREFIX: Record<CheckGroupKind, string> = { script: 'SCRIPT', file: 'FILE' }

/** Build the value stored in `checklist_items.source_ref`. */
export function makeRef(kind: CheckGroupKind, name: string, line: string | number): string {
  return `${PREFIX[kind]}:${String(name).trim()}:${String(line)}`
}

/**
 * Read a stored reference back.
 *
 * Anything that is not one of the two known shapes returns null, and a null
 * means "typed in by hand, not part of any import". That distinction is the
 * whole safety property of the delete: a check with no group is never in a
 * group, so it can never be swept up by deleting one.
 */
export function parseRef(sourceRef: string | null | undefined): ParsedRef | null {
  const raw = (sourceRef ?? '').trim()
  if (raw === '') return null

  const parts = raw.split(':')
  if (parts.length < 3) return null

  const head = parts[0].toUpperCase()
  const kind: CheckGroupKind | null = head === 'SCRIPT' ? 'script' : head === 'FILE' ? 'file' : null
  if (!kind) return null

  const name = parts.slice(1, -1).join(':').trim()
  const line = parts[parts.length - 1].trim()
  if (name === '') return null

  return { kind, name, line }
}

/**
 * The identity of a group, as one string safe to put in a form field.
 *
 * The name is percent-encoded, so a sheet called "A:B" and a sheet called
 * "A" containing a line "B" cannot produce the same key. A delete keyed on
 * an ambiguous string is a delete that one day removes the wrong two hundred
 * records.
 */
export function groupKey(kind: CheckGroupKind, name: string): string {
  return `${kind}:${encodeURIComponent(name.trim())}`
}

export function parseGroupKey(key: string | null | undefined): { kind: CheckGroupKind; name: string } | null {
  const raw = (key ?? '').trim()
  const at = raw.indexOf(':')
  if (at <= 0) return null

  const kind = raw.slice(0, at)
  if (kind !== 'script' && kind !== 'file') return null

  try {
    const name = decodeURIComponent(raw.slice(at + 1)).trim()
    return name === '' ? null : { kind, name }
  } catch {
    // A key somebody typed by hand with a stray % in it. No group is the
    // right answer; a crash on the checklist register is not.
    return null
  }
}

/** Does this check belong to that group? The only question the delete asks. */
export function inGroup(sourceRef: string | null | undefined, key: string): boolean {
  const g = parseGroupKey(key)
  if (!g) return false
  const r = parseRef(sourceRef)
  return r !== null && r.kind === g.kind && r.name === g.name
}

export type GroupedCheck = {
  id: string
  sourceRef: string | null
  status?: string | null
  level?: string | null
}

export type CheckGroup = {
  key: string
  kind: CheckGroupKind
  name: string
  /** Every check in it, in the order they were given. */
  ids: string[]
  total: number
  answered: number
  /** The levels present, in the order they first appear. */
  levels: string[]
}

const ANSWERED = new Set(['pass', 'fail', 'na'])

/**
 * Gather checks into the imports they arrived in.
 *
 * Checks with no parseable source are LEFT OUT — not collected into an
 * "Other" heading. A heading implies a file somebody could re-import, and a
 * pile of hand-typed checks is not that. The screen counts them separately
 * and says so in words.
 *
 * Groups come back in the order their first check appeared, which is the
 * order the caller asked the database for. Sorting here would quietly
 * override a deliberate `.order()` on the query.
 */
export function groupChecks(checks: GroupedCheck[]): CheckGroup[] {
  const out: CheckGroup[] = []
  const index = new Map<string, CheckGroup>()

  for (const c of checks) {
    const r = parseRef(c.sourceRef)
    if (!r) continue

    const key = groupKey(r.kind, r.name)
    let g = index.get(key)
    if (!g) {
      g = { key, kind: r.kind, name: r.name, ids: [], total: 0, answered: 0, levels: [] }
      index.set(key, g)
      out.push(g)
    }

    g.ids.push(c.id)
    g.total += 1
    if (ANSWERED.has((c.status ?? '').toLowerCase())) g.answered += 1
    if (c.level && !g.levels.includes(c.level)) g.levels.push(c.level)
  }

  return out
}

/** How many checks were typed in rather than imported. */
export function ungroupedCount(checks: GroupedCheck[]): number {
  return checks.filter((c) => parseRef(c.sourceRef) === null).length
}

/**
 * The ids a form actually asked to delete.
 *
 * A form posts whatever somebody's browser sent, so the ids are checked
 * against the checks this project really has rather than trusted. An id from
 * another project would otherwise be deleted by a request anybody could
 * make — the same shape of hole as the project cookie.
 */
export function pickedIds(posted: string[], allowed: Iterable<string>): string[] {
  const ok = new Set(allowed)
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of posted) {
    const v = (id ?? '').trim()
    if (v === '' || seen.has(v) || !ok.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

/** "Test Script" · script — what the heading and the confirmation both say. */
export function groupLabel(g: { kind: CheckGroupKind; name: string }): string {
  return g.kind === 'script' ? `test script “${g.name}”` : `checklist file “${g.name}”`
}
