// One sheet that builds the whole job.
//
// ── Why this exists ─────────────────────────────────────────────────────
//
// To get a job into this application you had to understand four screens and
// four different spreadsheets: Systems, Equipment Types, Equipment & Tags,
// and Checklists — in that order, because each one depends on the one
// before it. Nothing said so. A person with a list of tags and the checks
// against them had to take it apart into three files and put them back in
// the right sequence before anything appeared.
//
// That is not a format problem. It is the application asking somebody to
// hold its database schema in their head before they can use it.
//
// So: ONE SHEET. One row per check, with the system and the tag repeated on
// every row — which is what Excel's fill-down is for, and what everybody
// already has, because that is the shape a commissioning register is
// written in by hand.
//
//   System        Subsystem  Tag               Description      Level  Check
//   SUDB-MV-SWGR  Incomer    SUDB-MV-SWGR-01   22 kV incomer    L2     Busbar bolt torque
//   SUDB-MV-SWGR  Incomer    SUDB-MV-SWGR-01   22 kV incomer    L3     Insulation resistance
//   SUDB-MV-SWGR  Feeder 1   SUDB-MV-SWGR-02   Feeder to DCDB   L2     Busbar bolt torque
//
// The hierarchy is not a column anybody fills in. It is read out of the
// repetition: three systems named on forty rows is three systems.
//
// ── What it will not do ─────────────────────────────────────────────────
//
// It does not guess. Every other importer here refuses the whole file
// rather than apply half of it, and this one is no different — a job half
// imported is worse than one not imported, because the half that is there
// looks finished.
//
// And it does not write anything until somebody has seen what it read.
// `plan()` returns what WOULD happen. Nothing in this file touches a
// database.

import ExcelJS from 'exceljs'
import { Readable } from 'stream'
import { matchLevel, matchInspection } from '@/lib/checklist-io'

const SYSTEM_ALIASES = ['system', 'system name', 'system id', 'sys', 'package', 'area']
const SUBSYSTEM_ALIASES = ['subsystem', 'sub system', 'sub-system', 'subsys', 'section', 'bay', 'panel']
const TAG_ALIASES = ['tag', 'tag no', 'tag id', 'tag number', 'equipment tag', 'equipment', 'asset', 'asset id', 'kks', 'item no']
const DESC_ALIASES = ['description', 'tag description', 'equipment description', 'desc', 'name', 'equipment name']
const LEVEL_ALIASES = ['level', 'lvl', 'stage', 'cx level', 'commissioning level', 'test level', 'phase']
const CHECK_ALIASES = ['check', 'checks', 'item', 'item to check', 'checkpoint', 'activity', 'task', 'test', 'inspection', 'verification', 'point', 'scope']
const NOTES_ALIASES = ['notes', 'note', 'acceptance', 'acceptance criteria', 'criteria', 'remark', 'remarks', 'comment', 'comments', 'detail', 'details']
const ITP_ALIASES = ['itp', 'itp type', 'inspection type', 'hold point', 'h/w/s', 'point type', 'witness']

function norm(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && value !== null && 'text' in value) return String((value as { text: unknown }).text ?? '').trim()
  if (typeof value === 'object' && value !== null && 'result' in value) return String((value as { result: unknown }).result ?? '').trim()
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).trim()
}

function headerKey(value: unknown): string {
  return norm(value).toLowerCase().replace(/\s+/g, ' ').replace(/[.:*]+$/, '')
}

export type SheetProblem = { row: number; column: string; value: string; message: string }

export type SheetRow = {
  /** The row number in the workbook, for the error list. */
  row: number
  system: string
  subsystem: string
  tag: string
  description: string
  level: string
  check: string
  notes: string
  itp: string | null
}

export type JobPlan = {
  rows: SheetRow[]
  systems: string[]
  /** "system\u0000subsystem" pairs, because a subsystem name is only unique inside its system. */
  subsystems: { system: string; name: string }[]
  tags: { tag: string; description: string; system: string; subsystem: string }[]
  checks: { tag: string; level: string; item: string; notes: string; itp: string | null }[]
  problems: SheetProblem[]
  /** Columns found in the header, for the "this is what I read" panel. */
  columns: Record<string, string | null>
}

/**
 * Which columns are required.
 *
 * Description, Subsystem, Notes and ITP are all optional: a job with no
 * subsystems is a normal job, and somebody's first sheet will not have
 * acceptance criteria on it.
 */
const REQUIRED = ['system', 'tag', 'level', 'check'] as const

function findColumns(header: unknown[]): Record<string, number | null> {
  const want: Record<string, string[]> = {
    system: SYSTEM_ALIASES,
    subsystem: SUBSYSTEM_ALIASES,
    tag: TAG_ALIASES,
    description: DESC_ALIASES,
    level: LEVEL_ALIASES,
    check: CHECK_ALIASES,
    notes: NOTES_ALIASES,
    itp: ITP_ALIASES,
  }
  const keys = header.map((h) => headerKey(h))
  const found: Record<string, number | null> = {}
  const taken = new Set<number>()

  // Exact alias matches first, across every field, before any fuzzy
  // matching. Otherwise "Equipment Description" is claimed by `tag` (whose
  // aliases include "equipment") before `description` ever sees it.
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
  return found
}

