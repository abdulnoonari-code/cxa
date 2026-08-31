// The checklist round trip.
//
// This is the import he has asked about most, and it was the weakest of the
// four: it could read a level and an item and nothing else, it had no way to
// update an existing check, and a bad row was skipped in silence.
//
// Brought up to the same standard as the roles, gate-rule and equipment
// importers: a stable id per row so a re-import updates rather than
// duplicates, a Remove column, row-level validation that refuses the whole
// file rather than applying half of it, and — new here — a Tag or System
// column, so a check can belong to a system rather than only to a piece of
// equipment.

import ExcelJS from 'exceljs'
import { Readable } from 'stream'
import { LEVELS, STATUSES } from '@/lib/checklist'
import { INSPECTION_TYPES } from '@/lib/inspection'

const ID_ALIASES = ['cxa id', 'cxa_id', 'id', 'check id']
const LEVEL_ALIASES = ['level', 'levels', 'stage', 'phase', 'cx level', 'commissioning level', 'test level', 'lvl', 'step']
const ITEM_ALIASES = [
  'item',
  'item to check',
  'items',
  'description',
  'check',
  'checks',
  'checkpoint',
  'activity',
  'task',
  'test',
  'test description',
  'inspection',
  'requirement',
  'work',
  'scope',
  'verification',
  'point',
  's/n description',
]
const SUBJECT_ALIASES = [
  'tag',
  'tag no',
  'tag id',
  'tag number',
  'equipment',
  'equipment tag',
  'equipment no',
  'asset',
  'asset id',
  'system',
  'system id',
  'subsystem',
  'applies to',
  'kks',
  // What our own export writes out, in the spellings Excel leaves it in.
  'tag / system',
  'tag/system',
  'tag or system',
  'equipment / system',
  'equipment/system',
]
const STATUS_ALIASES = ['status', 'result', 'outcome', 'pass/fail', 'p/f']
const NOTES_ALIASES = ['notes', 'note', 'comment', 'comments', 'remark', 'remarks', 'observation', 'detail', 'details', 'signature']
const ITP_ALIASES = ['itp', 'itp type', 'inspection type', 'hold point', 'h/w/s', 'point type']
const REMOVE_ALIASES = ['remove', 'delete', 'drop']

const TRUTHY = new Set(['y', 'yes', 'true', '1', 'x', '✓', '✔'])

function norm(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && value !== null && 'text' in value) {
    return String((value as { text: unknown }).text ?? '').trim()
  }
  if (typeof value === 'object' && value !== null && 'result' in value) {
    return String((value as { result: unknown }).result ?? '').trim()
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).trim()
}

function headerKey(value: unknown): string {
  return norm(value).toLowerCase().replace(/\s+/g, ' ').replace(/[.:]+$/, '')
}

// "L2", "L2 - IV", "Level 2", "Installation Verification" should all land on
// the same level. Anything unrecognised is reported, never guessed.
export function matchLevel(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  const exact = LEVELS.find((l) => l.value.toLowerCase() === v || l.label.toLowerCase() === v)
  if (exact) return exact.value
  const short = v.match(/^l\s*([1-5])/)
  if (short) {
    const found = LEVELS.find((l) => l.value.startsWith(`L${short[1]}_`))
    if (found) return found.value
  }
  const byLabel = LEVELS.find((l) => l.label.toLowerCase().includes(v) && v.length >= 3)
  return byLabel ? byLabel.value : null
}

export function matchStatus(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  if (!v) return 'pending'
  const exact = STATUSES.find((s) => s.value.toLowerCase() === v || s.label.toLowerCase() === v)
  if (exact) return exact.value
  if (['p', 'ok', 'accept', 'accepted', 'satisfactory', 'complete', 'done'].includes(v)) return 'pass'
  if (['f', 'failed', 'reject', 'rejected', 'unsatisfactory'].includes(v)) return 'fail'
  if (['n/a', 'na', 'not applicable'].includes(v)) return 'na'
  if (['open', 'outstanding', 'tbc', 'to do', 'not started'].includes(v)) return 'pending'
  return null
}

