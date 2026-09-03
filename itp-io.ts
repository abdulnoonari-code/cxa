// Reading a marked-up Inspection and Test Plan back in.
//
// This is the eighth importer, and the first one that is forbidden from
// creating anything.
//
// The other seven read a register and add rows to it. The ITP is not a
// register — it is a *view* of the checklist and test registers, so every row
// of it already exists somewhere else. That gives this file one rule the
// others do not have and it is the most important line in it:
//
//   **A plan row that matches no record is an error, never a new activity.**
//
// Creating a checklist item from a plan row would put a check into the system
// that nobody performed, sitting at a level, waiting to be counted in a
// readiness figure. Everything else in CxSentinel exists to stop exactly that.
// So an unmatched row stops the file and is reported by its row number.
//
// What the import DOES set is the two things the plan decides: **which party
// holds each point**, and **what kind of point it is**. Both come out of one
// cell — the column says who, the letter says what.
//
// The second rule is subtler and matters more than it looks. On the exported
// matrix a letter in brackets — `(H)` — means the party was taken from the
// project default, not written against that activity. If it comes back still
// in brackets, it stays a default. Importing it as an explicit assignment
// would silently convert an assumption the software made into an agreement a
// client appears to have signed, which is the precise failure the bracket was
// invented to prevent. Remove the brackets and it becomes explicit; that is
// the client's act, not ours.

import ExcelJS from 'exceljs'
import { Readable } from 'node:stream'
import { PARTIES, isParty, type PartyValue } from '@/lib/itp'
import { INSPECTION_TYPES } from '@/lib/inspection'
import { LEVELS } from '@/lib/checklist'

const ID_ALIASES = ['cxa id', 'cxa_id', 'id', 'record id']
const TAG_ALIASES = ['tag', 'tag system', 'tag / system', 'system', 'equipment', 'asset', 'kks', 'location']
const ACTIVITY_ALIASES = ['activity', 'item', 'description', 'check', 'task', 'test', 'inspection', 'operation']
const LEVEL_ALIASES = ['level', 'cx level', 'commissioning level', 'stage', 'phase']
const POINT_ALIASES = ['point', 'point type', 'itp', 'itp type', 'inspection type', 'h/w/s', 'h w s r', 'code']
const HELD_ALIASES = ['held by', 'party', 'responsible', 'responsible party', 'holder', 'witness by', 'holds']
const REMOVE_ALIASES = ['remove', 'delete', 'drop', 'clear']
// The matrix says "this came from the project default" with brackets. The
// detail sheet says it in words, in its own column. Both have to be read, or
// the app's own two views of one plan disagree with each other on re-import.
const HOW_ALIASES = ['how assigned', 'assigned', 'assignment', 'source', 'basis', 'origin']

/** The column that carries points nobody holds. Must match lib/itp UNASSIGNED_COLUMN. */
const UNASSIGNED_ALIASES = ['not stated', 'nobody', 'unassigned', 'none', 'no party', 'not assigned']

const TRUTHY = new Set(['y', 'yes', 'true', '1', 'x', '✓', '✔'])

