// Which level belongs to a tag, and which belongs to a system.
//
// This is the gap the Systems screen showed: a system carrying a level badge
// and a punch item, as though the whole switchgear were the thing being
// tested. It is not, and the distinction is not a nicety — it is how
// commissioning actually works:
//
//   L1  Factory acceptance          — the vendor tested THIS DEVICE
//   L2  Installation verification   — THIS DEVICE arrived and was installed
//   L3  Pre-functional / static     — THIS DEVICE is safe to energise
//   ─────────────────────────────────────────────────────────────────────
//   L4  Functional performance      — THE SYSTEM works on its own
//   L5  Integrated systems test     — THE SYSTEM works with the others
//
// The line between L3 and L4 is the line between a device and an assembly.
// Before it, twenty breakers are twenty separate pieces of work with twenty
// separate records. After it, they are one switchboard doing one thing, and
// testing them individually proves nothing about the interlocking.
//
// ── What follows from that ──────────────────────────────────────────────
//
//   1. A system's completeness is TWO numbers, not one. Its own L4/L5, and
//      the L1–L3 of every tag inside it. Showing one figure hides whichever
//      half is behind.
//
//   2. A defect belongs to whatever it was found on. A crack in a bushing is
//      against that breaker. A failed interlock between two breakers is
//      against the system — no single device is wrong. Forcing either one to
//      the other loses the only fact that matters when somebody comes to fix
//      it.
//
//   3. Work recorded at the wrong scope is REPORTED, never moved. An L4
//      check against a single tag might be a mistake, or it might be a
//      deliberate single-device functional test on a project that works that
//      way. Software that silently re-files somebody's record has destroyed
//      evidence.

export const TAG_LEVELS = ['L1_fat', 'L2_iv', 'L3_prefunctional'] as const
export const SYSTEM_LEVELS = ['L4_fpt', 'L5_ist'] as const

export type Scope = 'tag' | 'system' | 'unknown'

export function scopeOf(level: string | null | undefined): Scope {
  if (!level) return 'unknown'
  if ((TAG_LEVELS as readonly string[]).includes(level)) return 'tag'
  if ((SYSTEM_LEVELS as readonly string[]).includes(level)) return 'system'
  return 'unknown'
}

/** Where a subject sits: equipment and components are tags; systems are systems. */
export function scopeOfSubject(type: string | null | undefined): Scope {
  if (type === 'equipment' || type === 'component') return 'tag'
  if (type === 'system' || type === 'subsystem') return 'system'
  return 'unknown'
}

// ── The matrix ───────────────────────────────────────────────────────────

export type ScopedCheck = {
  id: string
  item: string | null
  level: string | null
  status: string | null
  subjectType: string | null
  subjectId: string | null
}

export type Cell = { total: number; done: number; failed: number }

export const EMPTY_CELL: Cell = { total: 0, done: 0, failed: 0 }

const DONE = new Set(['pass', 'na'])

function tally(checks: ScopedCheck[]): Cell {
  return {
    total: checks.length,
    done: checks.filter((c) => DONE.has(c.status ?? '')).length,
    failed: checks.filter((c) => c.status === 'fail').length,
  }
}

export type TagRow = {
  id: string
  code: string
  cells: Record<string, Cell>
  /** Everything at any level against this tag, so a stray L4 is still visible. */
  offScope: Cell
}

export type SystemPicture = {
  /** One row per tag in the system, columns L1–L3. */
  tags: TagRow[]
  /** The system's own L4 and L5. */
  own: Record<string, Cell>
  /** L1–L3 added up across every tag. */
  tagTotals: Record<string, Cell>
  /** Checks against this system at a tag level — reported, never moved. */
  systemHoldingTagWork: Cell
}

