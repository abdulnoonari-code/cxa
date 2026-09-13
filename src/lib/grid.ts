// The data grid — the equipment list as a spreadsheet, as a pure model.
//
// ── Why this is its own file ─────────────────────────────────────────────
//
// An engineer who maintains an equipment list maintains it in Excel. The grid
// has to be close enough to that muscle memory that nobody thinks about it,
// and it has to stay honest about what the application will accept. Both of
// those are arithmetic and string handling, not pixels, so they live here and
// are checked against hand-worked cases.
//
// The screen on top of this file draws rows and handles a pointer. It decides
// nothing. That split is why a paste of a thousand rows can be trusted.
//
// ── THE RULE THIS FILE EXISTS TO ENFORCE ─────────────────────────────────
//
// A BAD CELL IS MARKED AND REFUSED, NEVER COERCED.
//
// The importers in this application are already all-or-nothing and report by
// row number, and they are that way because the alternative is worse in a
// specific direction: a rating typed as "400 kva" quietly becoming 400, a
// blank becoming zero, a voltage of "4l5" becoming 415. Every one of those
// produces a record that looks right and is wrong, and nothing afterwards ever
// shows that it was guessed. So this file parses strictly, says which row and
// which column, and leaves the decision to a person.

import { ITEMS, DIRS, type ItemKind, type Dir, type LayoutItem } from '@/lib/layout'

// ════════════════════════════════════════════════════════════════════════
// COLUMNS
// ════════════════════════════════════════════════════════════════════════

export type ColumnType = 'text' | 'number' | 'enum'

export type Column = {
  key: string
  label: string
  type: ColumnType
  /** Always shown. Never assumed — a number with no unit is a trap. */
  unit?: string
  /** Shown under the label where the quantity is not self-evident. */
  hint?: string
  width: number
  /** A computed column is read-only. It is derived, and derived is never typed. */
  editable: boolean
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  integer?: boolean
}

export const KIND_OPTIONS = (Object.keys(ITEMS) as ItemKind[]).map((k) => ({
  // The option carries its meaning, not a code: "Load bank 1 MW — 6.1 × 2.5 m",
  // never "lb". Somebody choosing from a list should not have to know the
  // vocabulary of the database to use it.
  value: k,
  label: `${ITEMS[k].label} — ${ITEMS[k].w} × ${ITEMS[k].h} m`,
}))

export const DIR_OPTIONS = DIRS.map((d) => ({
  value: d,
  label: { N: 'N — north', E: 'E — east', S: 'S — south', W: 'W — west' }[d],
}))

/**
 * The planner's columns.
 *
 * The first six are the record. The last three are computed from the drawing
 * and are deliberately not editable: a cable's loading is the answer to a
 * calculation, and a spreadsheet cell you can type over is a spreadsheet cell
 * somebody will type over.
 */
export const PLANNER_COLUMNS: Column[] = [
  { key: 'label', label: 'Tag', type: 'text', width: 186, editable: true, hint: 'as it appears on the equipment register' },
  { key: 'kind', label: 'Type', type: 'enum', width: 168, editable: true, options: KIND_OPTIONS },
  { key: 'kva', label: 'Rating', type: 'number', unit: 'kVA', width: 104, editable: true, min: 0, max: 100000 },
  { key: 'pf', label: 'Power factor', type: 'number', width: 122, editable: true, min: 0, max: 1, hint: '0.8 is the industrial convention' },
  { key: 'volts', label: 'Voltage', type: 'number', unit: 'V', width: 100, editable: true, min: 0, max: 36000, hint: 'line to line' },
  { key: 'dir', label: 'Faces', type: 'enum', width: 92, editable: true, options: DIR_OPTIONS, hint: 'discharge direction' },
  { key: 'x', label: 'X', type: 'number', unit: 'm', width: 86, editable: true, min: 0, max: 500 },
  { key: 'y', label: 'Y', type: 'number', unit: 'm', width: 86, editable: true, min: 0, max: 500 },
  { key: 'supply', label: 'Fed from', type: 'text', width: 176, editable: false },
  { key: 'carried', label: 'Carries', type: 'number', unit: 'kVA', width: 104, editable: false },
  { key: 'feeder', label: 'Feeder', type: 'text', width: 150, editable: false },
]

export function columnByKey(columns: Column[], key: string): Column | undefined {
  return columns.find((c) => c.key === key)
}

