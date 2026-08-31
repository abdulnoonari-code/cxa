// Reading an equipment list out of the EPC's spreadsheet.
//
// Every project starts with one of these: a tag list from the contractor, in
// their format, with their column names, usually under a title block. Typing
// two thousand tags in by hand is not a reasonable ask, and neither is making
// somebody reformat their file to suit us.
//
// Same shape as the roles and gate-rule importers: headings found anywhere,
// column names matched by alias, a stable id for the round trip, and
// all-or-nothing on errors with the row number and the offending value.

import ExcelJS from 'exceljs'
import { Readable } from 'stream'
import { CATEGORIES, INSTALL_STATUSES } from '@/app/equipment/styles'

const ID_ALIASES = ['cxa id', 'cxa_id', 'id']
const TAG_ALIASES = [
  'tag',
  'tag id',
  'tag no',
  'tag number',
  'tag_id',
  'equipment tag',
  'equipment id',
  'asset tag',
  'asset id',
  'kks',
  'item no',
  'item number',
  'ref',
  'reference',
]
const DESC_ALIASES = ['description', 'equipment', 'equipment description', 'name', 'item', 'service', 'title', 'desc']
const CATEGORY_ALIASES = ['category', 'discipline', 'type', 'equipment type', 'class']
const SYSTEM_ALIASES = ['system', 'system id', 'system code', 'sys']
const SUBSYSTEM_ALIASES = ['subsystem', 'sub system', 'sub-system', 'bay', 'subsystem code']
const AREA_ALIASES = ['area', 'zone', 'building', 'area code']
const LOCATION_ALIASES = ['location', 'room', 'position', 'place', 'installed at']
const MANUFACTURER_ALIASES = ['manufacturer', 'maker', 'vendor', 'oem', 'supplier', 'make', 'brand']
const MODEL_ALIASES = ['model', 'model no', 'model number', 'type no', 'part number']
const SERIAL_ALIASES = ['serial', 'serial no', 'serial number', 'sn', 's/n']
const STATUS_ALIASES = ['status', 'install status', 'installation status', 'delivery status', 'state']
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

// Match a written value against a list of options, by value or by label, with
// a little tolerance. "Elec" and "Electrical" should both land on electrical.
function matchOption(raw: string, options: { value: string; label: string }[]): string | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  const exact = options.find((o) => o.value.toLowerCase() === v || o.label.toLowerCase() === v)
  if (exact) return exact.value
  const partial = options.find(
    (o) => o.label.toLowerCase().startsWith(v) || o.value.toLowerCase().startsWith(v) || v.startsWith(o.value.toLowerCase())
  )
  return partial ? partial.value : null
}

type Mapping = {
  headerRow: number
  id: number | null
  tag: number
  description: number | null
  category: number | null
  system: number | null
  subsystem: number | null
  area: number | null
  location: number | null
  manufacturer: number | null
  model: number | null
  serial: number | null
  status: number | null
  remove: number | null
}

function findMapping(sheet: ExcelJS.Worksheet): { mapping: Mapping | null; headingsSeen: string[] } {
  const headingsSeen: string[] = []
  const limit = Math.min(sheet.rowCount, 40)

  for (let r = 1; r <= limit; r++) {
    const cells: { key: string; column: number }[] = []
    sheet.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      const k = headerKey(cell.value)
      if (k) cells.push({ key: k, column: col })
    })
    if (cells.length === 0) continue
    for (const c of cells) if (!headingsSeen.includes(c.key)) headingsSeen.push(c.key)

    const find = (aliases: string[]) => cells.find((c) => aliases.includes(c.key))?.column ?? null

    const tag = find(TAG_ALIASES)
    if (tag === null) continue

    return {
      mapping: {
        headerRow: r,
        id: find(ID_ALIASES),
        tag,
        description: find(DESC_ALIASES),
        category: find(CATEGORY_ALIASES),
        system: find(SYSTEM_ALIASES),
        subsystem: find(SUBSYSTEM_ALIASES),
        area: find(AREA_ALIASES),
        location: find(LOCATION_ALIASES),
        manufacturer: find(MANUFACTURER_ALIASES),
        model: find(MODEL_ALIASES),
        serial: find(SERIAL_ALIASES),
        status: find(STATUS_ALIASES),
        remove: find(REMOVE_ALIASES),
      },
      headingsSeen,
    }
  }

  return { mapping: null, headingsSeen }
}

