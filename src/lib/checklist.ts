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
