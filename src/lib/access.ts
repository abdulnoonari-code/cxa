// Who sees which project on the register.
//
// ── The rule, and the two ways it can go wrong ──────────────────────────
//
// The obvious rule — "show the projects this person is a member of" — has a
// failure mode that is worse than the problem it solves. An account with no
// membership rows anywhere sees an empty register, which looks exactly like
// a broken application, and the person it locks out is usually the one who
// built the projects in the first place: they created them before anybody
// thought to add a members table.
//
// So there are two deliberate exceptions, and both mirror behaviour the
// application already has in lib/audit.ts:
//
//   1. A project with NO members listed is open to everybody. An empty
//      member list is not a statement that nobody may see it — it is a
//      project where nobody has got round to the member list yet, and
//      getActor already treats that person as a project admin.
//
//   2. An account that is on NO project anywhere sees everything, and is
//      told so. That is the "you have not set up access yet" state. It is
//      announced rather than silent, because unrestricted access that
//      nobody mentions is how a system ends up thought to be locked when
//      it is wide open.
//
// Neither exception loosens anything once one membership row exists for the
// account: from that moment the register is the projects they are on.
//
// This decides what is LISTED. It is not a security boundary — the database
// is, and until SQL part 27 runs there isn't one. Listing and permission are
// kept apart on purpose so that neither is mistaken for the other.

export type Membership = { project_id: string; email: string | null; role: string | null }

export type RegisterEntry<P extends { id: string }> = {
  project: P
  /** This person's role on it, or null when the project has no member list. */
  role: string | null
  /** How many people are listed on it. */
  members: number
  /** True when it is listed because nobody is on it, not because they are. */
  openToAll: boolean
}

export type Register<P extends { id: string }> = {
  entries: RegisterEntry<P>[]
  /** Everything is listed because this account is on no project anywhere. */
  unrestricted: boolean
  /** Projects that exist and are not listed for this person. */
  hidden: number
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

export function buildRegister<P extends { id: string }>(
  projects: P[],
  memberships: Membership[],
  email: string | null
): Register<P> {
  const me = norm(email)

  const byProject = new Map<string, Membership[]>()
  for (const m of memberships) {
    const list = byProject.get(m.project_id)
    if (list) list.push(m)
    else byProject.set(m.project_id, [m])
  }

  const mineAnywhere = me.length > 0 && memberships.some((m) => norm(m.email) === me)

  const entries: RegisterEntry<P>[] = []
  let hidden = 0

  for (const p of projects) {
    const members = byProject.get(p.id) ?? []
    const mine = me.length > 0 ? members.find((m) => norm(m.email) === me) : undefined

    if (mine) {
      entries.push({ project: p, role: mine.role ?? null, members: members.length, openToAll: false })
      continue
    }
    if (members.length === 0) {
      entries.push({ project: p, role: null, members: 0, openToAll: true })
      continue
    }
    if (!mineAnywhere) {
      entries.push({ project: p, role: null, members: members.length, openToAll: true })
      continue
    }
    hidden++
  }

  return { entries, unrestricted: !mineAnywhere, hidden }
}

/**
 * The sentence under the register heading.
 *
 * Every branch says what is being shown AND why, because "3 projects" on its
 * own cannot be checked by the person reading it. Somebody who expects four
 * needs to know whether the fourth is missing because they are not on it or
 * because it was never created.
 */
export function registerNote<P extends { id: string }>(reg: Register<P>, email: string | null): string {
  const n = reg.entries.length
  const count = `${n} project${n === 1 ? '' : 's'}`

  if (n === 0 && reg.hidden === 0) {
    return 'No projects have been registered yet. Create one from Administrator → All Projects.'
  }
  if (n === 0) {
    return `${reg.hidden} project${reg.hidden === 1 ? ' exists' : 's exist'} and you are not listed on ${
      reg.hidden === 1 ? 'it' : 'any of them'
    }. Ask whoever runs the project to add ${email ?? 'your address'} to its team.`
  }
  if (reg.unrestricted) {
    return `${count}. You are not listed on the team of any project, so everything registered is shown. Once your address is added to a project team, this list becomes the projects you are on.`
  }
  // "3 projects you are on" was wrong whenever one of the three was listed
  // because it has no team at all. Being shown something because nobody has
  // set its access up is not the same as being on it, and the register is
  // the one screen where that distinction has to survive.
  const open = reg.entries.filter((e) => e.openToAll).length
  const mine = n - open

  const base =
    mine > 0
      ? `${mine} project${mine === 1 ? '' : 's'} you are on`
      : open === 1
        ? '1 project'
        : `${open} projects`
  const openPart =
    open > 0
      ? mine > 0
        ? `, and ${open} with no team list yet — ${open === 1 ? 'that one is' : 'those are'} open to everybody.`
        : `, with no team list yet, so ${open === 1 ? 'it is' : 'they are'} open to everybody.`
      : '.'
  const rest =
    reg.hidden > 0
      ? ` ${reg.hidden} other${reg.hidden === 1 ? ' is' : 's are'} registered and not shown, because you are not on ${reg.hidden === 1 ? 'its' : 'their'} team.`
      : open > 0
        ? ''
        : ' Every registered project is shown.'
  return base + openPart + rest
}
