'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

export async function createTask(formData: FormData) {
  const project_id = str(formData, 'project_id')
  const title = str(formData, 'title')
  if (!project_id || !title) return

  await supabase.from('tasks').insert({
    project_id,
    title,
    description: str(formData, 'description'),
    assignee: str(formData, 'assignee'),
    due_date: str(formData, 'due_date'),
    status: str(formData, 'status') ?? 'open',
    priority: str(formData, 'priority') ?? 'normal',
  })

  revalidatePath('/tasks')
  revalidatePath('/dashboard')
}

export async function updateTask(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

  await supabase
    .from('tasks')
    .update({
      status: str(formData, 'status') ?? 'open',
      assignee: str(formData, 'assignee'),
      due_date: str(formData, 'due_date'),
      priority: str(formData, 'priority') ?? 'normal',
    })
    .eq('id', id)

  revalidatePath('/tasks')
  revalidatePath('/dashboard')
}

export async function deleteTask(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return
  await supabase.from('tasks').delete().eq('id', id)
  revalidatePath('/tasks')
  revalidatePath('/dashboard')
}
