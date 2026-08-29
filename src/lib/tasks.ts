export const TASK_STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
]

export const TASK_PRIORITIES = [
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
]

export function taskStatusBadgeClass(status: string): string {
  switch (status) {
    case 'done':
      return 'badge badge-success'
    case 'blocked':
      return 'badge badge-danger'
    case 'in_progress':
      return 'badge badge-info'
    default:
      return 'badge badge-warning'
  }
}

export function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case 'high':
      return 'badge badge-danger'
    case 'low':
      return 'badge badge-neutral'
    default:
      return 'badge badge-info'
  }
}

export function isTaskOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === 'done') return false
  return new Date(dueDate) < new Date(new Date().toDateString())
}

// A project file library, separate from checklist evidence — drawings, specs,
// O&M manuals and contracts belong to the project, not to one check.
export const FILE_CATEGORIES = [
  { value: 'drawing', label: 'Drawing' },
  { value: 'specification', label: 'Specification' },
  { value: 'submittal', label: 'Submittal' },
  { value: 'manual', label: 'O&M Manual' },
  { value: 'report', label: 'Report' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'other', label: 'Other' },
]

export function fileCategoryLabel(value: string | null): string {
  return FILE_CATEGORIES.find((c) => c.value === value)?.label ?? 'Uncategorised'
}
