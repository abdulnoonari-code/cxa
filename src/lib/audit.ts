import { supabase } from '@/lib/supabase'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProject } from '@/lib/project'
import { can, type Capability, type RoleValue } from '@/lib/roles'
import { resolveRoles, canIn } from '@/lib/project-roles'
import type { ProjectRoleRow } from '@/lib/project-roles'

export type Actor = {
  email: string
  name: string
  role: RoleValue
}

// Who is doing this, and what are they allowed to do here.
//
// Roles only bite once somebody has been added to the project team. Until
// then everyone who can log in is treated as Project Admin, so adding this
// feature cannot lock anyone out of a project that was working yesterday.
export async function getActor(projectId?: string | null): Promise<Actor> {
  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()

  const email = user?.email ?? ''
  let name = email

  if (user) {
    // Read through the server client, not the session client.
    //
    // `profiles` has Row Level Security switched on with no policies on it,
    // so this read as the logged-in user has been returning nothing since the
    // day it was written — which is why names have been appearing as email
    // addresses throughout the application and in every export. It never
    // errored; RLS refuses by returning an empty list.
    //
    // The row is still scoped to this person by `user.id` on the line below,
    // which came from a verified session a moment ago. Nothing wider is
    // readable through this path than was intended by the original.
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
    if (profile?.full_name) name = profile.full_name
  }

  const id = projectId ?? (await getCurrentProject())?.id ?? null
  if (!id) return { email, name, role: 'project_admin' }

  const { data: members } = await supabase
    .from('project_members')
    .select('email, full_name, role')
    .eq('project_id', id)

  const list = members ?? []
  if (list.length === 0) return { email, name, role: 'project_admin' }

  const mine = list.find((m) => (m.email ?? '').toLowerCase() === email.toLowerCase())
  if (!mine) return { email, name, role: 'viewer' }

  return { email, name: mine.full_name || name, role: (mine.role as RoleValue) ?? 'viewer' }
}

// What this person may do here, according to THIS project's role list.
//
// A project can rename a role, change what it may do, switch it off, or add
// one of its own — so the check has to ask the project, not a table compiled
// into the application. If the project has defined nothing, resolveRoles
// returns the twelve built-ins unchanged and the answer is what it always was.
//
// Two safety properties are preserved deliberately: an unknown role is never
// permissive, and Project Admin can never lose 'manage' (enforced in
// resolveRoles), so no role edit or import can lock the last administrator out
// of their own project.
export async function actorCan(capability: Capability, projectId?: string | null): Promise<boolean> {
  const actor = await getActor(projectId)

  const id = projectId ?? (await getCurrentProject())?.id ?? null
  if (!id) return can(actor.role, capability)

  const { data } = await supabase
    .from('project_roles')
    .select('id, role_key, label, note, caps, sequence, active')
    .eq('project_id', id)

  const rows = (data ?? []) as ProjectRoleRow[]
  if (rows.length === 0) return can(actor.role, capability)

  return canIn(resolveRoles(rows), actor.role, capability)
}

type AuditInput = {
  projectId: string | null
  action: string
  entity: string
  entityId?: string | null
  entityLabel?: string | null
  oldValue?: string | null
  newValue?: string | null
  comment?: string | null
}

// Writes one line into the append-only log. Deliberately never throws: an
// audit write failing must not stop the work it was recording, and a missing
// line is visible in the log itself as a gap rather than as a crash.
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const actor = await getActor(input.projectId)
    await supabase.from('audit_log').insert({
      project_id: input.projectId,
      actor_email: actor.email,
      actor_name: actor.name,
      actor_role: actor.role,
      action: input.action,
      entity: input.entity,
      entity_id: input.entityId ?? null,
      entity_label: input.entityLabel ?? null,
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? null,
      comment: input.comment ?? null,
    })
  } catch {
    // Intentionally swallowed — see note above.
  }
}
