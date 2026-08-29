export const LEVELS = [
  { value: 'L1_fat', label: 'L1 — Factory Acceptance (FAT)' },
  { value: 'L2_iv', label: 'L2 — Installation Verification (IV)' },
  { value: 'L3_prefunctional', label: 'L3 — Pre-functional / Static' },
  { value: 'L4_fpt', label: 'L4 — Functional Performance Test (FPT)' },
  { value: 'L5_ist', label: 'L5 — Integrated Systems Test (IST)' },
]

export const STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'na', label: 'N/A' },
]

// Doing a check and having it accepted are two different things. STATUSES above
// is the technical result; this is where it sits in the approval chain — a
// check can be a clean Pass and still be waiting on the commissioning agent.
export const REVIEW_STATES = [
  { value: 'draft', label: 'Draft', hint: 'Being worked on — not submitted yet' },
  { value: 'submitted', label: 'Submitted', hint: 'Sent for review' },
  { value: 'reviewed', label: 'Reviewed', hint: 'Checked by the commissioning agent' },
  { value: 'approved', label: 'Approved', hint: 'Accepted and closed out' },
  { value: 'rejected', label: 'Rejected', hint: 'Sent back — needs rework' },
]

export const REVIEW_COLORS: Record<string, string> = {
  draft: 'var(--color-neutral-solid)',
  submitted: 'var(--color-primary)',
  reviewed: '#7c3aed',
  approved: 'var(--color-success-solid)',
  rejected: 'var(--color-danger-solid)',
}

export function reviewBadgeClass(state: string | null): string {
  switch (state) {
    case 'approved':
      return 'badge badge-success'
    case 'rejected':
      return 'badge badge-danger'
    case 'reviewed':
      return 'badge badge-info'
    case 'submitted':
      return 'badge badge-warning'
    default:
      return 'badge badge-neutral'
  }
}

export function reviewLabel(state: string | null): string {
  return REVIEW_STATES.find((r) => r.value === (state ?? 'draft'))?.label ?? 'Draft'
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'pass':
      return 'badge badge-success'
    case 'fail':
      return 'badge badge-danger'
    case 'na':
      return 'badge badge-neutral'
    default:
      return 'badge badge-warning'
  }
}