const GUIDE_SHEETS = [
  'how to read this',
  'how to edit this',
  'how to fill this in',
  'summary',
  'parties',
  'levels',
  'point types',
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
  'findings',
  'who holds what',
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

// ── What a party column is called ────────────────────────────────────────

/**
 * Which party a column heading names.
 *
 * As with the obligations importer, an unrecognised heading is the caller's
 * error rather than a shrug. A column headed "Sub Con" that quietly matches
 * nobody would silently drop every point assigned to a subcontractor, and the
 * file would import clean.
 */
export function matchPartyHeading(raw: string): PartyValue | null {
  const v = headerKey(raw)
  if (!v) return null

  for (const p of PARTIES) {
    if (v === p.value.replace(/_/g, ' ')) return p.value
    if (v === p.label.toLowerCase()) return p.value
  }

  const WORDS: Record<string, PartyValue> = {
    client: 'client',
    owner: 'client',
    'client owner': 'client',
    employer: 'client',
    epc: 'epc',
    'main contractor': 'epc',
    'main con': 'epc',
    contractor: 'contractor',
    'installation contractor': 'contractor',
    subcontractor: 'subcontractor',
    'sub contractor': 'subcontractor',
    'sub con': 'subcontractor',
    subcon: 'subcontractor',
    vendor: 'vendor',
    supplier: 'vendor',
    'vendor supplier': 'vendor',
    manufacturer: 'vendor',
    oem: 'vendor',
    cxm: 'cx_manager',
    'cx manager': 'cx_manager',
    'commissioning manager': 'cx_manager',
    cxa: 'cx_authority',
    'cx authority': 'cx_authority',
    'commissioning authority': 'cx_authority',
    operator: 'operator',
    'o m': 'operator',
    'operator o m': 'operator',
    'end user': 'operator',
    designer: 'consultant',
    consultant: 'consultant',
    engineer: 'consultant',
    'designer consultant': 'consultant',
    authority: 'authority',
    utility: 'authority',
    'authority utility': 'authority',
    inspectorate: 'authority',
    'grid operator': 'authority',
  }
  return WORDS[v] ?? null
}

export function isUnassignedHeading(raw: string): boolean {
  return UNASSIGNED_ALIASES.includes(headerKey(raw))
}

// ── What is in the cell ──────────────────────────────────────────────────

export type Marked = {
  /** 'hold' | 'witness' | 'review' | 'surveillance' */
  inspectionType: string
  /** Whether it arrived still wrapped in brackets — i.e. still a project default. */
  fromDefault: boolean
}

/**
 * Read one matrix cell.
 *
 * Accepts the letter, the letter in brackets, and the words people write
 * instead: "Hold", "Hold Point", "H.P.", "Witness", "Surveillance", "Review".
 * Returns null for an empty cell, and null for anything it cannot read — the
 * caller reports that by row and column rather than guessing.
 */
export function readCell(raw: string): Marked | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const bracketed = /^\(.*\)$/.test(trimmed) || /^\[.*\]$/.test(trimmed)
  const inner = trimmed.replace(/^[([]|[)\]]$/g, '').trim().toLowerCase().replace(/[.\s]+/g, ' ').trim()
  if (!inner) return null

  const byCode: Record<string, string> = { h: 'hold', w: 'witness', s: 'surveillance', r: 'review' }
  if (byCode[inner]) return { inspectionType: byCode[inner], fromDefault: bracketed }

  const WORDS: Record<string, string> = {
    hold: 'hold',
    'hold point': 'hold',
    'h p': 'hold',
    hp: 'hold',
    witness: 'witness',
    'witness point': 'witness',
    'w p': 'witness',
    wp: 'witness',
    attend: 'witness',
    surveillance: 'surveillance',
    monitor: 'surveillance',
    'spot check': 'surveillance',
    review: 'review',
    'review point': 'review',
    'document review': 'review',
  }
  const found = WORDS[inner]
  if (found) return { inspectionType: found, fromDefault: bracketed }

  // A bare tick means "this party is involved" without saying how. That is not
  // enough to set a point type, and guessing Surveillance would quietly demote
  // somebody's hold point.
  return null
}

export function isTick(raw: string): boolean {
  return TRUTHY.has(raw.trim().toLowerCase())
}

// ── Shapes ───────────────────────────────────────────────────────────────

export type ItpProblem = { row: number; column: string; value: string; message: string }

export type ParsedItpRow = {
  row: number
  /** Row numbers repeat across sheets, so a message has to say which one. */
  sheet: string
  id: string | null
  tag: string
  activity: string
  level: string | null
  inspectionType: string
  /** null with `clearParty` false means "leave whoever holds it alone". */
  party: PartyValue | null
  /** The row was marked under "Not stated" — nobody holds it. */
  clearParty: boolean
  /** Arrived still in brackets: it is a project default and must stay one. */
  keepDefault: boolean
  remove: boolean
}

export type ItpParseResult = {
  rows: ParsedItpRow[]
  errors: ItpProblem[]
  warnings: ItpProblem[]
  sheet: string | null
  headerRow: number | null
  /** 'matrix' when parties are columns, 'list' when there is a Held by column. */
  shape: 'matrix' | 'list' | null
  headingsSeen: string[]
  partyColumns: string[]
}

