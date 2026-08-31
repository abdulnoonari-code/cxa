// The requirement register — the spine of the digital thread.
//
// A requirement is a statement, from a named source at a named revision, that
// something must be true, verified by a named method, against a named subject.
// Checks and tests stop being free-standing lists and become verification
// activities against requirements.
//
// The verification status of a requirement is DERIVED from the activities
// linked to it. It is never stored, for the same reason readiness is never
// stored: a stored status can disagree with the records underneath it, and a
// requirement that claims to be verified when its test failed is the most
// dangerous record this system could hold.

export const SOURCE_KINDS = [
  { value: 'contract', label: 'Contract' },
  { value: 'employer_requirements', label: "Employer's Requirements" },
  { value: 'specification', label: 'Technical Specification' },
  { value: 'design', label: 'Design Document' },
  { value: 'drawing', label: 'Drawing' },
  { value: 'itp', label: 'Inspection & Test Plan' },
  { value: 'method_statement', label: 'Method Statement' },
  { value: 'commissioning_procedure', label: 'Commissioning Procedure' },
  { value: 'oem_manual', label: 'OEM Manual' },
  { value: 'regulation', label: 'Regulation / Code' },
  { value: 'client_standard', label: 'Client Standard' },
  { value: 'hse', label: 'HSE Requirement' },
  { value: 'operations', label: 'Operations Requirement' },
  { value: 'warranty', label: 'Warranty Condition' },
  { value: 'handover', label: 'Handover Requirement' },
]

export function sourceLabel(value: string | null): string {
  return SOURCE_KINDS.find((s) => s.value === value)?.label ?? 'Other source'
}

// How a requirement is proved. The method decides what kind of activity can
// close it out, and it is the field that stops "we checked it" standing in for
// a measured result.
export const VERIFICATION_METHODS = [
  { value: 'inspection', label: 'Inspection', note: 'Somebody looks at it and records what they saw' },
  { value: 'test', label: 'Test', note: 'A measurement against an acceptance limit' },
  { value: 'analysis', label: 'Analysis', note: 'Calculation or study rather than measurement' },
  { value: 'demonstration', label: 'Demonstration', note: 'Operated in front of a witness' },
  { value: 'certificate', label: 'Certificate', note: 'Closed by a supplied document' },
  { value: 'review', label: 'Document Review', note: 'Verified by reviewing a deliverable' },
  { value: 'training', label: 'Training Record', note: 'Closed by competence evidence' },
]

export function methodLabel(value: string | null): string {
  return VERIFICATION_METHODS.find((m) => m.value === value)?.label ?? 'Test'
}

export const CRITICALITIES = [
  { value: 'critical', label: 'Critical', note: 'Safety or contractual. Blocks the gate.' },
  { value: 'normal', label: 'Normal', note: 'Required, but assessed with the rest.' },
  { value: 'minor', label: 'Minor', note: 'Recorded; does not by itself hold anything up.' },
]

export function criticalityLabel(value: string | null): string {
  return CRITICALITIES.find((c) => c.value === value)?.label ?? 'Normal'
}

export function criticalityBadgeClass(value: string | null): string {
  switch (value) {
    case 'critical':
      return 'badge badge-danger'
    case 'minor':
      return 'badge badge-neutral'
    default:
      return 'badge badge-info'
  }
}

// ── Controlled documents ──────────────────────────────────────────────────

export const DOC_TYPES = [
  { value: 'specification', label: 'Specification' },
  { value: 'drawing', label: 'Drawing' },
  { value: 'sld', label: 'Single Line Diagram' },
  { value: 'schematic', label: 'Schematic' },
  { value: 'datasheet', label: 'Datasheet' },
  { value: 'itp', label: 'Inspection & Test Plan' },
  { value: 'method_statement', label: 'Method Statement' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'manual', label: 'O&M Manual' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'contract', label: 'Contract' },
  { value: 'report', label: 'Report' },
]

export function docTypeLabel(value: string | null): string {
  return DOC_TYPES.find((d) => d.value === value)?.label ?? 'Document'
}

export const REVISION_STATUSES = [
  { value: 'draft', label: 'Draft', note: 'Not for construction or verification' },
  { value: 'issued', label: 'Issued', note: 'Released, not yet approved' },
  { value: 'approved', label: 'Approved', note: 'The revision to work to' },
  { value: 'superseded', label: 'Superseded', note: 'Replaced by a later revision' },
]

export function revisionStatusLabel(value: string | null): string {
  return REVISION_STATUSES.find((r) => r.value === value)?.label ?? 'Issued'
}

export function revisionBadgeClass(value: string | null): string {
  switch (value) {
    case 'approved':
      return 'badge badge-success'
    case 'superseded':
      return 'badge badge-danger'
    case 'draft':
      return 'badge badge-neutral'
    default:
      return 'badge badge-warning'
  }
}

