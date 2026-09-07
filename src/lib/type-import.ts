// Reading an equipment-type catalogue out of a spreadsheet.
//
// A type is a make and model; a tag is one of them installed somewhere.
// Forty identical breakers are forty tags and one type.
//
// The same rules as every other importer here:
//   · A value that can be checked and is wrong stops the import. A value
//     that cannot be checked is kept as written and reported.
//   · Nothing is half-done: if any row cannot be read, nothing is written.
//   · A blank cell means "I did not say", not "clear this".

import ExcelJS from 'exceljs'
import { CATEGORIES } from '@/app/equipment/styles'

// 'model' is here as well as in MODEL_ALIASES on purpose: plenty of
// catalogues have no code of their own and are keyed on the model number.
// The mapping below refuses to read one column as both.
const CODE_ALIASES = ['type code', 'type', 'type id', 'code', 'model code', 'model', 'catalogue', 'catalog', 'catalogue no', 'part number']
const NAME_ALIASES = ['type name', 'name', 'description', 'title', 'equipment type']
const CATEGORY_ALIASES = ['category', 'discipline', 'trade', 'class', 'equipment category']
const MANUFACTURER_ALIASES = ['manufacturer', 'maker', 'vendor', 'oem', 'supplier', 'make', 'brand']
const MODEL_ALIASES = ['model', 'model no', 'model number', 'type no']
const RATING_ALIASES = ['rating', 'ratings', 'spec', 'specification', 'duty', 'size', 'capacity']
const NOTE_ALIASES = ['notes', 'note', 'remark', 'remarks', 'comment']

export type TypeMapping = {
  headerRow: number
  code: number
  name: number | null
  category: number | null
  manufacturer: number | null
  model: number | null
  rating: number | null
  description: number | null
}

export type ParsedType = {
  row: number
  type_code: string
  name: string
  category: string | null
  manufacturer: string | null
  model: string | null
  rating: string | null
  description: string | null
}

export type TypeProblem = { row: number; column: string; value: string; message: string }

export type ParsedTypes = {
  sheetName: string | null
  headerRow: number | null
  detectedColumns: string[]
  headingsSeen: string[]
  rows: ParsedType[]
  warnings: TypeProblem[]
  error: string | null
}

function headerKey(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null
  const text =
    typeof value === 'object' && 'richText' in value
      ? (value.richText ?? []).map((r) => r.text).join('')
      : String(value)
  const k = text.replace(/\s+/g, ' ').trim().toLowerCase().replace(/[:*]/g, '').trim()
  return k === '' ? null : k
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    if ('richText' in value) return (value.richText ?? []).map((r) => r.text).join('').trim()
    if ('text' in value) return String((value as { text: unknown }).text).trim()
    if (value instanceof Date) return value.toISOString().slice(0, 10)
    if ('result' in value) return String((value as { result: unknown }).result ?? '').trim()
  }
  return String(value).trim()
}

/**
 * The discipline, matched to one the database will accept.
 *
 * Loosely matched — "Electrical", "electrical", "ELECTRICAL" are one thing —
 * but never guessed. A word that matches nothing is left blank and reported.
 */
export function matchCategory(raw: string): string | null {
  const v = raw.trim().toLowerCase().replace(/[\s_/&-]+/g, '')
  if (v === '') return null
  for (const c of CATEGORIES) {
    if (c.value.replace(/_/g, '') === v) return c.value
    if (c.label.toLowerCase().replace(/[\s_/&-]+/g, '') === v) return c.value
  }
  return null
}