export function systemPicture(
  systemId: string,
  tags: { id: string; code: string }[],
  checks: ScopedCheck[]
): SystemPicture {
  const byTag = new Map<string, ScopedCheck[]>()
  for (const c of checks) {
    if (!c.subjectId) continue
    const list = byTag.get(c.subjectId)
    if (list) list.push(c)
    else byTag.set(c.subjectId, [c])
  }

  const rows: TagRow[] = tags.map((t) => {
    const mine = byTag.get(t.id) ?? []
    const cells: Record<string, Cell> = {}
    for (const level of TAG_LEVELS) cells[level] = tally(mine.filter((c) => c.level === level))
    return {
      id: t.id,
      code: t.code,
      cells,
      offScope: tally(mine.filter((c) => scopeOf(c.level) !== 'tag')),
    }
  })

  const systemChecks = byTag.get(systemId) ?? []
  const own: Record<string, Cell> = {}
  for (const level of SYSTEM_LEVELS) own[level] = tally(systemChecks.filter((c) => c.level === level))

  const tagTotals: Record<string, Cell> = {}
  for (const level of TAG_LEVELS) {
    tagTotals[level] = rows.reduce(
      (acc, r) => ({
        total: acc.total + r.cells[level].total,
        done: acc.done + r.cells[level].done,
        failed: acc.failed + r.cells[level].failed,
      }),
      { ...EMPTY_CELL }
    )
  }

  return {
    tags: rows,
    own,
    tagTotals,
    systemHoldingTagWork: tally(systemChecks.filter((c) => scopeOf(c.level) === 'tag')),
  }
}

/** Percent done, or null when there is nothing to be done. */
export function pct(cell: Cell): number | null {
  if (cell.total === 0) return null
  return Math.round((cell.done / cell.total) * 100)
}

/**
 * The two sentences a system needs, kept apart on purpose.
 *
 * One combined percentage over L1–L5 would let a switchboard read 80% because
 * every device passed its factory test while not one functional test has been
 * run. The halves answer different questions and are never added together.
 */
export function systemHeadline(p: SystemPicture): { devices: string; system: string } {
  const devTotal = TAG_LEVELS.reduce((n, l) => n + p.tagTotals[l].total, 0)
  const devDone = TAG_LEVELS.reduce((n, l) => n + p.tagTotals[l].done, 0)
  const sysTotal = SYSTEM_LEVELS.reduce((n, l) => n + p.own[l].total, 0)
  const sysDone = SYSTEM_LEVELS.reduce((n, l) => n + p.own[l].done, 0)

  return {
    devices:
      devTotal === 0
        ? `Nothing recorded against the ${p.tags.length} tag${p.tags.length === 1 ? '' : 's'} in this system.`
        : `${devDone} of ${devTotal} device checks done, across ${p.tags.length} tag${p.tags.length === 1 ? '' : 's'}.`,
    system:
      sysTotal === 0
        ? 'No functional or integrated testing recorded on the system itself.'
        : `${sysDone} of ${sysTotal} system checks done.`,
  }
}

// ── Punch items ──────────────────────────────────────────────────────────

export type ScopedIssue = {
  id: string
  ref: string | null
  title: string | null
  status: string | null
  category: string | null
  subjectId: string | null
}

/**
 * A system's defects, split by what they were found on.
 *
 * Both belong on the system's screen — nobody hands over a switchboard while
 * one of its breakers has an open Category A — but they are not the same
 * fact, and a screen that merges them cannot say whether the problem is the
 * assembly or one device in it.
 */
export function splitIssues(
  issues: ScopedIssue[],
  systemId: string,
  tagIds: string[]
): { own: ScopedIssue[]; fromTags: ScopedIssue[] } {
  const tags = new Set(tagIds)
  return {
    own: issues.filter((i) => i.subjectId === systemId),
    fromTags: issues.filter((i) => i.subjectId && tags.has(i.subjectId)),
  }
}

// ── Findings ─────────────────────────────────────────────────────────────

export type ScopeFinding = {
  rule: string
  level: 'blocking' | 'warning' | 'note'
  title: string
  detail: string
  count: number
  examples: string[]
}

function label(c: ScopedCheck, code: string): string {
  return `${code} — ${(c.item ?? '').slice(0, 55)}`
}

