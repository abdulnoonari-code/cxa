// Reading a Functional Performance Test script into the checklist register.
//
// The file this was written against is the Facility Grid FPT import template
// — the sheet a commissioning team actually builds a test script in. One
// worksheet is one FPT: a name, a type, and then a numbered run of lines,
// each with an Entry Type saying what kind of line it is and an Answer Type
// saying what the tester does with it.
//
// The whole difficulty of this importer is that MOST LINES IN A TEST SCRIPT
// ARE NOT CHECKS. Out of the 232 lines in the sample, 29 are headings and
// 203 are questions. Others carry set points, calibration readings, the
// sequence of operation, or plain narrative. Every one of those is essential
// to the document and none of them is a thing somebody ticks.
//
// That matters more than it sounds. A completion figure is checks-done over
// checks-total. Import a heading as a check and it can never be done, so the
// system is permanently short of complete. Import a set point as a check and
// somebody ticks it, and a number that was supposed to be recorded and
// compared has been replaced by a tick that proves nothing. Import a
// calibration line as a check and a measurement becomes an opinion.
//
// So the rule this file is built on:
//
//   ONLY A QUESTION BECOMES A CHECK. Everything else is counted, reported by
//   kind, and told where it belongs. Nothing is quietly converted.
//
// The second rule is inherited from the ITP importer and is the same rule:
// the script names the equipment it tests, and that equipment must already
// exist on the project. A test script cannot bring an asset into being. That
// is enforced in the action rather than here, because a parser has no
// database — but it is the reason `fptName` is returned raw rather than
// resolved.

import ExcelJS from 'exceljs'

// ── What the template's own Reference sheet defines ──────────────────────

/** Entry types. Only FPT lines are questionnaire entries. */
const ENTRY_TYPES: Record<string, { label: string; kind: 'question' | 'narrative' | 'setpoint' | 'calibration' | 'note' }> = {
  fpt: { label: 'Questionnaire entry', kind: 'question' },
  'fpt-custom': { label: 'Questionnaire entry', kind: 'question' },
  sysd: { label: 'System description', kind: 'narrative' },
  desc: { label: 'Design criteria', kind: 'narrative' },
  opa: { label: 'Operational assumptions', kind: 'narrative' },
  seqo: { label: 'Sequence of operation', kind: 'narrative' },
  setpt: { label: 'Set point', kind: 'setpoint' },
  senscal: { label: 'Sensor calibration', kind: 'calibration' },
  devcal: { label: 'Device calibration', kind: 'calibration' },
  notes: { label: 'Note', kind: 'note' },
}

/** Answer types that make a line something a person answers. */
const ANSWERABLE: Record<string, string> = {
  'yes-no-na': 'Yes / No / N/A',
  'yes-no-n/a': 'Yes / No / N/A',
  'pass-fail': 'Pass / Fail',
  'trackable custom': 'Custom (tracked)',
  'non-trackable custom': 'Custom',
  custom: 'Custom',
}

/** Answer types that are structure, not questions. */
const HEADINGS: Record<string, 1 | 2> = {
  section: 1,
  header: 1,
  subsection: 2,
  subheader: 2,
}

/** Answer types that are a reading, and belong in Test Records. */
const READINGS: Record<string, string> = {
  'two position': 'Two position',
  'two position(onoff)': 'Two position (on/off)',
  modulating: 'Modulating',
  vfd: 'VFD',
  'setpoint adjust': 'Setpoint adjust',
  ecm: 'ECM',
}

/**
 * FPT type to commissioning level.
 *
 * Only the mappings that are not a matter of opinion are here. "Factory
 * Acceptance Testing" is L1 on every project in the world; "Room Readiness"
 * and "Global Test" are not — different clients put them at different levels,
 * and a level decides what a check counts towards in a readiness figure that
 * somebody signs.
 *
 * So an unmapped type is not guessed and not defaulted. The import asks.
 */
