// The test record round trip.
//
// Test results arrive as spreadsheets from third-party testing companies, and
// those sheets always carry a Result column with "Pass" typed in it. This
// importer reads that column and then ignores it.
//
// The whole position of CxSentinel on test records is that you enter the
// measured value and the system decides — an engineer never types "pass" next
// to a number that does not meet the criteria. Honouring an imported Result
// would open the one door the app was built to close. So the measured value
// and the acceptance criteria are imported, the result is **recomputed**, and
// where the file's claim disagrees with its own arithmetic that disagreement
// is reported by row number. Catching it at the door is the cheapest place
// there is; the alternative is the Validity Review finding it later, or an
// auditor finding it later still.
//
// The sixth application of the Import Center pattern.

import ExcelJS from 'exceljs'
import { Readable } from 'stream'
import { evaluateTest } from '@/lib/tests'
import { INSPECTION_TYPES } from '@/lib/inspection'

const ID_ALIASES = ['cxa id', 'cxa_id', 'id']
const REF_ALIASES = ['test ref', 'ref', 'test no', 'test number', 'test id', 'report no', 'certificate no', 'sr no', 's/n']
const NAME_ALIASES = [
  'test',
  'test name',
  'name',
  'description',
  'test description',
  'measurement',
  'parameter',
  'item',
  'check',
  'activity',
]
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
]
const CRITERIA_ALIASES = [
  'criteria',
  'acceptance criteria',
  'acceptance',
  'limit',
  'limits',
  'spec',
  'specification',
  'required',
  'requirement',
  'expected',
  'expected value',
  'tolerance',
  'standard',
]
const MIN_ALIASES = ['min', 'minimum', 'lower limit', 'lower', 'from', 'expected min']
const MAX_ALIASES = ['max', 'maximum', 'upper limit', 'upper', 'to', 'expected max']
const VALUE_ALIASES = [
  'measured',
  'measured value',
  'actual',
  'actual value',
  'reading',
  'result value',
  'value',
  'recorded',
  'as found',
  'test value',
]
const TEXT_ALIASES = ['observation', 'finding', 'measured text', 'actual text', 'as left']
const UNIT_ALIASES = ['unit', 'units', 'uom', 'engineering unit']
const RESULT_ALIASES = ['result', 'pass/fail', 'p/f', 'outcome', 'status', 'verdict']
const INSTRUMENT_ALIASES = [
  'instrument',
  'instrument id',
  'instrument no',
  'test equipment',
  'meter',
  'device',
  'equipment used',
  'm&te',
  'mte',
  'calibration id',
]
const TESTED_BY_ALIASES = ['tested by', 'performed by', 'engineer', 'technician', 'carried out by', 'by']
const WITNESS_ALIASES = ['witness', 'witnessed by', 'client witness', 'attended by', 'verified by']
const DATE_ALIASES = ['date', 'test date', 'tested on', 'date tested', 'performed on', 'when']
const PROCEDURE_ALIASES = ['procedure', 'procedure ref', 'method', 'method statement', 'itp ref', 'doc ref', 'reference']
const PRECONDITION_ALIASES = ['preconditions', 'precondition', 'prerequisites', 'prerequisite', 'conditions']
const COMMENT_ALIASES = ['comments', 'comment', 'notes', 'note', 'remarks', 'remark']
const ITP_ALIASES = ['itp', 'itp type', 'inspection type', 'hold point', 'h/w/s', 'point type']
const REMOVE_ALIASES = ['remove', 'delete', 'drop']

const TRUTHY = new Set(['y', 'yes', 'true', '1', 'x', '✓', '✔'])

const GUIDE_SHEETS = [
  'how to edit this',
  'how to fill this in',
  'levels',
  'categories',
  'criteria',
  'itp types',
  'units',
  'guide',
  'instructions',
  'help',
  'notes',
  'legend',
  'lists',
  'dropdowns',
  'reference',
  'summary',
  'read me',
  'readme',
]

function norm(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && value !== null && 'richText' in value) {
    return (value as { richText: { text: string }[] }).richText.map((t) => t.text).join('').trim()
  }
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
  return norm(value).toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').replace(/[.:]+$/, '')
}

