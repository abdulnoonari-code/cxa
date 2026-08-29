export const SEVERITIES = [
  { value: 'critical', label: 'Critical' },
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
  { value: 'observation', label: 'Observation' },
]

// Standard construction/commissioning punch list categorization: A items must
// be closed before the system can advance at all, B items are minor and can
// be deferred to after energization/handover if the owner accepts it, C items
// are deferred on purpose to a future maintenance turnaround.
export const CATEGORIES = [
  { value: 'A', label: 'Category A — must fix before proceeding' },
  { value: 'B', label: 'Category B — minor, can defer with owner sign-off' },
  { value: 'C', label: 'Category C — deferred to future maintenance' },
]

export const ISSUE_STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'ready_for_retest', label: 'Ready for Retest' },
  { value: 'verified', label: 'Verified' },
  { value: 'closed', label: 'Closed' },
]

export function severityBadgeClass(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'badge badge-danger'
    case 'major':
      return 'badge badge-warning'
    case 'minor':
      return 'badge badge-info'
    default:
      return 'badge badge-neutral'
  }
}

export function categoryBadgeClass(category: string | null): string {
  switch (category) {
    case 'A':
      return 'badge badge-danger'
    case 'B':
      return 'badge badge-warning'
    case 'C':
      return 'badge badge-neutral'
    default:
      return 'badge badge-neutral'
  }
}

export function issueStatusBadgeClass(status: string): string {
  switch (status) {
    case 'verified':
      return 'badge badge-success'
    case 'closed':
      return 'badge badge-neutral'
    case 'open':
      return 'badge badge-warning'
    default:
      return 'badge badge-info'
  }
}