type Mapping = {
  headerRow: number
  id: number | null
  tag: number | null
  activity: number
  level: number | null
  point: number | null
  held: number | null
  how: number | null
  remove: number | null
  /** party value -> column index, for the matrix shape. */
  parties: { party: PartyValue; column: number; heading: string }[]
  unassigned: number | null
  /** Headings that look like a party column but could not be read. */
  unreadableParties: { heading: string; column: number }[]
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
    const cells: { key: string; raw: string; column: number }[] = []
    sheet.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      const k = headerKey(cell.value)
      if (k) cells.push({ key: k, raw: norm(cell.value), column: col })
    })
    if (cells.length === 0) continue
    for (const c of cells) if (!headingsSeen.includes(c.key)) headingsSeen.push(c.key)

    const find = (aliases: string[]) => cells.find((c) => aliases.includes(c.key))?.column ?? null

    // The activity is the one column an ITP cannot be read without.
    const activity = find(ACTIVITY_ALIASES)
    if (activity === null) continue

    const claimed = new Set<number>([activity])
    const once = (aliases: string[]) => {
      const col = find(aliases)
      if (col === null || claimed.has(col)) return null
      claimed.add(col)
      return col
    }

    const id = once(ID_ALIASES)
    const tag = once(TAG_ALIASES)
    const level = once(LEVEL_ALIASES)
    const point = once(POINT_ALIASES)
    const held = once(HELD_ALIASES)
    const how = once(HOW_ALIASES)
    const remove = once(REMOVE_ALIASES)

    // Anything left that names a party becomes a matrix column.
    const parties: Mapping['parties'] = []
    const unreadableParties: Mapping['unreadableParties'] = []
    let unassigned: number | null = null
    for (const c of cells) {
      if (claimed.has(c.column)) continue
      if (isUnassignedHeading(c.raw)) {
        unassigned = c.column
        claimed.add(c.column)
        continue
      }
      const party = matchPartyHeading(c.raw)
      if (party) {
        // The same party twice is two columns for one company. Recorded so the
        // caller can refuse the file rather than let one silently win.
        parties.push({ party, column: c.column, heading: c.raw })
        claimed.add(c.column)
      }
    }

    const mapping: Mapping = {
      headerRow: r,
      id,
      tag,
      activity,
      level,
      point,
      held,
      how,
      remove,
      parties,
      unassigned,
      unreadableParties,
    }

    // A matrix row scores by its party columns; a list row by Point + Held by.
    const score = claimed.size + parties.length
    if (score < 2 && widest > 1) continue
    if (!best || score > best.score) best = { mapping, score }
  }

  return { mapping: best?.mapping ?? null, headingsSeen }
}

