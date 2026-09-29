// The hierarchy, out and back in.
//
// ── What this is, and what it deliberately is not ───────────────────────
//
// THE PROJECT IS THE SUBSTATION. It is not a column and it is not a level
// you fill in — it is the thing you are already inside when you press the
// button. Under it there are three:
//
//     System        MV Switchgear
//       Subsystem     Incomer
//         Tag           MV-SWGR-01
//
// That is all. No facility, no area, no site, no component. Published
// guidance puts five levels on a company with many sites and three on a
// single site; one substation per project is a single site.
//
// I built this twice with an extra level in it that nobody asked for, and
// both times the extra level was the whole of the problem. So it is
// written down here: THREE, AND ADDING A FOURTH NEEDS A REASON THAT
// SOMEBODY ASKED FOR.
//
// ── And no checks ───────────────────────────────────────────────────────
//
// The sheet carries structure only. Checklists are attached to tags
// afterwards, per level, which is a separate thing somebody does at a
// different time for a different reason. Putting both in one sheet made a
// file that was four hundred rows long before it described forty tags.
//
// ── Why export comes before import ──────────────────────────────────────
//
// "When I come to upload the sheets it is very difficult" — and the
// difficulty was never the uploading. It was knowing what the file had to
// look like.
//
// So the first button is EXPORT, always, even on an empty project, where
// it hands back a sheet with worked example rows in it. Nobody has to be
// told a format they can simply be given, and a sheet that came out of the
// application is a sheet that will go back into it.

import ExcelJS from 'exceljs'
import { Readable } from 'stream'

const ASSET_ALIASES = ['asset', 'asset name', 'facility', 'substation', 'plant', 'station', 'building', 'area', 'asset group']
const SYSTEM_ALIASES = ['system', 'system name', 'system id', 'sys', 'package', 'discipline system']
const SUBSYSTEM_ALIASES = ['subsystem', 'sub system', 'sub-system', 'subsys', 'section', 'bay', 'panel', 'cubicle']
// 'equipment' is FIRST and is also in TAG_ALIASES. The exact-match pass
// runs fields in the order of `want` below, and equipmentType comes before
// tag there, so a column headed "Equipment" is read as the KIND. A sheet
// whose only item column is called "Equipment" is rescued further down,
// the same way "Asset" is.
const TYPE_ALIASES = ['equipment', 'equipment type', 'type', 'type code', 'equip type', 'asset type', 'item type', 'equipment category', 'family', 'model']
const TAG_ALIASES = ['tag', 'tag no', 'tag id', 'tag number', 'equipment tag', 'equipment', 'asset', 'asset id', 'kks', 'item no', 'equipment no']
const DESC_ALIASES = ['description', 'tag description', 'equipment description', 'desc', 'name', 'equipment name', 'title']

function norm(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && value !== null && 'text' in value) return String((value as { text: unknown }).text ?? '').trim()
  if (typeof value === 'object' && value !== null && 'result' in value) return String((value as { result: unknown }).result ?? '').trim()
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).trim()
}

const headerKey = (v: unknown) => norm(v).toLowerCase().replace(/\s+/g, ' ').replace(/[.:*]+$/, '')

// ── The sheet, written down once ────────────────────────────────────────
//
// The export route used to hold its own copy of the header, the example
// rows and the footnotes, and this file held the reader. Nothing connected
// them, and the previous pair of files like that disagreed on the very
// first try: the exported sheet's own footnotes were read as data, so the
// first file anybody downloaded was refused when they imported it back.
//
// So the shape lives here, beside the reader that has to understand it, and
// the route imports it. A round-trip assertion in
// src/checks/hierarchy.check.mts writes a real workbook from these and
// reads it back — which can only be honest because there is one copy.

export const HIERARCHY_HEADER = ['Asset', 'System', 'Subsystem', 'Equipment', 'Tag', 'Description'] as const

/**
 * What an empty project exports. Not an empty grid — an empty grid is still
 * a format to guess at. Worked rows showing the three levels and the
 * fill-down, to be typed over.
 */
