// Data access for the gate engine.

import { supabase } from '@/lib/supabase'
import { evaluateGate, type GateContext, type GateResult, type GateRule } from '@/lib/gates'
import { loadDocuments } from '@/data/requirements'
import { rollupFor, type ProjectRollup } from '@/data/rollup'
import { effectiveRevision } from '@/lib/requirements'
import type { SubjectRef } from '@/lib/subjects'

export type GateRow = {
  id: string
  gate_key: string
  name: string
  stage_key: string | null
  subject_type: string | null
  subject_id: string | null
  status: string | null
  planned_for: string | null
  notes: string | null
  created_at: string | null
}

export type GateWithResult = GateRow & {
  rules: GateRule[]
  result: GateResult
}

type SignatureRow = {
  entity: string
  entity_id: string
  decision: string
  signer_role: string | null
  created_at: string | null
}

// The document types that exist at a revision anyone should be working to.
// A draft does not count — that is the point of Document Control.
async function documentTypesPresent(projectId: string): Promise<Set<string>> {
  const { documents, revisionsByDocument } = await loadDocuments(projectId)
  const present = new Set<string>()
  for (const d of documents) {
    const revs = revisionsByDocument.get(d.id) ?? []
    if (effectiveRevision(revs) && d.doc_type) present.add(d.doc_type)
  }
  return present
}

function contextFor(
  rollup: ProjectRollup,
  ref: SubjectRef | null,
  docTypes: Set<string>,
  signatures: SignatureRow[],
  gateId: string
): GateContext {
  const r = rollupFor(rollup, ref)

  const mine = signatures.filter((s) => s.entity === 'gate' && s.entity_id === gateId)

  // The most recent signature from a role is the one that stands, so a
  // refusal followed by a signature after rework reads as approved — and
  // both remain in the register, because signatures cannot be deleted.
  const latestByRole = new Map<string, SignatureRow>()
  for (const s of [...mine].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))) {
    if (s.signer_role) latestByRole.set(s.signer_role, s)
  }

  const approvedRoles = new Set<string>()
  const refusedRoles = new Set<string>()
  for (const [role, s] of latestByRole) {
    if (s.decision === 'approved') approvedRoles.add(role)
    else if (s.decision === 'rejected') refusedRoles.add(role)
  }

  return {
    readiness: r.readiness,
    checks: r.checks.map((c) => ({
      status: c.status,
      inspection_type: c.inspection_type,
      release: c.release,
      hold_label: c.hold_label,
    })),
    tests: r.tests.map((t) => ({
      name: t.name,
      result: t.result,
      inspection_type: t.inspection_type,
      release: t.release,
      hold_label: t.hold_label,
      has_instrument: t.has_instrument,
      instrument_expiry: t.instrument_expiry,
    })),
    issues: r.issues.map((i) => ({ title: i.title, category: i.category, status: i.status })),
    requirements: r.requirements.map((q) => ({
      ref: q.ref,
      statement: q.statement,
      criticality: q.criticality,
      status: q.status,
    })),
    documentTypesPresent: docTypes,
    approvedRoles,
    refusedRoles,
  }
}

export async function loadGates(
  projectId: string | null,
  rollup: ProjectRollup
): Promise<GateWithResult[]> {
  if (!projectId) return []

  const [{ data: gateRows }, { data: signatureRows }, docTypes] = await Promise.all([
    supabase
      .from('gates')
      .select('id, gate_key, name, stage_key, subject_type, subject_id, status, planned_for, notes, created_at')
      .eq('project_id', projectId)
      .order('sequence', { ascending: true }),
    supabase.from('signatures').select('entity, entity_id, decision, signer_role, created_at').eq('project_id', projectId),
    documentTypesPresent(projectId),
  ])

  const gates = (gateRows ?? []) as GateRow[]
  if (gates.length === 0) return []

  const signatures = (signatureRows ?? []) as SignatureRow[]

  const { data: ruleRows } = await supabase
    .from('gate_rules')
    .select('id, gate_id, rule_kind, label, params, category, mandatory, sequence, status, evidence, confirmed_by, confirmed_at')
    .in(
      'gate_id',
      gates.map((g) => g.id)
    )
    .order('sequence', { ascending: true })

  const rulesByGate = new Map<string, GateRule[]>()
  for (const r of (ruleRows ?? []) as (GateRule & { gate_id: string })[]) {
    const list = rulesByGate.get(r.gate_id)
    if (list) list.push(r)
    else rulesByGate.set(r.gate_id, [r])
  }

  return gates.map((g) => {
    const rules = rulesByGate.get(g.id) ?? []
    const ref: SubjectRef | null =
      g.subject_type && g.subject_id ? { type: g.subject_type as never, id: g.subject_id } : null
    const ctx = contextFor(rollup, ref, docTypes, signatures, g.id)
    return { ...g, rules, result: evaluateGate(rules, ctx) }
  })
}

export async function loadGate(
  projectId: string | null,
  gateId: string,
  rollup: ProjectRollup
): Promise<GateWithResult | null> {
  const all = await loadGates(projectId, rollup)
  return all.find((g) => g.id === gateId) ?? null
}

export type GateSignature = {
  id: string
  decision: string
  signer_name: string | null
  signer_role: string | null
  signer_company: string | null
  signed_name: string | null
  statement: string | null
  comment: string | null
  created_at: string | null
}

export async function loadGateSignatures(projectId: string | null, gateId: string): Promise<GateSignature[]> {
  if (!projectId) return []
  const { data } = await supabase
    .from('signatures')
    .select('id, decision, signer_name, signer_role, signer_company, signed_name, statement, comment, created_at')
    .eq('project_id', projectId)
    .eq('entity', 'gate')
    .eq('entity_id', gateId)
    .order('created_at', { ascending: false })
  return (data ?? []) as GateSignature[]
}