/** A grid row is the item plus the figures the drawing worked out for it. */
export type GridRow = {
  id: number
  label: string
  kind: ItemKind
  kva: number
  pf: number
  volts: number
  dir: Dir
  x: number
  y: number
  supply: string
  carried: number
  feeder: string
  /** For colouring the row without the grid having to know about bands. */
  band?: string
}

// ════════════════════════════════════════════════════════════════════════
// CLIPBOARD
// ════════════════════════════════════════════════════════════════════════

/**
 * Excel's clipboard, parsed.
 *
 * Tab-separated, newline-terminated — until a field contains a tab or a
 * newline, at which point Excel wraps it in double quotes and doubles any
 * quote inside it. A naive `split('\t')` on that produces garbage silently,
 * and the failure looks like the user's data was wrong.
 *
 * \r\n and \r are both accepted because the line ending depends on which
 * application the text came from, not on what the user did.
 */
export function parseClipboard(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0
  const endField = () => { row.push(field); field = '' }
  const endRow = () => { endField(); rows.push(row); row = [] }

  while (i < text.length) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        quoted = false; i += 1; continue
      }
      field += ch; i += 1; continue
    }
    if (ch === '"' && field === '') { quoted = true; i += 1; continue }
    if (ch === '\t') { endField(); i += 1; continue }
    if (ch === '\r') { if (text[i + 1] === '\n') i += 1; endRow(); i += 1; continue }
    if (ch === '\n') { endRow(); i += 1; continue }
    field += ch; i += 1
  }
  // Only push a trailing row if there is something in it. A copied block ends
  // with a newline, and an empty final row would paste a blank over a record.
  if (field !== '' || row.length) endRow()
  return rows
}