export const HIERARCHY_EXAMPLE: string[][] = [
  // Equipment is written ONCE and the tags of that kind listed beneath it.
  // This is the shape a hundred MV panels take: one Equipment row, a
  // hundred tag rows, one checklist.
  ['22 kV Switchroom', 'MV Switchgear', 'Incomer', 'MV Panel', 'MV-SWGR-001', '22 kV incomer panel'],
  ['', '', '', '', 'MV-SWGR-002', 'Bus section'],
  ['', '', '', '', 'MV-SWGR-003', 'Feeder to TX-01'],
  ['', 'Transformers', '', 'Dry Transformer', 'TX-01', '22/0.4 kV 2000 kVA'],
  ['', '', '', '', 'TX-02', '22/0.4 kV 2000 kVA'],
  ['LV Room', 'LV Distribution', '', 'LV Panel', 'LV-MDB-01', 'Main distribution board'],
]

/** Printed under the table, in italic. Must survive its own reader. */
export const HIERARCHY_FOOTNOTES: string[] = [
  'Leave a cell blank to repeat the one above it: Asset, then System, then Subsystem, then Equipment, then the Tag.',
  'Equipment is the KIND of plant and Tag is one numbered item of it. A hundred panels are a hundred Tag rows under one Equipment.',
  'The checklist attaches to the Equipment once and reaches every Tag beneath it, so write the Equipment once and list the tags.',
  'The project is the substation, so it is not a column. Type over these example rows and import this file back.',
]

export type SheetProblem = { row: number; column: string; value: string; message: string }

export type HierarchyRow = {
  row: number
  asset: string
  system: string
  subsystem: string
  equipmentType: string
  tag: string
  description: string
}

/** Where one tag sits. Asset and subsystem may be empty; system never is. */
export type TagHome = {
  tag: string
  description: string
  asset: string
  system: string
  subsystem: string
  equipmentType: string
}

export type Hierarchy = {
  rows: HierarchyRow[]
  assets: string[]
  systems: { asset: string; name: string }[]
  subsystems: { asset: string; system: string; name: string }[]
  equipmentTypes: string[]
  tags: TagHome[]
  problems: SheetProblem[]
  columns: Record<string, string | null>
}

/**
 * System and Tag, and nothing else.
 *
 * Asset, Subsystem and Equipment Type are all optional, because a sheet
 * that refuses to load until somebody has filled in every level is the
 * application asking for its own structure again — which is what went
 * wrong twice. A sheet with only System and Tag loads, and the levels it
 * leaves out simply are not there.
 */
const REQUIRED = ['system', 'tag'] as const

function findColumns(header: unknown[]): Record<string, number | null> {
  // Order matters: the first field to claim a column keeps it. `asset`
  // comes before `tag` so that a sheet with both "Asset" and "Tag" reads
  // Asset as the level. A sheet with only "Asset" is handled below.
  const want: Record<string, string[]> = {
    asset: ASSET_ALIASES,
    system: SYSTEM_ALIASES,
    subsystem: SUBSYSTEM_ALIASES,
    equipmentType: TYPE_ALIASES,
    tag: TAG_ALIASES,
    description: DESC_ALIASES,
  }
  const keys = header.map(headerKey)
  const found: Record<string, number | null> = {}
  const taken = new Set<number>()

  // Exact matches across every field first. Otherwise "Equipment
  // Description" is claimed by `tag` — whose aliases include "equipment" —
  // before `description` ever sees it.
  for (const [field, aliases] of Object.entries(want)) {
    found[field] = null
    for (let i = 0; i < keys.length; i++) {
      if (taken.has(i)) continue
      if (aliases.includes(keys[i])) { found[field] = i; taken.add(i); break }
    }
  }
  for (const [field, aliases] of Object.entries(want)) {
    if (found[field] !== null) continue
    for (let i = 0; i < keys.length; i++) {
      if (taken.has(i) || !keys[i]) continue
      if (aliases.some((a) => keys[i].includes(a))) { found[field] = i; taken.add(i); break }
    }
  }

  // ── "Asset" meant the tag before it meant a level ──────────────────
  //
  // Every register anybody already has calls the equipment "Asset". Now
  // that Asset is also the top level, a sheet whose only equipment column
  // is called "Asset" would load with no tags at all — every row refused
  // for naming a system and no tag, which reads as the importer being
  // broken rather than as a column being ambiguous.
  //
  // So: if nothing claimed a tag column and Asset did claim one, Asset was
  // the tag. A sheet with BOTH is unambiguous and is left alone.
  //
  // EQUIPMENT IS CHECKED FIRST, because it is the nearer meaning: a
  // register whose item column is headed "Equipment" is far more common
  // than one headed "Asset", and if both are present and there is no Tag
  // column then the Equipment column is the item.
  if (found.tag === null && found.equipmentType !== null) {
    found.tag = found.equipmentType
    found.equipmentType = null
  }
  if (found.tag === null && found.asset !== null) {
    found.tag = found.asset
    found.asset = null
  }
  return found
}

