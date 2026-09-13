// Saving and loading a room layout.
//
// ── What this file is for ────────────────────────────────────────────────
//
// Until now the planner has been a calculator. Everything it worked out was
// right and none of it survived closing the tab. This is the part that turns
// the drawing into a record: a layout belongs to a project and to a subject,
// its equipment points at real tags where they exist, and it can be reopened,
// revised and — later — frozen into a handover pack.
//
// ── IT MUST DEGRADE, NOT BREAK ───────────────────────────────────────────
//
// The tables arrive with SQL part 39, pasted into an editor by hand. Until
// that has been run they do not exist, and a page that throws on a missing
// table is a page that goes blank for a reason nobody can see. Worse, a page
// that catches the error and shows an empty list makes a database that has
// not been set up look exactly like a project with nothing in it.
//
// So every function here reports the difference in words. `layoutsAvailable()`
// asks the database once and says which of the two it is, and the planner
// prints the answer instead of offering a Save button that does nothing.
//
// ── WHY local_id AND NOT THE uuid ────────────────────────────────────────
//
// The drawing numbers its own items 1, 2, 3 and its cables point at those
// numbers. Translating to and from database uuids on every save would mean
// holding a map in the browser and keeping it right through every undo. The
// numbers are stored as they are, unique within one layout, and the cables
// keep pointing at them. A layout is a self-contained document; its internal
// numbering does not need to be globally unique and pretending otherwise buys
// nothing.

import { supabase } from '@/lib/supabase'
import { describeDbError, type StoredItem, type StoredCable } from '@/lib/layout-io'

export type { StoredItem, StoredCable }

export type StoredLayout = {
  id: string
  name: string
  subjectType: string
  subjectId: string | null
  roomW: number
  roomD: number
  ambientC: number
  vdGuidance: string
  updatedAt: string | null
  revision: string | null
}

export type LayoutBundle = {
  layout: StoredLayout
  items: StoredItem[]
  cables: StoredCable[]
}

/**
 * Is there anywhere to save a layout?
 *
 * One small query, and the answer is a sentence rather than a boolean —
 * "the tables are not there" and "the tables are there and empty" are
 * different facts and the screen says which.
 */
export async function layoutsAvailable(): Promise<{ ok: boolean; reason: string }> {
  const { error } = await supabase.from('layouts').select('id').limit(1)
  if (!error) return { ok: true, reason: '' }
  return {
    ok: false,
    reason:
      'Database step part 39 has not been run, so there is nowhere to keep a layout. The planner still calculates everything — only saving is unavailable. Run week5-part39-layouts.sql in the Supabase SQL editor.',
  }
}

/** Every layout belonging to one project, newest first. */
export async function listLayouts(projectId: string): Promise<StoredLayout[]> {
  const { data, error } = await supabase
    .from('layouts')
    .select('id, name, subject_type, subject_id, room_w, room_d, ambient_c, vd_guidance, updated_at, revision')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false, nullsFirst: false })
  if (error) return []
  return (data ?? []).map(rowToLayout)
}

type LayoutRow = {
  id: string
  name: string | null
  subject_type: string | null
  subject_id: string | null
  room_w: number | null
  room_d: number | null
  ambient_c: number | null
  vd_guidance: string | null
  updated_at: string | null
  revision: string | null
}

function rowToLayout(r: LayoutRow): StoredLayout {
  return {
    id: r.id,
    name: r.name ?? 'Untitled',
    subjectType: r.subject_type ?? 'project',
    subjectId: r.subject_id,
    // Defaults that match the planner's own, so a row written before a column
    // existed opens as a sensible drawing rather than a 0 × 0 room.
    roomW: num(r.room_w, 24),
    roomD: num(r.room_d, 16),
    ambientC: num(r.ambient_c, 35),
    vdGuidance: r.vd_guidance ?? 'iec-b',
    updatedAt: r.updated_at,
    revision: r.revision,
  }
}

function num(v: number | null | undefined, fallback: number): number {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return typeof n === 'number' && isFinite(n) ? n : fallback
}

/** One layout with everything on it. */
export async function loadLayout(projectId: string, layoutId: string): Promise<LayoutBundle | null> {
  const { data: lay, error } = await supabase
    .from('layouts')
    .select('id, name, subject_type, subject_id, room_w, room_d, ambient_c, vd_guidance, updated_at, revision')
    .eq('project_id', projectId)
    .eq('id', layoutId)
    .single()
  if (error || !lay) return null

  const [itemRes, cableRes] = await Promise.all([
    supabase.from('layout_items')
      .select('local_id, kind, label, x, y, dir, kva, pf, volts, equipment_id')
      .eq('layout_id', layoutId).order('local_id'),
    supabase.from('layout_cables')
      .select('local_id, from_local, to_local, csa, runs, circuits, length_m')
      .eq('layout_id', layoutId).order('local_id'),
  ])

  type IR = { local_id: number; kind: string | null; label: string | null; x: number | null; y: number | null
              dir: string | null; kva: number | null; pf: number | null; volts: number | null; equipment_id: string | null }
  type CR = { local_id: number; from_local: number; to_local: number; csa: number | null
              runs: number | null; circuits: number | null; length_m: number | null }

  return {
    layout: rowToLayout(lay as LayoutRow),
    items: ((itemRes.data ?? []) as IR[]).map((r) => ({
      localId: r.local_id,
      kind: r.kind ?? 'panel',
      label: r.label ?? '',
      x: num(r.x, 0), y: num(r.y, 0),
      dir: r.dir ?? 'E',
      kva: num(r.kva, 0), pf: num(r.pf, 0.8), volts: num(r.volts, 400),
      equipmentId: r.equipment_id,
    })),
    cables: ((cableRes.data ?? []) as CR[]).map((r) => ({
      localId: r.local_id,
      fromLocal: r.from_local,
      toLocal: r.to_local,
      csa: num(r.csa, 240),
      runs: Math.max(1, Math.round(num(r.runs, 1))),
      circuits: Math.max(1, Math.round(num(r.circuits, 1))),
      // null is meaningful here: it means "measure it off the drawing".
      lengthM: r.length_m === null || r.length_m === undefined ? null : num(r.length_m, 0),
    })),
  }
}

