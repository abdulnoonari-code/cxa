// Who is on the project from outside your own team — the people a hold point
// notice actually goes to. Deliberately separate from project_members: a
// client witness needs an email address so you can invite them, but does not
// necessarily need a login.

export const PARTIES = [
  { value: 'client', label: 'Client / Owner' },
  { value: 'consultant', label: 'Consultant / Engineer' },
  { value: 'epc', label: 'EPC' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'oem', label: 'OEM / Vendor' },
  { value: 'authority', label: 'Authority / Utility' },
  { value: 'internal', label: 'Own team' },
]

export function partyLabel(value: string | null): string {
  return PARTIES.find((p) => p.value === value)?.label ?? 'Other'
}

export function partyBadgeClass(value: string | null): string {
  switch (value) {
    case 'client':
      return 'badge badge-success'
    case 'consultant':
    case 'authority':
      return 'badge badge-info'
    case 'oem':
      return 'badge badge-warning'
    case 'internal':
      return 'badge badge-neutral'
    default:
      return 'badge badge-neutral'
  }
}

export const DISCIPLINES = [
  { value: '', label: 'Any discipline' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'instrumentation', label: 'Instrumentation' },
  { value: 'controls', label: 'Controls / SCADA' },
  { value: 'civil', label: 'Civil' },
  { value: 'hse', label: 'HSE' },
  { value: 'quality', label: 'QA / QC' },
]

export function disciplineLabel(value: string | null): string {
  if (!value) return '—'
  return DISCIPLINES.find((d) => d.value === value)?.label ?? value
}

export type Contact = {
  id: string
  full_name: string
  company: string | null
  email: string | null
  phone: string | null
  party: string | null
  job_title: string | null
  discipline: string | null
  is_witness: boolean | null
}

// A contact is only useful for a notice if there is somewhere to send it.
export function canBeNotified(c: Contact): boolean {
  return Boolean(c.email && c.email.includes('@'))
}

// Who a hold point notice should go to by default: everyone marked as a
// witness who has an email address. Falls back to the client side of the
// project if nobody has been flagged, so the first notice is not empty.
export function defaultRecipients(contacts: Contact[]): Contact[] {
  const flagged = contacts.filter((c) => c.is_witness && canBeNotified(c))
  if (flagged.length > 0) return flagged
  return contacts.filter((c) => canBeNotified(c) && (c.party === 'client' || c.party === 'consultant'))
}
