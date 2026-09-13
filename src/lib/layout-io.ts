// A layout on its way in and out of the database.
//
// ── Why this is not inside the route handler ─────────────────────────────
//
// Because it is the part that can be wrong. A route handler is reachable
// directly, so "the browser would never send that" is not a check — every
// field has to be validated on arrival. And a layout that goes out and comes
// back slightly different is the worst kind of bug: nothing errors, the
// drawing just quietly stops matching the one that was signed.
//
// So the shaping and the validation live here, pure, and the round trip is
// asserted against a real drawing rather than hoped for.
//
// ── THE FIELD THAT MATTERS MOST ──────────────────────────────────────────
//
// `lengthM: null` means "measure it off the drawing". A number means somebody
// typed it, and the schedule prints it as typed rather than as measured. A
// null that becomes 0 on the way through is a cable of no length with a volt
// drop of nothing — which is not an error anybody would notice, and is wrong
// on a document that goes to a client.

import { ITEMS, DIRS, type LayoutItem, type Cable, type ItemKind, type Dir } from '@/lib/layout'

export type StoredItem = {
  localId: number
  kind: string
  label: string
  x: number
  y: number
  dir: string
  kva: number
  pf: number
  volts: number
  equipmentId: string | null
}

export type StoredCable = {
  localId: number
  fromLocal: number
  toLocal: number
  csa: number
  runs: number
  circuits: number
  lengthM: number | null
}

/** A number, or the fallback. Never NaN, never out of range, never a string. */
export function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  if (!isFinite(n)) return fallback
  return Math.max(lo, Math.min(hi, n))
}

/** The drawing's items, ready to store. */
export function itemsToStored(items: LayoutItem[]): StoredItem[] {
  return items.map((i) => ({
    localId: i.id, kind: i.kind, label: i.label, x: i.x, y: i.y,
    dir: i.dir, kva: i.kva, pf: i.pf, volts: i.volts, equipmentId: null,
  }))
}

export function cablesToStored(cables: Cable[]): StoredCable[] {
  return cables.map((c) => ({
    localId: c.id, fromLocal: c.fromId, toLocal: c.toId,
    csa: c.csa, runs: c.runs, circuits: c.circuits, lengthM: c.lengthM,
  }))
}

/**
 * Back into the drawing.
 *
 * An unknown kind becomes a panel rather than crashing the canvas — a row
 * written by a newer version of the application should leave an older one
 * showing a box in the right place with the wrong symbol, not a blank screen.
 */
export function storedToItems(rows: StoredItem[]): LayoutItem[] {
  return rows.map((r) => ({
    id: r.localId,
    kind: (ITEMS[r.kind as ItemKind] ? r.kind : 'panel') as ItemKind,
    label: r.label,
    x: r.x, y: r.y,
    dir: (DIRS.includes(r.dir as Dir) ? r.dir : 'E') as Dir,
    kva: r.kva, pf: r.pf, volts: r.volts,
  }))
}

export function storedToCables(rows: StoredCable[]): Cable[] {
  return rows.map((r) => ({
    id: r.localId, fromId: r.fromLocal, toId: r.toLocal,
    csa: r.csa, runs: Math.max(1, Math.round(r.runs)),
    circuits: Math.max(1, Math.round(r.circuits)),
    lengthM: r.lengthM,
  }))
}

/** Where the numbering has to carry on from, so a new item cannot collide. */
export function nextLocalIds(items: StoredItem[], cables: StoredCable[]): { item: number; cable: number } {
  const max = (ns: number[]) => (ns.length ? Math.max(...ns) : 0)
  return {
    item: max(items.map((i) => i.localId)) + 1,
    cable: max(cables.map((c) => c.localId)) + 1,
  }
}

// ════════════════════════════════════════════════════════════════════════
// ARRIVING FROM THE NETWORK — trust nothing
// ════════════════════════════════════════════════════════════════════════

export function asItems(v: unknown): StoredItem[] {
  if (!Array.isArray(v)) return []
  const out: StoredItem[] = []
  for (const raw of v.slice(0, 20000)) {
    const r = raw as Record<string, unknown>
    const localId = Math.round(Number(r.localId))
    // A row with no number cannot be pointed at by a cable, so it is dropped
    // rather than given one — an invented number would attach the wrong
    // cables to it.
    if (!isFinite(localId)) continue
    out.push({
      localId,
      kind: String(r.kind ?? 'panel').slice(0, 40),
      label: String(r.label ?? '').slice(0, 200),
      x: clampNum(r.x, -1000, 1000, 0),
      y: clampNum(r.y, -1000, 1000, 0),
      dir: DIRS.includes(String(r.dir) as Dir) ? String(r.dir) : 'E',
      kva: clampNum(r.kva, 0, 1e6, 0),
      pf: clampNum(r.pf, 0, 1, 0.8),
      volts: clampNum(r.volts, 0, 1e6, 400),
      equipmentId: typeof r.equipmentId === 'string' && r.equipmentId ? r.equipmentId : null,
    })
  }
  return out
}

export function asCables(v: unknown): StoredCable[] {
  if (!Array.isArray(v)) return []
  const out: StoredCable[] = []
  for (const raw of v.slice(0, 40000)) {
    const r = raw as Record<string, unknown>
    const localId = Math.round(Number(r.localId))
    const fromLocal = Math.round(Number(r.fromLocal))
    const toLocal = Math.round(Number(r.toLocal))
    if (!isFinite(localId) || !isFinite(fromLocal) || !isFinite(toLocal)) continue
    const len = r.lengthM
    out.push({
      localId, fromLocal, toLocal,
      csa: clampNum(r.csa, 0.5, 5000, 240),
      runs: Math.round(clampNum(r.runs, 1, 20, 1)),
      circuits: Math.round(clampNum(r.circuits, 1, 100, 1)),
      // null survives. See the note at the top of this file.
      lengthM: len === null || len === undefined || len === '' ? null : clampNum(len, 0, 10000, 0),
    })
  }
  return out
}

/**
 * A cable pointing at equipment that is not on the drawing.
 *
 * Refused on the way in rather than stored and discovered on the way back
 * out, when it is a drawing somebody has already printed.
 */
export function orphanCable(items: StoredItem[], cables: StoredCable[]): StoredCable | null {
  const present = new Set(items.map((i) => i.localId))
  return cables.find((c) => !present.has(c.fromLocal) || !present.has(c.toLocal)) ?? null
}

/**
 * A database message, turned into something an engineer can act on.
 *
 * PostgREST says `duplicate key value violates unique constraint
 * "layouts_subject_name_idx"`, which tells somebody standing in a switchroom
 * nothing at all. The raw text is kept on the end, because the day it is a
 * message this function has never seen, the raw text is the only thing that
 * helps.
 */
export function describeDbError(msg: string): string {
  if (/layouts_subject_name_idx/.test(msg))
    return 'A layout of that name already exists against this system. Use a different name, or open the existing one.'
  if (/layout_cables_pair_idx/.test(msg))
    return 'Two cables between the same pair of items. A second conductor on the same route is a parallel run — set the run count instead.'
  if (/layout_items_local_idx|layout_cables_local_idx/.test(msg))
    return 'Two things on the drawing share an internal number. Reopen the layout and save it again.'
  if (/relation .* does not exist|could not find the table/i.test(msg))
    return 'Database step part 39 has not been run, so there is nowhere to keep a layout. Run week5-part39-layouts.sql in the Supabase SQL editor.'
  if (/violates foreign key/.test(msg))
    return 'Something on the drawing points at a record that is no longer there. Reopen the layout and try again.'
  return `The database refused the save: ${msg}`
}
