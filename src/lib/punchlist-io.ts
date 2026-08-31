// The punch list round trip.
//
// Punch lists are the most exchanged spreadsheet on a commissioning job: the
// client marks one up, the contractor marks it up back, and both sides argue
// about what changed. So this importer is built for the file coming back
// covered in somebody else's edits — a stable punch number identifies each
// row, a Remove column deletes, and if any row cannot be read the whole file
// is refused rather than half-applied.
//
// The fifth application of the same pattern as roles, gate rules, equipment
// and checklists. The aliases are the only thing that differ, and they differ
// because the headings really do.

import ExcelJS from 'exceljs'
import { Readable } from 'stream'
import { LEVELS } from '@/lib/checklist'
import { CATEGORIES, ISSUE_STATUSES, SEVERITIES } from '@/lib/issues'
import { matchLevel } from '@/lib/checklist-io'

const ID_ALIASES = ['cxa id', 'cxa_id', 'id']
const REF_ALIASES = ['ref', 'punch no', 'punch number', 'punch ref', 'item no', 'item number', 'no', 'sr no', 's/n', 'sn', 'serial']
const TITLE_ALIASES = [
  'title',
  'punch item',
  'item',
  'description',
  'defect',
  'observation',
  'finding',
  'issue',
  'non conformance',
  'nonconformance',
  'ncr',
  'snag',
  'deficiency',
  'remark',
  'punch description',
  'description of defect',
]
const DETAIL_ALIASES = ['detail', 'details', 'notes', 'note', 'comment', 'comments', 'remarks', 'further detail', 'action required']
const SUBJECT_ALIASES = [
  'tag',
  'tag no',
  'tag id',
  'tag number',
  'equipment',
  'equipment tag',
  'asset',
  'asset id',
  'system',
  'system id',
  'subsystem',
  'applies to',
  'kks',
  'tag / system',
  'tag/system',
  'tag or system',
  'equipment / system',
]
const CATEGORY_ALIASES = ['category', 'cat', 'punch category', 'class', 'classification', 'a/b/c', 'priority']
const SEVERITY_ALIASES = ['severity', 'criticality', 'impact']
const STATUS_ALIASES = ['status', 'state', 'progress', 'open/closed', 'closed']
const LEVEL_ALIASES = ['level', 'cx level', 'commissioning level', 'stage', 'phase', 'raised at', 'raised at level']
const RAISED_BY_ALIASES = ['raised by', 'reported by', 'originator', 'raised', 'identified by', 'by']
const PARTY_ALIASES = [
  'responsible',
  'responsible party',
  'responsibility',
  'assigned to',
  'owner',
  'action by',
  'contractor',
  'subcontractor',
  'party',
  'discipline responsible',
]
const DISCIPLINE_ALIASES = ['discipline', 'trade', 'department']
const LOCATION_ALIASES = ['location', 'area', 'room', 'building', 'place', 'where']
const DUE_ALIASES = ['due', 'due date', 'target', 'target date', 'target close', 'required by', 'close by', 'deadline']
const REMOVE_ALIASES = ['remove', 'delete', 'drop']

const TRUTHY = new Set(['y', 'yes', 'true', '1', 'x', '✓', '✔'])

const GUIDE_SHEETS = [
  'how to edit this',
  'how to fill this in',
  'levels',
  'categories',
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

function norm(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && value !== null && 'text' in value) {
    return String((value as { text: unknown }).text ?? '').trim()
  }
  if (typeof value === 'object' && value !== null && 'result' in value) {
    return String((value as { result: unknown }).result ?? '').trim()
  }
  if (typeof value === 'object' && value !== null && 'richText' in value) {
    return (value as { richText: { text: string }[] }).richText.map((t) => t.text).join('').trim()
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).trim()
}

function headerKey(value: unknown): string {
  return norm(value).toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').replace(/[.:]+$/, '')
}

// ── Value matching ───────────────────────────────────────────────────────

// "A", "Cat A", "Category A — must fix before proceeding" and "1" all mean
// the same thing on different jobs. A number is read as a priority, which is
// how plenty of lists express the same three tiers.
export function matchCategory(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  const exact = CATEGORIES.find((c) => c.value.toLowerCase() === v || c.label.toLowerCase() === v)
  if (exact) return exact.value
  const letter = v.match(/^(?:cat(?:egory)?\s*)?([abc])\b/)
  if (letter) return letter[1].toUpperCase()
  if (v === '1' || v === 'p1') return 'A'
  if (v === '2' || v === 'p2') return 'B'
  if (v === '3' || v === 'p3') return 'C'
  return null
}