export function findTypeMapping(sheet: ExcelJS.Worksheet): { mapping: TypeMapping | null; headingsSeen: string[] } {
  const headingsSeen: string[] = []

  // Forty rows, not one. A real catalogue arrives with a title block, a
  // revision box and a blank line above the headings, and a file that has
  // to be tidied before it will import is a file that gets tidied wrongly.
  for (let r = 1; r <= Math.min(40, sheet.rowCount); r++) {
    const cells: { key: string; column: number }[] = []
    sheet.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      const k = headerKey(cell.value)
      if (k) cells.push({ key: k, column: col })
    })
    if (cells.length === 0) continue
    for (const c of cells) if (!headingsSeen.includes(c.key)) headingsSeen.push(c.key)

    const find = (aliases: string[]) => cells.find((c) => aliases.includes(c.key))?.column ?? null

    const code = find(CODE_ALIASES)
    if (code === null) continue

    // "Model" is in both the code aliases and its own list. If one column
    // has been taken as the code, it must not also be read as the model —
    // that would put the same string in two fields and look like agreement.
    const model = find(MODEL_ALIASES)

    return {
      mapping: {
        headerRow: r,
        code,
        name: find(NAME_ALIASES),
        category: find(CATEGORY_ALIASES),
        manufacturer: find(MANUFACTURER_ALIASES),
        model: model === code ? null : model,
        rating: find(RATING_ALIASES),
        description: find(NOTE_ALIASES),
      },
      headingsSeen,
    }
  }

  return { mapping: null, headingsSeen }
}

export function parseTypeWorkbook(wb: ExcelJS.Workbook): ParsedTypes {
  const empty: ParsedTypes = {
    sheetName: null,
    headerRow: null,
    detectedColumns: [],
    headingsSeen: [],
    rows: [],
    warnings: [],
    error: null,
  }

  for (const sheet of wb.worksheets) {
    if (sheet.name.trim().toLowerCase() === 'guide') continue

    const { mapping, headingsSeen } = findTypeMapping(sheet)
    if (!mapping) {
      empty.headingsSeen = [...new Set([...empty.headingsSeen, ...headingsSeen])]
      continue
    }

    const rows: ParsedType[] = []
    const warnings: TypeProblem[] = []
    const seen = new Map<string, number>()

    for (let r = mapping.headerRow + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)
      const at = (col: number | null) => (col === null ? '' : cellText(row.getCell(col).value))

      const code = at(mapping.code)
      if (code === '') continue

      const already = seen.get(code.toLowerCase())
      if (already !== undefined) {
        warnings.push({
          row: r,
          column: 'Type code',
          value: code,
          message: `The same code is already on row ${already}. Only the first was read.`,
        })
        continue
      }
      seen.set(code.toLowerCase(), r)

      let category: string | null = null
      const rawCategory = at(mapping.category)
      if (rawCategory !== '') {
        category = matchCategory(rawCategory)
        if (category === null) {
          warnings.push({
            row: r,
            column: 'Category',
            value: rawCategory,
            message: `Not one of: ${CATEGORIES.map((c) => c.label).join(', ')}. Left blank.`,
          })
        }
      }

      rows.push({
        row: r,
        type_code: code,
        // A type with no name is named after its code. Refusing the row
        // would be worse: the code is the part everything else keys on.
        name: at(mapping.name) || code,
        category,
        manufacturer: at(mapping.manufacturer) || null,
        model: at(mapping.model) || null,
        rating: at(mapping.rating) || null,
        description: at(mapping.description) || null,
      })
    }

    const detected: string[] = []
    const add = (col: number | null, label: string) => {
      if (col !== null) detected.push(label)
    }
    add(mapping.code, 'Type code')
    add(mapping.name, 'Name')
    add(mapping.category, 'Category')
    add(mapping.manufacturer, 'Manufacturer')
    add(mapping.model, 'Model')
    add(mapping.rating, 'Rating')
    add(mapping.description, 'Notes')

    return {
      sheetName: sheet.name,
      headerRow: mapping.headerRow,
      detectedColumns: detected,
      headingsSeen,
      rows,
      warnings,
      error: rows.length === 0 ? 'The Type code column was found and every row under it was empty.' : null,
    }
  }

  return {
    ...empty,
    error:
      empty.headingsSeen.length === 0
        ? 'No readable sheet in that file.'
        : `No Type code column found. The headings read were: ${empty.headingsSeen.slice(0, 12).join(', ')}.`,
  }
}