export async function parseItpWorkbook(
  buffer: ArrayBuffer,
  options: { fileName?: string } = {}
): Promise<ItpParseResult> {
  const workbook = new ExcelJS.Workbook()
  const name = options.fileName ?? ''

  if (name.toLowerCase().endsWith('.csv')) {
    await workbook.csv.read(Readable.from([Buffer.from(buffer).toString('utf8')]))
  } else {
    await workbook.xlsx.load(buffer)
  }

  const rows: ParsedItpRow[] = []
  const errors: ItpProblem[] = []
  const warnings: ItpProblem[] = []
  const allHeadings: string[] = []
  let firstSheet: string | null = null
  let firstHeaderRow: number | null = null
  let shape: 'matrix' | 'list' | null = null
  let partyColumns: string[] = []

  // Two passes. The first works out what each sheet is; the second reads only
  // the sheets that are the plan.
  //
  // This matters because the app's own export contains the same plan twice —
  // the matrix, which is the editable form, and a detail sheet that also
  // carries release states, signatures and dates. Somebody marking up the
  // export edits the matrix and never touches the detail sheet, and the file
  // then disagrees with itself. Reading both would answer a perfectly sensible
  // edit with two errors blaming the user for our own second view.
  //
  // So: **if any sheet is a matrix, only the matrix sheets are read.** A file
  // made by hand as a plain list still works, because then there is no matrix
  // to prefer.
  const candidates: { sheet: ExcelJS.Worksheet; mapping: Mapping; isMatrix: boolean }[] = []
  workbook.eachSheet((sheet) => {
    const { mapping, headingsSeen } = findMapping(sheet)
    for (const h of headingsSeen) if (!allHeadings.includes(h)) allHeadings.push(h)
    if (!mapping) return
    const isMatrix = mapping.parties.length > 0 || mapping.unassigned !== null
    if (!isMatrix && mapping.held === null && mapping.point === null) return
    candidates.push({ sheet, mapping, isMatrix })
  })

  const anyMatrix = candidates.some((c) => c.isMatrix)
  const chosen = anyMatrix ? candidates.filter((c) => c.isMatrix) : candidates

  for (const skipped of candidates.filter((c) => !chosen.includes(c))) {
    warnings.push({
      row: skipped.mapping.headerRow,
      column: skipped.sheet.name,
      value: '',
      message: `Sheet "${skipped.sheet.name}" was not read. It is a second view of the same plan, and the matrix is the one that decides.`,
    })
  }

  for (const { sheet, mapping, isMatrix } of chosen) {
    if (firstSheet === null) {
      firstSheet = sheet.name
      firstHeaderRow = mapping.headerRow
      shape = isMatrix ? 'matrix' : 'list'
      partyColumns = mapping.parties.map((p) => p.heading)
    }

    // Two columns for one party is an argument about who holds the point, and
    // the file has to be fixed rather than guessed at.
    const seen = new Set<PartyValue>()
    for (const p of mapping.parties) {
      if (seen.has(p.party)) {
        errors.push({
          row: mapping.headerRow,
          column: p.heading,
          value: p.heading,
          message: `Two columns both name the ${p.party.replace(/_/g, ' ')}. Merge them into one before uploading — CxSentinel will not choose between them.`,
        })
      }
      seen.add(p.party)
    }

    const at = (row: ExcelJS.Row, col: number | null) => (col === null ? '' : norm(row.getCell(col).value))

    for (let r = mapping.headerRow + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)
      const activity = at(row, mapping.activity)
      const tag = at(row, mapping.tag)
      const id = at(row, mapping.id)
      if (!activity && !tag && !id) continue

      const remove = TRUTHY.has(at(row, mapping.remove).toLowerCase())

      if (!activity) {
        errors.push({
          row: r,
          column: 'Activity',
          value: '',
          message: 'No activity on this row. Every ITP row has to say what is being inspected or tested.',
        })
        continue
      }

      let inspectionType: string | null = null
      let party: PartyValue | null = null
      let clearParty = false
      let keepDefault = false

      if (isMatrix) {
        const marks: { party: PartyValue | null; heading: string; mark: Marked }[] = []
        for (const p of mapping.parties) {
          const raw = norm(row.getCell(p.column).value)
          if (!raw) continue
          const mark = readCell(raw)
          if (!mark) {
            if (isTick(raw)) {
              errors.push({
                row: r,
                column: p.heading,
                value: raw,
                message:
                  'A tick says a party is involved but not how. Put H, W, S or R in the cell so the point type is stated.',
              })
            } else {
              errors.push({
                row: r,
                column: p.heading,
                value: raw,
                message: 'Not a point type. Use H (Hold), W (Witness), S (Surveillance) or R (Review).',
              })
            }
            continue
          }
          marks.push({ party: p.party, heading: p.heading, mark })
        }

        if (mapping.unassigned !== null) {
          const raw = norm(row.getCell(mapping.unassigned).value)
          if (raw) {
            const mark = readCell(raw)
            if (mark) marks.push({ party: null, heading: 'Not stated', mark })
          }
        }

        // The invariant the export guarantees and the import enforces: one
        // letter per row. An activity held by two parties is not a hold point,
        // it is an argument, and the plan has to settle it before the work does.
        if (marks.length > 1) {
          errors.push({
            row: r,
            column: marks.map((m) => m.heading).join(' + '),
            value: marks.map((m) => m.mark.inspectionType).join(', '),
            message: `${marks.length} parties are marked on this row. One activity is held by one party — decide which, and clear the others.`,
          })
          continue
        }

        if (marks.length === 0) {
          warnings.push({
            row: r,
            column: 'the party columns',
            value: '',
            message: 'Nothing marked on this row, so who holds this point is left exactly as it was.',
          })
          if (!remove) continue
        } else {
          const only = marks[0]
          inspectionType = only.mark.inspectionType
          keepDefault = only.mark.fromDefault
          if (only.party === null) clearParty = true
          else party = only.party
        }
      } else {
        // The list shape: an explicit Point column and an explicit Held by.
        const pointRaw = at(row, mapping.point)
        if (pointRaw) {
          const mark = readCell(pointRaw)
          if (!mark) {
            errors.push({
              row: r,
              column: 'Point',
              value: pointRaw,
              message: 'Not a point type. Use H (Hold), W (Witness), S (Surveillance) or R (Review).',
            })
            continue
          }
          inspectionType = mark.inspectionType
          keepDefault = mark.fromDefault
        }

        // "Project default" in the How assigned column means the same thing a
        // bracket means on the matrix.
        const howRaw = at(row, mapping.how).toLowerCase()
        if (howRaw.includes('default')) keepDefault = true

        const heldRaw = at(row, mapping.held)
        if (heldRaw) {
          if (isUnassignedHeading(heldRaw) || heldRaw.trim().toUpperCase() === 'NOBODY') {
            clearParty = true
          } else {
            const matched = matchPartyHeading(heldRaw)
            if (!matched) {
              errors.push({
                row: r,
                column: 'Held by',
                value: heldRaw,
                message:
                  'Not a party CxSentinel recognises. Use Client, EPC, Contractor, Subcontractor, Vendor, CxM, CxA, Operator, Designer or Authority.',
              })
              continue
            }
            party = matched
          }
        }
      }

      rows.push({
        row: r,
        sheet: sheet.name,
        id: id || null,
        tag,
        activity,
        level: matchLevel(at(row, mapping.level)),
        inspectionType: inspectionType ?? '',
        party,
        clearParty,
        keepDefault,
        remove,
      })
    }
  }

  return {
    rows,
    errors,
    warnings,
    sheet: firstSheet,
    headerRow: firstHeaderRow,
    shape,
    headingsSeen: allHeadings,
    partyColumns,
  }
}

