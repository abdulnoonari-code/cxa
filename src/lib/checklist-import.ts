import ExcelJS from 'exceljs'
import { LEVELS } from '@/lib/checklist'

export type ParsedRow = { level: string; item: string; notes: string | null }

export type ParseResult = {
  rows: ParsedRow[]
  skipped: number
  /** Column headings found in the file, so the screen can say what it read. */
  headings: string[]
  usedDefaultLevel: boolean
}

// Real commissioning sheets don't all use the same words. These are the
// headings seen most often for each of the three things we need; matching is
// case-insensitive and ignores punctuation, so "Item to Check", "ITEM_TO_CHECK"
// and "item to check" all land on the same column.
const LEVEL_ALIASES = [
  'level', 'levels', 'stage', 'phase', 'cx level', 'commissioning level', 'test level', 'lvl', 'step',
]
const ITEM_ALIASES = [
  'item', 'item to check', 'items', 'description', 'check', 'checks', 'checkpoint', 'check point',
  'activity', 'task', 'test', 'test description', 'inspection', 'requirement', 'work', 'scope',
  'check description', 'verification', 'point',
]
const NOTES_ALIASES = [
  'notes', 'note', 'comment', 'comments', 'remark', 'remarks', 'observation', 'observations', 'detail', 'details',
]

function normalizeHeading(text: string): string {
  return text.trim().toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ')
}

export function findLevelValueByLabel(text: string): string | null {
  const normalized = text.trim().toLowerCase()
  if (!normalized) return null

  const byValue = LEVELS.find((l) => l.value.toLowerCase() === normalized)
  if (byValue) return byValue.value

  const byLabel = LEVELS.find(
    (l) => l.label.toLowerCase() === normalized || l.label.toLowerCase().startsWith(normalized)
  )
  if (byLabel) return byLabel.value

  const byCode = LEVELS.find((l) => l.value.toLowerCase().split('_')[0] === normalized)
  if (byCode) return byCode.value

  const byContains = LEVELS.find(
    (l) => l.label.toLowerCase().includes(normalized) || normalized.includes(l.value.toLowerCase().split('_')[0])
  )
  return byContains?.value ?? null
}

function cellText(row: ExcelJS.Row, col: number): string {
  const value = row.getCell(col).value
  if (value == null) return ''
  if (typeof value === 'object' && 'richText' in value) {
    return (value.richText as { text: string }[]).map((t) => t.text).join('').trim()
  }
  if (typeof value === 'object' && 'text' in value) {
    return String((value as { text: unknown }).text).trim()
  }
  if (typeof value === 'object' && 'result' in value) {
    return String((value as { result: unknown }).result ?? '').trim()
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).trim()
}

type Mapping = { headerRow: number; level: number | null; item: number | null; notes: number | null; headings: string[] }

// Look for the header wherever it happens to be. Company checklists usually
// carry a logo, a title and a revision block above the table, so the header is
// rarely on row 1.
function findMapping(sheet: ExcelJS.Worksheet): Mapping | null {
  const maxScan = Math.min(sheet.rowCount, 40)

  for (let rowNumber = 1; rowNumber <= maxScan; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const headings: string[] = []
    let level: number | null = null
    let item: number | null = null
    let notes: number | null = null

    const width = Math.min(row.cellCount || 0, 40)
    for (let col = 1; col <= width; col += 1) {
      const raw = cellText(row, col)
      if (!raw) continue
      headings.push(raw)
      const h = normalizeHeading(raw)
      if (level === null && LEVEL_ALIASES.includes(h)) level = col
      else if (item === null && ITEM_ALIASES.includes(h)) item = col
      else if (notes === null && NOTES_ALIASES.includes(h)) notes = col
    }

    // An "item" column is the one thing we can't do without; the level can be
    // supplied by the person doing the import instead.
    if (item !== null) return { headerRow: rowNumber, level, item, notes, headings }
  }

  return null
}

export async function parseChecklistWorkbook(
  buffer: ArrayBuffer,
  options: { defaultLevel?: string | null; fileName?: string } = {}
): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook()

  if (options.fileName?.toLowerCase().endsWith('.csv')) {
    const text = new TextDecoder().decode(buffer)
    const { Readable } = await import('node:stream')
    await workbook.csv.read(Readable.from([text]))
  } else {
    await workbook.xlsx.load(buffer)
  }

  const rows: ParsedRow[] = []
  let skipped = 0
  let headings: string[] = []
  let usedDefaultLevel = false

  // Some workbooks put each commissioning level on its own tab, so read them all.
  for (const sheet of workbook.worksheets) {
    const mapping = findMapping(sheet)
    if (!mapping || mapping.item === null) continue
    if (headings.length === 0) headings = mapping.headings

    // A tab named "L2 checklist" tells us the level even when no column does.
    const sheetLevel = findLevelValueByLabel(sheet.name)

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= mapping.headerRow) return

      const itemCell = cellText(row, mapping.item as number)
      if (!itemCell) return
      if (itemCell.toUpperCase().startsWith('EXAMPLE')) return

      const levelCell = mapping.level ? cellText(row, mapping.level) : ''
      const level =
        (levelCell ? findLevelValueByLabel(levelCell) : null) ??
        sheetLevel ??
        options.defaultLevel ??
        null

      if (!level) {
        skipped += 1
        return
      }
      if (!levelCell && !sheetLevel) usedDefaultLevel = true

      const notes = mapping.notes ? cellText(row, mapping.notes) : ''
      rows.push({ level, item: itemCell, notes: notes || null })
    })
  }

  // Nothing matched anywhere. Report whatever the first real row of the file
  // looks like, so the screen can tell the user which headings it actually saw
  // instead of just failing silently.
  if (rows.length === 0 && headings.length === 0) {
    const sheet = workbook.worksheets[0]
    if (sheet) {
      const maxScan = Math.min(sheet.rowCount, 20)
      for (let rowNumber = 1; rowNumber <= maxScan; rowNumber += 1) {
        const row = sheet.getRow(rowNumber)
        const cells: string[] = []
        const width = Math.min(row.cellCount || 0, 20)
        for (let col = 1; col <= width; col += 1) {
          const text = cellText(row, col)
          if (text) cells.push(text)
        }
        if (cells.length >= 2) {
          headings = cells
          break
        }
      }
    }
  }

  return { rows, skipped, headings, usedDefaultLevel }
}
