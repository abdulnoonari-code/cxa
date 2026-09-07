'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { actorCan, recordAudit } from '@/lib/audit'
import { roleLabel } from '@/lib/roles'
import { cookies } from 'next/headers'
import { createAccount, resetPassword } from '@/data/invite'
import { carriesSecret, INVITE_COOKIE, type InviteOutcome } from '@/lib/invite'

/**
 * Hand the result back to the page that is about to be drawn.
 *
 * A cookie, not a query string. A temporary password in the URL is a
 * temporary password in the browser history, in the back button, in a
 * screenshot of the address bar, and — on most hosting — in a request log
 * that nobody has thought about. A short-lived httpOnly cookie is none of
 * those things.
 *
 * Two minutes. Long enough to read it out or paste it into a message;
 * short enough that it is gone before the laptop is left on a desk. It is
 * never written to the audit trail and never stored by this application.
 */
async function remember(outcome: InviteOutcome) {
  const store = await cookies()
  store.set(INVITE_COOKIE, JSON.stringify(outcome), {
    maxAge: 120,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  })
}

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

function refresh() {
  revalidatePath('/team')
  revalidatePath('/audit')
  revalidatePath('/review')
  revalidatePath('/tests')
}

export async function addMember(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) return

  const email = str(formData, 'email')
  const role = str(formData, 'role') ?? 'engineer'
  if (!email) return

  await supabase.from('project_members').insert({
    project_id: project.id,
    email,
    full_name: str(formData, 'full_name'),
    company: str(formData, 'company'),
    role,
  })

  // Being on the team and being able to sign in are two different things,
  // and since public sign-up was turned off the second no longer happens by
  // itself. So it happens here, in the same action, unless the box is
  // unticked — a client's inspector who already has an account on another
  // project does not need a second one.
  const outcome = formData.get('create_account') === 'on' ? await createAccount(email) : null
  if (outcome) await remember(outcome)

  await recordAudit({
    projectId: project.id,
    action: 'added to project team',
    entity: 'project_member',
    entityLabel: email,
    newValue: roleLabel(role),
    // What happened, never the password. An audit trail that carries a
    // secret is a secret stored forever in a table nobody thinks of as
    // sensitive.
    comment: outcome
      ? outcome.state === 'created'
        ? 'A sign-in account was created for this address.'
        : outcome.state === 'already'
          ? 'This address already had a sign-in account; nothing was changed.'
          : `No account was created: ${outcome.state}.`
      : 'No account was created — not requested.',
  })

  refresh()
}

/**
 * A new temporary password for somebody already on the team.
 *
 * Needed because sign-up is off and this deployment sends no email, so the
 * ordinary "forgot password" cannot reach anybody. Without it, one forgotten
 * password sends an administrator back into Supabase.
 */
export async function resetMemberPassword(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) return

  const email = str(formData, 'email')
  if (!email) return

  const outcome = await resetPassword(email)
  await remember(outcome)

  await recordAudit({
    projectId: project.id,
    action: 'reset a sign-in password',
    entity: 'project_member',
    entityLabel: email,
    comment: carriesSecret(outcome)
      ? 'A new temporary password was issued and shown once on screen. It is not recorded here.'
      : `No password was issued: ${outcome.state}.`,
  })

  refresh()
}

export async function updateMemberRole(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) return

  const id = str(formData, 'id')
  const role = str(formData, 'role') ?? 'viewer'
  const previous = str(formData, 'previous_role')
  const email = str(formData, 'email')
  if (!id) return

  await supabase.from('project_members').update({ role }).eq('id', id)

  await recordAudit({
    projectId: project.id,
    action: 'changed role',
    entity: 'project_member',
    entityId: id,
    entityLabel: email,
    oldValue: roleLabel(previous),
    newValue: roleLabel(role),
  })

  refresh()
}

export async function removeMember(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) return

  const id = str(formData, 'id')
  const email = str(formData, 'email')
  if (!id) return

  await supabase.from('project_members').delete().eq('id', id)

  await recordAudit({
    projectId: project.id,
    action: 'removed from project team',
    entity: 'project_member',
    entityId: id,
    entityLabel: email,
  })

  refresh()
}