export function matchLevel(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  for (const l of LEVELS) {
    if (v === l.value.toLowerCase()) return l.value
    if (v === l.label.toLowerCase()) return l.value
    if (v === l.label.split('—')[0].trim().toLowerCase()) return l.value
  }
  const m = v.match(/^l\s*([1-5])/)
  if (m) return LEVELS[Number(m[1]) - 1]?.value ?? null
  return null
}

// ── Matching plan rows to records ────────────────────────────────────────

export type ExistingActivity = {
  entity: string
  id: string
  tag: string
  activity: string
  level: string
  inspectionType: string
  /** What is currently written against the record, ignoring any convention. */
  explicitParty: string | null
}

export type ItpUpdate = {
  row: number
  entity: string
  id: string
  tag: string
  activity: string
  /** Set only when the point type changed. */
  inspectionType: string | null
  /** undefined = leave alone; null = clear; a value = set. */
  party: PartyValue | null | undefined
  /** What the reader will see in the audit log. */
  describe: string
}

export type ReconcileResult = {
  updates: ItpUpdate[]
  errors: ItpProblem[]
  warnings: ItpProblem[]
  unchanged: number
}

function key(tag: string, activity: string): string {
  return `${tag.trim().toLowerCase()}::${activity.trim().toLowerCase().replace(/\s+/g, ' ')}`
}

/**
 * Match every plan row to the record it describes, and work out what changed.
 *
 * Matching is by CxSentinel's own id first, then by tag plus activity. An
 * activity that matches nothing is an **error**: the ITP is a view of the
 * checklist and test registers, so a row with no record behind it means either
 * the file is for a different project or somebody typed a new activity into a
 * plan, and creating a check from it would put work into the system that
 * nobody did.
 */
