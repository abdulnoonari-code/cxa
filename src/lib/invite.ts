// Creating an account for somebody you have just put on the project team.
//
// ── Why this exists ─────────────────────────────────────────────────────
//
// Turning off public sign-up closed a real hole: anybody who found the
// address could register and, until the gate was built, read the whole job.
// It also broke the ordinary act of adding a colleague. Adding somebody
// became two jobs in two different products — create the account in
// Supabase, then add the address to the project team here — and the second
// one is easy to forget, which leaves the person logging in successfully
// and landing on "No access to this site".
//
// The server already holds the service role key. That key can create an
// account. So the application can do both halves in one action, and the
// person adding a colleague never opens Supabase at all.
//
// ── Why a temporary password and not an emailed invitation link ─────────
//
// An invitation link is the tidier idea and the more fragile one. It needs
// email that actually leaves the building — Supabase's built-in sender is
// rate limited to a handful an hour and is meant for testing — plus a
// redirect address configured to match the deployment, plus a route here to
// receive the token, plus a story for what happens when the link expires
// before somebody on a site with no signal opens it.
//
// A temporary password shown once on screen has none of those failure
// modes. It is read out, or sent on WhatsApp, and it works the first time.
// The cost is honest: for a moment it exists in two places rather than one,
// so it is shown once, never written to the audit trail, never logged, and
// never stored anywhere by this application — Supabase keeps only a hash.

/**
 * The cookie the result is handed over in.
 *
 * Declared here rather than in the action file because a 'use server' file
 * may export only async functions — exporting a string from one fails the
 * build, which is how this landed the first time.
 */
export const INVITE_COOKIE = 'cx_invite'

/** The alphabet: no O/0, no I/l/1. These get read out over a phone. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

/**
 * A temporary password.
 *
 * Grouped in fours with hyphens, because the first thing that happens to it
 * is somebody reading it aloud on a site with a generator running. Length
 * over cleverness: 20 characters from this alphabet is far past anything
 * that gets guessed, and it is replaced by the person the first time they
 * change it.
 *
 * `randomInt` from node:crypto, not Math.random. A password generated from
 * a predictable source is not a password, and Math.random is predictable.
 */
export function generatePassword(randomInt: (max: number) => number): string {
  const pick = () => ALPHABET[randomInt(ALPHABET.length)]
  const group = () => Array.from({ length: 4 }, pick).join('')
  return [group(), group(), group(), group(), group()].join('-')
}

export function looksLikeEmail(value: string | null | undefined): boolean {
  const v = (value ?? '').trim()
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v)
}

export type InviteOutcome =
  | { state: 'created'; email: string; password: string }
  | { state: 'already'; email: string }
  | { state: 'no-server-key' }
  | { state: 'not-an-email'; value: string }
  | { state: 'failed'; email: string; reason: string }

/**
 * What the person adding a colleague is told.
 *
 * Every branch says what happened AND what to do next, because "added" on
 * its own does not tell somebody whether their colleague can now log in.
 */
export function inviteNote(outcome: InviteOutcome): string {
  switch (outcome.state) {
    case 'created':
      return `${outcome.email} is on the team and an account has been created. Send them the password below — it is shown once and cannot be shown again.`
    case 'already':
      return `${outcome.email} is on the team. They already had an account, so their existing password still works and nothing was changed.`
    case 'no-server-key':
      return 'They are on the team, but an account could not be created: this deployment has no server key, so it cannot create accounts. Set SUPABASE_SERVICE_ROLE_KEY in Vercel, or create the account in Supabase under Authentication → Users.'
    case 'not-an-email':
      return `They are on the team, but "${outcome.value}" is not an email address, so no account was created. Correct it and use Reset password to create one.`
    case 'failed':
      return `${outcome.email} is on the team, but the account could not be created: ${outcome.reason}. They will be refused at the front door until an account exists.`
  }
}

/** Whether the outcome carries a secret that must be shown once and only once. */
export function carriesSecret(outcome: InviteOutcome): outcome is Extract<InviteOutcome, { state: 'created' }> {
  return outcome.state === 'created'
}