export type SaveResult =
  | { ok: true; layoutId: string; items: number; cables: number }
  | { ok: false; error: string }

/**
 * Write a layout back.
 *
 * ── Upsert then remove, never delete then insert ─────────────────────────
 *
 * The obvious shape is "delete everything on this layout, insert the new
 * set". It is also the one where a failure halfway through leaves the drawing
 * empty in the database — the engineer closes the tab believing it saved, and
 * what is there is nothing.
 *
 * Because local_id is unique within a layout there is a better shape: upsert
 * every item that is on the drawing now, then delete only those whose numbers
 * are no longer among them. There is no moment at which the layout is empty,
 * and a failed request leaves the previous version intact.
 *
 * Cables go first on the way out and last on the way in, because a cable
 * pointing at an item number that has just been removed is the one
 * intermediate state worth avoiding.
 */
export async function saveLayout(
  projectId: string,
  bundle: {
    layoutId?: string | null
    name: string
    subjectType: string
    subjectId: string | null
    roomW: number
    roomD: number
    ambientC: number
    vdGuidance: string
    items: StoredItem[]
    cables: StoredCable[]
  }
): Promise<SaveResult> {
  const now = new Date().toISOString()
  const head = {
    project_id: projectId,
    name: bundle.name,
    subject_type: bundle.subjectType,
    subject_id: bundle.subjectId,
    room_w: bundle.roomW,
    room_d: bundle.roomD,
    ambient_c: bundle.ambientC,
    vd_guidance: bundle.vdGuidance,
    updated_at: now,
  }

  let layoutId = bundle.layoutId ?? null
  if (layoutId) {
    const { error } = await supabase.from('layouts').update(head).eq('id', layoutId).eq('project_id', projectId)
    if (error) return { ok: false, error: describeDbError(error.message) }
  } else {
    const { data, error } = await supabase.from('layouts').insert(head).select('id').single()
    if (error || !data) return { ok: false, error: describeDbError(error?.message ?? 'the layout could not be created') }
    layoutId = (data as { id: string }).id
  }

  // ── cables out first ──
  const cableIds = bundle.cables.map((c) => c.localId)
  const delC = cableIds.length
    ? await supabase.from('layout_cables').delete().eq('layout_id', layoutId).not('local_id', 'in', `(${cableIds.join(',')})`)
    : await supabase.from('layout_cables').delete().eq('layout_id', layoutId)
  if (delC.error) return { ok: false, error: describeDbError(delC.error.message) }

  // ── items ──
  if (bundle.items.length) {
    const rows = bundle.items.map((i) => ({
      layout_id: layoutId, project_id: projectId, local_id: i.localId,
      kind: i.kind, label: i.label, x: i.x, y: i.y, dir: i.dir,
      kva: i.kva, pf: i.pf, volts: i.volts, equipment_id: i.equipmentId,
    }))
    const { error } = await supabase.from('layout_items').upsert(rows, { onConflict: 'layout_id,local_id' })
    if (error) return { ok: false, error: describeDbError(error.message) }
  }
  const itemIds = bundle.items.map((i) => i.localId)
  const delI = itemIds.length
    ? await supabase.from('layout_items').delete().eq('layout_id', layoutId).not('local_id', 'in', `(${itemIds.join(',')})`)
    : await supabase.from('layout_items').delete().eq('layout_id', layoutId)
  if (delI.error) return { ok: false, error: describeDbError(delI.error.message) }

  // ── cables back in, once every item they point at exists ──
  if (bundle.cables.length) {
    const rows = bundle.cables.map((c) => ({
      layout_id: layoutId, project_id: projectId, local_id: c.localId,
      from_local: c.fromLocal, to_local: c.toLocal,
      csa: c.csa, runs: c.runs, circuits: c.circuits, length_m: c.lengthM,
    }))
    const { error } = await supabase.from('layout_cables').upsert(rows, { onConflict: 'layout_id,local_id' })
    if (error) return { ok: false, error: describeDbError(error.message) }
  }

  return { ok: true, layoutId: layoutId as string, items: bundle.items.length, cables: bundle.cables.length }
}

export async function deleteLayout(projectId: string, layoutId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('layouts').delete().eq('id', layoutId).eq('project_id', projectId)
  if (error) return { ok: false, error: describeDbError(error.message) }
  return { ok: true }
}