// ── Numbers ──────────────────────────────────────────────────────────────

/**
 * A number out of a spreadsheet cell.
 *
 * Tolerates thousands separators, a stray unit stuck on the end ("640 MΩ"),
 * and the µ/Ω characters that survive a copy-paste. Returns null rather than
 * NaN so a caller cannot accidentally treat an unreadable cell as zero — on a
 * "not less than" criterion, zero passes nothing and fails everything, which
 * is exactly the sort of silent wrongness this file exists to prevent.
 */
export function toNumber(raw: string): number | null {
  // Match the first thing that is actually shaped like a number rather than
  // stripping the string down to "number characters" — the letter e is a
  // number character (1e6) and it also sits inside "less", "more" and
  // "exceeding", so stripping turns "not less than 1000" into "e 1000" and
  // reads it as nothing at all. The assertions caught this; nothing on any
  // screen would have.
  const match = raw.replace(/,/g, '').match(/-?\d*\.?\d+(?:[eE][+-]?\d+)?/)
  if (!match) return null
  const n = Number(match[0])
  return Number.isFinite(n) ? n : null
}

export type Criteria = {
  criteria_type: 'min' | 'max' | 'range' | 'text'
  expected_min: number | null
  expected_max: number | null
  unit: string | null
  criteria_text: string | null
}

const UNIT_AFTER = /([\d.]+)\s*([a-zA-Zµμ°%Ω/·⋅]+(?:\s?[a-zA-Z]+)?)\s*$/

function unitFrom(text: string): string | null {
  const match = text.match(UNIT_AFTER)
  const unit = match?.[2]?.trim()
  if (!unit) return null
  // Words that follow a number but are not units.
  if (/^(and|or|to|max|min|at|of|per|each|no|nos)$/i.test(unit)) return null
  return unit
}

/**
 * Read an acceptance criterion written the way engineers write them.
 *
 * "≥ 1000 MΩ", ">=1000", "min 1000 MΩ", "not less than 1000" all mean the
 * same thing; "540 – 560 V" and "between 3 and 5 bar" are ranges. Anything
 * that cannot be read as a number is kept as text and judged by a person,
 * which is a real criteria type here, not a failure.
 */
export function parseCriteria(raw: string): Criteria {
  const text = raw.trim()
  const asText: Criteria = {
    criteria_type: 'text',
    expected_min: null,
    expected_max: null,
    unit: null,
    criteria_text: text || null,
  }
  if (!text) return asText

  const lower = text.toLowerCase()
  const unit = unitFrom(text)

  // Ranges first — a range contains two numbers and would otherwise be read
  // as whichever comparison appears first.
  const range =
    text.match(/(-?[\d.,]+)\s*(?:–|—|-|\.\.\.|\.\.|\bto\b)\s*(-?[\d.,]+)/i) ??
    lower.match(/between\s+(-?[\d.,]+)\s+and\s+(-?[\d.,]+)/i)
  if (range) {
    const a = toNumber(range[1])
    const b = toNumber(range[2])
    if (a !== null && b !== null) {
      return {
        criteria_type: 'range',
        expected_min: Math.min(a, b),
        expected_max: Math.max(a, b),
        unit,
        criteria_text: text,
      }
    }
  }

  // "not less than" is a minimum, and it contains "less than". So the
  // negated forms are recognised first and their own words then removed,
  // otherwise every one of them reads as both a floor and a ceiling and is
  // thrown out as ambiguous.
  const negatedMin = /\b(?:not|no)\s+less\s+than\b|\bat\s+least\b|\bnot\s+below\b/i
  const negatedMax = /\b(?:not|no)\s+more\s+than\b|\bat\s+most\b|\bnot\s+exceed(?:ing)?\b|\bnot\s+greater\s+than\b|\bnot\s+above\b/i

  const hasNegatedMin = negatedMin.test(text)
  const hasNegatedMax = negatedMax.test(text)
  const rest = text.replace(negatedMin, ' ').replace(negatedMax, ' ')

  const isMin = hasNegatedMin || /(?:≥|>=|>|\bmin(?:imum)?\b|\bgreater than\b|\babove\b)/i.test(rest)
  const isMax = hasNegatedMax || /(?:≤|<=|<|\bmax(?:imum)?\b|\bless than\b|\bbelow\b)/i.test(rest)

  const number = toNumber(text)
  if (number === null) return asText

  // Both words present is ambiguous — "min 3 max 5" is really a range, and
  // anything else is not safe to guess at.
  if (isMin && isMax) {
    const numbers = (text.match(/-?[\d.,]+/g) ?? []).map(toNumber).filter((n): n is number => n !== null)
    if (numbers.length >= 2) {
      return {
        criteria_type: 'range',
        expected_min: Math.min(...numbers),
        expected_max: Math.max(...numbers),
        unit,
        criteria_text: text,
      }
    }
    return asText
  }

  if (isMin) {
    return { criteria_type: 'min', expected_min: number, expected_max: null, unit, criteria_text: text }
  }
  if (isMax) {
    return { criteria_type: 'max', expected_min: null, expected_max: number, unit, criteria_text: text }
  }

  // A bare number with no comparison is not a criterion — "50" could be a
  // floor or a ceiling and the difference is the whole test. Kept as text
  // rather than guessed.
  return asText
}

