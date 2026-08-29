export const CATEGORIES = [
  { value: 'electrical', label: 'Electrical' },
  { value: 'mechanical', label: 'Mechanical' },
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