const TYPE_TO_LEVEL: Record<string, string> = {
  'factory testing': 'L1_fat',
  'factory acceptance testing': 'L1_fat',
  'bench testing': 'L1_fat',
  'component verification': 'L2_iv',
  'system construction verification': 'L2_iv',
  'functional performance testing': 'L4_fpt',
  'level 4 commissioning': 'L4_fpt',
  'integrated functional testing': 'L5_ist',
  'integrated systems testing': 'L5_ist',
  'integrated system operation verification': 'L5_ist',
}

const HEADER_WORDS = ['line #', 'entry type', 'text', 'answer type', 'add text', 'custom text']

// ── Types ────────────────────────────────────────────────────────────────

export type FptProblem = { sheet: string; row: number; column: string; value: string; message: string }

export type FptCheck = {
  /** Spreadsheet row, for error messages. */
  row: number
  /** The template's own Line # column, kept so a check can be traced back. */
  lineNo: number | null
  /** The question itself. This becomes the check. */
  item: string
  /** The headings above it, joined. "3. Safety" or "4. Prerequisites › Documentation". */
  sectionPath: string
  /** How it is answered, in the template's words. */
  answerType: string
  /** Stable across re-imports of the same script. */
  sourceRef: string
}

export type FptSkipped = { kind: string; count: number; where: string }

export type FptScript = {
  sheet: string
  /** The equipment or system the script tests, exactly as written. */
  fptName: string | null
  /** The FPT type, exactly as written. */
  fptType: string | null
  /** The level, when the type decides it beyond argument. Null means ask. */
  level: string | null
  checks: FptCheck[]
  /** Headings, narrative, set points and readings — everything not a check. */
  skipped: FptSkipped[]
  /** Total non-blank script lines read. */
  linesRead: number
}

export type FptParseResult = {
  scripts: FptScript[]
  errors: FptProblem[]
  warnings: FptProblem[]
  sheetsSeen: string[]
}

// ── Reading ──────────────────────────────────────────────────────────────

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const rich = value as { richText?: { text: string }[]; text?: string; result?: unknown }
  if (Array.isArray(rich.richText)) return rich.richText.map((r) => r.text).join('').trim()
  if (typeof rich.text === 'string') return rich.text.trim()
  if (rich.result !== undefined) return cellText(rich.result)
  return ''
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Find the header row.
 *
 * The template carries the same header TWICE — once at the top over the
 * instructions block, and again immediately above the data. Taking the first
 * one would read the instruction rows as script lines: "Required", "Line
 * Order Number", and a paragraph explaining the entry types, all arriving as
 * content. So the LAST qualifying header row in the opening block is the one
 * that matters, because whatever follows it is data by construction.
 */
function findHeader(sheet: ExcelJS.Worksheet): { row: number; cols: Record<string, number> } | null {
  let best: { row: number; cols: Record<string, number> } | null = null
  const limit = Math.min(sheet.rowCount, 40)

  for (let r = 1; r <= limit; r++) {
    const cols: Record<string, number> = {}
    let hits = 0
    const row = sheet.getRow(r)
    for (let c = 1; c <= Math.min(sheet.columnCount, 20); c++) {
      const t = norm(cellText(row.getCell(c).value))
      if (HEADER_WORDS.includes(t)) {
        cols[t] = c
        hits++
      }
    }
    // "Text" and "Answer Type" are the two that decide whether a row can be
    // read at all. A header without both is not a header worth having.
    if (hits >= 3 && cols['text'] !== undefined && cols['answer type'] !== undefined) {
      best = { row: r, cols }
    }
  }
  return best
}