/** The other direction, for copying a selection back out to Excel. */
export function toClipboard(block: string[][]): string {
  const cell = (v: string) =>
    /[\t\n\r"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v
  return block.map((r) => r.map(cell).join('\t')).join('\n')
}

// ════════════════════════════════════════════════════════════════════════
// FILL
// ════════════════════════════════════════════════════════════════════════

/**
 * Continue a series, the way a spreadsheet does.
 *
 * The rules are Excel's, because they are the ones in the engineer's fingers:
 *
 *   · two or more numbers  → arithmetic progression at the common difference
 *   · one number           → repeated, NOT incremented
 *   · text ending in digits → the digits increment, keeping the zero padding,
 *                             so PDU-A09 goes to PDU-A10 and not PDU-A010
 *   · anything else        → the seed repeats in order
 *
 * The single-number rule is the one worth stating: dragging one "400" down a
 * rating column means "all of these are 400", and a tool that turned it into
 * 401, 402, 403 would be actively harmful.
 */
export function fillSeries(seed: string[], count: number): string[] {
  const out: string[] = []
  if (seed.length === 0 || count <= 0) return out

  const nums = seed.map((s) => (s.trim() === '' ? NaN : Number(s.trim())))
  const allNumeric = nums.every((n) => isFinite(n))

  if (allNumeric && seed.length >= 2) {
    // The common difference of the seed. Where the seed is not a straight
    // line, the last step is used — which is what a spreadsheet does too.
    const step = nums[nums.length - 1] - nums[nums.length - 2]
    let v = nums[nums.length - 1]
    for (let i = 0; i < count; i++) { v += step; out.push(trimNumber(v)) }
    return out
  }

  if (allNumeric) {
    for (let i = 0; i < count; i++) out.push(seed[0])
    return out
  }

  // Text with a trailing number: increment it and keep the padding.
  if (seed.length === 1) {
    const m = /^(.*?)(\d+)(\D*)$/.exec(seed[0])
    if (m) {
      const [, head, digits, tail] = m
      const width = digits.length
      let n = parseInt(digits, 10)
      for (let i = 0; i < count; i++) {
        n += 1
        out.push(head + String(n).padStart(width, '0') + tail)
      }
      return out
    }
  }

  for (let i = 0; i < count; i++) out.push(seed[i % seed.length])
  return out
}

/** 0.30000000000000004 is not a rating anybody typed. */
function trimNumber(v: number): string {
  return String(Math.round(v * 1e9) / 1e9)
}

// ════════════════════════════════════════════════════════════════════════
// VALIDATION
// ════════════════════════════════════════════════════════════════════════

export type CellError = {
  /** Index into the rows as the grid is currently showing them. */
  row: number
  col: string
  /** What was actually there, so the message can quote it back. */
  raw: string
  reason: string
}

export type Coerced =
  | { ok: true; value: string | number }
  | { ok: false; reason: string }

/**
 * One cell, parsed strictly.
 *
 * Everything refused here is refused because accepting it would produce a
 * record that reads as though somebody meant it.
 */
export function coerce(col: Column, raw: string): Coerced {
  const v = raw.trim()

  if (col.type === 'text') {
    if (col.key === 'label' && v === '') return { ok: false, reason: 'A tag cannot be blank' }
    return { ok: true, value: v }
  }

  if (col.type === 'enum') {
    const opts = col.options ?? []
    // Accept the stored value, the whole label, or the part of the label
    // before the em dash — so a column copied out of this grid pastes back in.
    const lower = v.toLowerCase()
    const hit = opts.find((o) =>
      o.value.toLowerCase() === lower ||
      o.label.toLowerCase() === lower ||
      o.label.split('—')[0].trim().toLowerCase() === lower)
    if (!hit) {
      return { ok: false, reason: `Not one of: ${opts.map((o) => o.label.split('—')[0].trim()).join(', ')}` }
    }
    return { ok: true, value: hit.value }
  }

  // number
  if (v === '') return { ok: false, reason: 'Blank. Type 0 if that is what you mean' }
  // Thousands separators and a stray unit are the two things people really
  // paste, and both are unambiguous, so both are accepted. Anything else is
  // not — "4l5" is a typo for 415 and guessing that is how a voltage ends up
  // wrong on a test sheet.
  const cleaned = v.replace(/[\s,]/g, '').replace(/(kva|kv|kw|va|w|v|m|%)$/i, '')
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return { ok: false, reason: `"${raw}" is not a number` }
  const n = Number(cleaned)
  if (!isFinite(n)) return { ok: false, reason: `"${raw}" is not a number` }
  if (col.integer && !Number.isInteger(n)) return { ok: false, reason: 'Must be a whole number' }
  if (col.min !== undefined && n < col.min) return { ok: false, reason: `Below ${col.min}${col.unit ? ' ' + col.unit : ''}` }
  if (col.max !== undefined && n > col.max) return { ok: false, reason: `Above ${col.max}${col.unit ? ' ' + col.unit : ''}` }
  return { ok: true, value: n }
}

/**
 * Tags that appear more than once.
 *
 * Normalised the same way the punch list's duplicate rule normalises its text:
 * lowercase, whitespace collapsed, trimmed. A register with two PDU-A11 in it
 * is a register where somebody will record a test against the wrong one.
 */
export function duplicateTags(rows: { label: string }[]): Map<string, number[]> {
  const byKey = new Map<string, number[]>()
  rows.forEach((r, i) => {
    const k = r.label.trim().replace(/\s+/g, ' ').toLowerCase()
    if (k === '') return
    const list = byKey.get(k) ?? []
    list.push(i)
    byKey.set(k, list)
  })
  const dupes = new Map<string, number[]>()
  for (const [k, list] of byKey) if (list.length > 1) dupes.set(k, list)
  return dupes
}

// ════════════════════════════════════════════════════════════════════════
// SELECTION
// ════════════════════════════════════════════════════════════════════════

export type Cell = { row: number; col: number }
export type Rect = { top: number; left: number; bottom: number; right: number }

/** Two corners in any order become a rectangle. */
export function normRect(a: Cell, b: Cell): Rect {
  return {
    top: Math.min(a.row, b.row),
    bottom: Math.max(a.row, b.row),
    left: Math.min(a.col, b.col),
    right: Math.max(a.col, b.col),
  }
}

export function inRect(r: Rect, row: number, col: number): boolean {
  return row >= r.top && row <= r.bottom && col >= r.left && col <= r.right
}

export function rectSize(r: Rect): { rows: number; cols: number; cells: number } {
  const rows = r.bottom - r.top + 1
  const cols = r.right - r.left + 1
  return { rows, cols, cells: rows * cols }
}

/**
 * The status-bar figures for a selection.
 *
 * Count, sum and mean over the numeric cells only — text cells are counted as
 * selected and excluded from the arithmetic, which is what a spreadsheet does
 * and what stops a stray tag column turning a sum into nonsense.
 */
export function selectionStats(values: (string | number)[]): {
  cells: number; numbers: number; sum: number; mean: number | null; min: number | null; max: number | null
} {
  const nums = values.filter((v): v is number => typeof v === 'number' && isFinite(v))
  if (nums.length === 0)
    return { cells: values.length, numbers: 0, sum: 0, mean: null, min: null, max: null }
  const sum = nums.reduce((t, n) => t + n, 0)
  return {
    cells: values.length,
    numbers: nums.length,
    sum,
    mean: sum / nums.length,
    min: Math.min(...nums),
    max: Math.max(...nums),
  }
}

// ════════════════════════════════════════════════════════════════════════
// PASTE
// ════════════════════════════════════════════════════════════════════════

export type PasteResult = {
  /** What would change, cell by cell, if this were committed. */
  changes: { row: number; col: string; value: string | number }[]
  errors: CellError[]
  /** Rows the block runs past the end of the grid — new items to create. */
  overflowRows: number
  /** Columns it runs past. Reported rather than silently truncated. */
  overflowCols: number
  /** Cells that landed on a computed column and were skipped. */
  readOnlySkipped: number
}

/**
 * Work out what a paste would do, without doing it.
 *
 * Returned rather than applied so the interface can show "412 cells, 3
 * problems" and let somebody look before committing. A paste is the one action
 * in this grid that can change a thousand records at once, and it is the one
 * action nobody reads carefully.
 */
export function planPaste(
  columns: Column[],
  rowCount: number,
  at: Cell,
  block: string[][]
): PasteResult {
  const changes: PasteResult['changes'] = []
  const errors: CellError[] = []
  let overflowRows = 0
  let overflowCols = 0
  let readOnlySkipped = 0

  block.forEach((line, dr) => {
    const row = at.row + dr
    if (row >= rowCount) { overflowRows += 1; return }
    line.forEach((raw, dc) => {
      const ci = at.col + dc
      if (ci >= columns.length) { overflowCols += 1; return }
      const col = columns[ci]
      if (!col.editable) { readOnlySkipped += 1; return }
      const got = coerce(col, raw)
      if (got.ok) changes.push({ row, col: col.key, value: got.value })
      else errors.push({ row, col: col.key, raw, reason: got.reason })
    })
  })

  return { changes, errors, overflowRows, overflowCols, readOnlySkipped }
}

/** One sentence describing a planned paste, for the confirmation strip. */
export function describePaste(r: PasteResult): string {
  const parts: string[] = []
  parts.push(`${r.changes.length} cell${r.changes.length === 1 ? '' : 's'} will change`)
  if (r.errors.length) parts.push(`${r.errors.length} refused`)
  if (r.readOnlySkipped) parts.push(`${r.readOnlySkipped} landed on a calculated column and were ignored`)
  if (r.overflowRows) parts.push(`${r.overflowRows} row${r.overflowRows === 1 ? '' : 's'} past the end of the list`)
  if (r.overflowCols) parts.push(`${r.overflowCols} cell${r.overflowCols === 1 ? '' : 's'} past the last column`)
  return parts.join(' · ')
}

// ════════════════════════════════════════════════════════════════════════
// FILTER AND SORT
// ════════════════════════════════════════════════════════════════════════

export type Filter = {
  /** Free text, matched against the tag and the type. */
  q: string
  kinds: ItemKind[]
  /** Only items whose feeder is in these bands. Empty means all. */
  bands: string[]
  unsuppliedOnly: boolean
}

export const EMPTY_FILTER: Filter = { q: '', kinds: [], bands: [], unsuppliedOnly: false }

export function filterRows(rows: GridRow[], f: Filter): GridRow[] {
  const q = f.q.trim().toLowerCase()
  return rows.filter((r) => {
    if (q) {
      const hay = `${r.label} ${ITEMS[r.kind].label} ${r.supply}`.toLowerCase()
      // Every word has to appear somewhere, in any order. "lb 500" finds a
      // 500 kW load bank; requiring the exact phrase would not.
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false
    }
    if (f.kinds.length && !f.kinds.includes(r.kind)) return false
    if (f.bands.length && !(r.band && f.bands.includes(r.band))) return false
    if (f.unsuppliedOnly && r.supply !== '') return false
    return true
  })
}

export function isFiltering(f: Filter): boolean {
  return f.q.trim() !== '' || f.kinds.length > 0 || f.bands.length > 0 || f.unsuppliedOnly
}

export type SortDir = 'asc' | 'desc'

/**
 * Sorted by one column, stably, with numbers compared as numbers.
 *
 * Tags sort with a natural comparison, so PDU-A2 comes before PDU-A10. A
 * lexicographic sort putting A10 before A2 makes a register of a thousand tags
 * look shuffled, and people stop trusting the sort.
 */
export function sortRows(rows: GridRow[], key: string, dir: SortDir): GridRow[] {
  const sign = dir === 'asc' ? 1 : -1
  const val = (r: GridRow) => (r as unknown as Record<string, unknown>)[key]
  return [...rows]
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const av = val(a.r), bv = val(b.r)
      let c = 0
      if (typeof av === 'number' && typeof bv === 'number') c = av - bv
      else c = naturalCompare(String(av ?? ''), String(bv ?? ''))
      return c !== 0 ? c * sign : a.i - b.i
    })
    .map((x) => x.r)
}

