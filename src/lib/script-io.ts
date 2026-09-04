// The CxSentinel test script format.
//
// One sheet is one script: the equipment it tests and the level named once at
// the top, then a numbered run of checks. It is the shape a commissioning
// engineer already writes a test procedure in, with nothing in it that exists
// only to suit a database.
//
//     No. | Section | Content | Answer | Attachment | Remark | Links to
//
// Six columns, and each one is there because a test sheet without it is
// missing something people write in the margin anyway:
//
//   No.         The serial number. It is how a check is referred to out loud
//               on site — "we're stuck on 84" — and it is what one line uses
//               to point at another.
//   Section     Optional. The heading a run of checks sits under, so two
//               hundred lines reading "Proper craftsmanship." can be told
//               apart.
//   Content     The check itself.
//   Answer      Yes / No / N A. Pass and Fail are accepted and mean the same.
//               Blank means not done yet — which is different from N/A, and
//               the two are never merged.
//   Attachment  What proves it. A file name, a photo reference, a drawing
//               number. A spreadsheet cell cannot carry a file, so this
//               records what the evidence IS; the file itself is uploaded
//               against the check.
//   Remark      What actually happened. The most valuable column on any real
//               test sheet and the first one most software leaves out.
//   Links to    What this check is connected to — another line on the sheet,
//               a tag, a requirement, an obligation, a drawing, a standard.
//
// ── The one rule that governs the whole file ────────────────────────────
//
// **A value that can be checked and is wrong stops the import. A value that
// cannot be checked is kept exactly as written and reported.**
//
// So a link to line 12 when the sheet has no line 12 is an error, because
// the sheet contradicts itself and only the person who wrote it can say what
// was meant. A link to drawing E-4102-B is kept as typed, because nothing
// here knows what drawings exist and inventing an opinion about it would be
// worse than silence.

import ExcelJS from 'exceljs'
import { Readable } from 'node:stream'

// ── Column names this reader answers to ──────────────────────────────────
//
// Real sheets arrive with the columns named whatever the last engineer called
// them, so each one has a list rather than a name. Order in the file does not
// matter and neither does case.

const ALIASES: Record<string, string[]> = {
  serial: ['no', 'no.', '#', 'sr', 'sr.', 's/n', 'sn', 'serial', 'serial no', 'serial no.', 'serial number', 'item no', 'item no.', 'line', 'line #', 'step', 'step no', 'point', 'point no'],
  section: ['section', 'heading', 'header', 'group', 'part', 'category', 'sub section', 'subsection'],
  content: ['content', 'item to check', 'item', 'description', 'check', 'checks', 'task', 'test', 'test step', 'activity', 'inspection', 'requirement description'],
  answer: ['answer', 'yes/no/na', 'yes no na', 'yes/no/n/a', 'y/n/na', 'result', 'pass/fail', 'outcome', 'status'],
  attachment: ['attachment', 'attachments', 'attached', 'evidence', 'photo', 'photograph', 'file', 'record', 'proof'],
  remark: ['remark', 'remarks', 'note', 'notes', 'comment', 'comments', 'observation', 'finding'],
  links: ['links to', 'link to', 'links', 'link', 'reference', 'references', 'ref', 'ref.', 'related', 'related to', 'connection', 'connections', 'connected to', 'see also', 'cross reference'],
  level: ['level', 'commissioning level', 'cx level', 'stage'],
  subject: ['tag', 'tag / system', 'tag/system', 'system', 'equipment', 'asset', 'kks', 'tag no', 'tag number', 'equipment tag'],
  id: ['cxa id', 'cxaid', 'id'],
  remove: ['remove', 'delete', 'del'],
}

const REQUIRED = ['content']

export type ScriptProblem = { sheet: string; row: number; column: string; value: string; message: string }

export type LinkKind = 'line' | 'subject' | 'requirement' | 'obligation' | 'reference'

export type ParsedLink = {
  /** Exactly as typed. */
  raw: string
  kind: LinkKind
  /** For 'line', the serial it points at. */
  serial?: string
}

