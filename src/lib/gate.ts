// Who may use this application at all.
//
// ── The hole this closes ────────────────────────────────────────────────
//
// Two separate things let a stranger in, and both need saying plainly.
//
//   1. Supabase allows anybody to create an account by default. /signup is
//      reachable by anyone with the address, so "log in" was never a
//      barrier — it was a form.
//
//   2. lib/access.ts then had a deliberate exception: an account on NO
//      project anywhere was shown EVERY project, with a note saying so.
//      That was written for the person who built the projects before there
//      was a member list, and it is exactly wrong for a live site: a
//      brand-new account is, by definition, on no project.
//
// Together they meant anybody who found the address could sign up and read
// the whole job. Signing in is now separate from being allowed in.
//
// ── The rule ────────────────────────────────────────────────────────────
//
// An account may use the application when:
//
//   · its address is in the OWNER LIST (the CXA_OWNER_EMAILS setting), or
//   · its address is on the team of at least one project.
//
// Anything else is refused — not shown an empty list, refused, with the
// address it tried printed on the page so the person can ask to be added.
//
// ── The one exception, and why it is safe ───────────────────────────────
//
// If there is no owner list AND no project has a single team member
// anywhere, the database has never had access set up. Refusing everybody
// then would lock the owner out of their own application with no way back
// in, on the deploy that introduced this file.
//
// So that one state is allowed — and it is ANNOUNCED, in red, on every
// page, saying the site is open to anybody who signs up and naming the two
// things that close it. An open door nobody mentions is how a system comes
// to be thought locked when it is not; that was the whole failure here.
//
// The moment either an owner list exists or one team member is recorded
// anywhere, the exception is gone and the rule above is the only rule.

export type Verdict =
  | { state: 'owner'; email: string }
  | { state: 'member'; email: string; projects: number }
  | { state: 'unconfigured'; email: string }
  | { state: 'blocked'; email: string; reason: 'not-on-any-team' | 'no-address' }

export type GateInput = {
  /** The signed-in address. */
  email: string | null | undefined
  /** Every team row on the database — project_id and email is enough. */
  memberships: { project_id: string; email: string | null }[]
  /** Addresses from the CXA_OWNER_EMAILS setting. */
  owners: string[]
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/**
 * Read the owner list.
 *
 * Commas or newlines, spaces ignored, case ignored. An entry that is not an
 * address is dropped rather than kept: a typo in this setting must not
 * become an account that can never sign in but sits there looking valid.
 */
export function parseOwners(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(/[,\n;]/)
    .map((s) => norm(s))
    .filter((s) => s.length > 0 && /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s))
}

export function decideAccess(input: GateInput): Verdict {
  const me = norm(input.email)
  if (me === '') return { state: 'blocked', email: '', reason: 'no-address' }

  const owners = input.owners.map(norm).filter(Boolean)
  if (owners.includes(me)) return { state: 'owner', email: me }

  const mine = input.memberships.filter((m) => norm(m.email) === me)
  if (mine.length > 0) {
    return { state: 'member', email: me, projects: new Set(mine.map((m) => m.project_id)).size }
  }

  // Nothing configured anywhere: the first-run state described above.
  if (owners.length === 0 && input.memberships.length === 0) {
    return { state: 'unconfigured', email: me }
  }

  return { state: 'blocked', email: me, reason: 'not-on-any-team' }
}

export function mayUseApp(v: Verdict): boolean {
  return v.state !== 'blocked'
}

/** The red banner shown while the door is open. Empty when it is not. */
export function openDoorWarning(v: Verdict): string | null {
  if (v.state !== 'unconfigured') return null
  return (
    'This site is open to anybody who signs up. No owner address is set and no project has a team list, ' +
    'so every account that registers can read the whole project. Two things close it: turn off new sign-ups ' +
    'in Supabase (Authentication → Sign In / Providers → Email), and add your address to CXA_OWNER_EMAILS ' +
    'in Vercel.'
  )
}

/** What the refused person is told. Their address, because they must quote it. */
export function refusalNote(v: Verdict): string {
  if (v.state === 'blocked' && v.reason === 'no-address') {
    return 'This account has no email address on it, so it cannot be matched to a project team.'
  }
  return (
    `${v.email} is signed in but is not on the team of any project on this site, and is not an owner address. ` +
    'Ask whoever runs the project to add this address to the project team — until then there is nothing here to show.'
  )
}
