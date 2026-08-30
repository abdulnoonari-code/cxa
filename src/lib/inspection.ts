// Inspection and Test Plan activity kinds, and what it takes to get past one.
//
// On a real ITP every activity carries a letter. Most are Surveillance: the
// work happens, the record is checked afterwards. A Witness Point invites
// somebody to attend — if they don't turn up, work still proceeds. A Hold
// Point is different in kind: work stops there until a named person signs it
// off. That distinction is the whole reason this file exists.

export type InspectionValue = 'surveillance' | 'witness' | 'hold' | 'review'

export const INSPECTION_TYPES: {
  value: InspectionValue
  code: string
  label: string
  note: string
  blocking: boolean
  needsNotice: boolean
}[] = [
  {
    value: 'surveillance',
    code: 'S',
    label: 'Surveillance',
    note: 'Work proceeds. The record is checked afterwards.',
    blocking: false,
    needsNotice: false,
  },
  {
    value: 'review',
    code: 'R',
    label: 'Review Point',
    note: 'Documents are reviewed before the next activity. Does not stop the work.',
    blocking: false,
    needsNotice: false,
  },
  {
    value: 'witness',
    code: 'W',
    label: 'Witness Point',
    note: 'The witness is given notice and invited to attend. If they do not attend, work may proceed.',
    blocking: false,
    needsNotice: true,
  },
  {
    value: 'hold',
    code: 'H',
    label: 'Hold Point',
    note: 'Work stops here. It may not proceed until it is released by signature.',
    blocking: true,
    needsNotice: true,
  },
]

export function inspectionType(value: string | null | undefined): InspectionValue {
  const found = INSPECTION_TYPES.find((t) => t.value === value)
  return found ? found.value : 'surveillance'
}

export function inspectionLabel(value: string | null | undefined): string {
  return INSPECTION_TYPES.find((t) => t.value === value)?.label ?? 'Surveillance'
}

export function inspectionCode(value: string | null | undefined): string {
  return INSPECTION_TYPES.find((t) => t.value === value)?.code ?? 'S'
}

export function inspectionBadgeClass(value: string | null | undefined): string {
  switch (value) {
    case 'hold':
      return 'badge badge-danger'
    case 'witness':
      return 'badge badge-warning'
    case 'review':
      return 'badge badge-info'
    default:
      return 'badge badge-neutral'
  }
}

// Only hold and witness points carry a release; the other two are recorded and
// reviewed like any other line.
export function carriesRelease(value: string | null | undefined): boolean {
  return value === 'hold' || value === 'witness'
}

// ── Signatures ────────────────────────────────────────────────────────────

// The three things a person can put their name to. They are deliberately not
// interchangeable: witnessing is a statement of attendance, not of approval,
// and conflating the two is how a client ends up appearing to have accepted
// something they only watched.
export const DECISIONS: {
  value: string
  label: string
  short: string
  statement: string
}[] = [
  {
    value: 'approved',
    label: 'Release — work may proceed',
    short: 'Released',
    statement:
      'I have inspected this activity, I am satisfied it meets the specified requirements, and I release the work to proceed.',
  },
  {
    value: 'witnessed',
    label: 'Witnessed — I attended and observed',
    short: 'Witnessed',
    statement:
      'I attended this activity and observed it being carried out. This records my attendance; it is not by itself an approval of the result.',
  },
  {
    value: 'rejected',
    label: 'Do not release — rework required',
    short: 'Not released',
    statement:
      'I have inspected this activity. It does not meet the specified requirements, it is not released, and rework is required.',
  },
]

export function decisionLabel(value: string | null): string {
  return DECISIONS.find((d) => d.value === value)?.short ?? 'Signed'
}

export function decisionStatement(value: string | null): string {
  return DECISIONS.find((d) => d.value === value)?.statement ?? ''
}

export function decisionBadgeClass(value: string | null): string {
  switch (value) {
    case 'approved':
      return 'badge badge-success'
    case 'rejected':
      return 'badge badge-danger'
    case 'witnessed':
      return 'badge badge-info'
    default:
      return 'badge badge-neutral'
  }
}

export type SignatureLike = {
  entity: string
  entity_id: string
  decision: string
  created_at?: string | null
}

// The most recent signature wins. A hold point rejected in the morning and
// released in the afternoon after rework is released — but both rows survive,
// because the signatures table cannot be edited or deleted.
export function latestSignature<T extends SignatureLike>(
  signatures: T[],
  entity: string,
  entityId: string
): T | null {
  const mine = signatures.filter((s) => s.entity === entity && s.entity_id === entityId)
  if (mine.length === 0) return null
  const sorted = [...mine].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
  return sorted[sorted.length - 1]
}

// ── Release state ─────────────────────────────────────────────────────────

export type ReleaseState =
  | 'not_required' // surveillance or review — nothing to release
  | 'awaiting_work' // it is a hold/witness point, but the work isn't done yet
  | 'awaiting_notice' // work done, nobody has been told to come and look
  | 'notified' // notice given, waiting for the signature
  | 'released' // signed off — work may proceed
  | 'rejected' // signed, and refused

export const RELEASE_LABELS: Record<ReleaseState, string> = {
  not_required: 'Not applicable',
  awaiting_work: 'Work not yet done',
  awaiting_notice: 'Notice not yet given',
  notified: 'Awaiting signature',
  released: 'Released',
  rejected: 'Not released',
}

export function releaseLabel(state: ReleaseState): string {
  return RELEASE_LABELS[state]
}

export function releaseBadgeClass(state: ReleaseState): string {
  switch (state) {
    case 'released':
      return 'badge badge-success'
    case 'rejected':
      return 'badge badge-danger'
    case 'notified':
      return 'badge badge-info'
    case 'awaiting_notice':
      return 'badge badge-warning'
    default:
      return 'badge badge-neutral'
  }
}

export function releaseState(input: {
  inspectionType: string | null | undefined
  workComplete: boolean
  notifiedAt: string | null | undefined
  signature: SignatureLike | null
}): ReleaseState {
  if (!carriesRelease(input.inspectionType)) return 'not_required'

  if (input.signature) {
    if (input.signature.decision === 'rejected') return 'rejected'
    return 'released'
  }

  if (!input.workComplete) return 'awaiting_work'
  return input.notifiedAt ? 'notified' : 'awaiting_notice'
}

// Anything in this list stops the next activity starting. A hold point that
// has been reached and not released is the textbook case.
export function releaseBlocks(inspectionTypeValue: string | null | undefined, state: ReleaseState): boolean {
  if (state === 'rejected') return true
  if (inspectionTypeValue !== 'hold') return false
  return state === 'awaiting_notice' || state === 'notified'
}
