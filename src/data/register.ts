import { supabase } from '@/lib/supabase'
import { createClient } from '@/lib/supabase/server'
import { listProjects, type Project } from '@/lib/project'
import { buildRegister, type Membership, type Register } from '@/lib/access'

export type ProjectRegister = Register<Project> & { email: string | null }

/**
 * The register, and the signed-in address it is built for.
 *
 * The member list is read for every project at once rather than per project.
 * With one query per project a register of thirty is thirty round trips, and
 * the page that everybody lands on after logging in is the last place that
 * can afford to be slow.
 *
 * A failure to read the member table is treated as "no memberships", not as
 * "no projects". The difference matters: the first shows everything with a
 * note saying access has not been set up, the second shows an empty page
 * that looks like data loss.
 */
export async function loadRegister(): Promise<ProjectRegister> {
  const auth = await createClient()
  const {
    data: { user },
  } = await auth.auth.getUser()
  const email = user?.email ?? null

  const [projects, members] = await Promise.all([
    listProjects(),
    supabase.from('project_members').select('project_id, email, role'),
  ])

  const memberships = (members.data ?? []) as Membership[]
  return { ...buildRegister(projects, memberships, email), email }
}
