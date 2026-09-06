// The disciplines a tag can belong to.
//
// This list is enforced by a CHECK CONSTRAINT in the database, so it cannot
// be extended here alone — the database refuses any value not in its own
// copy, whole row, with a message about equipment_category_check. That is
// exactly how the worked example failed the first time it met a real
// database: it wrote "Switchgear", which is a perfectly good English word
// and not one of these.
//
// SQL part 32 rebuilds the constraint from this list. The two must be
// changed together, and an assertion checks that the SQL names every value
// written here.
export const CATEGORIES = [
  { value: 'electrical', label: 'Electrical' },
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'civil_structural', label: 'Civil / Structural' },
  { value: 'architectural', label: 'Architectural' },
  { value: 'plumbing_public_health', label: 'Plumbing & Public Health' },
  { value: 'elv_security', label: 'ELV / Security' },
  { value: 'fire_life_safety', label: 'Fire & Life Safety' },
  { value: 'controls_bms', label: 'Controls / BMS' },
  { value: 'it_whitespace', label: 'IT / White Space' },
  { value: 'substation_protection', label: 'Substation Protection' },
]

export const INSTALL_STATUSES = [
  { value: 'not_delivered', label: 'Not Delivered' },
  { value: 'received', label: 'Received' },
  { value: 'installed', label: 'Installed' },
  { value: 'energized', label: 'Energized' },
]

export function installBadgeClass(status: string): string {
  switch (status) {
    case 'energized':
      return 'badge badge-success'
    case 'installed':
      return 'badge badge-warning'
    case 'received':
      return 'badge badge-info'
    default:
      return 'badge badge-neutral'
  }
}
