'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { getActor, actorCan, recordAudit } from '@/lib/audit'
import { roleLabel } from '@/lib/roles'
import { templateFor, GATE_TEMPLATES } from '@/lib/gates'
import { DECISIONS, decisionLabel, decisionStatement } from '@/lib/inspection'
import { parseGateRuleWorkbook, resolveKind, settingToParams } from '@/lib/gate-rules-io'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

function refresh() {
  revalidatePath('/gates')
  revalidatePath('/assets')
  revalidatePath('/readiness')
  revalidatePath('/dashboard')
  revalidatePath('/audit')
}

export async function createGate(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('review', project.id))) return

  const key = str(formData, 'gate_key')
  const template = key ? templateFor(key) : null
  if (!template) return

  const raw = str(formData, 'subject')
  const [subjectType, subjectId] = raw && raw.includes(':') ? raw.split(':') : [null, null]

  const { data } = await supabase
    .from('gates')
    .insert({
      project_id: project.id,
      subject_type: subjectType,
      subject_id: subjectId,
      gate_key: template.key,
      name: str(formData, 'name') ?? template.name,
      stage_key: template.stage_key,
      sequence: GATE_TEMPLATES.findIndex((t) => t.key === template.key),
      planned_for: str(formData, 'planned_for'),
    })
    .select('id')
    .single()

  const gateId = (data as { id: string } | null)?.id
  if (!gateId) return

  // The rules are copied from the template rather than referenced, so editing
  // a template later never silently changes a gate somebody has already been
  // working through.
  await supabase.from('gate_rules').insert(
    template.rules.map((r, i) => ({
      gate_id: gateId,
      rule_kind: r.rule_kind,
      label: r.label,
      params: r.params ?? {},
      category: r.category ?? null,
      mandatory: r.mandatory !== false,
      sequence: i,
    }))
  )

  await recordAudit({
    projectId: project.id,
    action: 'created readiness gate',
    entity: 'gate',
    entityId: gateId,
    entityLabel: template.name,
    newValue: `${template.rules.length} rules`,
  })

  refresh()
}

// Only manual_confirmation rules can be answered by hand. Everything else is
// derived from the records and is deliberately not settable — otherwise the
// gate could be talked into passing without the records changing.
export async function confirmRule(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('record', project.id))) return

  const id = str(formData, 'rule_id')
  const status = str(formData, 'status') ?? 'pending'
  if (!id) return
  if (!['pending', 'satisfied', 'not_satisfied', 'na'].includes(status)) return

  const { data: rule } = await supabase.from('gate_rules').select('rule_kind, label, status').eq('id', id).single()
  const existing = rule as { rule_kind: string; label: string; status: string | null } | null
  if (!existing || existing.rule_kind !== 'manual_confirmation') return

  const actor = await getActor(project.id)

  await supabase
    .from('gate_rules')
    .update({
      status,
      evidence: str(formData, 'evidence'),
      confirmed_by: status === 'pending' ? null : actor.name || actor.email,
      confirmed_at: status === 'pending' ? null : new Date().toISOString(),
    })
    .eq('id', id)

  await recordAudit({
    projectId: project.id,
    action: 'answered gate prerequisite',
    entity: 'gate',
    entityId: str(formData, 'gate_id'),
    entityLabel: existing.label,
    oldValue: existing.status,
    newValue: status,
    comment: str(formData, 'evidence'),
  })

  refresh()
}

// Signing a gate is the human act the whole engine defers to. The app never
// authorises anything itself; it reports what the records say, and a person
// with approve rights puts their name to the decision.
export async function signGate(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('approve', project.id))) return

  const gateId = str(formData, 'gate_id')
  const decision = str(formData, 'decision')
  const signedName = str(formData, 'signed_name')
  if (!gateId || !decision || !signedName) return
  if (!DECISIONS.some((d) => d.value === decision)) return

  const actor = await getActor(project.id)
  const userAgent = (await headers()).get('user-agent')

  await supabase.from('signatures').insert({
    project_id: project.id,
    entity: 'gate',
    entity_id: gateId,
    entity_label: str(formData, 'label'),
    signer_email: actor.email,
    signer_name: actor.name,
    signer_role: str(formData, 'as_role') ?? roleLabel(actor.role),
    signer_company: str(formData, 'company'),
    decision,
    statement: decisionStatement(decision),
    comment: str(formData, 'comment'),
    signed_name: signedName,
    user_agent: userAgent,
  })

  await recordAudit({
    projectId: project.id,
    action: 'signed readiness gate',
    entity: 'gate',
    entityId: gateId,
    entityLabel: str(formData, 'label'),
    newValue: decisionLabel(decision),
    comment: str(formData, 'comment'),
  })

  refresh()
}

export async function deleteGate(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) return

  const id = str(formData, 'id')
  if (!id) return

  // Rules go with it. Signatures do not — they are permanent, and a gate that
  // was signed and later removed must still leave the signature on record.
  await supabase.from('gates').delete().eq('id', id)

  await recordAudit({
    projectId: project.id,
    action: 'removed readiness gate',
    entity: 'gate',
    entityId: id,
    entityLabel: str(formData, 'label'),
  })

  refresh()
}

// ── Editing rules directly ────────────────────────────────────────────────

