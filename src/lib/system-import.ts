// Reading a list of systems out of a spreadsheet.
//
// ── Why this exists at all ──────────────────────────────────────────────
//
// It was already possible to get systems in without typing them: the
// equipment importer creates a system when it meets one in the System
// column, and files it under the Area on the same row. That works, and it is
// still the fastest route when the tags and the boards arrive together.
//
// It is not enough on its own for two reasons a real job hits immediately.
// A system created that way gets a name and nothing else — no discipline, no
// boundary, no responsible engineer, no stage — so every one of them has to
// be opened and edited afterwards, which is the typing this was meant to
// avoid. And the boards are usually known months before the tag list: the
// register is built from the single line diagram, and the breakers are
// scheduled later.
//
// So systems get their own import. Running it after the equipment import is
// safe and useful — a system that already exists is UPDATED, not duplicated,
// which is how a bare name gets its discipline and boundary filled in.
//
// ── The rule this shares with every other importer here ─────────────────
//
// A value that can be checked and is wrong stops the import. A value that
// cannot be checked is kept exactly as written and reported. Nothing is
// half-done: if any row cannot be read, nothing is written at all.

import ExcelJS from 'exceljs'
import { STAGES } from '@/lib/readiness'

const ID_ALIASES = ['system id', 'system code', 'system no', 'system number', 'code', 'id', 'system', 'tag']
const NAME_ALIASES = ['system name', 'name', 'description', 'title', 'service']
const DISCIPLINE_ALIASES = ['discipline', 'category', 'trade', 'type', 'class']
const AREA_ALIASES = ['area', 'zone', 'location', 'area code', 'room']
const BUILDING_ALIASES = ['building', 'building no', 'building number', 'bldg', 'block', 'tower']
const BOUNDARY_ALIASES = ['boundary', 'scope', 'battery limit', 'battery limits', 'extent', 'includes']
const RESPONSIBLE_ALIASES = ['responsible', 'responsible engineer', 'engineer', 'owner', 'lead']
const STAGE_ALIASES = ['stage', 'phase', 'status', 'state', 'commissioning stage']
// "Level" is deliberately accepted here even though L1-L5 mean the
// commissioning levels everywhere else in this application. People head the
// column Level because that is the word on the drawing; refusing it would
// mean the floor is silently dropped from a sheet that plainly carries it.
// It is read as the floor and stored as the floor — the ambiguity is in the
// spreadsheet, and this is where it gets resolved rather than carried on.
const FLOOR_ALIASES = ['floor', 'level', 'storey', 'story', 'floor level', 'fl', 'lvl', 'elevation level']
const DESC_ALIASES = ['notes', 'note', 'remark', 'remarks', 'comment']

export type SystemMapping = {
  headerRow: number
  systemId: number
  name: number | null
  discipline: number | null
  area: number | null
  building: number | null
  floor: number | null
  boundary: number | null
  responsible: number | null
  stage: number | null
  description: number | null
}

export type ParsedSystem = {
  row: number
  system_id: string
  name: string
  discipline: string | null
  area: string | null
  building: string | null
  floor: string | null
  boundary: string | null
  responsible: string | null
  stage: string | null
  description: string | null
}

export type SystemWarning = { row: number; column: string; value: string; message: string }

export type ParsedSystems = {
  sheetName: string | null
  headerRow: number | null
  detectedColumns: string[]
  headingsSeen: string[]
  rows: ParsedSystem[]
  warnings: SystemWarning[]
  error: string | null
}

function headerKey(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null
  const text = typeof value === 'object' && 'richText' in value
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
 * Find the header row and what each column means.
 *
 * The first forty rows are searched, not just the first, because real
 * spreadsheets carry a title, a revision block and a blank line above the
 * headings. A file that has to be tidied before it will import is a file
 * that gets tidied wrongly.
 */
export function findSystemMapping(sheet: ExcelJS.Worksheet): { mapping: SystemMapping | null; headingsSeen: string[] } {
  const headingsSeen: string[] = []

  for (let r = 1; r <= Math.min(40, sheet.rowCount); r++) {
    const row = sheet.getRow(r)
    const cells: { key: string; column: number }[] = []
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const k = headerKey(cell.value)
      if (k) cells.push({ key: k, column: col })
    })
    if (cells.length === 0) continue
    for (const c of cells) if (!headingsSeen.includes(c.key)) headingsSeen.push(c.key)

    const find = (aliases: string[]) => cells.find((c) => aliases.includes(c.key))?.column ?? null

    // The id column is what makes a row a system. Without it there is nothing
    // to key on and nothing to update, so the row is not a system row.
    const systemId = find(ID_ALIASES)
    if (systemId === null) continue

    return {
      mapping: {
        headerRow: r,
        systemId,
        name: find(NAME_ALIASES),
        discipline: find(DISCIPLINE_ALIASES),
        area: find(AREA_ALIASES),
        building: find(BUILDING_ALIASES),
        floor: find(FLOOR_ALIASES),
        boundary: find(BOUNDARY_ALIASES),
        responsible: find(RESPONSIBLE_ALIASES),
        stage: find(STAGE_ALIASES),
        description: find(DESC_ALIASES),
      },
      headingsSeen,
    }
  }

  return { mapping: null, headingsSeen }
}

