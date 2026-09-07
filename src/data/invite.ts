import { randomInt } from 'node:crypto'
import { supabase, USING_SERVICE_ROLE } from '@/lib/supabase'
import { generatePassword, looksLikeEmail, type InviteOutcome } from '@/lib/invite'

/**
 * Create a sign-in account for an address.
 *
 * Uses the Supabase admin API, which is exactly what the service role key is
 * for. Without that key this cannot work at all, and says so rather than
 * failing in a way that looks like a bug.
 *
 * `email_confirm: true` — the account is usable immediately. There is no
 * confirmation email to wait for, which matters because public sign-up is
 * off and Supabase's built-in mail is rate limited to a few an hour. The
 * confirmation step exists to prove somebody owns an address they typed
 * themselves; here an administrator has typed it, on purpose, for a
 * colleague they know.
 */
export async function createAccount(rawEmail: string): Promise<InviteOutcome> {
  const email = rawEmail.trim().toLowerCase()

  if (!looksLikeEmail(email)) return { state: 'not-an-email', value: rawEmail }
  if (!USING_SERVICE_ROLE) return { state: 'no-server-key' }

  const password = generatePassword((max) => randomInt(max))

  const { error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (!error) return { state: 'created', email, password }

  // An address that already has an account is the ordinary case when
  // somebody is added to a second project, and it is not a failure. Supabase
  // words this differently between versions, so the code is checked as well
  // as the message.
  const msg = (error.message ?? '').toLowerCase()
  const status = (error as { status?: number }).status
  if (status === 422 || msg.includes('already registered') || msg.includes('already exists') || msg.includes('duplicate')) {
    return { state: 'already', email }
  }

  return { state: 'failed', email, reason: error.message ?? 'unknown error' }
}

/**
 * Give an existing account a new temporary password.
 *
 * Needed because sign-up is off and this deployment has no outgoing mail, so
 * "forgot password" cannot reach anybody. Without this, one forgotten
 * password means an administrator opening Supabase — the thing the invite
 * flow exists to avoid.
 *
 * The user is found by listing accounts and matching the address. Supabase
 * has no "get by email" on the admin API; the list is paged rather than
 * assumed to be one page, because a project with more than fifty people
 * would otherwise silently fail to find the person on page two.
 */
export async function resetPassword(rawEmail: string): Promise<InviteOutcome> {
  const email = rawEmail.trim().toLowerCase()

  if (!looksLikeEmail(email)) return { state: 'not-an-email', value: rawEmail }
  if (!USING_SERVICE_ROLE) return { state: 'no-server-key' }

  let id: string | null = null
  for (let page = 1; page <= 20 && id === null; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) return { state: 'failed', email, reason: error.message }
    const users = data?.users ?? []
    id = users.find((u) => (u.email ?? '').toLowerCase() === email)?.id ?? null
    if (users.length < 200) break
  }

  if (!id) {
    // No account yet — creating one is what they actually wanted.
    return createAccount(email)
  }

  const password = generatePassword((max) => randomInt(max))
  const { error } = await supabase.auth.admin.updateUserById(id, { password })
  if (error) return { state: 'failed', email, reason: error.message }

  return { state: 'created', email, password }
}
