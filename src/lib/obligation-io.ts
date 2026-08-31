// The obligations round trip — the seventh and last of the importers.
//
// An obligations register goes out to a party, comes back with their column
// filled in, and goes out again. So it is built to survive that loop: the
// reference identifies a row, the state and the evidence are what they change,
// and the statement itself is theirs to correct if we read the clause wrong.
//
// One thing is deliberately harder to change here than anywhere else. The
// **party** is the whole content of an obligation — it is the answer to "whose
// was this?" — so a party the file names but CxSentinel does not recognise
// stops the import rather than quietly filing the row as unassigned. Getting
// that wrong on a re-import would silently orphan somebody's obligations.

import ExcelJS from 'exceljs'
import { Readable } from 'stream'
import { PARTIES, OBLIGATION_TYPES, OBLIGATION_STATUSES } from '@/lib/obligations'
import { LEVELS } from '@/lib/checklist'
import { matchLevel } from '@/lib/checklist-io'

const ID_ALIASES = ['cxa id', 'cxa_id', 'id']
const REF_ALIASES = ['ref', 'reference', 'obligation ref', 'obl', 'obl no', 'item no', 'no', 'sr no', 's/n']
const CLAUSE_ALIASES = ['clause', 'clause no', 'clause ref', 'section', 'article', 'para', 'paragraph']
const STATEMENT_ALIASES = [
  'obligation',
  'statement',
  'requirement',
  'description',
  'duty',
  'commitment',
  'undertaking',
  'what is owed',
  'scope',
  'item',
]
const PARTY_ALIASES = ['party', 'responsible', 'responsible party', 'owner party', 'owed by', 'accountable', 'company', 'responsibility']
const TYPE_ALIASES = ['kind', 'type', 'obligation type', 'category', 'nature']
const STATUS_ALIASES = ['state', 'status', 'progress', 'position']
const OWNER_ALIASES = ['owner', 'assigned to', 'person', 'contact', 'action by']
const DUE_ALIASES = ['due', 'due date', 'target', 'target date', 'required by', 'deadline', 'by when']
const LEVEL_ALIASES = ['level', 'cx level', 'commissioning level', 'stage', 'bites at', 'phase']
const EVIDENCE_ALIASES = ['evidence', 'proof', 'transmittal', 'reference document', 'discharged by', 'closed by']
const NOTES_ALIASES = ['notes', 'note', 'comment', 'comments', 'remark', 'remarks']
const REMOVE_ALIASES = ['remove', 'delete', 'drop']

const TRUTHY = new Set(['y', 'yes', 'true', '1', 'x', '✓', '✔'])