export function matchInspection(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  if (!v) return 'surveillance'
  const exact = INSPECTION_TYPES.find((t) => t.value === v || t.label.toLowerCase() === v || t.code.toLowerCase() === v)
  if (exact) return exact.value
  if (v.startsWith('hold') || v === 'h') return 'hold'
  if (v.startsWith('witness') || v === 'w') return 'witness'
  if (v.startsWith('review') || v === 'r') return 'review'
  if (v.startsWith('surv') || v === 's') return 'surveillance'
  return null
}

export type ParsedCheck = {
  row: number
  id: string | null
  subject: string | null
  level: string
  item: string
  status: string
  notes: string | null
  inspection_type: string
  remove: boolean
}

export type CheckProblem = { row: number; column: string; value: string; message: string }

export type ChecklistParseResult = {
  rows: ParsedCheck[]
  errors: CheckProblem[]
  warnings: CheckProblem[]
  sheetName: string | null
  headerRow: number | null
  headingsSeen: string[]
  detectedColumns: string[]
  /** the level taken from the tab name, when no level column was found */
  levelFromSheet: string | null
}

type Mapping = {
  headerRow: number
  id: number | null
  subject: number | null
  level: number | null
  item: number
  status: number | null
  notes: number | null
  itp: number | null
  remove: number | null
}

// Tabs that explain the format rather than carry data. Our own template and
// export both ship one, and a guide sheet is a trap for a header finder: its
// first column lists the column names — "CXA ID", "Level", "Item to check" —
// one per row, so a row of it reads exactly like a header.
const GUIDE_SHEETS = [
  'how to edit this',
  'how to fill this in',
  'levels',
  'itp types',
  'guide',
  'instructions',
  'help',
  'notes',
  'legend',
  'lists',
  'dropdowns',
  'reference',
  'read me',
  'readme',
]

function isGuideSheet(name: string): boolean {
  return GUIDE_SHEETS.includes(name.trim().toLowerCase())
}

function findMapping(sheet: ExcelJS.Worksheet): { mapping: Mapping | null; headingsSeen: string[] } {
  const headingsSeen: string[] = []
  if (isGuideSheet(sheet.name)) return { mapping: null, headingsSeen }

  const limit = Math.min(sheet.rowCount, 40)

  // How wide the sheet is. A one-column sheet can only ever have a one-column
  // header, so the two-column rule below has to give way for it.
  let widest = 0
  for (let r = 1; r <= limit; r++) {
    let count = 0
    sheet.getRow(r).eachCell({ includeEmpty: false }, () => {
      count += 1
    })
    if (count > widest) widest = count
  }

  let best: { mapping: Mapping; score: number } | null = null

  for (let r = 1; r <= limit; r++) {
    const cells: { key: string; column: number }[] = []
    sheet.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      const k = headerKey(cell.value)
      if (k) cells.push({ key: k, column: col })
    })
    if (cells.length === 0) continue
    for (const c of cells) if (!headingsSeen.includes(c.key)) headingsSeen.push(c.key)

    const find = (aliases: string[]) => cells.find((c) => aliases.includes(c.key))?.column ?? null

    const item = find(ITEM_ALIASES)
    if (item === null) continue

    const subject = find(SUBJECT_ALIASES)
    const mapping: Mapping = {
      headerRow: r,
      id: find(ID_ALIASES),
      // A "description" heading claimed as the item must not also be the
      // subject; the subject column has to be a different one.
      subject: subject === item ? null : subject,
      level: find(LEVEL_ALIASES),
      item,
      status: find(STATUS_ALIASES),
      notes: find(NOTES_ALIASES),
      itp: find(ITP_ALIASES),
      remove: find(REMOVE_ALIASES),
    }

    // How much of a header row this actually looks like. One recognised word
    // is not enough on a sheet that is wider than one column — it is how a
    // guide tab, or a title block that happens to say "Test", gets mistaken
    // for the table.
    const score = [mapping.id, mapping.subject, mapping.level, mapping.status, mapping.notes, mapping.itp, mapping.remove]
      .filter((c) => c !== null).length + 1
    if (score < 2 && widest > 1) continue

    // The best-matching row wins, not the first — a real ITP often has a
    // title block above the table with a word or two in common with it.
    if (!best || score > best.score) best = { mapping, score }
  }

  return { mapping: best?.mapping ?? null, headingsSeen }
}

