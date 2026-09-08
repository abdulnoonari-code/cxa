'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { missingColumn } from '@/lib/pg-columns'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

/**
 * Write a row, and if the database has never heard of one of its columns,
 * write it again without that column.
 *
 * `level` is new. Without this, on a database where the SQL step has not
 * been run, adding a task would be REFUSED WHOLE — the button would appear
 * to work, nothing would appear in the list, and no message would say why.
 * A row is refused entire: one unknown column throws the other six away
 * with it. Dropping the column and saying so is the only honest answer
 * that still saves the person's typing.
 */
async function writeDroppingUnknownColumns(
  row: Record<string, unknown>,
  run: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
): Promise<void> {
  const current = { ...row }
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await run(current)
    if (!error) return
    const column = missingColumn(error.message)
    if (!column || !(column in current)) return
    delete current[column]
  }
}

export async function createTask(formData: FormData) {
  const project_id = str(formData, 'project_id')
  const title = str(formData, 'title')
  if (!project_id || !title) return

  await writeDroppingUnknownColumns(
    {
      project_id,
      title,
      description: str(formData, 'description'),
      assignee: str(formData, 'assignee'),
      due_date: str(formData, 'due_date'),
      status: str(formData, 'status') ?? 'open',
      priority: str(formData, 'priority') ?? 'normal',
      level: str(formData, 'level'),
    },
    async (row) => ({ error: (await supabase.from('tasks').insert(row)).error })
  )

  revalidatePath('/tasks')
  revalidatePath('/levels')
  revalidatePath('/dashboard')
}

export async function updateTask(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return

  await writeDroppingUnknownColumns(
    {
      status: str(formData, 'status') ?? 'open',
      assignee: str(formData, 'assignee'),
      due_date: str(formData, 'due_date'),
      priority: str(formData, 'priority') ?? 'normal',
      level: str(formData, 'level'),
    },
    async (row) => ({ error: (await supabase.from('tasks').update(row).eq('id', id)).error })
  )

  revalidatePath('/tasks')
  revalidatePath('/levels')
  revalidatePath('/dashboard')
}

export async function deleteTask(formData: FormData) {
  const id = str(formData, 'id')
  if (!id) return
  await supabase.from('tasks').delete().eq('id', id)
  revalidatePath('/tasks')
  revalidatePath('/levels')
  revalidatePath('/dashboard')
}
