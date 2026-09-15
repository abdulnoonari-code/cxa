// The three registers an import can fill, and the words for them.
//
// Pure, and in lib rather than data on purpose. This is a vocabulary, not a
// query: the screens, the component that draws the delete buttons and the
// server action that carries them out all need the same nouns, and a test
// that wants to check the wording should not have to start a database
// client to read a noun.

export type RegisterKind = 'equipment' | 'systems' | 'equipment_types'

export const REGISTER_KINDS: RegisterKind[] = ['equipment', 'systems', 'equipment_types']

/** The table each one lives in. */
export const REGISTER_TABLE: Record<RegisterKind, string> = {
  equipment: 'equipment',
  systems: 'systems',
  equipment_types: 'equipment_types',
}

/** The screen each one is on. */
export const REGISTER_PATH: Record<RegisterKind, string> = {
  equipment: '/equipment',
  systems: '/systems',
  equipment_types: '/equipment-types',
}

/** What a person calls one of them, and several. */
export const REGISTER_LABEL: Record<RegisterKind, { one: string; many: string }> = {
  equipment: { one: 'tag', many: 'tags' },
  systems: { one: 'system', many: 'systems' },
  equipment_types: { one: 'equipment type', many: 'equipment types' },
}

export function isRegisterKind(v: string | null | undefined): v is RegisterKind {
  return v === 'equipment' || v === 'systems' || v === 'equipment_types'
}