/**
 * A stage word from a spreadsheet, matched to one this application defines.
 *
 * Matched loosely on purpose — "Pre-Commissioning", "pre commissioning" and
 * "precommissioning" are the same stage — but never guessed. A word that
 * matches nothing is left blank and reported, because a system silently
 * filed at the wrong commissioning stage reports the wrong readiness on
 * every screen it appears on.
 */
export function matchStage(raw: string): string | null {
  const v = raw.trim().toLowerCase().replace(/[\s_-]+/g, '')
  if (v === '') return null
  for (const s of STAGES) {
    if (s.value.replace(/_/g, '') === v) return s.value
    if (s.label.toLowerCase().replace(/[\s_/-]+/g, '') === v) return s.value
  }
  return null
}

export function parseSystemWorkbook(wb: ExcelJS.Workbook): ParsedSystems {
  const empty: ParsedSystems = {
    sheetName: null,
    headerRow: null,
    detectedColumns: [],
    headingsSeen: [],
    rows: [],
    warnings: [],
    error: null,
  }

  for (const sheet of wb.worksheets) {
    // The guide sheet in the template is not data and must not be read as it.
    if (sheet.name.trim().toLowerCase() === 'guide') continue

    const { mapping, headingsSeen } = findSystemMapping(sheet)
    if (!mapping) {
      empty.headingsSeen = [...new Set([...empty.headingsSeen, ...headingsSeen])]
      continue
    }

    const rows: ParsedSystem[] = []
    const warnings: SystemWarning[] = []
    const seen = new Map<string, number>()

    for (let r = mapping.headerRow + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)
      const at = (col: number | null) => (col === null ? '' : cellText(row.getCell(col).value))

      const systemId = at(mapping.systemId)
      if (systemId === '') continue

      // The same code twice in one file is a mistake in the file, and the
      // second row would silently overwrite the first. Say so instead.
      const already = seen.get(systemId.toLowerCase())
      if (already !== undefined) {
        warnings.push({
          row: r,
          column: 'System ID',
          value: systemId,
          message: `The same code is already on row ${already}. Only the first was read.`,
        })
        continue
      }
      seen.set(systemId.toLowerCase(), r)

      let stage: string | null = null
      const rawStage = at(mapping.stage)
      if (rawStage !== '') {
        stage = matchStage(rawStage)
        if (stage === null) {
          warnings.push({
            row: r,
            column: 'Stage',
            value: rawStage,
            message: `Not one of: ${STAGES.map((s) => s.label).join(', ')}. Left blank.`,
          })
        }
      }

      rows.push({
        row: r,
        system_id: systemId,
        // A system with no name is named after its code. Refusing the row
        // would be worse: the code is the part that matters and the part
        // everything else keys on.
        name: at(mapping.name) || systemId,
        discipline: at(mapping.discipline) || null,
        area: at(mapping.area) || null,
        building: at(mapping.building) || null,
        // Kept exactly as written. sortFloors() in @/lib/floors understands
        // L3, Level 3, 3F and 3 as the same storey when it comes to putting
        // them in lift-panel order; nothing here renames what you typed.
        floor: at(mapping.floor) || null,
        boundary: at(mapping.boundary) || null,
        responsible: at(mapping.responsible) || null,
        stage,
        description: at(mapping.description) || null,
      })
    }

    const detected: string[] = []
    const add = (col: number | null, label: string) => {
      if (col !== null) detected.push(label)
    }
    add(mapping.systemId, 'System ID')
    add(mapping.name, 'Name')
    add(mapping.discipline, 'Discipline')
    add(mapping.area, 'Area')
    add(mapping.building, 'Building')
    add(mapping.floor, 'Floor')
    add(mapping.boundary, 'Boundary')
    add(mapping.responsible, 'Responsible')
    add(mapping.stage, 'Stage')
    add(mapping.description, 'Notes')

    return {
      sheetName: sheet.name,
      headerRow: mapping.headerRow,
      detectedColumns: detected,
      headingsSeen,
      rows,
      warnings,
      error: rows.length === 0 ? 'The System ID column was found and every row under it was empty.' : null,
    }
  }

  return {
    ...empty,
    error:
      empty.headingsSeen.length === 0
        ? 'No readable sheet in that file.'
        : `No System ID column found. The headings read were: ${empty.headingsSeen.slice(0, 12).join(', ')}.`,
  }
}