export function hierarchyFromRows(grid: unknown[][]): Hierarchy {
  const problems: SheetProblem[] = []
  const empty: Hierarchy = {
    rows: [], assets: [], systems: [], subsystems: [], equipmentTypes: [], tags: [], problems, columns: {},
  }

  // The header is the first row naming both required columns. Sheets have
  // titles, logos and blank rows above the table, and insisting the header
  // is row 1 is how an importer refuses nearly every real file.
  let headerAt = -1
  let columns: Record<string, number | null> = {}
  for (let i = 0; i < Math.min(grid.length, 25); i++) {
    const c = findColumns(grid[i] ?? [])
    if (REQUIRED.every((f) => c[f] !== null)) { headerAt = i; columns = c; break }
  }
  if (headerAt === -1) {
    problems.push({ row: 0, column: '—', value: '', message: 'No header row found. There must be a row naming at least System and Tag.' })
    return empty
  }

  const at = (r: unknown[], field: string) => {
    const i = columns[field]
    return i === null || i === undefined ? '' : norm(r[i])
  }

  // ── Fill-down, running DOWN the tree ────────────────────────────────
  //
  // A blank cell means "same as the row above". People merge cells and
  // leave blanks, and a sheet that repeats the system on every one of
  // sixty rows is a sheet somebody will get wrong.
  //
  // THE RESET IS THE PART THAT MATTERS, and it runs the whole way down:
  // naming a level clears every level beneath it. A new Asset clears the
  // system, the subsystem and the equipment; a new System clears the
  // subsystem and the equipment; a new Subsystem clears the equipment.
  //
  // Without that, the first tag under a new heading silently inherits the
  // last one from the heading above — filed somewhere its owner will never
  // look, with nothing anywhere saying so.
  //
  // EQUIPMENT FILLS DOWN because it is a LEVEL, and that is the whole
  // point of it: write "MV Panel" once and list a hundred tags beneath it.
  // An earlier version made Equipment an attribute that never filled down,
  // to stop a transformer inheriting the switchgear's kind. The reset
  // above is the right answer to that, not refusing to fill down — and
  // refusing cost a hundred checklists on a hundred identical panels.
  //
  // DESCRIPTION STILL DOES NOT FILL DOWN. It is not a level; it is a
  // sentence about one tag, and a sentence copied down a hundred rows is
  // a hundred wrong descriptions.
  let lastAsset = '', lastSystem = '', lastSub = '', lastEquipment = ''
  const rows: HierarchyRow[] = []

  for (let i = headerAt + 1; i < grid.length; i++) {
    const raw = grid[i] ?? []
    const rowNo = i + 1
    const assetCell = at(raw, 'asset')
    const systemCell = at(raw, 'system')
    const subCell = at(raw, 'subsystem')
    const equipmentCell = at(raw, 'equipmentType')
    const tag = at(raw, 'tag')
    const description = at(raw, 'description')

    if (!assetCell && !systemCell && !subCell && !equipmentCell && !tag && !description) continue

    // A footnote under the table. Real sheets end with prose — "Prepared
    // by…", "Sheet 1 of 3" — and so does the one this application hands
    // out, which its own importer refused until this existed. Narrow on
    // purpose: one cell in the whole row, no tag, sentence-shaped.
    const filledCells = raw.map(norm).filter((v) => v !== '')
    if (filledCells.length === 1 && !tag) {
      const only = filledCells[0]
      if (only.length >= 50 || /[.!?]$/.test(only)) continue
    }

    const newAsset = !!assetCell && assetCell !== lastAsset
    const asset = assetCell || lastAsset

    const system = systemCell || (newAsset ? '' : lastSystem)
    const newSystem = newAsset || (!!systemCell && systemCell !== lastSystem)

    const subsystem = subCell || (newSystem ? '' : lastSub)
    const newSub = newSystem || (!!subCell && subCell !== lastSub)

    const equipment = equipmentCell || (newSub ? '' : lastEquipment)

    if (!system) problems.push({ row: rowNo, column: 'System', value: '', message: 'No system on this row, and no row above it to take one from.' })
    if (!tag) problems.push({ row: rowNo, column: 'Tag', value: '', message: 'This row names part of the tree but no tag.' })

    lastAsset = asset
    lastSystem = system
    lastSub = subsystem
    lastEquipment = equipment
    if (!system || !tag) continue
    rows.push({ row: rowNo, asset, system, subsystem, equipmentType: equipment, tag, description })
  }

  if (rows.length === 0 && problems.length === 0) {
    problems.push({ row: headerAt + 1, column: '—', value: '', message: 'The header was found but there are no rows under it.' })
  }

  // ── One tag, one place ──────────────────────────────────────────────
  //
  // A tag named twice under different systems is a typo in one of the two
  // rows, and picking either files the equipment where its owner will not
  // look for it. Reported by row rather than resolved.
  const homeOf = new Map<string, { asset: string; system: string; subsystem: string; row: number }>()
  for (const r of rows) {
    const k = r.tag.toLowerCase()
    const home = homeOf.get(k)
    if (!home) { homeOf.set(k, { asset: r.asset, system: r.system, subsystem: r.subsystem, row: r.row }); continue }
    if (home.asset !== r.asset) {
      problems.push({ row: r.row, column: 'Asset', value: r.asset, message: `${r.tag} is under "${home.asset || 'no asset'}" on row ${home.row} and "${r.asset || 'no asset'}" here.` })
    } else if (home.system !== r.system) {
      problems.push({ row: r.row, column: 'System', value: r.system, message: `${r.tag} is under "${home.system}" on row ${home.row} and "${r.system}" here.` })
    } else if (home.subsystem !== r.subsystem && r.subsystem && home.subsystem) {
      problems.push({ row: r.row, column: 'Subsystem', value: r.subsystem, message: `${r.tag} is under "${home.subsystem}" on row ${home.row} and "${r.subsystem}" here.` })
    } else if (home.row !== r.row) {
      problems.push({ row: r.row, column: 'Tag', value: r.tag, message: `${r.tag} is already on row ${home.row}.` })
    }
  }

  const lc = (s: string) => s.toLowerCase()

  const assets = [...new Map(rows.filter((r) => r.asset).map((r) => [lc(r.asset), r.asset])).values()]

  // A system name is only unique inside its asset: "MV Switchgear" in two
  // switchrooms is two systems, on two floors, with different equipment.
  const sysMap = new Map<string, { asset: string; name: string }>()
  for (const r of rows) sysMap.set(`${lc(r.asset)}\u0000${lc(r.system)}`, { asset: r.asset, name: r.system })
  const systems = [...sysMap.values()]

  const subs = new Map<string, { asset: string; system: string; name: string }>()
  for (const r of rows) {
    if (!r.subsystem) continue
    subs.set(`${lc(r.asset)}\u0000${lc(r.system)}\u0000${lc(r.subsystem)}`, { asset: r.asset, system: r.system, name: r.subsystem })
  }

  const equipmentTypes = [...new Map(rows.filter((r) => r.equipmentType).map((r) => [lc(r.equipmentType), r.equipmentType])).values()]

  const tags: TagHome[] = [...homeOf.entries()].map(([k, home]) => {
    const mine = rows.filter((r) => lc(r.tag) === k)
    return {
      tag: mine[0].tag,
      description: mine.find((r) => r.description)?.description ?? '',
      asset: home.asset,
      system: home.system,
      subsystem: home.subsystem,
      equipmentType: mine.find((r) => r.equipmentType)?.equipmentType ?? '',
    }
  })

  const labelled: Record<string, string | null> = {}
  for (const [field, i] of Object.entries(columns)) {
    labelled[field] = i === null || i === undefined ? null : norm((grid[headerAt] ?? [])[i]) || `Column ${i + 1}`
  }

  return { rows, assets, systems, subsystems: [...subs.values()], equipmentTypes, tags, problems, columns: labelled }
}

