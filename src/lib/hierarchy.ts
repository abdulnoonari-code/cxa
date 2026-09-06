// The whole project, rolled up the way it is actually organised.
//
// ── Why a hierarchy and not another total ───────────────────────────────
//
// "The project is 61% complete" is a figure nobody can act on. It does not
// say which switchboard is holding it up, and on a substation with four
// boards and sixty breakers that is the only question worth asking. A
// commissioning job is a tree — site, area, system, device — and progress
// belongs at every node of it, because that is where somebody is standing
// when they need the number.
//
// ── The rule that governs every figure here ─────────────────────────────
//
// Device levels and system levels are counted separately and NEVER added
// together. L1 to L3 belong to a piece of equipment; L4 and L5 belong to the
// assembly. One merged percentage would let a switchboard read most of the
// way finished on the strength of factory tests alone, with no functional
// testing carried out at all — which is the single most expensive lie this
// application could tell.
//
// So every node carries two pictures, side by side, and the screen prints
// them side by side.

import { TAG_LEVELS, SYSTEM_LEVELS, EMPTY_CELL, pct, type Cell } from '@/lib/scope'
import { childrenOf, refKey, type Subject, type SubjectIndex } from '@/lib/subjects'

export type HierarchyCheck = {
  subjectId: string | null
  level: string | null
  status: string | null
}

export type HierarchyIssue = {
  subjectId: string | null
  category: string | null
  status: string | null
}

export type HierarchyNode = {
  key: string
  type: Subject['type']
  code: string
  name: string
  /** 0 for the top row, 1 for its children, and so on — the indent on screen. */
  depth: number
  /** Devices at or under this node. */
  devices: number
  /** L1 to L3, summed over every device under this node. */
  deviceCells: Record<string, Cell>
  /** L4 and L5, recorded against this node and the systems under it. */
  systemCells: Record<string, Cell>
  punchOpen: number
  punchRaised: number
  /** Category A items not closed. The ones that stop the next step. */
  punchBlocking: number
}

const SETTLED = new Set(['verified', 'closed'])

/**
 * Which kinds of subject get a row.
 *
 * Equipment is counted, not listed. A substation has sixty breakers, and a
 * summary that lists all of them is one nobody scrolls to the bottom of —
 * the per-device detail already has its own screen. What belongs here is the
 * level at which somebody makes a decision, and that is the system.
 */
const LISTED = new Set(['site', 'area', 'system', 'subsystem'])

function emptyCells(levels: readonly string[]): Record<string, Cell> {
  const out: Record<string, Cell> = {}
  for (const l of levels) out[l] = { ...EMPTY_CELL }
  return out
}

function add(into: Record<string, Cell>, from: Record<string, Cell>) {
  for (const k of Object.keys(from)) {
    into[k].total += from[k].total
    into[k].done += from[k].done
    into[k].failed += from[k].failed
  }
}

/**
 * One row per site, area and system, in tree order.
 *
 * Equipment is counted, not listed. A substation has sixty breakers and a
 * dashboard that lists all of them is a dashboard nobody scrolls to the
 * bottom of; the per-device detail already has its own screen. What belongs
 * here is the level at which somebody makes a decision, and that is the
 * system.
 *
 * Figures at a node include everything beneath it, so a site row is the sum
 * of its areas and an area row the sum of its systems. That is what makes
 * the rows comparable — the whole point of the screen is reading down the
 * column and seeing which branch is behind.
 */