export function matchSeverity(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  if (!v) return 'minor'
  const exact = SEVERITIES.find((s) => s.value === v || s.label.toLowerCase() === v)
  if (exact) return exact.value
  if (['high', 'severe', 'urgent', 'showstopper'].includes(v)) return 'critical'
  if (['medium', 'moderate', 'significant'].includes(v)) return 'major'
  if (['low', 'trivial'].includes(v)) return 'minor'
  if (['note', 'comment', 'info', 'informational'].includes(v)) return 'observation'
  return null
}

export function matchStatus(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  if (!v) return 'open'
  const exact = ISSUE_STATUSES.find((s) => s.value === v || s.label.toLowerCase() === v)
  if (exact) return exact.value
  if (['wip', 'in progress', 'started', 'ongoing', 'working'].includes(v)) return 'in_progress'
  if (['retest', 'ready', 'ready for retest', 'for retest', 'ready to retest'].includes(v)) return 'ready_for_retest'
  if (['done', 'complete', 'completed', 'cleared', 'rectified', 'fixed'].includes(v)) return 'ready_for_retest'
  if (['accepted', 'verified', 'signed off', 'approved'].includes(v)) return 'verified'
  if (['closed', 'close', 'shut'].includes(v)) return 'closed'
  if (['outstanding', 'not started', 'new', 'raised', 'o'].includes(v)) return 'open'
  return null
}

// Excel gives a date back as a Date when the cell is a date and as text when
// somebody typed it. Only unambiguous forms are accepted: a bare "03/04/2026"
// could be March or April depending on who filled it in, and guessing wrong
// on a punch list due date is worse than asking.
export function matchDate(raw: string): { value: string | null; ambiguous: boolean } {
  const v = raw.trim()
  if (!v) return { value: null, ambiguous: false }

  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return { value: `${iso[1]}-${iso[2]}-${iso[3]}`, ambiguous: false }

  // 3 Apr 2026 / 3-Apr-26 / April 3 2026
  const parsed = Date.parse(v.replace(/(\d)(st|nd|rd|th)\b/gi, '$1'))
  if (!Number.isNaN(parsed) && /[a-z]{3}/i.test(v)) {
    return { value: new Date(parsed).toISOString().slice(0, 10), ambiguous: false }
  }

  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(v)) return { value: null, ambiguous: true }
  return { value: null, ambiguous: true }
}

// ── Shapes ───────────────────────────────────────────────────────────────

export type ParsedPunch = {
  row: number
  id: string | null
  ref: string | null
  subject: string | null
  title: string
  description: string | null
  category: string | null
  severity: string
  status: string
  level: string | null
  raised_by: string | null
  responsible_party: string | null
  discipline: string | null
  location: string | null
  due_date: string | null
  remove: boolean
}

export type PunchProblem = { row: number; column: string; value: string; message: string }

export type PunchParseResult = {
  rows: ParsedPunch[]
  errors: PunchProblem[]
  warnings: PunchProblem[]
  sheetName: string | null
  headerRow: number | null
  headingsSeen: string[]
  detectedColumns: string[]
}

type Mapping = {
  headerRow: number
  id: number | null
  ref: number | null
  subject: number | null
  title: number
  detail: number | null
  category: number | null
  severity: number | null
  status: number | null
  level: number | null
  raisedBy: number | null
  party: number | null
  discipline: number | null
  location: number | null
  due: number | null
  remove: number | null
}

function findMapping(sheet: ExcelJS.Worksheet): { mapping: Mapping | null; headingsSeen: string[] } {
  const headingsSeen: string[] = []
  if (GUIDE_SHEETS.includes(sheet.name.trim().toLowerCase())) return { mapping: null, headingsSeen }

  const limit = Math.min(sheet.rowCount, 40)

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

    const title = find(TITLE_ALIASES)
    if (title === null) continue

    const claimed = new Set<number>([title])
    // Each column may only play one part. "Description" claimed as the title
    // must not also be the detail, and a single "Item" column must not be the
    // punch number as well as the item itself.
    const once = (aliases: string[]) => {
      const col = find(aliases)
      if (col === null || claimed.has(col)) return null
      claimed.add(col)
      return col
    }

    const mapping: Mapping = {
      headerRow: r,
      id: once(ID_ALIASES),
      ref: once(REF_ALIASES),
      subject: once(SUBJECT_ALIASES),
      title,
      detail: once(DETAIL_ALIASES),
      category: once(CATEGORY_ALIASES),
      severity: once(SEVERITY_ALIASES),
      status: once(STATUS_ALIASES),
      level: once(LEVEL_ALIASES),
      raisedBy: once(RAISED_BY_ALIASES),
      party: once(PARTY_ALIASES),
      discipline: once(DISCIPLINE_ALIASES),
      location: once(LOCATION_ALIASES),
      due: once(DUE_ALIASES),
      remove: once(REMOVE_ALIASES),
    }

    const score = claimed.size
    if (score < 2 && widest > 1) continue
    if (!best || score > best.score) best = { mapping, score }
  }

  return { mapping: best?.mapping ?? null, headingsSeen }
}