/** "PDU-A2" before "PDU-A10". Digit runs compare as numbers. */
export function naturalCompare(a: string, b: string): number {
  const ax = a.match(/\d+|\D+/g) ?? []
  const bx = b.match(/\d+|\D+/g) ?? []
  for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
    const x = ax[i], y = bx[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = /^\d/.test(x), ny = /^\d/.test(y)
    if (nx && ny) {
      const d = parseInt(x, 10) - parseInt(y, 10)
      if (d !== 0) return d
    } else {
      const d = x.localeCompare(y, 'en', { sensitivity: 'base' })
      if (d !== 0) return d
    }
  }
  return 0
}

// ════════════════════════════════════════════════════════════════════════
// VIRTUALISATION
// ════════════════════════════════════════════════════════════════════════

export type Window = { start: number; end: number; offsetTop: number; totalHeight: number }

/**
 * Which rows to actually put in the DOM.
 *
 * Row height is fixed so the scrollbar tells the truth at five thousand rows —
 * a variable row height means the thumb size is a guess and the scroll
 * position jumps as content loads, which is the thing that makes a big grid
 * feel broken.
 *
 * `overscan` renders a few rows beyond the viewport in each direction so a
 * fast scroll does not show a band of nothing.
 */
export function windowOf(
  scrollTop: number, viewportH: number, rowH: number, total: number, overscan = 6
): Window {
  const safeRow = Math.max(1, rowH)
  const first = Math.floor(Math.max(0, scrollTop) / safeRow)
  const visible = Math.ceil(Math.max(0, viewportH) / safeRow)
  const start = Math.max(0, first - overscan)
  const end = Math.min(total, first + visible + overscan)
  return {
    start,
    end: Math.max(start, end),
    offsetTop: start * safeRow,
    totalHeight: total * safeRow,
  }
}