export function buildHierarchy(
  index: SubjectIndex,
  checks: HierarchyCheck[],
  issues: HierarchyIssue[]
): HierarchyNode[] {
  const bySubject = new Map<string, HierarchyCheck[]>()
  for (const c of checks) {
    if (!c.subjectId) continue
    const list = bySubject.get(c.subjectId)
    if (list) list.push(c)
    else bySubject.set(c.subjectId, [c])
  }

  const issuesBySubject = new Map<string, HierarchyIssue[]>()
  for (const i of issues) {
    if (!i.subjectId) continue
    const list = issuesBySubject.get(i.subjectId)
    if (list) list.push(i)
    else issuesBySubject.set(i.subjectId, [i])
  }

  const cellsFor = (subjectId: string, levels: readonly string[]): Record<string, Cell> => {
    const out = emptyCells(levels)
    for (const c of bySubject.get(subjectId) ?? []) {
      if (!c.level || !(c.level in out)) continue
      const cell = out[c.level]
      cell.total += 1
      if (c.status === 'pass' || c.status === 'na') cell.done += 1
      else if (c.status === 'fail') cell.failed += 1
    }
    return out
  }

  const rows: HierarchyNode[] = []

  // Depth-first, so a node's own row is emitted before its children and the
  // list reads top-down like the tree it describes.
  const visit = (subject: Subject, depth: number): HierarchyNode => {
    const kids = childrenOf(index, { type: subject.type, id: subject.id })

    const node: HierarchyNode = {
      key: refKey({ type: subject.type, id: subject.id }),
      type: subject.type,
      code: subject.code ?? subject.name ?? '—',
      name: subject.name ?? '',
      depth,
      devices: 0,
      deviceCells: emptyCells(TAG_LEVELS),
      systemCells: emptyCells(SYSTEM_LEVELS),
      punchOpen: 0,
      punchRaised: 0,
      punchBlocking: 0,
    }

    const own = issuesBySubject.get(subject.id) ?? []
    node.punchRaised += own.length
    for (const i of own) {
      const settled = SETTLED.has(i.status ?? 'open')
      if (!settled) {
        node.punchOpen += 1
        if (i.category === 'A') node.punchBlocking += 1
      }
    }

    // A device's checks roll into its parent; a system's own L4/L5 stay with
    // the system. Both are collected here so the node's figures include
    // everything beneath it.
    if (subject.type === 'equipment' || subject.type === 'component') {
      node.devices = 1
      add(node.deviceCells, cellsFor(subject.id, TAG_LEVELS))
      // Device-level work recorded at a device is normal; L4/L5 recorded
      // against a device is a scope error the rules already report, and it
      // is counted here so the figure is not silently lost.
      add(node.systemCells, cellsFor(subject.id, SYSTEM_LEVELS))
    } else {
      add(node.systemCells, cellsFor(subject.id, SYSTEM_LEVELS))
      add(node.deviceCells, cellsFor(subject.id, TAG_LEVELS))
    }

    const listed = LISTED.has(subject.type)

    for (const kid of kids) {
      const child = visit(kid, listed ? depth + 1 : depth)
      node.devices += child.devices
      add(node.deviceCells, child.deviceCells)
      add(node.systemCells, child.systemCells)
      node.punchOpen += child.punchOpen
      node.punchRaised += child.punchRaised
      node.punchBlocking += child.punchBlocking
    }

    if (listed) rows.push(node)
    return node
  }

  const root = index.root
  if (!root) return []
  for (const top of childrenOf(index, { type: root.type, id: root.id })) visit(top, 0)

  // visit() pushes each listed node as it finishes, which is bottom-up.
  // The screen wants tree order, so it is rebuilt here from the rows.
  return orderRows(rows, index)
}

/** Depth-first order: a parent immediately before the branch beneath it. */
function orderRows(rows: HierarchyNode[], index: SubjectIndex): HierarchyNode[] {
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const out: HierarchyNode[] = []

  const walk = (ref: { type: Subject['type']; id: string }) => {
    const node = byKey.get(refKey(ref))
    if (node) out.push(node)
    const kids = childrenOf(index, ref)
      .filter((k) => byKey.has(refKey({ type: k.type, id: k.id })))
      .sort((a, b) => (a.code ?? a.name ?? '').localeCompare(b.code ?? b.name ?? '', undefined, { numeric: true }))
    for (const k of kids) walk({ type: k.type, id: k.id })
  }

  const root = index.root
  if (root) {
    const tops = childrenOf(index, { type: root.type, id: root.id })
      .filter((k) => byKey.has(refKey({ type: k.type, id: k.id })))
      .sort((a, b) => (a.code ?? a.name ?? '').localeCompare(b.code ?? b.name ?? '', undefined, { numeric: true }))
    for (const t of tops) walk({ type: t.type, id: t.id })
  }

  // Anything the walk did not reach — a system whose parent was deleted, or
  // one hanging off nothing — is appended rather than dropped. A row that
  // vanishes from a summary is worse than a row in the wrong place, because
  // nobody can miss what they cannot see.
  const placed = new Set(out.map((r) => r.key))
  for (const r of rows) if (!placed.has(r.key)) out.push(r)
  return out
}

/** Passed out of recorded, across L1 to L3. Null when nothing is recorded. */
export function devicePercent(node: HierarchyNode): number | null {
  return pct(sumCells(node.deviceCells))
}

/** Passed out of recorded, across L4 and L5. Null when nothing is recorded. */
export function systemPercent(node: HierarchyNode): number | null {
  return pct(sumCells(node.systemCells))
}

export function sumCells(cells: Record<string, Cell>): Cell {
  const out: Cell = { total: 0, done: 0, failed: 0 }
  for (const c of Object.values(cells)) {
    out.total += c.total
    out.done += c.done
    out.failed += c.failed
  }
  return out
}

export const HIERARCHY_NOTE =
  'Every figure includes everything beneath that row, so a site is the sum of its areas and an area the sum of its systems. Device work (L1 to L3) and system work (L4 and L5) are shown separately and are never added together — one merged figure would let a board read most of the way finished on factory tests alone, with no functional testing carried out. A dash means nothing is recorded at that level, which is not the same as nought per cent.'