export type ScriptRow = {
  row: number
  serial: string | null
  section: string | null
  content: string
  /** pass | fail | na | pending */
  status: string
  /** The words the sheet used, kept for the export so it round-trips. */
  answerType: string
  attachment: string | null
  remark: string | null
  links: ParsedLink[]
  /** Overrides the equipment named at the top of the sheet, when present. */
  subjectText: string | null
  /** Overrides the level named at the top of the sheet, when present. */
  levelText: string | null
  id: string | null
  remove: boolean
}

export type ScriptSheet = {
  sheet: string
  /** From the "Equipment / System:" cell above the table. */
  subjectText: string | null
  /** From the "Level:" cell above the table. */
  levelText: string | null
  headerRow: number
  columnsFound: string[]
  rows: ScriptRow[]
}

export type ScriptParseResult = {
  sheets: ScriptSheet[]
  errors: ScriptProblem[]
  warnings: ScriptProblem[]
  sheetsSeen: string[]
}

// ── Cells ────────────────────────────────────────────────────────────────

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const rich = value as { richText?: { text: string }[]; text?: string; result?: unknown; hyperlink?: string }
  if (Array.isArray(rich.richText)) return rich.richText.map((r) => r.text).join('').trim()
  if (typeof rich.text === 'string') return rich.text.trim()
  if (rich.result !== undefined) return cellText(rich.result)
  return ''
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/[:*]+$/, '').trim()
}

// ── Answers ──────────────────────────────────────────────────────────────
//
// Yes and Pass mean the same thing and both are written on real sheets, often
// on the same one. N/A is its own answer and never becomes a Yes: "does not
// apply" and "checked and correct" are different facts, and a handover pack
// that cannot tell them apart is worth less than the paper.
//
// A blank is NOT an answer. It means nobody has been there yet.

const ANSWERS: Record<string, { status: string; type: string }> = {
  yes: { status: 'pass', type: 'Yes / No / N A' },
  y: { status: 'pass', type: 'Yes / No / N A' },
  ok: { status: 'pass', type: 'Yes / No / N A' },
  pass: { status: 'pass', type: 'Pass / Fail' },
  passed: { status: 'pass', type: 'Pass / Fail' },
  accepted: { status: 'pass', type: 'Pass / Fail' },
  '✓': { status: 'pass', type: 'Yes / No / N A' },
  no: { status: 'fail', type: 'Yes / No / N A' },
  n: { status: 'fail', type: 'Yes / No / N A' },
  ng: { status: 'fail', type: 'Pass / Fail' },
  fail: { status: 'fail', type: 'Pass / Fail' },
  failed: { status: 'fail', type: 'Pass / Fail' },
  rejected: { status: 'fail', type: 'Pass / Fail' },
  na: { status: 'na', type: 'Yes / No / N A' },
  'n/a': { status: 'na', type: 'Yes / No / N A' },
  'n a': { status: 'na', type: 'Yes / No / N A' },
  'not applicable': { status: 'na', type: 'Yes / No / N A' },
  pending: { status: 'pending', type: 'Yes / No / N A' },
  '-': { status: 'pending', type: 'Yes / No / N A' },
  '—': { status: 'pending', type: 'Yes / No / N A' },
}

export function readAnswer(raw: string): { status: string; type: string } | null {
  const v = norm(raw)
  if (!v) return { status: 'pending', type: 'Yes / No / N A' }
  return ANSWERS[v] ?? null
}

/** The words to write back out, so an export re-imports unchanged. */
export function answerWords(status: string | null, type: string | null): string {
  const passFail = (type ?? '').startsWith('Pass')
  switch (status) {
    case 'pass':
      return passFail ? 'Pass' : 'Yes'
    case 'fail':
      return passFail ? 'Fail' : 'No'
    case 'na':
      return 'N/A'
    default:
      return ''
  }
}

// ── Links ────────────────────────────────────────────────────────────────

const REQUIREMENT = /^(req|r)[-\s]?\d+/i
const OBLIGATION = /^(obl|ob)[-\s]?\d+/i
const LINE = /^#?\s*(\d{1,4})(\.\d{1,3})?$/

/**
 * Split a Links to cell and say what each piece is.
 *
 * Kind is decided by shape alone here, because a parser has no database. What
 * a 'subject' or a 'requirement' actually resolves to is settled by the
 * import, which can ask. A piece that matches nothing recognisable is a
 * 'reference' — a drawing, a submittal, a standard clause — and is kept
 * exactly as typed.
 */
