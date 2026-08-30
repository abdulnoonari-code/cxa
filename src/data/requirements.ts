// Data access for the requirement register and controlled documents.

import { supabase } from '@/lib/supabase'
import {
  effectiveRevision,
  requirementStatus,
  type RequirementStatus,
  type Revision,
  type VerificationActivity,
} from '@/lib/requirements'

export type RequirementRow = {
  id: string
  ref: string | null
  statement: string
  subject_type: string | null
  subject_id: string | null
  source_kind: string | null
  document_id: string | null
  source_revision: string | null
  clause: string | null
  verification_method: string | null
  criticality: string | null
  acceptance: string | null
  notes: string | null
  created_at: string | null
}

export type DocumentRow = {
  id: string
  doc_number: string
  title: string | null
  doc_type: string | null
  discipline: string | null
  owner: string | null
  subject_type: string | null
  subject_id: string | null
}

export type RequirementWithStatus = RequirementRow & {
  activities: VerificationActivity[]
  status: RequirementStatus
  /** true when the cited revision is no longer the effective one */
  staleSource: boolean
  effectiveRev: string | null
}

export type RegisterData = {
  requirements: RequirementWithStatus[]
  documents: DocumentRow[]
  revisionsByDocument: Map<string, Revision[]>
  effectiveByDocument: Map<string, string>
}

export async function loadDocuments(projectId: string | null): Promise<{
  documents: DocumentRow[]
  revisionsByDocument: Map<string, Revision[]>
  effectiveByDocument: Map<string, string>
}> {
  if (!projectId) {
    return { documents: [], revisionsByDocument: new Map(), effectiveByDocument: new Map() }
  }

  const { data: docRows } = await supabase
    .from('controlled_documents')
    .select('id, doc_number, title, doc_type, discipline, owner, subject_type, subject_id')
    .eq('project_id', projectId)
    .order('doc_number')

  const documents = (docRows ?? []) as DocumentRow[]
  const revisionsByDocument = new Map<string, Revision[]>()
  const effectiveByDocument = new Map<string, string>()

  if (documents.length > 0) {
    const { data: revRows } = await supabase
      .from('document_revisions')
      .select('id, document_id, rev, status, issued_date, effective_from, superseded_by')
      .in(
        'document_id',
        documents.map((d) => d.id)
      )
      .order('issued_date', { ascending: true })

    for (const r of (revRows ?? []) as Revision[]) {
      const list = revisionsByDocument.get(r.document_id)
      if (list) list.push(r)
      else revisionsByDocument.set(r.document_id, [r])
    }

    for (const [docId, revs] of revisionsByDocument) {
      const eff = effectiveRevision(revs)
      if (eff) effectiveByDocument.set(docId, eff.rev)
    }
  }

  return { documents, revisionsByDocument, effectiveByDocument }
}

// The register with every requirement's status derived from the checks and
// tests actually linked to it — in a fixed number of queries rather than one
// per requirement.
export async function loadRequirementRegister(projectId: string | null): Promise<RegisterData> {
  const { documents, revisionsByDocument, effectiveByDocument } = await loadDocuments(projectId)

  if (!projectId) {
    return { requirements: [], documents, revisionsByDocument, effectiveByDocument }
  }

  const { data: reqRows } = await supabase
    .from('requirements')
    .select(
      'id, ref, statement, subject_type, subject_id, source_kind, document_id, source_revision, clause, verification_method, criticality, acceptance, notes, created_at'
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  const requirements = (reqRows ?? []) as RequirementRow[]

  if (requirements.length === 0) {
    return { requirements: [], documents, revisionsByDocument, effectiveByDocument }
  }

  const { data: linkRows } = await supabase
    .from('requirement_verifications')
    .select('requirement_id, activity_kind, activity_id')
    .in(
      'requirement_id',
      requirements.map((r) => r.id)
    )

  const links = (linkRows ?? []) as {
    requirement_id: string
    activity_kind: string
    activity_id: string
  }[]

  const checkIds = links.filter((l) => l.activity_kind === 'checklist_item').map((l) => l.activity_id)
  const testIds = links.filter((l) => l.activity_kind === 'test_record').map((l) => l.activity_id)

  const [checkRes, testRes] = await Promise.all([
    checkIds.length > 0
      ? supabase.from('checklist_items').select('id, item, status, review_state').in('id', checkIds)
      : Promise.resolve({ data: [] }),
    testIds.length > 0
      ? supabase.from('test_records').select('id, name, result, approval_state').in('id', testIds)
      : Promise.resolve({ data: [] }),
  ])

  const checkById = new Map(
    ((checkRes.data ?? []) as { id: string; item: string; status: string; review_state: string | null }[]).map(
      (c) => [c.id, c]
    )
  )
  const testById = new Map(
    ((testRes.data ?? []) as { id: string; name: string; result: string; approval_state: string | null }[]).map(
      (t) => [t.id, t]
    )
  )

  const activitiesByRequirement = new Map<string, VerificationActivity[]>()

  for (const l of links) {
    let activity: VerificationActivity | null = null

    if (l.activity_kind === 'checklist_item') {
      const c = checkById.get(l.activity_id)
      if (c) {
        activity = { kind: 'checklist_item', id: c.id, label: c.item, result: c.status, approval: c.review_state }
      }
    } else if (l.activity_kind === 'test_record') {
      const t = testById.get(l.activity_id)
      if (t) {
        activity = { kind: 'test_record', id: t.id, label: t.name, result: t.result, approval: t.approval_state }
      }
    }

    // A link whose activity has been deleted is ignored rather than counted as
    // anything — it must never read as a pass.
    if (!activity) continue

    const list = activitiesByRequirement.get(l.requirement_id)
    if (list) list.push(activity)
    else activitiesByRequirement.set(l.requirement_id, [activity])
  }

  const withStatus: RequirementWithStatus[] = requirements.map((r) => {
    const activities = activitiesByRequirement.get(r.id) ?? []
    const effectiveRev = r.document_id ? effectiveByDocument.get(r.document_id) ?? null : null
    return {
      ...r,
      activities,
      status: requirementStatus(activities),
      effectiveRev,
      staleSource: Boolean(r.document_id && r.source_revision && effectiveRev && effectiveRev !== r.source_revision),
    }
  })

  return { requirements: withStatus, documents, revisionsByDocument, effectiveByDocument }
}

// Backward navigation: which requirements does this check or test verify?
export async function requirementsForActivity(
  kind: 'checklist_item' | 'test_record',
  activityId: string
): Promise<{ id: string; ref: string | null; statement: string }[]> {
  const { data: linkRows } = await supabase
    .from('requirement_verifications')
    .select('requirement_id')
    .eq('activity_kind', kind)
    .eq('activity_id', activityId)

  const ids = ((linkRows ?? []) as { requirement_id: string }[]).map((l) => l.requirement_id)
  if (ids.length === 0) return []

  const { data } = await supabase.from('requirements').select('id, ref, statement').in('id', ids)
  return (data ?? []) as { id: string; ref: string | null; statement: string }[]
}
