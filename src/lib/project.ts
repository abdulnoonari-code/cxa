import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'

export const PROJECT_COOKIE = 'cx_project'

export type Project = {
  id: string
  name: string
  client: string | null
  location: string | null
  start_date: string | null
  target_date: string | null
}

const PROJECT_COLUMNS = 'id, name, client, location, start_date, target_date'

// Which project the app is currently looking at. The choice is kept in a
// cookie rather than the URL so every existing screen stays at its own address
// — /equipment is still /equipment — while showing only the selected project's
// data. Falls back to the oldest project so a fresh login always lands
// somewhere sensible.
export async function getCurrentProject(): Promise<Project | null> {
  const store = await cookies()
  const selectedId = store.get(PROJECT_COOKIE)?.value

  if (selectedId) {
    const { data } = await supabase.from('projects').select(PROJECT_COLUMNS).eq('id', selectedId).single()
    if (data) return data as Project
  }

  const { data: fallback } = await supabase
    .from('projects')
    .select(PROJECT_COLUMNS)
    .order('created_at', { ascending: true })
    .limit(1)

  return ((fallback ?? [])[0] as Project) ?? null
}

export async function listProjects(): Promise<Project[]> {
  const { data } = await supabase
    .from('projects')
    .select(PROJECT_COLUMNS)
    .order('created_at', { ascending: true })

  return (data ?? []) as Project[]
}
