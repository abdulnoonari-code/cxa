// Assembling a handover pack for one system and everything beneath it.
//
// The rollup already scopes checks, tests, punch items and requirements to a
// subject's whole subtree, so this file only adds what the rollup does not
// carry: the signatures that released hold points, the gates raised against
// the subtree, the obligations, and the documents the pack cites.

import { supabase } from '@/lib/supabase'
import { subtreeKeys, refKey, subjectTitle, breadcrumb, type SubjectIndex, type SubjectRef } from '@/lib/subjects'
import { loadProjectRollup, rollupFor, type ProjectRollup, type Rollup } from '@/data/rollup'
import { loadGates } from '@/data/gates'
import { latestSignature, releaseBlocks, type SignatureLike } from '@/lib/inspection'
import type { DossierInput } from '@/lib/dossier'
import type { ObligationRow } from '@/data/obligations'
import type { GateWithResult } from '@/data/gates'

export type DossierSignature = {
  entity: string
  entity_id: string
  entity_label: string | null
  decision: string
  signer_name: string | null
  signer_role: string | null
  signer_company: string | null
  statement: string | null
  created_at: string | null
}

export type PackDocument = { doc_number: string; title: string | null; rev: string | null; status: string | null }

export type Pack = {
  title: string
  path: string
  rollup: Rollup
  projectRollup: ProjectRollup
  keys: Set<string>
  signatures: DossierSignature[]
  gates: GateWithResult[]
  obligations: ObligationRow[]
  documents: PackDocument[]
  input: DossierInput
}