/** "FPT NAME:" and "FPT TYPE (Choose One):" — label in one cell, value to its right. */
function labelledValue(sheet: ExcelJS.Worksheet, startsWith: string, beforeRow: number): string | null {
  for (let r = 1; r < beforeRow; r++) {
    const row = sheet.getRow(r)
    for (let c = 1; c <= Math.min(sheet.columnCount, 20); c++) {
      if (norm(cellText(row.getCell(c).value)).startsWith(startsWith)) {
        for (let k = c + 1; k <= Math.min(sheet.columnCount, 20); k++) {
          const v = cellText(row.getCell(k).value)
          if (!v) continue
          // The name and the type sit on the SAME row, as two label/value
          // pairs. An empty name would otherwise scan straight past its own
          // blank cell and return the next label — so a nameless script came
          // back named "FPT TYPE (Choose One):" and was reported as an
          // equipment tag that does not exist, instead of as a missing name.
          //
          // A label is not a value. Anything ending in a colon, or beginning
          // "FPT NAME"/"FPT TYPE", stops the scan and leaves the field empty,
          // which is the truth.
          if (/:\s*$/.test(v) || /^fpt\s+(name|type)\b/i.test(v)) return null
          return v
        }
      }
    }
  }
  return null
}

export function levelForFptType(fptType: string | null): string | null {
  if (!fptType) return null
  return TYPE_TO_LEVEL[norm(fptType)] ?? null
}

/** The heading path, built as the script is walked. */
function pathOf(stack: (string | null)[]): string {
  return stack.filter((s): s is string => !!s).join(' › ')
}

