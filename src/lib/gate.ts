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
  // The ids themselves, not a count. A count answered "is this person on a
  // team anywhere", which is the question that let a member of one job open
  // every other job on the database. The ids answer "WHICH jobs".
  | { state: 'member'; email: string; projectIds: string[] }
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
    // project_id is nullable on the team table, so a row can carry no project
    // at all. A blank id in this list would be compared against a blank
    // cookie value and let somebody through a door that does not exist.
    const ids = [...new Set(mine.map((m) => (m.project_id ?? '').trim()).filter((id) => id !== ''))]
    if (ids.length > 0) return { state: 'member', email: me, projectIds: ids }
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

/**
 * May this account open THIS project?
 *
 * ── The hole this closes ────────────────────────────────────────────────
 *
 * Being on a team was treated as a pass for the whole site. `mayUseApp`
 * asked "is this address on SOME project" and nothing anywhere asked "on
 * THIS one" — so a person added to one job could choose any other job from
 * the project switcher and read it in full: another client's tag register,
 * punch list, test results, photographs and contracts. Every screen already
 * filtered by the selected project, which is exactly why it looked right.
 *
 * The database cannot catch this. Row level security is on with no policies
 * and the server holds the service-role key, so this function is the only
 * thing standing there.
 *
 * ── The two states that stay open, and why ──────────────────────────────
 *
 * An OWNER may open anything. That is what the owner list is for, and it is
 * what stops the person who runs the site locking themselves out of it on
 * the deploy that introduces this file.
 *
 * UNCONFIGURED is the documented first-run state — no owner address, no team
 * row anywhere — and it is already announced in red on every page by
 * `openDoorWarning`. Refusing here would lock out a database that has never
 * had access set up, with no way back in. It stays open for exactly as long
 * as that banner is showing, and not one moment longer.
 */
export function mayOpenProject(v: Verdict, projectId: string | null | undefined): boolean {
  if (v.state === 'owner' || v.state === 'unconfigured') return true
  if (v.state !== 'member') return false

  // A blank id must never match. `''` in a cookie against `''` in a broken
  // team row is the shape of the bug this whole function exists to prevent.
  const id = (projectId ?? '').trim()
  return id !== '' && v.projectIds.includes(id)
}

/**
 * Of these projects, the ones this account may open — in the order given.
 *
 * Order is kept rather than sorted: the caller asked the database for a
 * particular order (oldest first, so a fresh login lands somewhere stable)
 * and a filter that quietly reorders would change which project opens.
 */
export function allowedProjects<T extends { id: string }>(v: Verdict, projects: T[]): T[] {
  if (v.state === 'owner' || v.state === 'unconfigured') return projects
  if (v.state !== 'member') return []
  const mine = new Set(v.projectIds)
  return projects.filter((p) => mine.has(p.id))
}

/** How many projects this account may open, or null when that is "all of them". */
export function projectCountFor(v: Verdict): number | null {
  if (v.state === 'member') return v.projectIds.length
  if (v.state === 'blocked') return 0
  return null
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
