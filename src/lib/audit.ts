import { supabase } from '@/lib/supabase'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProject } from '@/lib/project'
import { can, type Capability, type RoleValue } from '@/lib/roles'

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
    const { data: profile } = await sb.from('profiles').select('full_name').eq('id', user.id).single()
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

export async function actorCan(capability: Capability, projectId?: string | null): Promise<boolean> {
  const actor = await getActor(projectId)
  return can(actor.role, capability)
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