export async function parseChecklistWorkbook(
  buffer: ArrayBuffer,
  options: { defaultLevel?: string; fileName?: string } = {}
): Promise<ChecklistParseResult> {
  const workbook = new ExcelJS.Workbook()
  const name = options.fileName ?? ''

  if (name.toLowerCase().endsWith('.csv')) {
    await workbook.csv.read(Readable.from([Buffer.from(buffer).toString('utf8')]))
  } else {
    await workbook.xlsx.load(buffer)
  }

  const rows: ParsedCheck[] = []
  const errors: CheckProblem[] = []
  const warnings: CheckProblem[] = []
  let allHeadings: string[] = []
  let firstSheet: string | null = null
  let firstHeaderRow: number | null = null
  let detected: string[] = []
  let levelFromSheet: string | null = null

  // Multi-tab workbooks are the norm: one tab per level, or one per system.
  for (const sheet of workbook.worksheets) {
    const { mapping, headingsSeen } = findMapping(sheet)
    allHeadings = [...allHeadings, ...headingsSeen.filter((h) => !allHeadings.includes(h))]
    if (!mapping) continue

    // A tab called "L2" or "Installation Verification" tells us the level for
    // every row on it, when the sheet has no level column of its own.
    const sheetLevel = matchLevel(sheet.name)
    if (mapping.level === null && sheetLevel) levelFromSheet = sheetLevel

    if (firstSheet === null) {
      firstSheet = sheet.name
      firstHeaderRow = mapping.headerRow
      detected = ['Item']
      const add = (col: number | null, label: string) => {
        if (col !== null) detected.push(label)
      }
      add(mapping.id, 'CXA ID')
      add(mapping.subject, 'Tag / System')
      add(mapping.level, 'Level')
      add(mapping.status, 'Status')
      add(mapping.notes, 'Notes')
      add(mapping.itp, 'ITP type')
      if (mapping.level === null && sheetLevel) detected.push('Level (from the tab name)')
    }

    for (let r = mapping.headerRow + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)
      const at = (col: number | null) => (col === null ? '' : norm(row.getCell(col).value))

      const item = at(mapping.item)
      if (!item) continue

      // Level: the column, then the tab name, then whatever was chosen in the
      // dropdown. Reported, never guessed.
      const rawLevel = at(mapping.level)
      const level = (rawLevel ? matchLevel(rawLevel) : null) ?? sheetLevel ?? options.defaultLevel ?? null
      if (!level) {
        errors.push({
          row: r,
          column: 'Level',
          value: rawLevel,
          message: rawLevel
            ? `Not one of the commissioning levels (${LEVELS.map((l) => l.label).join('; ')}).`
            : 'No level on this row, none in the tab name, and none chosen below.',
        })
        continue
      }

      const rawStatus = at(mapping.status)
      const status = matchStatus(rawStatus)
      if (status === null) {
        errors.push({
          row: r,
          column: 'Status',
          value: rawStatus,
          message: `Not a result. Use ${STATUSES.map((s) => s.label).join(', ')}, or leave blank for Pending.`,
        })
        continue
      }

      const rawItp = at(mapping.itp)
      const inspection = matchInspection(rawItp)
      if (inspection === null) {
        warnings.push({
          row: r,
          column: 'ITP type',
          value: rawItp,
          message: 'Not recognised, so treated as Surveillance. Use Hold, Witness, Review or Surveillance.',
        })
      }

      rows.push({
        row: r,
        id: at(mapping.id) || null,
        subject: at(mapping.subject) || null,
        level,
        item,
        status,
        notes: at(mapping.notes) || null,
        inspection_type: inspection ?? 'surveillance',
        remove: TRUTHY.has(at(mapping.remove).toLowerCase()),
      })
    }
  }

  return {
    rows,
    errors,
    warnings,
    sheetName: firstSheet,
    headerRow: firstHeaderRow,
    headingsSeen: allHeadings,
    detectedColumns: detected,
    levelFromSheet,
  }
}
