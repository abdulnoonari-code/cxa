'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

export async function createInstrument(formData: FormData) {
  const project_id = str(formData, 'project_id')
  const instrument_id = str(formData, 'instrument_id')
  if (!project_id || !instrument_id) return

  await supabase.from('instruments').insert({
    project_id,
    instrument_id,
    name: str(formData, 'name'),
    manufacturer: str(formData, 'manufacturer'),
    model: str(formData, 'model'),
    serial_number: str(formData, 'serial_number'),
    cert_number: str(formData, 'cert_number'),
    calibration_date: str(formData, 'calibration_date'),
    calibration_expiry: str(formData, 'calibration_expiry'),
  })

  revalidatePath('/instruments')
  revalidatePath('/tests')
}

export async function updateInstrument(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

  await supabase
    .from('instruments')
    .update({
      cert_number: str(formData, 'cert_number'),
      calibration_date: str(formData, 'calibration_date'),
      calibration_expiry: str(formData, 'calibration_expiry'),
    })
    .eq('id', id)

  revalidatePath('/instruments')
  revalidatePath('/tests')
}

export async function deleteInstrument(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return
  await supabase.from('instruments').delete().eq('id', id)
  revalidatePath('/instruments')
  revalidatePath('/tests')
}