// ════════════════════════════════════════════════════════════════════════
// TURNING ITEMS INTO ROWS AND BACK
// ════════════════════════════════════════════════════════════════════════

/** Apply one edited cell to an item. Unknown or computed keys are ignored. */
export function applyCell(item: LayoutItem, key: string, value: string | number): LayoutItem {
  switch (key) {
    case 'label': return { ...item, label: String(value) }
    case 'kind': return { ...item, kind: value as ItemKind }
    case 'kva': return { ...item, kva: Number(value) }
    case 'pf': return { ...item, pf: Number(value) }
    case 'volts': return { ...item, volts: Number(value) }
    case 'dir': return { ...item, dir: value as Dir }
    case 'x': return { ...item, x: Number(value) }
    case 'y': return { ...item, y: Number(value) }
    default: return item
  }
}

/**
 * One value edited across many selected items.
 *
 * The bulk edit. Returns the changed items rather than mutating, and returns
 * how many actually changed so the interface can say "3 of 12 were already
 * 400 kVA" instead of claiming twelve edits.
 */
export function applyToMany(
  items: LayoutItem[], ids: number[], key: string, value: string | number
): { items: LayoutItem[]; changed: number } {
  const set = new Set(ids)
  let changed = 0
  const next = items.map((it) => {
    if (!set.has(it.id)) return it
    const after = applyCell(it, key, value)
    const before = (it as unknown as Record<string, unknown>)[key]
    const now = (after as unknown as Record<string, unknown>)[key]
    if (before !== now) changed += 1
    return after
  })
  return { items: next, changed }
}

/**
 * Where a value is the same across every selected item, and where it is not.
 *
 * The inspector needs this to show "— mixed —" rather than the first item's
 * value, because showing the first one makes an editor that silently flattens
 * eleven other records the moment somebody touches it.
 */
export function commonValue(
  items: LayoutItem[], ids: number[], key: string
): { mixed: boolean; value: unknown } {
  const set = new Set(ids)
  const vals = items.filter((i) => set.has(i.id))
    .map((i) => (i as unknown as Record<string, unknown>)[key])
  if (vals.length === 0) return { mixed: false, value: undefined }
  const first = vals[0]
  return { mixed: vals.some((v) => v !== first), value: first }
}