export async function parsePunchWorkbook(
  buffer: ArrayBuffer,
  options: { fileName?: string } = {}
): Promise<PunchParseResult> {
  const workbook = new ExcelJS.Workbook()
  const name = options.fileName ?? ''

  if (name.toLowerCase().endsWith('.csv')) {
    await workbook.csv.read(Readable.from([Buffer.from(buffer).toString('utf8')]))
  } else {
    await workbook.xlsx.load(buffer)
  }

  const rows: ParsedPunch[] = []
  const errors: PunchProblem[] = []
  const warnings: PunchProblem[] = []
  let allHeadings: string[] = []
  let firstSheet: string | null = null
  let firstHeaderRow: number | null = null
  let detected: string[] = []

  for (const sheet of workbook.worksheets) {
    const { mapping, headingsSeen } = findMapping(sheet)
    allHeadings = [...allHeadings, ...headingsSeen.filter((h) => !allHeadings.includes(h))]
    if (!mapping) continue

    if (firstSheet === null) {
      firstSheet = sheet.name
      firstHeaderRow = mapping.headerRow
      detected = ['Punch item']
      const add = (col: number | null, label: string) => {
        if (col !== null) detected.push(label)
      }
      add(mapping.id, 'CXA ID')
      add(mapping.ref, 'Punch no')
      add(mapping.subject, 'Tag / System')
      add(mapping.detail, 'Detail')
      add(mapping.category, 'Category')
      add(mapping.severity, 'Severity')
      add(mapping.status, 'Status')
      add(mapping.level, 'Level')
      add(mapping.raisedBy, 'Raised by')
      add(mapping.party, 'Responsible')
      add(mapping.discipline, 'Discipline')
      add(mapping.location, 'Location')
      add(mapping.due, 'Due date')
    }

    for (let r = mapping.headerRow + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)
      const at = (col: number | null) => (col === null ? '' : norm(row.getCell(col).value))

      const title = at(mapping.title)
      if (!title) continue

      // Category is the one field that must not be guessed. An item with a
      // category nobody can read is treated as unreadable, not as harmless.
      const rawCategory = at(mapping.category)
      const category = rawCategory ? matchCategory(rawCategory) : null
      if (rawCategory && category === null) {
        errors.push({
          row: r,
          column: 'Category',
          value: rawCategory,
          message: `Not a punch category. Use A, B or C — ${CATEGORIES.map((c) => c.label).join('; ')}.`,
        })
        continue
      }
      if (!rawCategory) {
        warnings.push({
          row: r,
          column: 'Category',
          value: '',
          message:
            'No category. The item is imported uncategorised and counted as blocking until somebody says what it blocks.',
        })
      }

      const rawStatus = at(mapping.status)
      const status = matchStatus(rawStatus)
      if (status === null) {
        errors.push({
          row: r,
          column: 'Status',
          value: rawStatus,
          message: `Not a status. Use ${ISSUE_STATUSES.map((s) => s.label).join(', ')}, or leave blank for Open.`,
        })
        continue
      }

      const rawSeverity = at(mapping.severity)
      const severity = matchSeverity(rawSeverity)
      if (severity === null) {
        errors.push({
          row: r,
          column: 'Severity',
          value: rawSeverity,
          message: `Not a severity. Use ${SEVERITIES.map((s) => s.label).join(', ')}, or leave blank for Minor.`,
        })
        continue
      }

      const rawLevel = at(mapping.level)
      const level = rawLevel ? matchLevel(rawLevel) : null
      if (rawLevel && level === null) {
        errors.push({
          row: r,
          column: 'Level',
          value: rawLevel,
          message: `Not one of the commissioning levels (${LEVELS.map((l) => l.label).join('; ')}). Leave it blank if the item is not tied to a level.`,
        })
        continue
      }

      const rawDue = at(mapping.due)
      const due = matchDate(rawDue)
      if (rawDue && due.ambiguous) {
        errors.push({
          row: r,
          column: 'Due date',
          value: rawDue,
          message:
            'Cannot be read without guessing whether the day or the month comes first. Write it as 2026-04-03, or as 3 Apr 2026.',
        })
        continue
      }

      rows.push({
        row: r,
        id: at(mapping.id) || null,
        ref: at(mapping.ref) || null,
        subject: at(mapping.subject) || null,
        title,
        description: at(mapping.detail) || null,
        category,
        severity,
        status,
        level,
        raised_by: at(mapping.raisedBy) || null,
        responsible_party: at(mapping.party) || null,
        discipline: at(mapping.discipline) || null,
        location: at(mapping.location) || null,
        due_date: due.value,
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
  }
}