// ── Value matching ───────────────────────────────────────────────────────

export function matchResult(raw: string): 'pass' | 'fail' | 'pending' | null {
  const v = raw.trim().toLowerCase()
  if (!v) return 'pending'
  if (['pass', 'passed', 'p', 'ok', 'acceptable', 'satisfactory', 'sat', 'accept', 'accepted', 'complete'].includes(v))
    return 'pass'
  if (['fail', 'failed', 'f', 'reject', 'rejected', 'unsatisfactory', 'unsat', 'not acceptable'].includes(v))
    return 'fail'
  if (['pending', 'not tested', 'open', 'tbc', 'to do', 'not started', 'outstanding', 'n/a', 'na'].includes(v))
    return 'pending'
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

export function matchDate(raw: string): { value: string | null; ambiguous: boolean } {
  const v = raw.trim()
  if (!v) return { value: null, ambiguous: false }

  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return { value: `${iso[1]}-${iso[2]}-${iso[3]}`, ambiguous: false }

  const parsed = Date.parse(v.replace(/(\d)(st|nd|rd|th)\b/gi, '$1'))
  if (!Number.isNaN(parsed) && /[a-z]{3}/i.test(v)) {
    return { value: new Date(parsed).toISOString().slice(0, 10), ambiguous: false }
  }
  return { value: null, ambiguous: true }
}

// ── Shapes ───────────────────────────────────────────────────────────────

export type ParsedTest = {
  row: number
  id: string | null
  test_ref: string | null
  subject: string | null
  name: string
  procedure_ref: string | null
  preconditions: string | null
  criteria_type: string
  expected_min: number | null
  expected_max: number | null
  unit: string | null
  criteria_text: string | null
  actual_value: number | null
  actual_text: string | null
  /** computed here from the value and the criteria — never taken from the file */
  result: string
  /** what the file claimed, kept only so the screen can say what was ignored */
  claimedResult: string | null
  instrument: string | null
  tested_by: string | null
  witness: string | null
  tested_at: string | null
  comments: string | null
  inspection_type: string
  remove: boolean
}

export type TestProblem = { row: number; column: string; value: string; message: string }

export type TestParseResult = {
  rows: ParsedTest[]
  errors: TestProblem[]
  warnings: TestProblem[]
  sheetName: string | null
  headerRow: number | null
  headingsSeen: string[]
  detectedColumns: string[]
  /** rows where the file's own Result disagreed with its own numbers */
  disagreements: number
}

type Mapping = {
  headerRow: number
  id: number | null
  ref: number | null
  subject: number | null
  name: number
  criteria: number | null
  min: number | null
  max: number | null
  unit: number | null
  value: number | null
  text: number | null
  result: number | null
  instrument: number | null
  testedBy: number | null
  witness: number | null
  date: number | null
  procedure: number | null
  precondition: number | null
  comments: number | null
  itp: number | null
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

    const name = find(NAME_ALIASES)
    if (name === null) continue

    const claimed = new Set<number>([name])
    // One column, one part. A single "Description" column must not be read
    // as the test name and the acceptance criteria at the same time.
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
      name,
      criteria: once(CRITERIA_ALIASES),
      min: once(MIN_ALIASES),
      max: once(MAX_ALIASES),
      unit: once(UNIT_ALIASES),
      value: once(VALUE_ALIASES),
      text: once(TEXT_ALIASES),
      result: once(RESULT_ALIASES),
      instrument: once(INSTRUMENT_ALIASES),
      testedBy: once(TESTED_BY_ALIASES),
      witness: once(WITNESS_ALIASES),
      date: once(DATE_ALIASES),
      procedure: once(PROCEDURE_ALIASES),
      precondition: once(PRECONDITION_ALIASES),
      comments: once(COMMENT_ALIASES),
      itp: once(ITP_ALIASES),
      remove: once(REMOVE_ALIASES),
    }

    const score = claimed.size
    if (score < 2 && widest > 1) continue
    if (!best || score > best.score) best = { mapping, score }
  }

  return { mapping: best?.mapping ?? null, headingsSeen }
}

