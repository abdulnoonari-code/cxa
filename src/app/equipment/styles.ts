import type { CSSProperties } from 'react'

export const inputStyle: CSSProperties = {
  padding: '8px 10px',
  border: '1px solid #ccc',
  borderRadius: 6,
  fontSize: 14,
  width: '100%',
}

export const buttonStyle: CSSProperties = {
  padding: '9px 16px',
  background: '#111',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 14,
}

export const labelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  fontSize: 13,
  gap: 4,
}

export const thStyle: CSSProperties = { padding: '8px 6px', fontSize: 13, color: '#555' }
export const tdStyle: CSSProperties = { padding: '8px 6px', fontSize: 14 }

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
