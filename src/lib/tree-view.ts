// The asset tree as rows, grouped by Equipment, and filtered.
//
// Pure. No database, no React. The two things here are both easy to get
// subtly wrong and impossible to eyeball on a real register:
//
//   1. GROUPING TAGS UNDER THEIR EQUIPMENT. The tree stores tags directly
//      under a system or subsystem; the Equipment level lives beside them
//      on equipment_types, not above them in the parent chain. So the
//      level has to be inserted while the rows are built.
//
//   2. FILTERING A TREE. A leaf that matches is useless on its own — you
//      need the branch it hangs from, or the result is a flat list with
//      no idea where anything is. So a row is kept when it matches OR
//      when anything beneath it matches, and the ancestors come with it.
//
// Both are asserted in src/checks/tree-view.check.mts.

export type RowKind = 'site' | 'area' | 'system' | 'subsystem' | 'equipment' | 'tag' | 'component'

export type TreeRow = {
  /** Unique within one render. Synthetic for an Equipment grouping row. */
  key: string
  parentKey: string | null
  depth: number
  kind: RowKind
  /** What it is called. */
  label: string
  /** Its stable code, where it has one — the tag, the system code. */
  code: string | null
  /** Only a tag has one. Used by the status filter. */
  status: string | null
  /** The subject this row links to, or null for a grouping row. */
  subject: { type: string; id: string } | null
  /** How many tags sit at or beneath this row. */
  tagCount: number
}

export type Filters = {
  /** Free text across label and code. */
  q: string
  area: string
  system: string
  equipment: string
  status: string
}

export const NO_FILTERS: Filters = { q: '', area: '', system: '', equipment: '', status: '' }

export function anyFilter(f: Filters): boolean {
  return f.q !== '' || f.area !== '' || f.system !== '' || f.equipment !== '' || f.status !== ''
}

const lc = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/**
 * Does this row itself match?
 *
 * The dropdown filters — area, system, equipment, status — are answered
 * by the TAG rows only. A system row does not "match the system filter":
 * it is kept because its tags do, which is what keeps the branch and its
 * siblings honest. Without that, choosing a system would show every
 * system whose name happened to match and none of their contents.
 *
 * Free text is different and matches ANY row, because somebody typing
 * "chiller" may be looking for the system, the equipment kind or the tag
 * and should not have to say which.
 */
export function rowMatches(row: TreeRow, f: Filters, ancestry: TreeRow[]): boolean {
  if (f.q !== '') {
    const q = lc(f.q)
    const hit = lc(row.label).includes(q) || lc(row.code).includes(q)
    if (!hit) return false
  }

  // Everything below is answered by tags. A branch survives only because
  // a tag under it survived.
  if (f.area === '' && f.system === '' && f.equipment === '' && f.status === '') return true
  if (row.kind !== 'tag') return f.q !== '' ? true : false

  const inAncestry = (kind: RowKind, want: string) =>
    ancestry.some((a) => a.kind === kind && (lc(a.code) === lc(want) || lc(a.label) === lc(want)))

  if (f.area !== '' && !inAncestry('area', f.area)) return false
  if (f.system !== '' && !inAncestry('system', f.system)) return false
  if (f.equipment !== '' && !inAncestry('equipment', f.equipment)) return false
  if (f.status !== '' && lc(row.status) !== lc(f.status)) return false
  return true
}

/**
 * Keep the rows that match, and every ancestor of a row that matches.
 *
 * Rows arrive depth-first, so a parent is always seen before its
 * children. Matching is decided going down (an ancestry is needed), and
 * keeping is decided coming back up (a parent is kept once a descendant
 * is). Two passes, because one cannot do both.
 */
export function filterRows(rows: TreeRow[], f: Filters): TreeRow[] {
  if (!anyFilter(f)) return rows

  const byKey = new Map(rows.map((r) => [r.key, r]))
  const ancestryOf = (row: TreeRow): TreeRow[] => {
    const chain: TreeRow[] = []
    let cur = row.parentKey ? byKey.get(row.parentKey) : undefined
    const seen = new Set<string>()
    while (cur && !seen.has(cur.key)) {
      seen.add(cur.key)
      chain.push(cur)
      cur = cur.parentKey ? byKey.get(cur.parentKey) : undefined
    }
    return chain
  }

  const keep = new Set<string>()
  for (const row of rows) {
    if (!rowMatches(row, f, ancestryOf(row))) continue
    keep.add(row.key)
    for (const a of ancestryOf(row)) keep.add(a.key)
  }

  return rows.filter((r) => keep.has(r.key))
}

/** Recount tags after filtering, so a branch does not claim hidden ones. */
export function recount(rows: TreeRow[]): TreeRow[] {
  const byKey = new Map(rows.map((r) => [r.key, { ...r, tagCount: 0 }]))
  for (const row of rows) {
    if (row.kind !== 'tag') continue
    const cur = byKey.get(row.key)
    if (cur) cur.tagCount = 1
    let parentKey = row.parentKey
    const seen = new Set<string>()
    while (parentKey && !seen.has(parentKey)) {
      seen.add(parentKey)
      const p = byKey.get(parentKey)
      if (!p) break
      p.tagCount += 1
      parentKey = p.parentKey
    }
  }
  return rows.map((r) => byKey.get(r.key)!)
}

/** The distinct values a dropdown should offer, from the rows themselves. */
export function choicesFor(rows: TreeRow[], kind: RowKind): { value: string; label: string }[] {
  // Keyed by the lower-cased value to dedupe, but the VALUE KEPT IS THE
  // ORIGINAL. An earlier version returned the map key, so every dropdown
  // offered "r101" and "mv panel" — and the filter then compared a
  // lower-cased value against a real code, which happened to work only
  // because the comparison lower-cases both sides. It would have shown
  // the user mangled labels for no reason.
  const seen = new Map<string, { value: string; label: string }>()
  for (const r of rows) {
    if (r.kind !== kind) continue
    const value = r.code || r.label
    if (!value) continue
    if (!seen.has(lc(value))) seen.set(lc(value), { value, label: r.label || value })
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label))
}
