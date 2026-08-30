// Reading and writing a project's gate requirements as a spreadsheet.
//
// Every project's ITP is different, and every utility asks for different
// prerequisites before it will let you energize. The sixteen safety items are
// a starting point, not a rule — so the whole rule set has to be editable in
// the tool an engineer already has open, and come back in without anybody
// retyping it.
//
// Two things make the round trip safe:
//
//   1. Every exported row carries its CXA ID. A row that comes back with an
//      ID is an UPDATE of that exact rule; a row with a blank ID is an
//      INSERT. Nothing is matched by guessing at text, so renaming a rule
//      does not silently create a second one.
//   2. An import changes a rule's DEFINITION only. It never touches whether
//      somebody has confirmed it, who confirmed it, or what they wrote — that
//      is a field record, not a template, and a spreadsheet must not be able
//      to mark a permit as issued.

import ExcelJS from 'exceljs'
import { Readable } from 'stream'
import { RULE_KINDS, ruleKindLabel } from '@/lib/gates'

// ── Params as something a person can type ─────────────────────────────────

// Raw params are JSON. Nobody should have to write JSON in Excel, so each
// rule kind exposes one "Setting" column in the words it actually uses.
export function settingHelp(kind: string): string {
  switch (kind) {
    case 'no_open_issues':
      return 'A, B or C — the lowest punch category that must be closed'
    case 'all_requirements_verified':
      return 'critical, normal, minor, or any'
    case 'all_activities_complete':
      return 'check, test, or both'
    case 'documents_present':
      return 'document types, comma separated (itp, procedure, drawing, manual, certificate…)'
    case 'approvals_obtained':
      return 'role names, comma separated (Commissioning Manager, Client / Owner)'
    default:
      return 'not used by this rule'
  }
}

export function paramsToSetting(kind: string, params: Record<string, unknown> | null): string {
  const p = params ?? {}
  switch (kind) {
    case 'no_open_issues':
      return String(p.min_category ?? 'A')
    case 'all_requirements_verified':
      return String(p.criticality ?? 'critical')
    case 'all_activities_complete':
      return String(p.kind ?? 'both')
    case 'documents_present':
      return Array.isArray(p.doc_types) ? (p.doc_types as string[]).join(', ') : ''
    case 'approvals_obtained':
      return Array.isArray(p.roles) ? (p.roles as string[]).join(', ') : ''
    default:
      return ''
  }
}

const CATEGORY_VALUES = new Set(['A', 'B', 'C'])
const CRITICALITY_VALUES = new Set(['critical', 'normal', 'minor', 'any'])
const ACTIVITY_VALUES = new Set(['check', 'test', 'both'])

export function settingToParams(
  kind: string,
  raw: string
): { params: Record<string, unknown>; error: string | null } {
  const text = raw.trim()

  switch (kind) {
    case 'no_open_issues': {
      const value = (text || 'A').toUpperCase()
      if (!CATEGORY_VALUES.has(value)) {
        return { params: {}, error: 'Use A, B or C.' }
      }
      return { params: { min_category: value }, error: null }
    }
    case 'all_requirements_verified': {
      const value = (text || 'critical').toLowerCase()
      if (!CRITICALITY_VALUES.has(value)) {
        return { params: {}, error: 'Use critical, normal, minor or any.' }
      }
      return { params: { criticality: value }, error: null }
    }
    case 'all_activities_complete': {
      const value = (text || 'both').toLowerCase()
      if (!ACTIVITY_VALUES.has(value)) {
        return { params: {}, error: 'Use check, test or both.' }
      }
      return { params: { kind: value }, error: null }
    }
    case 'documents_present': {
      const list = text
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
      if (list.length === 0) {
        return { params: {}, error: 'Name at least one document type, or the rule can never be met.' }
      }
      return { params: { doc_types: list }, error: null }
    }
    case 'approvals_obtained': {
      const list = text
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (list.length === 0) {
        return { params: {}, error: 'Name at least one role, or the rule can never be met.' }
      }
      return { params: { roles: list }, error: null }
    }
    default:
      // manual_confirmation and the rest take no setting; anything typed is
      // ignored rather than treated as an error.
      return { params: {}, error: null }
  }
}

// ── Rule kind, written the way it appears in the sheet ────────────────────

const KIND_BY_LABEL = new Map<string, string>()
for (const k of RULE_KINDS) {
  KIND_BY_LABEL.set(k.value, k.value)
  KIND_BY_LABEL.set(k.label.toLowerCase(), k.value)
}
// A few things a person is likely to write instead.
KIND_BY_LABEL.set('manual', 'manual_confirmation')
KIND_BY_LABEL.set('person', 'manual_confirmation')
KIND_BY_LABEL.set('confirmed by a person', 'manual_confirmation')
KIND_BY_LABEL.set('confirm', 'manual_confirmation')
KIND_BY_LABEL.set('checklist', 'manual_confirmation')

export function resolveKind(raw: string): string | null {
  const key = raw.trim().toLowerCase()
  if (!key) return 'manual_confirmation' // the sensible default for a typed-in line
  return KIND_BY_LABEL.get(key) ?? null
}

