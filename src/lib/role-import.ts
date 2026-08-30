// Reading a role list out of somebody's spreadsheet.
//
// Built on the same principle as the checklist importer: match THEIR file
// rather than demanding ours. Headings can sit anywhere in the first rows,
// column names are matched by alias, and a row that cannot be read is
// reported with its row number and the offending value — never skipped in
// silence, and never imported half-right.

import ExcelJS from 'exceljs'
import { Readable } from 'stream'
import { CAPABILITIES, parseCaps, toRoleKey, formatCaps } from '@/lib/project-roles'

const KEY_ALIASES = ['key', 'role key', 'role_key', 'code', 'role code', 'id', 'role id']
const LABEL_ALIASES = ['role', 'label', 'name', 'role name', 'title', 'position', 'designation', 'job title']
const CAPS_ALIASES = [
  'capabilities',
  'capability',
  'caps',
  'permissions',
  'permission',
  'rights',
  'access',
  'may',
  'can',
  'allowed',
]
const NOTE_ALIASES = ['note', 'notes', 'description', 'remark', 'remarks', 'comment', 'comments', 'detail', 'details']
const ACTIVE_ALIASES = ['active', 'in use', 'enabled', 'used', 'use']

// Column-per-capability is how most people actually lay this out in Excel:
// one column per right, with a tick or a Y in it.
const CAP_COLUMN_ALIASES: Record<string, string[]> = {
  view: ['view', 'read', 'see'],
  record: ['record', 'enter', 'write', 'input'],
  review: ['review', 'check'],
  approve: ['approve', 'approval', 'sign', 'authorise', 'authorize'],
  manage: ['manage', 'admin', 'administer'],
}

const TRUTHY = new Set(['y', 'yes', 'true', '1', 'x', '✓', '✔', 'tick', 'ok', 'yes ', 'included'])
const FALSY = new Set(['n', 'no', 'false', '0', '-', '', 'na', 'n/a'])

function norm(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && value !== null && 'text' in value) {
    return String((value as { text: unknown }).text ?? '').trim()
  }
  if (typeof value === 'object' && value !== null && 'result' in value) {
    return String((value as { result: unknown }).result ?? '').trim()
  }
  return String(value).trim()
}

function headerKey(value: unknown): string {
  return norm(value).toLowerCase().replace(/\s+/g, ' ')
}

type Mapping = {
  headerRow: number
  key: number | null
  label: number | null
  caps: number | null
  note: number | null
  active: number | null
  capColumns: { cap: string; column: number }[]
}

// Scan the first rows for a row that contains something we recognise as a role
// name column. Company templates habitually carry a logo, a document number
// and a revision block above the actual table.
function findMapping(sheet: ExcelJS.Worksheet): { mapping: Mapping | null; headingsSeen: string[] } {
  const headingsSeen: string[] = []
  const limit = Math.min(sheet.rowCount, 30)

  for (let r = 1; r <= limit; r++) {
    const row = sheet.getRow(r)
    const cells: { key: string; column: number }[] = []
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const k = headerKey(cell.value)
      if (k) cells.push({ key: k, column: col })
    })
    if (cells.length === 0) continue

    for (const c of cells) if (!headingsSeen.includes(c.key)) headingsSeen.push(c.key)

    const find = (aliases: string[]) => cells.find((c) => aliases.includes(c.key))?.column ?? null

    const label = find(LABEL_ALIASES)
    if (label === null) continue

    const capColumns: { cap: string; column: number }[] = []
    for (const [cap, aliases] of Object.entries(CAP_COLUMN_ALIASES)) {
      const col = cells.find((c) => aliases.includes(c.key))?.column
      if (col !== undefined) capColumns.push({ cap, column: col })
    }

    const capsColumn = find(CAPS_ALIASES)

    // A "can" or "may" heading is a capability list, unless it was already
    // claimed as a per-capability column.
    const capsSingle = capColumns.some((c) => c.column === capsColumn) ? null : capsColumn

    return {
      mapping: {
        headerRow: r,
        key: find(KEY_ALIASES),
        label,
        caps: capsSingle,
        note: find(NOTE_ALIASES),
        active: find(ACTIVE_ALIASES),
        capColumns,
      },
      headingsSeen,
    }
  }

  return { mapping: null, headingsSeen }
}

export type ParsedRole = {
  row: number
  role_key: string
  label: string
  caps: string
  note: string | null
  active: boolean
}

export type RowProblem = {
  row: number
  column: string
  value: string
  message: string
}