/**
 * Read a sheet that is already rows of cells.
 *
 * Separate from the workbook reading so the whole of this can be tested
 * without an .xlsx — the parsing is where the mistakes are, and a test that
 * has to build a spreadsheet first is a test nobody writes enough of.
 */
export function planFromRows(grid: unknown[][]): JobPlan {
  const problems: SheetProblem[] = []
  const empty: JobPlan = {
    rows: [], systems: [], subsystems: [], tags: [], checks: [], problems, columns: {},
  }

  // The header is the first row that names at least two of the required
  // columns. Sheets have titles, logos and blank rows above the table, and
  // insisting the header is row 1 is how an importer rejects a real file.
  let headerAt = -1
  let columns: Record<string, number | null> = {}
  for (let i = 0; i < Math.min(grid.length, 25); i++) {
    const c = findColumns(grid[i] ?? [])
    const hits = REQUIRED.filter((f) => c[f] !== null).length
    if (hits >= 2) { headerAt = i; columns = c; break }
  }
  if (headerAt === -1) {
    problems.push({ row: 0, column: '—', value: '', message: 'No header row found. There must be a row naming at least System, Tag, Level and Check.' })
    return empty
  }

  const missing = REQUIRED.filter((f) => columns[f] === null)
  if (missing.length > 0) {
    problems.push({
      row: headerAt + 1, column: missing.join(', '), value: '',
      message: `The header is missing ${missing.length === 1 ? 'a column' : 'columns'}: ${missing.join(', ')}.`,
    })
    return { ...empty, columns: labelColumns(grid[headerAt] ?? [], columns) }
  }

  const at = (r: unknown[], field: string) => {
    const i = columns[field]
    return i === null || i === undefined ? '' : norm(r[i])
  }

  // ── Fill-down ───────────────────────────────────────────────────────
  //
  // A blank System or Tag means "same as the row above". People merge
  // cells and leave blanks, and a sheet that has to repeat the tag on
  // every row in a block of twenty is a sheet somebody will get wrong.
  //
  // It carries forward only while the row has a check on it. A blank row
  // between blocks does not inherit anything, and the first row cannot
  // inherit from nothing — that is an error, not a silent empty system.
  let lastSystem = '', lastSubsystem = '', lastTag = '', lastDesc = ''
  const rows: SheetRow[] = []

  for (let i = headerAt + 1; i < grid.length; i++) {
    const raw = grid[i] ?? []
    const rowNo = i + 1
    const check = at(raw, 'check')
    const level = at(raw, 'level')
    const tagCell = at(raw, 'tag')
    const systemCell = at(raw, 'system')

    // A row with nothing on it at all is a spacer, not a problem.
    if (!check && !level && !tagCell && !systemCell && !at(raw, 'description')) continue

    // ── A footnote under the table ──────────────────────────────────
    //
    // Real sheets end with prose: "Prepared by...", "Sheet 1 of 3",
    // "Delete these example rows before importing". So does the blank
    // template this application hands out — which, until this was
    // written, MY OWN IMPORTER REFUSED. The note telling somebody to
    // delete the example rows was itself read as a row with a system
    // and no check on it.
    //
    // Found by writing the template with one file, reading it back with
    // the other, and looking at what came out. Neither file was wrong on
    // its own.
    //
    // The rule is narrow on purpose: ONE cell filled, in the first
    // column, holding something sentence-shaped — long, or ending in a
    // full stop. A system name is short and does not end in a full stop.
    // Anything else that is odd is still reported rather than skipped,
    // because silently ignoring rows is how half a job goes missing.
    const filled = raw.filter((c) => norm(c) !== '').length
    const looksLikeProse = systemCell.length >= 50 || /[.!?]$/.test(systemCell)
    if (filled === 1 && systemCell && !check && !level && !tagCell && looksLikeProse) continue

    const system = systemCell || lastSystem
    const subsystemCell = at(raw, 'subsystem')
    // A new tag clears the remembered subsystem: otherwise a tag with no
    // subsystem, sitting under one that had one, silently inherits it.
    const subsystem = subsystemCell || (tagCell && tagCell !== lastTag ? '' : lastSubsystem)
    const tag = tagCell || lastTag
    const description = at(raw, 'description') || (tagCell && tagCell !== lastTag ? '' : lastDesc)

    if (!system) problems.push({ row: rowNo, column: 'System', value: '', message: 'No system on this row, and no row above it to take one from.' })
    if (!tag) problems.push({ row: rowNo, column: 'Tag', value: '', message: 'No tag on this row, and no row above it to take one from.' })
    if (!check) problems.push({ row: rowNo, column: 'Check', value: '', message: 'This row has a tag but no check on it.' })

    const matched = level ? matchLevel(level) : null
    if (!level) problems.push({ row: rowNo, column: 'Level', value: '', message: 'No level. Use L1 to L5.' })
    else if (!matched) problems.push({ row: rowNo, column: 'Level', value: level, message: `"${level}" is not a level this application knows. Use L1 to L5.` })

    const itpRaw = at(raw, 'itp')
    const itp = itpRaw ? matchInspection(itpRaw) : null
    if (itpRaw && !itp) problems.push({ row: rowNo, column: 'ITP', value: itpRaw, message: `"${itpRaw}" is not a hold, witness or surveillance point.` })

    lastSystem = system
    lastSubsystem = subsystem
    lastTag = tag
    lastDesc = description

    if (!system || !tag || !check || !matched) continue
    rows.push({ row: rowNo, system, subsystem, tag, description, level: matched, check, notes: at(raw, 'notes'), itp })
  }

  if (rows.length === 0 && problems.length === 0) {
    problems.push({ row: headerAt + 1, column: '—', value: '', message: 'The header was found but there are no rows under it.' })
  }

  // ── The same check twice on the same tag ────────────────────────────
  //
  // Reported rather than silently collapsed. Two identical rows are
  // nearly always a copy-and-paste that went one row too far, and quietly
  // keeping one of them means the count on the screen never matches the
  // count in the sheet and nobody can work out why.
  const seen = new Map<string, number>()
  for (const r of rows) {
    const key = `${r.tag}\u0000${r.level}\u0000${r.check.toLowerCase()}`
    const first = seen.get(key)
    if (first !== undefined) {
      problems.push({ row: r.row, column: 'Check', value: r.check, message: `The same check at the same level on ${r.tag} is already on row ${first}.` })
    } else seen.set(key, r.row)
  }

  // ── One tag, two systems ────────────────────────────────────────────
  //
  // A tag belongs in one place. Two rows putting SUDB-01 under different
  // systems is a typo in one of them, and picking either would file the
  // equipment somewhere its owner will not look for it.
  const homeOf = new Map<string, { system: string; subsystem: string; row: number }>()
  for (const r of rows) {
    const home = homeOf.get(r.tag)
    if (!home) { homeOf.set(r.tag, { system: r.system, subsystem: r.subsystem, row: r.row }); continue }
    if (home.system !== r.system) {
      problems.push({ row: r.row, column: 'System', value: r.system, message: `${r.tag} is under "${home.system}" on row ${home.row} and "${r.system}" here.` })
    } else if (home.subsystem !== r.subsystem && r.subsystem && home.subsystem) {
      problems.push({ row: r.row, column: 'Subsystem', value: r.subsystem, message: `${r.tag} is under "${home.subsystem}" on row ${home.row} and "${r.subsystem}" here.` })
    }
  }

  const systems = [...new Set(rows.map((r) => r.system))]
  const subsystemKeys = new Map<string, { system: string; name: string }>()
  for (const r of rows) {
    if (!r.subsystem) continue
    subsystemKeys.set(`${r.system}\u0000${r.subsystem}`, { system: r.system, name: r.subsystem })
  }
  const tags = [...homeOf.entries()].map(([tag, home]) => ({
    tag,
    description: rows.find((r) => r.tag === tag && r.description)?.description ?? '',
    system: home.system,
    subsystem: home.subsystem,
  }))
  const checks = rows.map((r) => ({ tag: r.tag, level: r.level, item: r.check, notes: r.notes, itp: r.itp }))

  return {
    rows,
    systems,
    subsystems: [...subsystemKeys.values()],
    tags,
    checks,
    problems,
    columns: labelColumns(grid[headerAt] ?? [], columns),
  }
}

/** Which spreadsheet column each field was read from, for the preview. */
function labelColumns(header: unknown[], columns: Record<string, number | null>): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const [field, i] of Object.entries(columns)) {
    out[field] = i === null || i === undefined ? null : norm(header[i]) || `Column ${i + 1}`
  }
  return out
}

/** Read the first worksheet of an .xlsx into a grid, then plan from it. */
export async function planFromWorkbook(buffer: ArrayBuffer): Promise<JobPlan> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.read(Readable.from(Buffer.from(buffer)))
  const sheet = wb.worksheets[0]
  if (!sheet) {
    return {
      rows: [], systems: [], subsystems: [], tags: [], checks: [], columns: {},
      problems: [{ row: 0, column: '—', value: '', message: 'That file has no sheets in it.' }],
    }
  }
  const grid: unknown[][] = []
  sheet.eachRow({ includeEmpty: true }, (row, n) => {
    const cells: unknown[] = []
    row.eachCell({ includeEmpty: true }, (cell, c) => { cells[c - 1] = cell.value })
    grid[n - 1] = cells
  })
  return planFromRows(grid)
}
