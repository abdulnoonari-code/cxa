import ExcelJS from 'exceljs'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { subjectTitle, subjectLabel, getSubject } from '@/lib/subjects'
import { RULE_KINDS } from '@/lib/gates'
import { paramsToSetting, settingHelp, kindLabel } from '@/lib/gate-rules-io'

// Every gate requirement on the project, in one sheet, ready to be edited in
// Excel and brought back. One row per rule; the CXA ID is what makes it come
// back to the right rule rather than being matched by guessing at text.
export async function GET(request: Request) {
  const project = await getCurrentProject()
  if (!project) return new Response('No project found', { status: 404 })

  const url = new URL(request.url)
  const onlyGate = url.searchParams.get('gate')

  const index = await loadSubjectIndex(project.id)

  let query = supabase
    .from('gates')
    .select('id, name, gate_key, subject_type, subject_id, sequence')
    .eq('project_id', project.id)
    .order('sequence', { ascending: true })

  if (onlyGate) query = query.eq('id', onlyGate)

  const { data: gateRows } = await query
  const gates = (gateRows ?? []) as {
    id: string
    name: string
    gate_key: string
    subject_type: string | null
    subject_id: string | null
    sequence: number | null
  }[]

  const { data: ruleRows } =
    gates.length > 0
      ? await supabase
          .from('gate_rules')
          .select('id, gate_id, rule_kind, label, params, category, mandatory, sequence, status, confirmed_by')
          .in(
            'gate_id',
            gates.map((g) => g.id)
          )
          .order('sequence', { ascending: true })
      : { data: [] }

  const rules = (ruleRows ?? []) as {
    id: string
    gate_id: string
    rule_kind: string
    label: string
    params: Record<string, unknown> | null
    category: string | null
    mandatory: boolean | null
    sequence: number | null
    status: string | null
    confirmed_by: string | null
  }[]

  const gateById = new Map(gates.map((g) => [g.id, g]))

  const wb = new ExcelJS.Workbook()
  wb.creator = 'CxSentinel'
  wb.created = new Date()

  const sheet = wb.addWorksheet('Gate requirements')
  sheet.columns = [
    { header: 'CXA ID', key: 'id', width: 38 },
    { header: 'Gate', key: 'gate', width: 26 },
    { header: 'Applies to', key: 'subject', width: 30 },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Requirement', key: 'label', width: 68 },
    { header: 'Type', key: 'kind', width: 26 },
    { header: 'Setting', key: 'setting', width: 32 },
    { header: 'Mandatory', key: 'mandatory', width: 11 },
    { header: 'Remove', key: 'remove', width: 9 },
    { header: 'Answered', key: 'answered', width: 24 },
  ]

  for (const r of rules) {
    const gate = gateById.get(r.gate_id)
    const subject =
      gate?.subject_type && gate.subject_id
        ? getSubject(index, { type: gate.subject_type as never, id: gate.subject_id })
        : null

    sheet.addRow({
      id: r.id,
      gate: gate?.name ?? '',
      subject: subject ? `${subjectLabel(subject.type)} · ${subjectTitle(subject)}` : 'Whole project',
      category: r.category ?? '',
      label: r.label,
      kind: kindLabel(r.rule_kind),
      setting: paramsToSetting(r.rule_kind, r.params),
      mandatory: r.mandatory === false ? 'N' : 'Y',
      remove: '',
      answered:
        r.rule_kind === 'manual_confirmation' && r.confirmed_by
          ? `${r.status} — ${r.confirmed_by}`
          : r.rule_kind === 'manual_confirmation'
            ? 'not yet'
            : 'from the records',
    })
  }

  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }]
  if (rules.length > 0) sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columnCount } }

  // Columns C and J are read-only context. Grey them so nobody wastes time
  // editing something that will be ignored.
  for (let r = 2; r <= rules.length + 1; r++) {
    for (const col of ['C', 'J']) {
      sheet.getCell(`${col}${r}`).font = { color: { argb: 'FF8A8A8A' }, italic: true }
    }
  }

  const guide = wb.addWorksheet('How to edit this')
  guide.columns = [
    { header: 'Column', key: 'col', width: 16 },
    { header: 'What it does', key: 'meaning', width: 92 },
  ]
  guide.addRow({ col: 'CXA ID', meaning: 'Leave it exactly as it is. A row that keeps its ID updates that rule. A NEW row with this cell left BLANK adds a rule. Never invent an ID.' })
  guide.addRow({ col: 'Gate', meaning: 'Which gate the rule belongs to. Must match a gate name on this project — needed for new rows.' })
  guide.addRow({ col: 'Applies to', meaning: 'Read only. Shown so you know which system the gate is for. Ignored on import.' })
  guide.addRow({ col: 'Category', meaning: 'The heading it appears under, e.g. Permit & isolation, Protection & control. Anything you like.' })
  guide.addRow({ col: 'Requirement', meaning: 'The requirement itself, in your own words. This is what the engineer reads on site.' })
  guide.addRow({ col: 'Type', meaning: 'How the rule is proved. See the "Rule types" sheet. Leave blank on a new row and it becomes a person-confirmed prerequisite.' })
  guide.addRow({ col: 'Setting', meaning: 'Only some types use this — see the "Rule types" sheet for what each one accepts.' })
  guide.addRow({ col: 'Mandatory', meaning: 'Y means the gate cannot be met without it. N means it is recorded but does not hold the gate.' })
  guide.addRow({ col: 'Remove', meaning: 'Put Y to delete that rule from the gate on import. Leave blank to keep it.' })
  guide.addRow({ col: 'Answered', meaning: 'Read only. Whether a person has confirmed it. An import NEVER changes this — a spreadsheet must not be able to mark a permit as issued.' })
  guide.addRow({ col: '', meaning: '' })
  guide.addRow({ col: 'If a row is wrong', meaning: 'Nothing is imported at all, and every bad row is listed in the audit trail with its row number. A half-applied gate is worse than none.' })
  guide.getRow(1).font = { bold: true }

  const kinds = wb.addWorksheet('Rule types')
  kinds.columns = [
    { header: 'Type', key: 'label', width: 28 },
    { header: 'What it asks', key: 'note', width: 76 },
    { header: 'Setting accepts', key: 'setting', width: 62 },
  ]
  for (const k of RULE_KINDS) {
    kinds.addRow({ label: k.label, note: k.note, setting: settingHelp(k.value) })
  }
  kinds.getRow(1).font = { bold: true }

  const buffer = await wb.xlsx.writeBuffer()
  const safe = project.name.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)
  const suffix = onlyGate ? `_${(gates[0]?.name ?? 'gate').replace(/[^a-z0-9]+/gi, '_')}` : ''

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safe}_gate_requirements${suffix}.xlsx"`,
    },
  })
}