export function reconcile(parsed: ParsedItpRow[], existing: ExistingActivity[]): ReconcileResult {
  const byId = new Map(existing.map((e) => [e.id, e]))
  const byText = new Map<string, ExistingActivity[]>()
  for (const e of existing) {
    const k = key(e.tag, e.activity)
    const list = byText.get(k)
    if (list) list.push(e)
    else byText.set(k, [e])
  }

  const updates: ItpUpdate[] = []
  const errors: ItpProblem[] = []
  const warnings: ItpProblem[] = []
  let unchanged = 0
  const claimed = new Map<string, { type: string; party: string | null; clear: boolean; keep: boolean; row: number; sheet: string }>()

  for (const p of parsed) {
    let match: ExistingActivity | undefined

    if (p.id) {
      match = byId.get(p.id)
      if (!match) {
        errors.push({
          row: p.row,
          column: 'CXA ID',
          value: p.id,
          message: 'No record in this project has that id. The file may be from a different project.',
        })
        continue
      }
    } else {
      const candidates = byText.get(key(p.tag, p.activity)) ?? []
      if (candidates.length === 0) {
        errors.push({
          row: p.row,
          column: 'Tag / Activity',
          value: `${p.tag} — ${p.activity}`,
          message:
            'No check or test in this project matches. The ITP is a view of records that already exist, so it cannot create this activity — add it on the Checklists or Test Records page first.',
        })
        continue
      }
      if (candidates.length > 1) {
        errors.push({
          row: p.row,
          column: 'Tag / Activity',
          value: `${p.tag} — ${p.activity}`,
          message: `${candidates.length} records have that tag and activity. Add the CXA ID column from the export so the right one is updated.`,
        })
        continue
      }
      match = candidates[0]
    }

    // Two rows for one record are only a problem when they DISAGREE.
    //
    // The export deliberately writes every activity into the matrix sheet and
    // every inspection point again into the detail sheet, so a plain round
    // trip legitimately presents the same fact twice. Refusing that would mean
    // the one file the app produces is the one file it cannot read back.
    // What must never pass is two rows that say different things about the
    // same point — that is a disagreement the plan has to settle before the
    // work does.
    const said = { type: p.inspectionType, party: p.party ?? null, clear: p.clearParty, keep: p.keepDefault }
    const before = claimed.get(match.id)
    if (before) {
      const agrees =
        before.type === said.type &&
        before.party === said.party &&
        before.clear === said.clear &&
        before.keep === said.keep
      if (!agrees) {
        errors.push({
          row: p.row,
          column: 'Activity',
          value: p.activity,
          message: `${before.sheet} row ${before.row} sets this activity to ${describeSaid(
            before
          )}, and this row says ${describeSaid(said)}. Two rows cannot both decide who holds one point.`,
        })
      }
      // Agreeing or not, it is not written a second time.
      continue
    }
    claimed.set(match.id, { ...said, row: p.row, sheet: p.sheet })

    // A letter that came back in brackets is still the project default. Left
    // exactly as it was: importing it as explicit would turn a guess the
    // software made into an agreement the client appears to have made.
    if (p.keepDefault) {
      warnings.push({
        row: p.row,
        column: 'the party columns',
        value: `(${p.inspectionType})`,
        message:
          'Still in brackets, so it is still the project default. Remove the brackets to write this party against the activity.',
      })
      unchanged += 1
      continue
    }

    const typeChanged = p.inspectionType !== '' && p.inspectionType !== match.inspectionType
    const wantParty: PartyValue | null | undefined = p.clearParty ? null : (p.party ?? undefined)
    const partyChanged = wantParty !== undefined && (wantParty ?? null) !== (match.explicitParty ?? null)

    if (!typeChanged && !partyChanged) {
      unchanged += 1
      continue
    }

    const bits: string[] = []
    if (typeChanged) {
      bits.push(
        `point type ${labelOf(match.inspectionType)} → ${labelOf(p.inspectionType)}`
      )
    }
    if (partyChanged) {
      bits.push(
        `held by ${match.explicitParty ? partyWord(match.explicitParty) : 'nobody'} → ${
          wantParty ? partyWord(wantParty) : 'nobody'
        }`
      )
    }

    updates.push({
      row: p.row,
      entity: match.entity,
      id: match.id,
      tag: match.tag,
      activity: match.activity,
      inspectionType: typeChanged ? p.inspectionType : null,
      party: partyChanged ? wantParty : undefined,
      describe: `${match.tag} — ${match.activity}: ${bits.join('; ')}`,
    })
  }

  return { updates, errors, warnings, unchanged }
}

/** What a row said, in the words the error message needs. */
function describeSaid(said: { type: string; party: string | null; clear: boolean }): string {
  const who = said.clear ? 'nobody' : said.party ? partyWord(said.party) : 'no change of party'
  const what = said.type ? labelOf(said.type) : 'no change of point type'
  return `${what}, held by ${who}`
}

function labelOf(value: string): string {
  return INSPECTION_TYPES.find((t) => t.value === value)?.label ?? value
}

function partyWord(value: string): string {
  return PARTIES.find((p) => p.value === value)?.label ?? value
}

/** A one-line summary for the screen, in the words the reader would use. */
export function summariseImport(result: ReconcileResult): string {
  const { updates, unchanged } = result
  const parties = updates.filter((u) => u.party !== undefined).length
  const types = updates.filter((u) => u.inspectionType !== null).length
  if (updates.length === 0) {
    return `Nothing to change. ${unchanged} row${unchanged === 1 ? '' : 's'} already say what the file says.`
  }
  const bits: string[] = []
  if (parties > 0) bits.push(`${parties} change${parties === 1 ? '' : 's'} of who holds the point`)
  if (types > 0) bits.push(`${types} change${types === 1 ? '' : 's'} of point type`)
  return `${bits.join(' and ')}, across ${updates.length} activit${updates.length === 1 ? 'y' : 'ies'}. ${unchanged} unchanged.`
}

export { isParty }
