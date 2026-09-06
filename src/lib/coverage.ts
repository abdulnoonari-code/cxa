// What is missing, as opposed to what is wrong.
//
// Everything in this application so far reports on records that EXIST: this
// check failed, this defect has no photograph, this line depends on one that
// failed. All of it is blind to the more dangerous case, which is a record
// that was never created.
//
// A breaker with no installation verification at all does not show up as a
// problem anywhere. It shows as 0/0 — which reads as "nothing to do" and is
// indistinguishable on every screen from a device that needed nothing. The
// completion figure is not even wrong: zero of zero is a hundred percent of
// what was asked for. Nobody asked for anything.
//
// ── How this is worked out without anybody configuring it ───────────────
//
// By comparison with the neighbours. If four breakers in a switchboard carry
// fourteen L2 checks each and the fifth carries none, the fifth was left out.
// That is not a guess about what should have been planned — it is an
// observation that this project already decided what a breaker of this kind
// needs, four times over, and then did not do it a fifth time.
//
// It is deliberately silent when NOTHING has been planned at a level. A
// project on its first day has no L2 anywhere, and reporting every tag as a
// gap would bury the one case that matters under the ninety that do not.
//
// ── What this never does ────────────────────────────────────────────────
//
// It never creates the missing check. A check that appeared because software
// thought it ought to exist is a check nobody planned, sitting in a register,
// counted in a readiness figure, waiting to be signed by somebody who assumes
// a person put it there.

import { TAG_LEVELS, SYSTEM_LEVELS } from '@/lib/scope'

export type CoverageCheck = {
  subjectId: string | null
  level: string | null
  status: string | null
  templateId?: string | null
}

/** A tag or system, and which system it belongs to. */
export type CoverageSubject = {
  id: string
  code: string
  kind: 'tag' | 'system'
  /** The system this tag sits in. Null for a system itself. */
  systemId: string | null
  systemCode: string | null
}

export type CoverageFinding = {
  rule: string
  level: 'blocking' | 'warning' | 'note'
  title: string
  detail: string
  count: number
  examples: string[]
}

const DONE = new Set(['pass', 'na'])

/**
 * Tags left out of a level their neighbours were included in.
 *
 * `minPeers` is 2 rather than 1 on purpose. One breaker with checks and one
 * without is not evidence of a plan — it is two devices, one of which has
 * been started. Two or more is a pattern, and the third is then conspicuous.
 */
