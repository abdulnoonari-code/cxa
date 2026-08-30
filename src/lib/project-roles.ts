// Roles a project defines for itself.
//
// The twelve built-in roles are sensible defaults, not a rule. Every site
// names its people differently — an EGAT substation has an Authorised Person
// and a Protection Engineer; a data centre has a Facility Manager and an IST
// Lead — and a project must be able to say so without waiting for the software
// to be changed.
//
// A project row whose key matches a built-in overrides it. A row with a new
// key adds a role. Nothing is ever deleted from the built-in list, so a
// project that defines nothing behaves exactly as it did before.

import { ROLES, type Capability, type RoleValue } from '@/lib/roles'

export const CAPABILITIES: { value: Capability; label: string; note: string }[] = [
  { value: 'view', label: 'View', note: 'See the project' },
  { value: 'record', label: 'Record', note: 'Enter check results, test readings, raise issues' },
  { value: 'review', label: 'Review', note: 'Mark work reviewed, set requirements and ITP types' },
  { value: 'approve', label: 'Approve', note: 'Approve, reject, sign gates and hold points' },
  { value: 'manage', label: 'Manage', note: 'Create and delete projects, systems, equipment, the team' },
]

const CAP_VALUES = new Set(CAPABILITIES.map((c) => c.value))

export type ProjectRoleRow = {
  id: string
  role_key: string
  label: string
  note: string | null
  caps: string
  sequence: number | null
  active: boolean | null
}

export type ResolvedRole = {
  value: string
  label: string
  caps: Capability[]
  note: string
  /** true when this role came from the project rather than the built-in list */
  custom: boolean
  /** true when a project row replaced a built-in of the same key */
  overridden: boolean
  active: boolean
}

// Roles that must keep 'manage' whatever a project says. Without this a single
// bad import could remove the last role able to edit the team, and there would
// be no way back through the interface.
export const PROTECTED_KEYS = new Set(['super_admin', 'project_admin'])

export function parseCaps(value: string | null | undefined): Capability[] {
  if (!value) return []
  const out: Capability[] = []
  for (const raw of value.split(/[,;|/]+/)) {
    const c = raw.trim().toLowerCase()
    if (CAP_VALUES.has(c as Capability) && !out.includes(c as Capability)) out.push(c as Capability)
  }
  return out
}

export function formatCaps(caps: Capability[]): string {
  // Written back in the canonical order so an export always looks the same
  // regardless of how the row was typed in.
  return CAPABILITIES.filter((c) => caps.includes(c.value))
    .map((c) => c.value)
    .join(', ')
}

// A key that survives being typed by a person: lower case, underscores, no
// punctuation. "Authorised Person" and "authorised person" become one role.
export function toRoleKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

// The built-ins, overridden and extended by whatever the project has defined.
export function resolveRoles(projectRows: ProjectRoleRow[]): ResolvedRole[] {
  const byKey = new Map<string, ProjectRoleRow>()
  for (const row of projectRows) byKey.set(row.role_key.toLowerCase(), row)

  const resolved: ResolvedRole[] = ROLES.map((builtIn) => {
    const override = byKey.get(builtIn.value)
    if (!override) {
      return {
        value: builtIn.value,
        label: builtIn.label,
        caps: builtIn.caps,
        note: builtIn.note,
        custom: false,
        overridden: false,
        active: true,
      }
    }
    byKey.delete(builtIn.value)
    const caps = parseCaps(override.caps)
    const isProtected = PROTECTED_KEYS.has(builtIn.value)
    return {
      value: builtIn.value,
      label: override.label || builtIn.label,
      // A protected role keeps every capability whatever the row says — and
      // stays active, because switching it off would strip those capabilities
      // just as effectively as removing them (canIn refuses an inactive role).
      // Renaming it is allowed; disarming it is not.
      caps: isProtected ? builtIn.caps : caps,
      note: override.note || builtIn.note,
      custom: false,
      overridden: true,
      active: isProtected ? true : override.active !== false,
    }
  })

  // Whatever is left is new to this project.
  const extras = [...byKey.values()]
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .map((row) => ({
      value: row.role_key,
      label: row.label,
      caps: parseCaps(row.caps),
      note: row.note ?? 'Defined by this project',
      custom: true,
      overridden: false,
      active: row.active !== false,
    }))

  return [...resolved, ...extras]
}

export function activeRoles(roles: ResolvedRole[]): ResolvedRole[] {
  return roles.filter((r) => r.active)
}

export function findRole(roles: ResolvedRole[], value: string | null): ResolvedRole | null {
  if (!value) return null
  return roles.find((r) => r.value === value) ?? null
}

export function roleLabelIn(roles: ResolvedRole[], value: string | null): string {
  return findRole(roles, value)?.label ?? 'Viewer'
}

// The capability check the whole application should be asking. An unknown
// role is never permissive — the same rule the built-in matrix has always
// followed.
export function canIn(roles: ResolvedRole[], value: string | null, capability: Capability): boolean {
  const role = findRole(roles, value)
  if (!role) return false
  if (!role.active) return false
  return role.caps.includes(capability)
}

// Would this set of roles leave the project unable to approve anything, or
// unable to manage itself? Worth saying out loud on the page rather than
// letting somebody discover it later.
export function roleSetWarnings(roles: ResolvedRole[]): string[] {
  const live = activeRoles(roles)
  const warnings: string[] = []
  if (!live.some((r) => r.caps.includes('approve'))) {
    warnings.push('No active role can approve anything, so no record could ever be closed out.')
  }
  if (!live.some((r) => r.caps.includes('manage'))) {
    warnings.push('No active role can manage the project.')
  }
  if (!live.some((r) => r.caps.includes('record'))) {
    warnings.push('No active role can record a result, so no work could be entered.')
  }
  return warnings
}

export function isBuiltInKey(key: string): boolean {
  return ROLES.some((r) => r.value === key)
}

export function builtInFor(key: string): { value: RoleValue; label: string; caps: Capability[]; note: string } | null {
  return ROLES.find((r) => r.value === key) ?? null
}