export type ParsedEquipment = {
  row: number
  id: string | null
  tag_id: string
  description: string | null
  category: string | null
  system: string | null
  subsystem: string | null
  area: string | null
  location: string | null
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  install_status: string
  remove: boolean
}

export type EquipmentProblem = { row: number; column: string; value: string; message: string }

export type EquipmentParseResult = {
  rows: ParsedEquipment[]
  errors: EquipmentProblem[]
  warnings: EquipmentProblem[]
  sheetName: string | null
  headerRow: number | null
  headingsSeen: string[]
  detectedColumns: string[]
}

export async function parseEquipmentWorkbook(
  buffer: ArrayBuffer,
  options: { fileName?: string } = {}
): Promise<EquipmentParseResult> {
  const workbook = new ExcelJS.Workbook()
  const name = options.fileName ?? ''

  if (name.toLowerCase().endsWith('.csv')) {
    await workbook.csv.read(Readable.from([Buffer.from(buffer).toString('utf8')]))
  } else {
    await workbook.xlsx.load(buffer)
  }

  let allHeadings: string[] = []

  for (const sheet of workbook.worksheets) {
    const { mapping, headingsSeen } = findMapping(sheet)
    allHeadings = [...allHeadings, ...headingsSeen.filter((h) => !allHeadings.includes(h))]
    if (!mapping) continue

    const rows: ParsedEquipment[] = []
    const errors: EquipmentProblem[] = []
    const warnings: EquipmentProblem[] = []
    const seenTags = new Map<string, number>()

    for (let r = mapping.headerRow + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)
      const at = (col: number | null) => (col === null ? '' : norm(row.getCell(col).value))

      const tag = at(mapping.tag)
      if (!tag) continue

      // A tag with a space in the middle is almost always a heading row that
      // slipped through ("115kV GIS EQUIPMENT"), not a real tag.
      if (tag.length > 60) {
        warnings.push({ row: r, column: 'Tag', value: tag.slice(0, 40), message: 'Unusually long — is this a section heading rather than a tag?' })
      }

      const previous = seenTags.get(tag.toLowerCase())
      if (previous !== undefined) {
        errors.push({
          row: r,
          column: 'Tag',
          value: tag,
          message: `The same tag appears on row ${previous}. Every tag on a project must be unique.`,
        })
        continue
      }
      seenTags.set(tag.toLowerCase(), r)

      const rawCategory = at(mapping.category)
      const category = rawCategory ? matchOption(rawCategory, CATEGORIES) : null
      if (rawCategory && !category) {
        warnings.push({
          row: r,
          column: 'Category',
          value: rawCategory,
          message: `Not one of the known categories (${CATEGORIES.map((c) => c.label).join(', ')}), so left blank.`,
        })
      }

      const rawStatus = at(mapping.status)
      const status = rawStatus ? matchOption(rawStatus, INSTALL_STATUSES) : null
      if (rawStatus && !status) {
        warnings.push({
          row: r,
          column: 'Status',
          value: rawStatus,
          message: `Not one of the known statuses (${INSTALL_STATUSES.map((s) => s.label).join(', ')}), so treated as not delivered.`,
        })
      }

      rows.push({
        row: r,
        id: at(mapping.id) || null,
        tag_id: tag,
        description: at(mapping.description) || null,
        category,
        system: at(mapping.system) || null,
        subsystem: at(mapping.subsystem) || null,
        area: at(mapping.area) || null,
        location: at(mapping.location) || null,
        manufacturer: at(mapping.manufacturer) || null,
        model: at(mapping.model) || null,
        serial_number: at(mapping.serial) || null,
        install_status: status ?? 'not_delivered',
        remove: TRUTHY.has(at(mapping.remove).toLowerCase()),
      })
    }

    if (rows.length > 0 || errors.length > 0) {
      const detected = ['Tag']
      const add = (col: number | null, label: string) => {
        if (col !== null) detected.push(label)
      }
      add(mapping.id, 'CXA ID')
      add(mapping.description, 'Description')
      add(mapping.category, 'Category')
      add(mapping.system, 'System')
      add(mapping.subsystem, 'Subsystem')
      add(mapping.area, 'Area')
      add(mapping.location, 'Location')
      add(mapping.manufacturer, 'Manufacturer')
      add(mapping.model, 'Model')
      add(mapping.serial, 'Serial')
      add(mapping.status, 'Status')

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

  return {
    rows: [],
    errors: [],
    warnings: [],
    sheetName: null,
    headerRow: null,
    headingsSeen: allHeadings,
    detectedColumns: [],
  }
}