export function leftOutFindings(
  subjects: CoverageSubject[],
  checks: CoverageCheck[],
  minPeers = 2
): CoverageFinding[] {
  const counts = new Map<string, number>()
  for (const c of checks) {
    if (!c.subjectId || !c.level) continue
    const k = `${c.subjectId}|${c.level}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }

  const tags = subjects.filter((s) => s.kind === 'tag' && s.systemId)
  const bySystem = new Map<string, CoverageSubject[]>()
  for (const t of tags) {
    const list = bySystem.get(t.systemId as string)
    if (list) list.push(t)
    else bySystem.set(t.systemId as string, [t])
  }

  const missing: string[] = []

  for (const [, group] of bySystem) {
    for (const level of TAG_LEVELS) {
      const withWork = group.filter((t) => (counts.get(`${t.id}|${level}`) ?? 0) > 0)
      const without = group.filter((t) => (counts.get(`${t.id}|${level}`) ?? 0) === 0)
      if (withWork.length < minPeers || without.length === 0) continue

      // How much work the neighbours carry, so the sentence can say what is
      // being missed rather than just that something is.
      const typical = Math.round(
        withWork.reduce((n, t) => n + (counts.get(`${t.id}|${level}`) ?? 0), 0) / withWork.length
      )
      const code = level.split('_')[0].toUpperCase()

      for (const t of without) {
        missing.push(
          `${t.code} has no ${code} checks, while ${withWork.length} other${withWork.length === 1 ? '' : 's'} in ${t.systemCode ?? 'the same system'} carry about ${typical} each`
        )
      }
    }
  }

  if (missing.length === 0) return []

  return [
    {
      rule: 'plan/left-out-of-a-level-its-neighbours-were-in',
      level: 'warning',
      title: 'Tags with no checks at a level their neighbours were checked at',
      detail:
        'These show as 0 of 0 everywhere, which reads as nothing to do and is indistinguishable from a device that needed nothing. The completion figure is not even wrong — zero of zero is all of what was asked for, and nobody asked for anything. Either the work was planned and never entered, or these tags genuinely differ, and only somebody who knows the plant can say which.',
      count: missing.length,
      examples: missing.slice(0, 5),
    },
  ]
}

/**
 * Systems whose devices are finished and which have no functional test at all.
 *
 * The moment this catches is specific and common: every breaker has passed
 * L3, the board looks ready on every screen, and no L4 has ever been created
 * for it. Nothing is failing. There is simply nothing there.
 */
export function untestedSystemFindings(
  subjects: CoverageSubject[],
  checks: CoverageCheck[]
): CoverageFinding[] {
  const bySubject = new Map<string, CoverageCheck[]>()
  for (const c of checks) {
    if (!c.subjectId) continue
    const list = bySubject.get(c.subjectId)
    if (list) list.push(c)
    else bySubject.set(c.subjectId, [c])
  }

  const systems = subjects.filter((s) => s.kind === 'system')
  const out: string[] = []

  for (const sys of systems) {
    const tags = subjects.filter((s) => s.kind === 'tag' && s.systemId === sys.id)
    if (tags.length === 0) continue

    const deviceChecks = tags.flatMap((t) => bySubject.get(t.id) ?? []).filter((c) => c.level === 'L3_prefunctional')
    if (deviceChecks.length === 0) continue
    if (!deviceChecks.every((c) => DONE.has(c.status ?? ''))) continue

    const own = bySubject.get(sys.id) ?? []
    const functional = own.filter((c) => (SYSTEM_LEVELS as readonly string[]).includes(c.level ?? ''))
    if (functional.length > 0) continue

    out.push(`${sys.code} — ${tags.length} device${tags.length === 1 ? '' : 's'}, all pre-functional checks done, no L4 or L5 recorded`)
  }

  if (out.length === 0) return []

  return [
    {
      rule: 'plan/no-functional-test-exists-for-a-finished-system',
      level: 'blocking',
      title: 'Systems whose devices are finished with no functional test recorded at all',
      detail:
        'Every pre-functional check on every device has passed, so the system reads ready on every screen. There is no L4 or L5 against it — not failing, not outstanding, absent. A system that has never been functionally tested is not one that passed; the difference is invisible on a completion figure and total at handover.',
      count: out.length,
      examples: out.slice(0, 5),
    },
  ]
}

/**
 * Library checks applied to some of a system's tags and not the rest.
 *
 * Stronger than the neighbour rule and quite separate from it: here somebody
 * has explicitly said what this check is, and applied it. A tag in the same
 * system that did not get it was more likely missed than excluded.
 */
export function partialApplicationFindings(
  subjects: CoverageSubject[],
  checks: CoverageCheck[],
  titleOf: (templateId: string) => string
): CoverageFinding[] {
  const applied = new Map<string, Set<string>>() // templateId -> subjectIds
  for (const c of checks) {
    if (!c.templateId || !c.subjectId) continue
    const set = applied.get(c.templateId) ?? new Set<string>()
    set.add(c.subjectId)
    applied.set(c.templateId, set)
  }

  const tags = subjects.filter((s) => s.kind === 'tag' && s.systemId)
  const gaps: string[] = []

  for (const [templateId, subjectIds] of applied) {
    // Which systems this template has been used in at all.
    const systems = new Set(
      tags.filter((t) => subjectIds.has(t.id)).map((t) => t.systemId as string)
    )
    for (const systemId of systems) {
      const inSystem = tags.filter((t) => t.systemId === systemId)
      const without = inSystem.filter((t) => !subjectIds.has(t.id))
      const withIt = inSystem.length - without.length
      if (without.length === 0 || withIt < 2) continue
      gaps.push(
        `"${titleOf(templateId).slice(0, 50)}" — on ${withIt} of ${inSystem.length} in ${without[0].systemCode ?? 'one system'}, missing from ${without.map((t) => t.code).slice(0, 4).join(', ')}${without.length > 4 ? ' …' : ''}`
      )
    }
  }

  if (gaps.length === 0) return []

  return [
    {
      rule: 'plan/library-check-applied-to-some-tags-and-not-others',
      level: 'warning',
      title: 'Library checks applied to some tags in a system but not all of them',
      detail:
        'Somebody wrote this check down as a definition and applied it deliberately — and then some tags in the same system did not get it. More likely a tick missed on the apply screen than a decision, and the tags without it will never show the check as outstanding, because for them it does not exist.',
      count: gaps.length,
      examples: gaps.slice(0, 5),
    },
  ]
}