const GUIDE_SHEETS = [
  'how to edit this',
  'how to fill this in',
  'summary',
  'parties',
  'levels',
  'kinds',
  'states',
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

// ── Value matching ───────────────────────────────────────────────────────

/**
 * Which party a cell names.
 *
 * Matched against the stored value, the full label, the short label, and the
 * words a party is called on site. Returns null for anything unrecognised —
 * the caller treats that as an error, not as unassigned, because "Sub Con"
 * silently becoming nobody's problem is exactly the failure this register
 * exists to prevent.
 */
export function matchParty(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null

  const exact = PARTIES.find(
    (p) => p.value === v || p.label.toLowerCase() === v || p.label.toLowerCase().split(' / ')[0] === v
  )
  if (exact) return exact.value

  // The words a party is actually called in a spreadsheet column.
  if (/^(sub[- ]?con(tractor)?s?)$/.test(v)) return 'subcontractor'
  if (/^(main con(tractor)?|epc|principal contractor|gc)$/.test(v)) return 'epc'
  if (/^(con(tractor)?s?)$/.test(v)) return 'contractor'
  if (/^(vendor|supplier|oem|manufacturer)s?$/.test(v)) return 'vendor'
  if (/^(client|owner|employer|purchaser)s?$/.test(v)) return 'client'
  if (/^(cxm|cx m|commissioning manager|cx manager)$/.test(v)) return 'cx_manager'
  if (/^(cxa|cx a|commissioning authority|cx authority)$/.test(v)) return 'cx_authority'
  if (/^(operator|o&m|o & m|facilities)$/.test(v)) return 'operator'
  if (/^(designer|consultant|design engineer|architect)$/.test(v)) return 'consultant'
  if (/^(authority|utility|grid|ahj|regulator|inspectorate)$/.test(v)) return 'authority'

  return null
}

export function matchType(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  if (!v) return 'other'
  const exact = OBLIGATION_TYPES.find((t) => t.value === v || t.label.toLowerCase() === v)
  if (exact) return exact.value
  if (/^(provide|supply|submit|deliver|issue)$/.test(v)) return 'provide'
  if (/^(perform|do|carry out|execute|test)$/.test(v)) return 'perform'
  if (/^(witness|attend|witness \/ attend)$/.test(v)) return 'witness'
  if (/^(approve|review|review or approve|accept)$/.test(v)) return 'approve'
  if (/^(notify|notice|give notice|inform)$/.test(v)) return 'notify'
  if (/^(maintain|keep|maintain \/ keep|retain)$/.test(v)) return 'maintain'
  if (/^(comply|comply with|conform)$/.test(v)) return 'comply'
  if (/^(other|misc|general)$/.test(v)) return 'other'
  return null
}

export function matchStatus(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  if (!v) return 'open'
  const exact = OBLIGATION_STATUSES.find((s) => s.value === v || s.label.toLowerCase() === v)
  if (exact) return exact.value
  if (/^(open|outstanding|owed|new|not started|o)$/.test(v)) return 'open'
  if (/^(in progress|wip|started|ongoing|working)$/.test(v)) return 'in_progress'
  // "Done" and "complete" are the owing party's word. They mean submitted —
  // never accepted, because accepting is the other party's decision and a
  // spreadsheet cell cannot make it.
  if (/^(submitted|sent|issued|done|complete[d]?|discharged|provided)$/.test(v)) return 'submitted'
  if (/^(accepted|approved|closed|verified|agreed|signed off)$/.test(v)) return 'accepted'
  if (/^(waived|waiver|released|given up)$/.test(v)) return 'waived'
  if (/^(n\/a|na|not applicable|does not apply)$/.test(v)) return 'not_applicable'
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

export type ParsedObligation = {
  row: number
  id: string | null
  ref: string | null
  clause: string | null
  statement: string
  party: string | null
  obligation_type: string
  status: string
  owner: string | null
  due_date: string | null
  level: string | null
  evidence: string | null
  notes: string | null
  remove: boolean
}

export type ObligationProblem = { row: number; column: string; value: string; message: string }

export type ObligationParseResult = {
  rows: ParsedObligation[]
  errors: ObligationProblem[]
  warnings: ObligationProblem[]
  sheetName: string | null
  headerRow: number | null
  headingsSeen: string[]
  detectedColumns: string[]
}

type Mapping = {
  headerRow: number
  id: number | null
  ref: number | null
  clause: number | null
  statement: number
  party: number | null
  type: number | null
  status: number | null
  owner: number | null
  due: number | null
  level: number | null
  evidence: number | null
  notes: number | null
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

    const statement = find(STATEMENT_ALIASES)
    if (statement === null) continue

    const claimed = new Set<number>([statement])
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
      clause: once(CLAUSE_ALIASES),
      statement,
      // Responsible is an alias of both party and owner. Party is claimed
      // first because it is the one that matters — an obligation with a party
      // and no named person is workable; the reverse is not.
      party: once(PARTY_ALIASES),
      type: once(TYPE_ALIASES),
      status: once(STATUS_ALIASES),
      owner: once(OWNER_ALIASES),
      due: once(DUE_ALIASES),
      level: once(LEVEL_ALIASES),
      evidence: once(EVIDENCE_ALIASES),
      notes: once(NOTES_ALIASES),
      remove: once(REMOVE_ALIASES),
    }

    const score = claimed.size
    if (score < 2 && widest > 1) continue
    if (!best || score > best.score) best = { mapping, score }
  }

  return { mapping: best?.mapping ?? null, headingsSeen }
}