export async function hierarchyFromWorkbook(buffer: ArrayBuffer): Promise<Hierarchy> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.read(Readable.from(Buffer.from(buffer)))
  const sheet = wb.worksheets[0]
  if (!sheet) {
    return { rows: [], assets: [], systems: [], subsystems: [], equipmentTypes: [], tags: [], columns: {},
      problems: [{ row: 0, column: '—', value: '', message: 'That file has no sheets in it.' }] }
  }
  const grid: unknown[][] = []
  sheet.eachRow({ includeEmpty: true }, (row, n) => {
    const cells: unknown[] = []
    row.eachCell({ includeEmpty: true }, (cell, c) => { cells[c - 1] = cell.value })
    grid[n - 1] = cells
  })
  return hierarchyFromRows(grid)
}

// ── Deciding what to write ──────────────────────────────────────────────

export type ExistingTree = {
  assets: { id: string; name: string }[]
  systems: { id: string; name: string; area_id: string | null }[]
  subsystems: { id: string; name: string; system_id: string | null }[]
  equipmentTypes: { id: string; type_code: string }[]
  tags: { id: string; tag_id: string }[]
}

export type TreeWork = {
  assetsToAdd: string[]
  systemsToAdd: { asset: string; name: string }[]
  subsystemsToAdd: { asset: string; system: string; name: string }[]
  equipmentTypesToAdd: string[]
  tagsToAdd: TagHome[]
  tagsToUpdate: (TagHome & { id: string })[]
}