export async function parseFptWorkbook(
  buffer: ArrayBuffer,
  options: { fileName?: string } = {}
): Promise<FptParseResult> {
  const workbook = new ExcelJS.Workbook()
  const name = options.fileName ?? ''
  if (name.toLowerCase().endsWith('.csv')) {
    throw new Error('A test script has to be a workbook — the name and type sit above the table, and CSV has no room for them.')
  }
  await workbook.xlsx.load(buffer)

  const scripts: FptScript[] = []
  const errors: FptProblem[] = []
  const warnings: FptProblem[] = []
  const sheetsSeen: string[] = []

  for (const sheet of workbook.worksheets) {
    sheetsSeen.push(sheet.name)
    const header = findHeader(sheet)
    // The Reference tab, and any other sheet with no table on it, is not an
    // error. The template ships with one.
    if (!header) continue

    const cols = header.cols
    const fptName = labelledValue(sheet, 'fpt name', header.row)
    const fptType = labelledValue(sheet, 'fpt type', header.row)

    const checks: FptCheck[] = []
    const skippedBy = new Map<string, { count: number; rows: number[] }>()
    let linesRead = 0
    const stack: (string | null)[] = [null, null]

    const note = (kind: string, row: number) => {
      const e = skippedBy.get(kind) ?? { count: 0, rows: [] }
      e.count++
      if (e.rows.length < 4) e.rows.push(row)
      skippedBy.set(kind, e)
    }

    for (let r = header.row + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)
      const text = cellText(row.getCell(cols['text']).value)
      if (!text) continue

      const entryRaw = cols['entry type'] !== undefined ? cellText(row.getCell(cols['entry type']).value) : ''
      const answerRaw = cellText(row.getCell(cols['answer type']).value)
      const lineRaw = cols['line #'] !== undefined ? cellText(row.getCell(cols['line #']).value) : ''
      const lineNo = /^\d+$/.test(lineRaw) ? Number(lineRaw) : null

      const entry = ENTRY_TYPES[norm(entryRaw)]
      if (!entry) {
        // Never silently dropped. A line with words on it that this reader
        // does not understand is the one most likely to matter.
        warnings.push({
          sheet: sheet.name,
          row: r,
          column: 'Entry Type',
          value: entryRaw,
          message: entryRaw
            ? `Not an entry type this template defines. The line was left out. Its text begins "${text.slice(0, 60)}".`
            : `No entry type on a row that has text. The line was left out. Its text begins "${text.slice(0, 60)}".`,
        })
        continue
      }
      linesRead++

      const answer = norm(answerRaw)

      // ── Headings: structure, and the context every check under them needs
      //
      // Real scripts use the heading types for two different jobs. Some
      // headings are headings — "Visual Inspections - Interior", "Bus Tie
      // Interlock". Others are instructions to the tester that happen to be
      // marked the same way: "The following prerequisites should be complete
      // prior to execution of CxL4."
      //
      // Treating the second kind as a heading puts a paragraph of prose above
      // every check under it, which is how a useful label becomes noise. So
      // length and a full stop decide, and the reasoning is:
      //
      //   • A sentence that ends in a full stop is prose. Headings are not
      //     punctuated that way, in this template or in any other.
      //   • A long heading is not a replacement for the heading above it —
      //     "Take a photo showing each of the below details" does not stop
      //     the checks under it belonging to "5. Equipment Identification".
      //     So it nests instead of replacing.
      //
      // The whole risk of being wrong here is a label reading slightly off.
      // It cannot create a check, cannot change a level, and cannot move a
      // number. That is why a judgement is allowed here and nowhere else in
      // this file.
      const depth = HEADINGS[answer]
      if (depth) {
        const prose = text.endsWith('.') || text.length > 110
        if (prose) {
          note('Instructions to the tester, marked as headings — shown in the script, not used as a label', r)
          continue
        }
        if (depth === 1 && text.length <= 60) {
          stack[0] = text
          stack[1] = null
        } else {
          stack[1] = text
        }
        note('Headings — kept as the context above each check', r)
        continue
      }

      // ── Readings: these belong in Test Records, never as a tick
      if (READINGS[answer]) {
        note(`${READINGS[answer]} calibration lines — a reading, not a tick. Add these on Test Records.`, r)
        continue
      }

      // ── Anything that is not a question
      if (entry.kind !== 'question') {
        note(`${entry.label} lines — reference text, not something to answer`, r)
        continue
      }

      if (entry.kind === 'question' && !ANSWERABLE[answer]) {
        if (!answerRaw) {
          warnings.push({
            sheet: sheet.name,
            row: r,
            column: 'Answer Type',
            value: '',
            message: `A questionnaire line with no answer type. Nothing says how it is answered, so it was left out. Its text begins "${text.slice(0, 60)}".`,
          })
        } else {
          warnings.push({
            sheet: sheet.name,
            row: r,
            column: 'Answer Type',
            value: answerRaw,
            message: `Not an answer type this reader knows. The line was left out rather than guessed at.`,
          })
        }
        continue
      }

      checks.push({
        row: r,
        lineNo,
        item: text,
        sectionPath: pathOf(stack),
        answerType: ANSWERABLE[answer],
        sourceRef: `FPT:${sheet.name}:${lineNo ?? `r${r}`}`,
      })
    }

    // A sheet with a table but nothing answerable on it is worth saying so
    // about, rather than reporting a successful import of nothing.
    if (checks.length === 0 && linesRead === 0) continue

    scripts.push({
      sheet: sheet.name,
      fptName,
      fptType,
      level: levelForFptType(fptType),
      checks,
      skipped: [...skippedBy.entries()].map(([kind, v]) => ({
        kind,
        count: v.count,
        where: v.rows.map((n) => `row ${n}`).join(', ') + (v.count > v.rows.length ? ' …' : ''),
      })),
      linesRead,
    })
  }

  if (scripts.length === 0) {
    errors.push({
      sheet: sheetsSeen.join(', ') || 'the file',
      row: 0,
      column: 'Answer Type',
      value: '',
      message:
        'No test script was found. This reader looks for a row of headings containing at least Text and Answer Type, with the script lines underneath.',
    })
  }

  for (const s of scripts) {
    if (!s.fptName) {
      errors.push({
        sheet: s.sheet,
        row: 0,
        column: 'FPT NAME',
        value: '',
        message:
          'No FPT NAME on this sheet. The script has to say which equipment it tests — without it there is nothing to file the checks against.',
      })
    }
    if (s.checks.length === 0) {
      errors.push({
        sheet: s.sheet,
        row: 0,
        column: 'Answer Type',
        value: '',
        message: `${s.linesRead} lines were read but none of them is a question. Nothing would be imported from this sheet.`,
      })
    }
  }

  return { scripts, errors, warnings, sheetsSeen }
}

/** For the audit entry and the screen. */
export function describeFptProblem(p: FptProblem): string {
  const where = p.row > 0 ? `${p.sheet} row ${p.row}` : p.sheet
  return `${where}, ${p.column}: ${p.message}`
}