export async function parseObligationWorkbook(
  buffer: ArrayBuffer,
  options: { fileName?: string } = {}
): Promise<ObligationParseResult> {
  const workbook = new ExcelJS.Workbook()
  const name = options.fileName ?? ''

  if (name.toLowerCase().endsWith('.csv')) {
    await workbook.csv.read(Readable.from([Buffer.from(buffer).toString('utf8')]))
  } else {
    await workbook.xlsx.load(buffer)
  }

  const rows: ParsedObligation[] = []
  const errors: ObligationProblem[] = []
  const warnings: ObligationProblem[] = []
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
      detected = ['Obligation']
      const add = (col: number | null, label: string) => {
        if (col !== null) detected.push(label)
      }
      add(mapping.id, 'CXA ID')
      add(mapping.ref, 'Ref')
      add(mapping.clause, 'Clause')
      add(mapping.party, 'Party')
      add(mapping.type, 'Kind')
      add(mapping.status, 'State')
      add(mapping.owner, 'Owner')
      add(mapping.due, 'Due date')
      add(mapping.level, 'Level')
      add(mapping.evidence, 'Evidence')
    }

    for (let r = mapping.headerRow + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)
      const at = (col: number | null) => (col === null ? '' : norm(row.getCell(col).value))

      const statement = at(mapping.statement)
      if (!statement) continue

      // The party is the whole content of an obligation. An unreadable one
      // stops the import; it is never quietly filed as unassigned.
      const rawParty = at(mapping.party)
      const party = rawParty ? matchParty(rawParty) : null
      if (rawParty && party === null) {
        errors.push({
          row: r,
          column: 'Party',
          value: rawParty,
          message: `Not a party on this project. Use one of: ${PARTIES.map((p) => p.label).join('; ')}.`,
        })
        continue
      }
      if (!rawParty) {
        warnings.push({
          row: r,
          column: 'Party',
          value: '',
          message: 'No party. The obligation is imported unassigned and counted as such — nobody will discharge it until somebody owns it.',
        })
      }

      const rawStatus = at(mapping.status)
      const status = matchStatus(rawStatus)
      if (status === null) {
        errors.push({
          row: r,
          column: 'State',
          value: rawStatus,
          message: `Not a state. Use ${OBLIGATION_STATUSES.map((s) => s.label).join(', ')}, or leave blank for Open.`,
        })
        continue
      }
      if (rawStatus && /^(done|complete[d]?|discharged|provided)$/i.test(rawStatus.trim()) && status === 'submitted') {
        warnings.push({
          row: r,
          column: 'State',
          value: rawStatus,
          message:
            'Read as Submitted, not Accepted. "Done" is the owing party saying it is discharged; accepting it is the other party’s decision and a spreadsheet cell cannot make it.',
        })
      }

      const rawType = at(mapping.type)
      const type = matchType(rawType)
      if (rawType && type === null) {
        warnings.push({
          row: r,
          column: 'Kind',
          value: rawType,
          message: `Not recognised, so filed as Other. Use ${OBLIGATION_TYPES.map((t) => t.label).join(', ')}.`,
        })
      }

      const rawLevel = at(mapping.level)
      const level = rawLevel ? matchLevel(rawLevel) : null
      if (rawLevel && level === null) {
        errors.push({
          row: r,
          column: 'Level',
          value: rawLevel,
          message: `Not one of the commissioning levels (${LEVELS.map((l) => l.label).join('; ')}). Leave it blank if the obligation is not tied to a level.`,
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
          message: 'Cannot be read without guessing whether the day or the month comes first. Write it as 2026-04-03, or as 3 Apr 2026.',
        })
        continue
      }

      rows.push({
        row: r,
        id: at(mapping.id) || null,
        ref: at(mapping.ref) || null,
        clause: at(mapping.clause) || null,
        statement,
        party,
        obligation_type: type ?? 'other',
        status,
        owner: at(mapping.owner) || null,
        due_date: due.value,
        level,
        evidence: at(mapping.evidence) || null,
        notes: at(mapping.notes) || null,
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
