'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

function refresh() {
  revalidatePath('/systems')
  revalidatePath('/readiness')
  revalidatePath('/equipment')
  revalidatePath('/dashboard')
}

export async function createSystem(formData: FormData) {
  const project_id = str(formData, 'project_id')
  const system_id = str(formData, 'system_id')
  const name = str(formData, 'name')
  if (!project_id || !system_id || !name) return

  await supabase.from('systems').insert({
    project_id,
    system_id,
    name,
    discipline: str(formData, 'discipline'),
    description: str(formData, 'description'),
    boundary: str(formData, 'boundary'),
    responsible: str(formData, 'responsible'),
    stage: str(formData, 'stage') ?? 'construction',
  })

  refresh()
}

export async function updateSystem(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

  await supabase
    .from('systems')
    .update({
      stage: str(formData, 'stage') ?? 'construction',
      responsible: str(formData, 'responsible'),
      boundary: str(formData, 'boundary'),
    })
    .eq('id', id)

  refresh()
}

export async function deleteSystem(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return
  // Equipment is not deleted — it simply loses its system assignment.
  await supabase.from('equipment').update({ system_id: null, subsystem_id: null }).eq('system_id', id)
  await supabase.from('systems').delete().eq('id', id)
  refresh()
}

// Put a tag inside a system, or take it out again.
export async function assignEquipment(formData: FormData) {
  const equipment_id = str(formData, 'equipment_id')
  const system_id = str(formData, 'system_id')
  if (!equipment_id) return

  await supabase
    .from('equipment')
    .update({ system_id, subsystem_id: null })
    .eq('id', equipment_id)

  refresh()
}
