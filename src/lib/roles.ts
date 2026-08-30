// The roles a commissioning project actually has, and what each one may do.
// Kept as a plain table rather than a permissions engine — it is easy to read,
// easy to argue with, and easy to change when a project disagrees.

export type Capability =
  | 'view' // see the project
  | 'record' // enter check results, test readings, raise issues
  | 'review' // mark work reviewed
  | 'approve' // approve or reject — the signature that closes a record out
  | 'manage' // create and delete projects, systems, equipment, and the team

export type RoleValue =
  | 'super_admin'
  | 'project_admin'
  | 'project_manager'
  | 'commissioning_manager'
  | 'discipline_lead'
  | 'engineer'
  | 'technician'
  | 'qa_qc'
  | 'hse'
  | 'client'
  | 'consultant'
  | 'viewer'

export const ROLES: { value: RoleValue; label: string; caps: Capability[]; note: string }[] = [
  {
    value: 'super_admin',
    label: 'Super Admin',
    caps: ['view', 'record', 'review', 'approve', 'manage'],
    note: 'Everything, on every project',
  },
  {
    value: 'project_admin',
    label: 'Project Admin',
    caps: ['view', 'record', 'review', 'approve', 'manage'],
    note: 'Everything on this project, including the team',
  },
  {
    value: 'project_manager',
    label: 'Project Manager',
    caps: ['view', 'record', 'review', 'approve', 'manage'],
    note: 'Full project control',
  },
  {
    value: 'commissioning_manager',
    label: 'Commissioning Manager',
    caps: ['view', 'record', 'review', 'approve', 'manage'],
    note: 'Approves commissioning records and manages the structure',
  },
  {
    value: 'discipline_lead',
    label: 'Discipline Lead',
    caps: ['view', 'record', 'review'],
    note: 'Records and reviews, but does not give final approval',
  },
  {
    value: 'engineer',
    label: 'Engineer',
    caps: ['view', 'record'],
    note: 'Carries out and records the work',
  },
  {
    value: 'technician',
    label: 'Technician',
    caps: ['view', 'record'],
    note: 'Carries out and records the work',
  },
  {
    value: 'qa_qc',
    label: 'QA / QC',
    caps: ['view', 'review', 'approve'],
    note: 'Reviews and approves, does not record field results',
  },
  {
    value: 'hse',
    label: 'HSE',
    caps: ['view', 'review'],
    note: 'Reviews safety-related records',
  },
  {
    value: 'client',
    label: 'Client / Owner',
    caps: ['view', 'approve'],
    note: 'Witnesses and gives final acceptance',
  },
  {
    value: 'consultant',
    label: 'Consultant',
    caps: ['view', 'review'],
    note: 'Reviews on the owner’s behalf',
  },
  {
    value: 'viewer',
    label: 'Viewer',
    caps: ['view'],
    note: 'Read only',
  },
]

export function roleLabel(role: string | null): string {
  return ROLES.find((r) => r.value === role)?.label ?? 'Viewer'
}

export function can(role: string | null, capability: Capability): boolean {
  const found = ROLES.find((r) => r.value === (role ?? 'viewer'))
  return found ? found.caps.includes(capability) : false
}

export function roleBadgeClass(role: string | null): string {
  switch (role) {
    case 'super_admin':
    case 'project_admin':
    case 'project_manager':
    case 'commissioning_manager':
      return 'badge badge-info'
    case 'qa_qc':
    case 'client':
      return 'badge badge-success'
    case 'viewer':
      return 'badge badge-neutral'
    default:
      return 'badge badge-warning'
  }
}