export async function parseTestWorkbook(
  buffer: ArrayBuffer,
  options: { fileName?: string } = {}
): Promise<TestParseResult> {
  const workbook = new ExcelJS.Workbook()
  const name = options.fileName ?? ''

  if (name.toLowerCase().endsWith('.csv')) {
    await workbook.csv.read(Readable.from([Buffer.from(buffer).toString('utf8')]))
  } else {
    await workbook.xlsx.load(buffer)
  }

  const rows: ParsedTest[] = []
  const errors: TestProblem[] = []
  const warnings: TestProblem[] = []
  let allHeadings: string[] = []
  let firstSheet: string | null = null
  let firstHeaderRow: number | null = null
  let detected: string[] = []
  let disagreements = 0

  for (const sheet of workbook.worksheets) {
    const { mapping, headingsSeen } = findMapping(sheet)
    allHeadings = [...allHeadings, ...headingsSeen.filter((h) => !allHeadings.includes(h))]
    if (!mapping) continue

    if (firstSheet === null) {
      firstSheet = sheet.name
      firstHeaderRow = mapping.headerRow
      detected = ['Test']
      const add = (col: number | null, label: string) => {
        if (col !== null) detected.push(label)
      }
      add(mapping.id, 'CXA ID')
      add(mapping.ref, 'Test ref')
      add(mapping.subject, 'Tag / System')
      add(mapping.criteria, 'Acceptance criteria')
      add(mapping.min, 'Min')
      add(mapping.max, 'Max')
      add(mapping.unit, 'Unit')
      add(mapping.value, 'Measured value')
      add(mapping.instrument, 'Instrument')
      add(mapping.testedBy, 'Tested by')
      add(mapping.witness, 'Witness')
      add(mapping.date, 'Date')
      add(mapping.itp, 'ITP type')
    }

    for (let r = mapping.headerRow + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)
      const at = (col: number | null) => (col === null ? '' : norm(row.getCell(col).value))

      const testName = at(mapping.name)
      if (!testName) continue

      // ── Criteria ───────────────────────────────────────────────────────
      // Explicit Min/Max columns beat a free-text criteria column, because
      // they cannot be misread.
      const rawMin = at(mapping.min)
      const rawMax = at(mapping.max)
      const min = rawMin ? toNumber(rawMin) : null
      const max = rawMax ? toNumber(rawMax) : null
      const rawCriteria = at(mapping.criteria)
      const unitColumn = at(mapping.unit) || null

      let criteria: Criteria
      if (min !== null && max !== null) {
        criteria = { criteria_type: 'range', expected_min: min, expected_max: max, unit: unitColumn, criteria_text: rawCriteria || null }
      } else if (min !== null) {
        criteria = { criteria_type: 'min', expected_min: min, expected_max: null, unit: unitColumn, criteria_text: rawCriteria || null }
      } else if (max !== null) {
        criteria = { criteria_type: 'max', expected_min: null, expected_max: max, unit: unitColumn, criteria_text: rawCriteria || null }
      } else {
        criteria = parseCriteria(rawCriteria)
        if (unitColumn) criteria.unit = unitColumn
      }

      if ((rawMin && min === null) || (rawMax && max === null)) {
        errors.push({
          row: r,
          column: rawMin && min === null ? 'Min' : 'Max',
          value: rawMin && min === null ? rawMin : rawMax,
          message: 'Not a number. A limit that cannot be read is worse than no limit, because the test would judge itself against it.',
        })
        continue
      }

      if (rawCriteria && criteria.criteria_type === 'text' && min === null && max === null && /\d/.test(rawCriteria)) {
        warnings.push({
          row: r,
          column: 'Acceptance criteria',
          value: rawCriteria,
          message:
            'Contains a number but no ≥, ≤ or range, so it cannot be judged automatically and is kept as a criterion for a person to judge. Write it as "≥ 1000 MΩ" or "540 – 560 V" to have the app decide.',
        })
      }

      // ── Measured value ─────────────────────────────────────────────────
      const rawValue = at(mapping.value)
      const value = rawValue ? toNumber(rawValue) : null
      if (rawValue && value === null && criteria.criteria_type !== 'text') {
        errors.push({
          row: r,
          column: 'Measured value',
          value: rawValue,
          message: 'Not a number, but this test has a numeric acceptance criterion. Put the reading here and any words in Comments.',
        })
        continue
      }

      // ── The result is computed, never imported ─────────────────────────
      const rawResult = at(mapping.result)
      const claimed = rawResult ? matchResult(rawResult) : null
      if (rawResult && claimed === null) {
        warnings.push({
          row: r,
          column: 'Result',
          value: rawResult,
          message: 'Not recognised. It makes no difference to the import — the result is worked out from the measured value and the criteria — but it is worth knowing the column was unreadable.',
        })
      }

      const computed =
        criteria.criteria_type === 'text'
          ? (claimed ?? 'pending')
          : evaluateTest(criteria.criteria_type, criteria.expected_min, criteria.expected_max, value)

      if (
        criteria.criteria_type !== 'text' &&
        claimed !== null &&
        claimed !== 'pending' &&
        computed !== 'pending' &&
        claimed !== computed
      ) {
        disagreements += 1
        warnings.push({
          row: r,
          column: 'Result',
          value: rawResult,
          message: `The file says ${claimed.toUpperCase()}, but ${value} against this row's own acceptance criteria is ${computed.toUpperCase()}. The measured value wins — that is the whole point of recording it — so the record will read ${computed.toUpperCase()}.`,
        })
      }

      // ── The rest ───────────────────────────────────────────────────────
      const rawDate = at(mapping.date)
      const date = matchDate(rawDate)
      if (rawDate && date.ambiguous) {
        errors.push({
          row: r,
          column: 'Date',
          value: rawDate,
          message: 'Cannot be read without guessing whether the day or the month comes first. Write it as 2026-04-03, or as 3 Apr 2026.',
        })
        continue
      }

      const rawItp = at(mapping.itp)
      const inspection = matchInspection(rawItp)
      if (rawItp && inspection === null) {
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
        test_ref: at(mapping.ref) || null,
        subject: at(mapping.subject) || null,
        name: testName,
        procedure_ref: at(mapping.procedure) || null,
        preconditions: at(mapping.precondition) || null,
        criteria_type: criteria.criteria_type,
        expected_min: criteria.expected_min,
        expected_max: criteria.expected_max,
        unit: criteria.unit,
        criteria_text: criteria.criteria_text,
        actual_value: value,
        actual_text: at(mapping.text) || null,
        result: computed,
        claimedResult: claimed,
        instrument: at(mapping.instrument) || null,
        tested_by: at(mapping.testedBy) || null,
        witness: at(mapping.witness) || null,
        tested_at: date.value,
        comments: at(mapping.comments) || null,
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
    disagreements,
  }
}