export type Revision = {
  id: string
  document_id: string
  rev: string
  status: string | null
  issued_date: string | null
  effective_from: string | null
  superseded_by: string | null
  // Filled in when the actual document is attached and read. A revision with
  // no text has not been read — which is different from a revision whose text
  // contained nothing worth filing.
  file_name?: string | null
  file_url?: string | null
  word_count?: number | null
  page_count?: number | null
  source_format?: string | null
  extracted_at?: string | null
}

// The revision to work to: the approved one, or failing that the latest issued
// one. A draft is never effective — working to a draft is how the wrong
// setting ends up in a relay.
export function effectiveRevision(revisions: Revision[]): Revision | null {
  const usable = revisions.filter((r) => r.status !== 'superseded' && r.status !== 'draft')
  if (usable.length === 0) return null
  const approved = usable.filter((r) => r.status === 'approved')
  const pool = approved.length > 0 ? approved : usable
  return [...pool].sort((a, b) => (a.issued_date ?? '').localeCompare(b.issued_date ?? ''))[pool.length - 1] ?? null
}

// ── Verification status ───────────────────────────────────────────────────

export type VerificationActivity = {
  kind: 'checklist_item' | 'test_record'
  id: string
  label: string
  /** 'pass' | 'fail' | 'pending' | 'na' for checks; 'pass' | 'fail' | 'pending' for tests */
  result: string
  /** the approval or review state, whatever the source table calls it */
  approval: string | null
}

export type RequirementStatus =
  | 'not_planned'   // nothing has been linked to prove it
  | 'planned'       // linked, but nothing carried out yet
  | 'in_progress'   // some activities done, not all
  | 'failed'        // at least one linked activity failed
  | 'verified'      // every linked activity passed and was approved
  | 'unapproved'    // every linked activity passed, but approval is outstanding

export const STATUS_LABELS: Record<RequirementStatus, string> = {
  not_planned: 'No verification planned',
  planned: 'Planned',
  in_progress: 'In progress',
  failed: 'Failed',
  verified: 'Verified',
  unapproved: 'Passed, awaiting approval',
}

export function statusLabel(s: RequirementStatus): string {
  return STATUS_LABELS[s]
}

export function statusBadgeClass(s: RequirementStatus): string {
  switch (s) {
    case 'verified':
      return 'badge badge-success'
    case 'failed':
      return 'badge badge-danger'
    case 'unapproved':
    case 'in_progress':
      return 'badge badge-warning'
    case 'planned':
      return 'badge badge-info'
    default:
      return 'badge badge-neutral'
  }
}

const APPROVED = new Set(['approved'])

// Derived, never stored. Note the ordering: a single failure outranks any
// number of passes, and "not applicable" is treated as satisfied because
// somebody has explicitly said the requirement does not apply here — which is
// a decision, unlike "pending", which is an absence.
export function requirementStatus(activities: VerificationActivity[]): RequirementStatus {
  if (activities.length === 0) return 'not_planned'

  if (activities.some((a) => a.result === 'fail')) return 'failed'

  const settled = activities.filter((a) => a.result === 'pass' || a.result === 'na')
  if (settled.length === 0) return 'planned'
  if (settled.length < activities.length) return 'in_progress'

  const allApproved = activities.every((a) => a.result === 'na' || APPROVED.has(a.approval ?? ''))
  return allApproved ? 'verified' : 'unapproved'
}

// What a gate should treat as met. Deliberately strict: only a fully verified
// requirement counts, so an unapproved pass never closes a gate on its own.
export function isSatisfied(s: RequirementStatus): boolean {
  return s === 'verified'
}

export function isBlocking(s: RequirementStatus, criticality: string | null): boolean {
  if (s === 'failed') return true
  return criticality === 'critical' && s !== 'verified'
}

// ── Revision impact ───────────────────────────────────────────────────────

// The §7 question: a document has been revised — what does it touch? A
// requirement citing a revision that is no longer effective needs re-reading
// against the new one. This is the whole reason a requirement stores its
// source revision as well as its source document.
export type RequirementSourceRef = {
  id: string
  ref: string | null
  statement: string
  document_id: string | null
  source_revision: string | null
}

export function requirementsNeedingReview(
  requirements: RequirementSourceRef[],
  effectiveByDocument: Map<string, string>
): RequirementSourceRef[] {
  return requirements.filter((r) => {
    if (!r.document_id || !r.source_revision) return false
    const effective = effectiveByDocument.get(r.document_id)
    if (!effective) return false
    return effective !== r.source_revision
  })
}

// A readable reference for a requirement that has none of its own.
export function displayRef(r: { ref: string | null; id: string }, index: number): string {
  if (r.ref) return r.ref
  return `REQ-${String(index + 1).padStart(3, '0')}`
}