export async function loadPack(
  projectId: string | null,
  index: SubjectIndex,
  ref: SubjectRef | null
): Promise<Pack | null> {
  if (!projectId || !ref) return null

  const subject = index.byKey.get(refKey(ref))
  if (!subject) return null

  const keys = subtreeKeys(index, ref)

  // The gate engine judges its rules against the roll-up, so the roll-up has
  // to exist before the gates can be read. Everything else is independent and
  // goes in parallel with it.
  const projectRollup = await loadProjectRollup(projectId, index)

  const [allGates, signatureRes, obligationRes, documentRes] = await Promise.all([
    loadGates(projectId, projectRollup),
    supabase
      .from('signatures')
      .select('entity, entity_id, entity_label, decision, signer_name, signer_role, signer_company, statement, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true }),
    supabase
      .from('obligations')
      .select(
        'id, ref, project_id, document_id, revision_id, source_name, clause, statement, party, obligation_type, ' +
          'level, stage_key, status, owner, due_date, evidence, notes, subject_type, subject_id, origin, ' +
          'closed_at, closed_by, accepted_at, accepted_by, created_at, created_by_name'
      )
      .eq('project_id', projectId)
      .order('ref', { ascending: true }),
    supabase
      .from('controlled_documents')
      .select('id, doc_number, title')
      .eq('project_id', projectId)
      .order('doc_number'),
  ])

  const rollup = rollupFor(projectRollup, ref)
  const signatures = (signatureRes.data ?? []) as DossierSignature[]

  // Only the signatures that belong to records inside this subtree. A pack for
  // one system must not carry another system's sign-offs.
  const ownedIds = new Set<string>([
    ...rollup.checks.map((c) => c.id),
    ...rollup.tests.map((t) => t.id),
  ])
  const packSignatures = signatures.filter((s) => ownedIds.has(s.entity_id) || keys.has(refKey({ type: s.entity, id: s.entity_id })))

  const gates = allGates.filter((g) => {
    const gateRef = g.subject_type && g.subject_id ? refKey({ type: g.subject_type, id: g.subject_id }) : null
    return gateRef ? keys.has(gateRef) : false
  })

  const allObligations = (obligationRes.data ?? []) as unknown as ObligationRow[]
  const obligations = allObligations.filter((o) => {
    // An obligation with no subject is a project-wide duty and belongs in
    // every pack — "the Contractor shall maintain calibration certificates"
    // applies to this system as much as any other.
    if (!o.subject_type || !o.subject_id) return true
    return keys.has(refKey({ type: o.subject_type, id: o.subject_id }))
  })

  const documentsById = new Map(
    ((documentRes.data ?? []) as { id: string; doc_number: string; title: string | null }[]).map((d) => [d.id, d])
  )
  const citedIds = new Set(obligations.map((o) => o.document_id).filter((v): v is string => !!v))

  const { data: revRows } =
    citedIds.size > 0
      ? await supabase
          .from('document_revisions')
          .select('document_id, rev, status')
          .in('document_id', [...citedIds])
      : { data: [] as { document_id: string; rev: string; status: string | null }[] }

  const documents: PackDocument[] = [...citedIds].flatMap((id) => {
    const doc = documentsById.get(id)
    if (!doc) return []
    const revs = ((revRows ?? []) as { document_id: string; rev: string; status: string | null }[]).filter(
      (r) => r.document_id === id
    )
    const effective = revs.find((r) => r.status === 'issued' || r.status === 'approved') ?? revs[0]
    return [{ doc_number: doc.doc_number, title: doc.title, rev: effective?.rev ?? null, status: effective?.status ?? null }]
  })

  // ── The figures the verdict is built from ──────────────────────────────
  const holdChecks = rollup.checks.filter((c) => c.inspection_type === 'hold')
  const holdTests = rollup.tests.filter((t) => t.inspection_type === 'hold')
  const unreleased =
    holdChecks.filter((c) => releaseBlocks(c.inspection_type, c.release)).length +
    holdTests.filter((t) => releaseBlocks(t.inspection_type, t.release)).length

  const openPunch = rollup.issues.filter((i) => i.status !== 'verified' && i.status !== 'closed')
  const settledObligations = new Set(['accepted', 'waived', 'not_applicable'])

  const input: DossierInput = {
    requirements: { verified: rollup.requirementsVerified, total: rollup.requirements.length },
    checks: {
      done: rollup.checks.filter((c) => c.status === 'pass' || c.status === 'na').length,
      failed: rollup.checks.filter((c) => c.status === 'fail').length,
      total: rollup.checks.length,
    },
    tests: {
      passed: rollup.tests.filter((t) => t.result === 'pass').length,
      failed: rollup.tests.filter((t) => t.result === 'fail').length,
      total: rollup.tests.length,
    },
    holdPoints: {
      released: holdChecks.length + holdTests.length - unreleased,
      unreleased,
      total: holdChecks.length + holdTests.length,
    },
    punch: {
      openA: openPunch.filter((i) => i.category === 'A').length,
      openOther: openPunch.filter((i) => i.category !== 'A').length,
      closed: rollup.issues.length - openPunch.length,
      total: rollup.issues.length,
    },
    obligations: {
      outstanding: obligations.filter((o) => !settledObligations.has(o.status)).length,
      total: obligations.length,
    },
    gates: {
      signed: gates.filter((g) => g.status === 'signed' || g.status === 'passed').length,
      unmet: gates.reduce((n, g) => n + (g.result?.notMet ?? 0), 0),
      total: gates.length,
    },
    documents: documents.length,
  }

  // breadcrumb() already ends with the subject itself. Appending it again gave
  // packs an asset path that read "My First Site › My First Site".
  const trail = breadcrumb(index, ref)

  return {
    title: subjectTitle(subject),
    path: trail.map((s) => s.code ?? s.name).join(' › '),
    rollup,
    projectRollup,
    keys,
    signatures: packSignatures,
    gates,
    obligations,
    documents,
    input,
  }
}

/** Whether a hold point on a record was actually released, for the register. */
export function releaseFor(
  signatures: DossierSignature[],
  entity: string,
  id: string
): DossierSignature | null {
  return (latestSignature(signatures as unknown as SignatureLike[], entity, id) as DossierSignature | null) ?? null
}