export function scopeFindings(checks: ScopedCheck[], codeOf: (id: string | null) => string): ScopeFinding[] {
  const out: ScopeFinding[] = []

  const systemWorkOnTag = checks.filter(
    (c) => scopeOf(c.level) === 'system' && scopeOfSubject(c.subjectType) === 'tag'
  )
  if (systemWorkOnTag.length > 0) {
    out.push({
      rule: 'scope/system-testing-recorded-against-one-tag',
      level: 'warning',
      title: 'Functional or integrated tests recorded against a single tag',
      detail:
        'L4 and L5 prove that an assembly works — the interlocking, the changeover, the sequence. Recorded against one device they prove that device was present while something was tested, which is not the same claim and will not support the system when it is signed for. It may also be exactly right on a project that functionally tests single devices, so nothing has been moved.',
      count: systemWorkOnTag.length,
      examples: systemWorkOnTag.slice(0, 5).map((c) => label(c, codeOf(c.subjectId))),
    })
  }

  const tagWorkOnSystem = checks.filter(
    (c) => scopeOf(c.level) === 'tag' && scopeOfSubject(c.subjectType) === 'system'
  )
  if (tagWorkOnSystem.length > 0) {
    out.push({
      rule: 'scope/device-checks-recorded-against-the-system',
      level: 'warning',
      title: 'Device-level checks recorded against a system',
      detail:
        'L1 to L3 are done on a piece of plant: this breaker was tested at the factory, this breaker was installed correctly, this breaker is safe to energise. Against the whole system they say nothing about any particular device, and the tag that was actually checked cannot be told from the one that was not.',
      count: tagWorkOnSystem.length,
      examples: tagWorkOnSystem.slice(0, 5).map((c) => label(c, codeOf(c.subjectId))),
    })
  }

  return out
}

// ── Repeated work ────────────────────────────────────────────────────────

/**
 * The same check, recorded twice against the same thing at the same level.
 *
 * Normalised before comparing, because the duplicate that matters is never
 * character-identical: it is the same sentence typed again with different
 * spacing, a trailing full stop, or a capital letter. Comparing raw text
 * finds almost none of them.
 */
export function normaliseCheck(text: string | null | undefined): string {
  // Trim BEFORE stripping the trailing punctuation, and again after.
  //
  // The first version stripped punctuation first, so "Asset tag is attached. "
  // — with the trailing space Excel leaves behind — kept its full stop and did
  // not match "asset tag is attached". A trailing space is the single most
  // likely difference between two copies of one line, which made the check
  // miss the exact case it exists for.
  return (text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;:,]+$/g, '')
    .trim()
}

export function duplicateFindings(checks: ScopedCheck[], codeOf: (id: string | null) => string): ScopeFinding[] {
  const groups = new Map<string, ScopedCheck[]>()
  for (const c of checks) {
    const key = normaliseCheck(c.item)
    if (!key) continue
    const k = `${c.subjectId ?? ''}|${c.level ?? ''}|${key}`
    const list = groups.get(k)
    if (list) list.push(c)
    else groups.set(k, [c])
  }

  const repeated = [...groups.values()].filter((g) => g.length > 1)
  if (repeated.length === 0) return []

  const extra = repeated.reduce((n, g) => n + g.length - 1, 0)

  return [
    {
      rule: 'repeat/the-same-check-recorded-twice',
      level: 'warning',
      title: 'The same check recorded more than once against the same tag and level',
      detail: `${extra} extra record${extra === 1 ? '' : 's'} across ${repeated.length} check${repeated.length === 1 ? '' : 's'}. Every one has to be answered and signed separately, and the completion figure counts them all — so the same piece of work makes the project look bigger and less finished than it is. Usually a script imported twice under different names, or a checklist pasted into two tabs.`,
      count: repeated.length,
      examples: repeated
        .slice(0, 5)
        .map((g) => `${codeOf(g[0].subjectId)} — ${(g[0].item ?? '').slice(0, 50)} · ${g.length} copies`),
    },
  ]
}

/**
 * The shape the screen reads. Declared here rather than in the loader so the
 * component depends on the model, not on how it happens to be fetched.
 */
export type SystemView = {
  picture: SystemPicture
  own: ScopedIssue[]
  fromTags: ScopedIssue[]
  codeOf: (id: string | null) => string
}