export type RoleParseResult = {
  rows: ParsedRole[]
  errors: RowProblem[]
  warnings: RowProblem[]
  sheetName: string | null
  headerRow: number | null
  headingsSeen: string[]
  detectedColumns: string[]
}

function readBoolean(value: string, fallback: boolean): boolean {
  const v = value.trim().toLowerCase()
  if (v === '') return fallback
  if (TRUTHY.has(v)) return true
  if (FALSY.has(v)) return false
  return fallback
}

export async function parseRoleWorkbook(
  buffer: ArrayBuffer,
  options: { fileName?: string } = {}
): Promise<RoleParseResult> {
  const workbook = new ExcelJS.Workbook()
  const name = options.fileName ?? ''

  if (name.toLowerCase().endsWith('.csv')) {
    const text = Buffer.from(buffer).toString('utf8')
    await workbook.csv.read(Readable.from([text]))
  } else {
    await workbook.xlsx.load(buffer)
  }

  const empty: RoleParseResult = {
    rows: [],
    errors: [],
    warnings: [],
    sheetName: null,
    headerRow: null,
    headingsSeen: [],
    detectedColumns: [],
  }

  let allHeadings: string[] = []

  for (const sheet of workbook.worksheets) {
    const { mapping, headingsSeen } = findMapping(sheet)
    allHeadings = [...allHeadings, ...headingsSeen.filter((h) => !allHeadings.includes(h))]
    if (!mapping || mapping.label === null) continue

    const rows: ParsedRole[] = []
    const errors: RowProblem[] = []
    const warnings: RowProblem[] = []
    const seenKeys = new Map<string, number>()

    for (let r = mapping.headerRow + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)
      const at = (col: number | null) => (col === null ? '' : norm(row.getCell(col).value))

      const label = at(mapping.label)
      if (!label) continue // genuinely blank row — not an error

      const rawKey = at(mapping.key)
      const role_key = toRoleKey(rawKey || label)

      if (!role_key) {
        errors.push({
          row: r,
          column: 'Role',
          value: label,
          message: 'Could not make a key from this — it has no letters or numbers in it.',
        })
        continue
      }

      // Capabilities: either one list column, or a column per capability.
      let caps: string[] = []
      if (mapping.caps !== null) {
        const raw = at(mapping.caps)
        const parsed = parseCaps(raw)
        if (raw && parsed.length === 0) {
          errors.push({
            row: r,
            column: 'Capabilities',
            value: raw,
            message: `Not recognised. Use any of: ${CAPABILITIES.map((c) => c.value).join(', ')}.`,
          })
          continue
        }
        caps = parsed
      }

      for (const cc of mapping.capColumns) {
        const raw = at(cc.column)
        const on = readBoolean(raw, false)
        if (raw && !TRUTHY.has(raw.toLowerCase()) && !FALSY.has(raw.toLowerCase())) {
          warnings.push({
            row: r,
            column: cc.cap,
            value: raw,
            message: 'Not read as yes or no, so treated as no. Use Y, Yes, X or a tick.',
          })
        }
        if (on && !caps.includes(cc.cap)) caps.push(cc.cap)
      }

      if (caps.length === 0) {
        warnings.push({
          row: r,
          column: 'Capabilities',
          value: '',
          message: 'No capabilities given — this role will be able to view only.',
        })
        caps = ['view']
      }

      // Everybody can at least see the project; a role that can record but
      // not view is a contradiction rather than a decision.
      if (!caps.includes('view')) caps.unshift('view')

      const previous = seenKeys.get(role_key)
      if (previous !== undefined) {
        errors.push({
          row: r,
          column: 'Role',
          value: label,
          message: `Same role key as row ${previous}. Give one of them a different name or key.`,
        })
        continue
      }
      seenKeys.set(role_key, r)

      rows.push({
        row: r,
        role_key,
        label,
        caps: formatCaps(caps as never),
        note: at(mapping.note) || null,
        active: readBoolean(at(mapping.active), true),
      })
    }

    if (rows.length > 0 || errors.length > 0) {
      const detected: string[] = ['Role']
      if (mapping.key !== null) detected.push('Key')
      if (mapping.caps !== null) detected.push('Capabilities')
      for (const c of mapping.capColumns) detected.push(c.cap)
      if (mapping.note !== null) detected.push('Note')
      if (mapping.active !== null) detected.push('Active')

      return {
        rows,
        errors,
        warnings,
        sheetName: sheet.name,
        headerRow: mapping.headerRow,
        headingsSeen: allHeadings,
        detectedColumns: detected,
      }
    }
  }

  return { ...empty, headingsSeen: allHeadings }
}
