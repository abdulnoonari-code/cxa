export const MILESTONE_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'on_track', label: 'On Track' },
  { value: 'at_risk', label: 'At Risk' },
  { value: 'complete', label: 'Complete' },
]

export function milestoneBadgeClass(status: string): string {
  switch (status) {
    case 'complete':
      return 'badge badge-success'
    case 'on_track':
      return 'badge badge-info'
    case 'at_risk':
      return 'badge badge-danger'
    default:
      return 'badge badge-neutral'
  }
}

export function isOverdue(targetDate: string | null, status: string): boolean {
  if (!targetDate || status === 'complete') return false
  return new Date(targetDate) < new Date(new Date().toDateString())
}