export async function addRule(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('review', project.id))) return

  const gateId = str(formData, 'gate_id')
  const label = str(formData, 'label')
  const kind = resolveKind(str(formData, 'rule_kind') ?? 'manual_confirmation')
  if (!gateId || !label || !kind) return

  const { params, error } = settingToParams(kind, str(formData, 'setting') ?? '')
  if (error) return

  const { data: existing } = await supabase.from('gate_rules').select('sequence').eq('gate_id', gateId)
  const next = Math.max(0, ...((existing ?? []) as { sequence: number | null }[]).map((r) => r.sequence ?? 0)) + 1

  await supabase.from('gate_rules').insert({
    gate_id: gateId,
    rule_kind: kind,
    label,
    params,
    category: str(formData, 'category'),
    mandatory: formData.get('mandatory') === 'on',
    sequence: next,
  })

  await recordAudit({
    projectId: project.id,
    action: 'added gate requirement',
    entity: 'gate',
    entityId: gateId,
    entityLabel: str(formData, 'gate_name'),
    newValue: label,
  })

  refresh()
}

export async function removeRule(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('review', project.id))) return

  const id = str(formData, 'rule_id')
  if (!id) return

  await supabase.from('gate_rules').delete().eq('id', id)

  await recordAudit({
    projectId: project.id,
    action: 'removed gate requirement',
    entity: 'gate',
    entityId: str(formData, 'gate_id'),
    entityLabel: str(formData, 'gate_name'),
    oldValue: str(formData, 'label'),
  })

  refresh()
}

// ── The Excel round trip ──────────────────────────────────────────────────
//
// A row that comes back with its CXA ID updates that exact rule. A row with a
// blank ID is a new rule, added to the gate its Gate column names. A row
// marked Remove is deleted.
//
// An import changes a rule's DEFINITION only. It never sets, clears or alters
// whether somebody has confirmed a prerequisite, or who did — a spreadsheet
// must not be able to mark a permit as issued.
export async function importGateRules(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('review', project.id))) return

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return

  const parsed = await parseGateRuleWorkbook(await file.arrayBuffer(), { fileName: file.name })

  if (parsed.rows.length === 0 && parsed.errors.length === 0) {
    await recordAudit({
      projectId: project.id,
      action: 'gate requirement import failed',
      entity: 'gate',
      entityLabel: file.name,
      comment:
        parsed.headingsSeen.length > 0
          ? `No requirement column found. Headings seen: ${parsed.headingsSeen.slice(0, 15).join(', ')}`
          : 'The file had nothing readable in it.',
    })
    refresh()
    return
  }

  const { data: gateRows } = await supabase.from('gates').select('id, name').eq('project_id', project.id)
  const gates = (gateRows ?? []) as { id: string; name: string }[]
  const gateByName = new Map(gates.map((g) => [g.name.trim().toLowerCase(), g.id]))
  const gateIds = new Set(gates.map((g) => g.id))

  const { data: ruleRows } =
    gateIds.size > 0
      ? await supabase.from('gate_rules').select('id, gate_id').in('gate_id', [...gateIds])
      : { data: [] }
  const ruleGate = new Map(((ruleRows ?? []) as { id: string; gate_id: string }[]).map((r) => [r.id, r.gate_id]))

  // Validate every row against this project before writing anything.
  const errors = [...parsed.errors]

  for (const row of parsed.rows) {
    if (row.id) {
      if (!ruleGate.has(row.id)) {
        errors.push({
          row: row.row,
          column: 'CXA ID',
          value: row.id,
          message: 'No requirement on this project has that ID. Leave the cell blank to add a new one.',
        })
      }
    } else if (!row.remove) {
      const gateId = gateByName.get(row.gate.trim().toLowerCase())
      if (!gateId) {
        errors.push({
          row: row.row,
          column: 'Gate',
          value: row.gate,
          message: row.gate
            ? 'No gate on this project has that name.'
            : 'A new requirement needs a Gate name so it knows where to go.',
        })
      }
    }
  }

  if (errors.length > 0) {
    await recordAudit({
      projectId: project.id,
      action: 'gate requirement import rejected',
      entity: 'gate',
      entityLabel: file.name,
      newValue: `${errors.length} errors — nothing imported`,
      comment: errors
        .slice(0, 10)
        .map((e) => `Row ${e.row} · ${e.column}: ${e.message}${e.value ? ` (found "${e.value}")` : ''}`)
        .join(' | '),
    })
    refresh()
    return
  }

  let inserted = 0
  let updated = 0
  let removed = 0

  for (const row of parsed.rows) {
    if (row.remove) {
      if (row.id && ruleGate.has(row.id)) {
        await supabase.from('gate_rules').delete().eq('id', row.id)
        removed += 1
      }
      continue
    }

    if (row.id) {
      await supabase
        .from('gate_rules')
        .update({
          rule_kind: row.rule_kind,
          label: row.label,
          params: row.params,
          category: row.category,
          mandatory: row.mandatory,
          sequence: row.sequence,
        })
        .eq('id', row.id)
      updated += 1
    } else {
      await supabase.from('gate_rules').insert({
        gate_id: gateByName.get(row.gate.trim().toLowerCase()),
        rule_kind: row.rule_kind,
        label: row.label,
        params: row.params,
        category: row.category,
        mandatory: row.mandatory,
        sequence: row.sequence,
      })
      inserted += 1
    }
  }

  await recordAudit({
    projectId: project.id,
    action: 'imported gate requirements',
    entity: 'gate',
    entityLabel: file.name,
    newValue: `${inserted} added, ${updated} updated, ${removed} removed`,
    comment:
      parsed.warnings.length > 0
        ? `Read from ${parsed.sheetName ?? 'sheet'}, header row ${parsed.headerRow}. ${parsed.warnings.length} warnings: ${parsed.warnings
            .slice(0, 6)
            .map((w) => `row ${w.row} ${w.column}`)
            .join(', ')}`
        : `Read from ${parsed.sheetName ?? 'sheet'}, header row ${parsed.headerRow}. Confirmations were left untouched.`,
  })

  refresh()
}
