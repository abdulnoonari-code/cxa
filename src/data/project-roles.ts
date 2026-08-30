import { supabase } from '@/lib/supabase'
import { resolveRoles, type ProjectRoleRow, type ResolvedRole } from '@/lib/project-roles'

export async function loadProjectRoleRows(projectId: string | null): Promise<ProjectRoleRow[]> {
  if (!projectId) return []
  const { data } = await supabase
    .from('project_roles')
    .select('id, role_key, label, note, caps, sequence, active')
    .eq('project_id', projectId)
    .order('sequence', { ascending: true })
  return (data ?? []) as ProjectRoleRow[]
}

// The role list this project actually works to: the built-in twelve, with
// whatever the project has renamed, re-scoped, switched off or added.
export async function loadRoles(projectId: string | null): Promise<ResolvedRole[]> {
  return resolveRoles(await loadProjectRoleRows(projectId))
}