const key = (s: string) => s.trim().toLowerCase()

/**
 * Pure, so the decision can be tested without a database.
 *
 * The property that matters: APPLY THE RESULT, RUN IT AGAIN, NOTHING LEFT
 * TO DO. Somebody exports their hierarchy, corrects three rows and imports
 * it back — if that doubles the register the damage is invisible until
 * somebody counts, which is months later, at handover.
 */
export function reconcileTree(h: Hierarchy, existing: ExistingTree): TreeWork {
  const assetIdByName = new Map(existing.assets.map((a) => [key(a.name), a.id]))
  const assetNameById = new Map(existing.assets.map((a) => [a.id, key(a.name)]))
  const assetsToAdd = h.assets.filter((n) => !assetIdByName.has(key(n)))

  // ── Matching a system ────────────────────────────────────────────────
  //
  // A system name is only unique inside its asset: "MV Switchgear" in two
  // switchrooms is two systems.
  //
  // THE FALLBACK IS THE PART THAT MATTERS. A register loaded before assets
  // existed has systems with no asset at all. Matching only on (asset,
  // name) would treat every one of them as missing, and the first sheet
  // carrying an Asset column would silently duplicate the whole register
  // beside itself. So a system with NO asset matches by name alone — and
  // only one with no asset, never one belonging to a different asset.
  const sysKey = (assetKey: string, name: string) => `${assetKey}\u0000${key(name)}`
  const systemIdByKey = new Map<string, string>()
  const looseSystemIdByName = new Map<string, string>()
  for (const s of existing.systems) {
    const a = s.area_id ? assetNameById.get(s.area_id) ?? null : null
    if (s.area_id && a === null) continue // belongs to an asset we cannot see — not ours to match
    if (a === null) looseSystemIdByName.set(key(s.name), s.id)
    else systemIdByKey.set(sysKey(a, s.name), s.id)
  }
  const matchSystem = (asset: string, name: string): string | undefined =>
    systemIdByKey.get(sysKey(key(asset), name)) ?? looseSystemIdByName.get(key(name))

  const systemsToAdd = h.systems.filter((s) => !matchSystem(s.asset, s.name))

  // A subsystem name is only unique inside its system: "Incomer" under two
  // switchboards is two different bays.
  const subKey = (systemId: string, name: string) => `${systemId}\u0000${key(name)}`
  const haveSubs = new Set(
    existing.subsystems.filter((s) => s.system_id).map((s) => subKey(s.system_id!, s.name)),
  )
  const subsystemsToAdd = h.subsystems.filter((s) => {
    const id = matchSystem(s.asset, s.system)
    return !id || !haveSubs.has(subKey(id, s.name))
  })

  const haveTypes = new Set(existing.equipmentTypes.map((t) => key(t.type_code)))
  const equipmentTypesToAdd = h.equipmentTypes.filter((t) => !haveTypes.has(key(t)))

  const tagIdByTag = new Map(existing.tags.map((t) => [key(t.tag_id), t.id]))
  const tagsToAdd: TagHome[] = []
  const tagsToUpdate: (TagHome & { id: string })[] = []
  for (const t of h.tags) {
    const id = tagIdByTag.get(key(t.tag))
    if (id) tagsToUpdate.push({ ...t, id })
    else tagsToAdd.push(t)
  }

  return { assetsToAdd, systemsToAdd, subsystemsToAdd, equipmentTypesToAdd, tagsToAdd, tagsToUpdate }
}