export function parseLinks(raw: string): ParsedLink[] {
  if (!raw.trim()) return []
  return raw
    .split(/[;,\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((piece) => {
      const line = LINE.exec(piece)
      if (line) return { raw: piece, kind: 'line' as LinkKind, serial: line[1] + (line[2] ?? '') }
      if (REQUIREMENT.test(piece)) return { raw: piece, kind: 'requirement' as LinkKind }
      if (OBLIGATION.test(piece)) return { raw: piece, kind: 'obligation' as LinkKind }
      // A tag looks like a tag: letters and digits joined by dashes or
      // slashes, no spaces. A drawing number can look the same, which is why
      // the import checks it against the asset register before believing it.
      if (/^[A-Za-z0-9]{1,8}(?:[-/][A-Za-z0-9]{1,8}){1,4}$/.test(piece)) {
        return { raw: piece, kind: 'subject' as LinkKind }
      }
      return { raw: piece, kind: 'reference' as LinkKind }
    })
}

/** Put them back in a cell, unchanged. */
export function linksText(links: ParsedLink[]): string {
  return links.map((l) => l.raw).join('; ')
}

// ── Finding the table ────────────────────────────────────────────────────

type Mapping = { headerRow: number; cols: Record<string, number>; found: string[] }

function findMapping(sheet: ExcelJS.Worksheet): Mapping | null {
  let best: Mapping | null = null
  const limit = Math.min(sheet.rowCount, 40)

  for (let r = 1; r <= limit; r++) {
    const cols: Record<string, number> = {}
    const row = sheet.getRow(r)
    for (let c = 1; c <= Math.min(sheet.columnCount, 30); c++) {
      const t = norm(cellText(row.getCell(c).value))
      if (!t) continue
      for (const [key, names] of Object.entries(ALIASES)) {
        if (cols[key] === undefined && names.includes(t)) cols[key] = c
      }
    }
    const found = Object.keys(cols)
    if (!REQUIRED.every((k) => cols[k] !== undefined)) continue
    // The best header row is the one that recognises the most columns; ties
    // go to the later row, because title blocks and revision tables sit above
    // the data and sometimes echo its wording.
    if (!best || found.length >= best.found.length) best = { headerRow: r, cols, found }
  }
  return best
}

/** A labelled cell above the table — "Equipment / System:", "Level:". */
function labelled(sheet: ExcelJS.Worksheet, names: string[], beforeRow: number): string | null {
  for (let r = 1; r < beforeRow; r++) {
    const row = sheet.getRow(r)
    for (let c = 1; c <= Math.min(sheet.columnCount, 30); c++) {
      if (!names.includes(norm(cellText(row.getCell(c).value)))) continue
      for (let k = c + 1; k <= Math.min(sheet.columnCount, 30); k++) {
        const v = cellText(row.getCell(k).value)
        if (!v) continue
        // A label is not a value. Two label/value pairs share a row in this
        // format, so scanning past an empty cell would otherwise return the
        // next label as the answer.
        if (/:\s*$/.test(v) || Object.values(ALIASES).flat().includes(norm(v))) return null
        if (['equipment / system', 'equipment/system', 'level', 'script name'].includes(norm(v))) return null
        return v
      }
    }
  }
  return null
}

export async function parseScriptWorkbook(
  buffer: ArrayBuffer,
  options: { fileName?: string } = {}
): Promise<ScriptParseResult> {
  const workbook = new ExcelJS.Workbook()
  const name = options.fileName ?? ''
  if (name.toLowerCase().endsWith('.csv')) {
    await workbook.csv.read(Readable.from([Buffer.from(buffer).toString('utf8')]))
  } else {
    await workbook.xlsx.load(buffer)
  }

  const sheets: ScriptSheet[] = []
  const errors: ScriptProblem[] = []
  const warnings: ScriptProblem[] = []
  const sheetsSeen: string[] = []

  for (const ws of workbook.worksheets) {
    sheetsSeen.push(ws.name)
    // The guide tab that ships with the template has no table on it, and
    // neither does a title page. Neither is an error.
    if (norm(ws.name) === 'guide' || norm(ws.name) === 'how to use') continue

    const mapping = findMapping(ws)
    if (!mapping) continue

    const cols = mapping.cols
    const get = (row: ExcelJS.Row, key: string): string =>
      cols[key] === undefined ? '' : cellText(row.getCell(cols[key]).value)

    const rows: ScriptRow[] = []
    const serialsSeen = new Map<string, number>()

    for (let r = mapping.headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const content = get(row, 'content')
      const serialRaw = get(row, 'serial')

      // A row with a number and nothing else is a blank line somebody left in
      // the sheet, not a check with no content.
      if (!content) {
        if (serialRaw && Object.keys(cols).some((k) => k !== 'serial' && get(row, k))) {
          errors.push({
            sheet: ws.name,
            row: r,
            column: 'Content',
            value: '',
            message: 'This row has an answer or a remark on it but nothing to check. Write what the check is, or clear the row.',
          })
        }
        continue
      }

      const answerRaw = get(row, 'answer')
      const answer = readAnswer(answerRaw)
      if (!answer) {
        errors.push({
          sheet: ws.name,
          row: r,
          column: 'Answer',
          value: answerRaw,
          message: 'Not an answer this reads. Use Yes, No or N/A — or Pass and Fail. Leave it empty for a check nobody has done yet.',
        })
        continue
      }

      const serial = serialRaw || null
      if (serial) {
        const first = serialsSeen.get(serial)
        if (first !== undefined) {
          errors.push({
            sheet: ws.name,
            row: r,
            column: 'No.',
            value: serial,
            message: `Row ${first} is already number ${serial}. Serial numbers have to be unique on a sheet — they are what one line uses to point at another, and what somebody says out loud on site.`,
          })
          continue
        }
        serialsSeen.set(serial, r)
      }

      rows.push({
        row: r,
        serial,
        section: get(row, 'section') || null,
        content,
        status: answer.status,
        answerType: answer.type,
        attachment: get(row, 'attachment') || null,
        remark: get(row, 'remark') || null,
        links: parseLinks(get(row, 'links')),
        subjectText: get(row, 'subject') || null,
        levelText: get(row, 'level') || null,
        id: get(row, 'id') || null,
        remove: /^(y|yes|x|true|1|remove|delete)$/i.test(get(row, 'remove').trim()),
      })
    }

    // ── Links that point inside this sheet can be checked here ───────────
    for (const row of rows) {
      for (const link of row.links) {
        if (link.kind !== 'line') continue
        if (!serialsSeen.has(link.serial ?? '')) {
          errors.push({
            sheet: ws.name,
            row: row.row,
            column: 'Links to',
            value: link.raw,
            message: `There is no line ${link.serial} on this sheet. A sheet that points at a line it does not have contradicts itself, and only the person who wrote it can say what was meant.`,
          })
        }
      }
    }

    if (rows.length === 0 && !errors.some((e) => e.sheet === ws.name)) {
      warnings.push({
        sheet: ws.name,
        row: mapping.headerRow,
        column: 'Content',
        value: '',
        message: 'A table was found on this sheet but there are no checks under it.',
      })
    }

    sheets.push({
      sheet: ws.name,
      subjectText: labelled(ws, ['equipment / system', 'equipment/system', 'equipment', 'system', 'tag', 'tag / system'], mapping.headerRow),
      levelText: labelled(ws, ['level', 'commissioning level', 'cx level'], mapping.headerRow),
      headerRow: mapping.headerRow,
      columnsFound: mapping.found,
      rows,
    })
  }

  if (sheets.length === 0) {
    errors.push({
      sheet: sheetsSeen.join(', ') || 'the file',
      row: 0,
      column: 'Content',
      value: '',
      message:
        'No table was found. This reads a sheet with a row of headings that includes at least a Content column — Content, Item to check, Description, Check or Test step all work — with the checks underneath it.',
    })
  }

  return { sheets, errors, warnings, sheetsSeen }
}

export function describeScriptProblem(p: ScriptProblem): string {
  const where = p.row > 0 ? `${p.sheet} row ${p.row}` : p.sheet
  return `${where}, ${p.column}: ${p.message}`
}