export function kindLabel(kind: string): string {
  return ruleKindLabel(kind)
}

// ── Parsing ───────────────────────────────────────────────────────────────

const ID_ALIASES = ['cxa id', 'cxa_id', 'id', 'rule id', 'ref']
const GATE_ALIASES = ['gate', 'gate name', 'readiness gate', 'stage']
const LABEL_ALIASES = ['requirement', 'rule', 'prerequisite', 'item', 'description', 'check', 'activity', 'label']
const KIND_ALIASES = ['type', 'kind', 'rule type', 'rule kind', 'proved by', 'source']
const SETTING_ALIASES = ['setting', 'settings', 'parameter', 'parameters', 'value', 'applies to', 'scope']
const CATEGORY_ALIASES = ['category', 'group', 'section', 'heading']
const MANDATORY_ALIASES = ['mandatory', 'required', 'must', 'compulsory']
const REMOVE_ALIASES = ['remove', 'delete', 'drop']

const TRUTHY = new Set(['y', 'yes', 'true', '1', 'x', '✓', '✔', 'tick', 'ok'])
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

export type ParsedRule = {
  row: number
  id: string | null
  gate: string
  label: string
  rule_kind: string
  params: Record<string, unknown>
  category: string | null
  mandatory: boolean
  remove: boolean
  sequence: number
}

export type RuleProblem = { row: number; column: string; value: string; message: string }

export type GateRuleParseResult = {
  rows: ParsedRule[]
  errors: RuleProblem[]
  warnings: RuleProblem[]
  sheetName: string | null
  headerRow: number | null
  headingsSeen: string[]
}

export async function parseGateRuleWorkbook(
  buffer: ArrayBuffer,
  options: { fileName?: string } = {}
): Promise<GateRuleParseResult> {
  const workbook = new ExcelJS.Workbook()
  const name = options.fileName ?? ''

  if (name.toLowerCase().endsWith('.csv')) {
    await workbook.csv.read(Readable.from([Buffer.from(buffer).toString('utf8')]))
  } else {
    await workbook.xlsx.load(buffer)
  }

  const headingsSeen: string[] = []

  for (const sheet of workbook.worksheets) {
    const limit = Math.min(sheet.rowCount, 30)
    let headerRow = -1
    let cols: Record<string, number | null> = {}

    for (let r = 1; r <= limit; r++) {
      const cells: { key: string; column: number }[] = []
      sheet.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
        const k = headerKey(cell.value)
        if (k) cells.push({ key: k, column: col })
      })
      if (cells.length === 0) continue
      for (const c of cells) if (!headingsSeen.includes(c.key)) headingsSeen.push(c.key)

      const find = (aliases: string[]) => cells.find((c) => aliases.includes(c.key))?.column ?? null
      const label = find(LABEL_ALIASES)
      if (label === null) continue

      headerRow = r
      cols = {
        id: find(ID_ALIASES),
        gate: find(GATE_ALIASES),
        label,
        kind: find(KIND_ALIASES),
        setting: find(SETTING_ALIASES),
        category: find(CATEGORY_ALIASES),
        mandatory: find(MANDATORY_ALIASES),
        remove: find(REMOVE_ALIASES),
      }
      break
    }

    if (headerRow === -1) continue

    const rows: ParsedRule[] = []
    const errors: RuleProblem[] = []
    const warnings: RuleProblem[] = []

    for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)
      const at = (col: number | null | undefined) => (col === null || col === undefined ? '' : norm(row.getCell(col).value))

      const label = at(cols.label)
      if (!label) continue

      const rawKind = at(cols.kind)
      const kind = resolveKind(rawKind)
      if (!kind) {
        errors.push({
          row: r,
          column: 'Type',
          value: rawKind,
          message: `Not a rule type. Use one of: ${RULE_KINDS.map((k) => k.label).join('; ')}.`,
        })
        continue
      }

      const { params, error } = settingToParams(kind, at(cols.setting))
      if (error) {
        errors.push({ row: r, column: 'Setting', value: at(cols.setting), message: error })
        continue
      }

      const mandatoryRaw = at(cols.mandatory).toLowerCase()
      let mandatory = true
      if (mandatoryRaw !== '') {
        if (TRUTHY.has(mandatoryRaw)) mandatory = true
        else if (FALSY.has(mandatoryRaw)) mandatory = false
        else {
          warnings.push({
            row: r,
            column: 'Mandatory',
            value: mandatoryRaw,
            message: 'Not read as yes or no, so treated as mandatory.',
          })
        }
      }

      const removeRaw = at(cols.remove).toLowerCase()
      const remove = TRUTHY.has(removeRaw)

      rows.push({
        row: r,
        id: at(cols.id) || null,
        gate: at(cols.gate),
        label,
        rule_kind: kind,
        params,
        category: at(cols.category) || null,
        mandatory,
        remove,
        sequence: r,
      })
    }

    if (rows.length > 0 || errors.length > 0) {
      return { rows, errors, warnings, sheetName: sheet.name, headerRow, headingsSeen }
    }
  }

  return { rows: [], errors: [], warnings: [], sheetName: null, headerRow: null, headingsSeen }
}
