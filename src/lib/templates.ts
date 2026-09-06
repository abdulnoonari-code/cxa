// The check library: one definition, many records.
//
// Twenty breakers each need "All cables properly torqued, double torque marks
// visible" checked, signed and evidenced. That is twenty records and it
// should be — each breaker was torqued separately and each one is separately
// wrong if it was not. What should NOT be twenty is the sentence. Typed or
// pasted twenty times it drifts: nineteen say "torqued", one says "torqued
// (see note)", and at handover nobody can tell whether that one is the same
// check or a different one.
//
// So a template is a DEFINITION and a checklist item is a RECORD of doing it.
//
// ── The rule that makes this safe ───────────────────────────────────────
//
// **Editing a definition never changes a record somebody has answered.**
//
// A check that has been marked Pass is a statement by a person about a
// specific sentence. Rewriting that sentence afterwards changes what they
// signed, silently, months later, with no trace. It is the single most
// dangerous thing a feature like this can do — and the most tempting, because
// "fix the wording everywhere" is exactly what you want from a library.
//
// The compromise is honest and small: editing a template rewrites every
// record still waiting to be done, and leaves every answered one alone. The
// answered ones are then reported as having drifted, with both sentences
// shown, so somebody can decide whether to re-test.

import { scopeOf, scopeOfSubject, normaliseCheck } from '@/lib/scope'

export type Template = {
  id: string
  /** Short reference, if the project uses one. Optional. */
  code: string | null
  /** The check itself — the sentence that gets applied. */
  title: string
  level: string
  section: string | null
  answerType: string | null
  /** How to do it, shown to the tester. Never part of the check text. */
  guidance: string | null
}

export type AppliedRecord = {
  id: string
  templateId: string | null
  subjectId: string | null
  subjectType: string | null
  level: string | null
  item: string | null
  status: string | null
}

export type Target = { id: string; type: string; code: string }

// ── Applying ─────────────────────────────────────────────────────────────

export type ApplyPlan = {
  /** Targets that will get a new record. */
  create: Target[]
  /** Targets that already have this template at this level. */
  alreadyHave: Target[]
  /** Targets whose kind does not match the template's level. */
  wrongScope: Target[]
}

/**
 * What applying a template to a set of targets would do.
 *
 * Three outcomes rather than two, because the third is the one that causes
 * trouble: an L4 template applied to twenty breakers creates twenty functional
 * tests against individual devices, which is exactly the mistake the scope
 * rules were written to report. Better to say so before writing than to
 * report it afterwards.
 */
export function planApply(template: Template, targets: Target[], existing: AppliedRecord[]): ApplyPlan {
  const want = scopeOf(template.level)

  const taken = new Set(
    existing
      .filter((r) => r.templateId === template.id && r.level === template.level)
      .map((r) => r.subjectId ?? '')
  )

  const plan: ApplyPlan = { create: [], alreadyHave: [], wrongScope: [] }

  for (const t of targets) {
    if (want !== 'unknown' && scopeOfSubject(t.type) !== want) {
      plan.wrongScope.push(t)
      continue
    }
    if (taken.has(t.id)) {
      plan.alreadyHave.push(t)
      continue
    }
    plan.create.push(t)
  }

  return plan
}

/**
 * The sentence under the Apply button, so the size of it is not a surprise.
 *
 * "Nothing will happen" has to be said FIRST and plainly. The first version
 * listed the outcomes in order, so a template already applied everywhere read
 * "1 already have it and will be left alone." — which describes the state
 * accurately and still sounds like pressing the button does something.
 */
export function applySentence(plan: ApplyPlan): string {
  const have = plan.alreadyHave.length
  const wrong = plan.wrongScope.length

  if (plan.create.length === 0) {
    const why: string[] = []
    if (have > 0) why.push(`all ${have} already ${have === 1 ? 'has' : 'have'} this check`)
    if (wrong > 0) why.push(`${wrong} ${wrong === 1 ? 'is' : 'are'} the wrong kind of thing for this level`)
    return why.length === 0 ? 'Nothing to do — nothing is selected.' : `Nothing to do — ${why.join(', and ')}.`
  }

  const parts = [`${plan.create.length} new check${plan.create.length === 1 ? '' : 's'}`]
  if (have > 0) parts.push(`${have} already ${have === 1 ? 'has' : 'have'} it and will be left alone`)
  if (wrong > 0) {
    parts.push(`${wrong} ${wrong === 1 ? 'is' : 'are'} the wrong kind of thing for this level and will be skipped`)
  }
  return `${parts.join(', ')}.`
}

// ── Editing a definition ─────────────────────────────────────────────────

const ANSWERED = new Set(['pass', 'fail', 'na'])

export type EditPlan = {
  /** Still waiting to be done — the wording is updated. */
  rewrite: AppliedRecord[]
  /** Already answered — left exactly as signed. */
  leaveAlone: AppliedRecord[]
}

export function planEdit(template: Template, records: AppliedRecord[]): EditPlan {
  const mine = records.filter((r) => r.templateId === template.id)
  return {
    rewrite: mine.filter((r) => !ANSWERED.has(r.status ?? 'pending')),
    leaveAlone: mine.filter((r) => ANSWERED.has(r.status ?? 'pending')),
  }
}

export function editSentence(plan: EditPlan): string {
  const r = plan.rewrite.length
  const l = plan.leaveAlone.length
  if (r === 0 && l === 0) return 'This is not applied to anything yet, so only the definition changes.'
  const first = r === 0 ? 'No unanswered check will change' : `${r} unanswered check${r === 1 ? '' : 's'} will be reworded`
  if (l === 0) return `${first}.`
  return `${first}. ${l} that ${l === 1 ? 'has' : 'have'} already been answered will be left exactly as ${l === 1 ? 'it was' : 'they were'} signed, and reported as having drifted.`
}

// ── Coverage and drift ───────────────────────────────────────────────────

export type Coverage = {
  applied: number
  done: number
  failed: number
  /** Answered records whose wording no longer matches the definition. */
  drifted: number
}

export function coverageOf(template: Template, records: AppliedRecord[]): Coverage {
  const mine = records.filter((r) => r.templateId === template.id)
  const key = normaliseCheck(template.title)
  return {
    applied: mine.length,
    done: mine.filter((r) => r.status === 'pass' || r.status === 'na').length,
    failed: mine.filter((r) => r.status === 'fail').length,
    drifted: mine.filter((r) => ANSWERED.has(r.status ?? 'pending') && normaliseCheck(r.item) !== key).length,
  }
}

export type TemplateFinding = {
  rule: string
  level: 'blocking' | 'warning' | 'note'
  title: string
  detail: string
  count: number
  examples: string[]
}

export function driftFindings(
  templates: Template[],
  records: AppliedRecord[],
  codeOf: (id: string | null) => string
): TemplateFinding[] {
  const byId = new Map(templates.map((t) => [t.id, t]))
  const drifted = records.filter((r) => {
    if (!r.templateId || !ANSWERED.has(r.status ?? 'pending')) return false
    const t = byId.get(r.templateId)
    if (!t) return false
    return normaliseCheck(r.item) !== normaliseCheck(t.title)
  })

  if (drifted.length === 0) return []

  return [
    {
      rule: 'library/answered-check-no-longer-matches-its-definition',
      level: 'warning',
      title: 'Answered checks whose wording has since changed in the library',
      detail:
        'Somebody signed one sentence and the library now holds a different one. The record was deliberately left as it was signed — rewriting it would change what a person put their name to, months later, with no trace. Worth deciding whether the change was a correction of wording or a change of scope, because only the second needs re-testing.',
      count: drifted.length,
      examples: drifted.slice(0, 5).map((r) => {
        const t = byId.get(r.templateId ?? '')
        return `${codeOf(r.subjectId)} — signed "${(r.item ?? '').slice(0, 40)}" · library now "${(t?.title ?? '').slice(0, 40)}"`
      }),
    },
  ]
}

// ── Making templates out of what is already there ────────────────────────

export type Candidate = {
  /** The wording used by the most records in the group. */
  title: string
  level: string
  section: string | null
  answerType: string | null
  /** How many existing records this would cover. */
  records: number
  /** How many distinct tags or systems it appears on. */
  subjects: number
  /** Wordings that differ from the chosen one. */
  variants: string[]
  ids: string[]
}

/**
 * Existing checks that are really one definition repeated.
 *
 * This is the other half of the duplicate rule: that one reports repetition,
 * this one offers to fix it. Grouped by normalised text and level rather than
 * by exact text, so "Cables torqued." and "cables torqued" come together —
 * and the variants are listed rather than hidden, because which wording
 * becomes the definition is a decision, not a detail.
 *
 * Only groups on more than one subject qualify. A check that exists once is
 * not a template, it is a check.
 */
export function candidatesFrom(
  records: { id: string; item: string | null; level: string | null; status: string | null; subjectId: string | null; section?: string | null; answerType?: string | null; templateId?: string | null }[],
  minSubjects = 2
): Candidate[] {
  const groups = new Map<string, typeof records>()

  for (const r of records) {
    if (r.templateId) continue // already from a definition
    const key = normaliseCheck(r.item)
    if (!key || !r.level) continue
    const k = `${r.level}|${key}`
    const list = groups.get(k)
    if (list) list.push(r)
    else groups.set(k, [r])
  }

  const out: Candidate[] = []
  for (const group of groups.values()) {
    const subjects = new Set(group.map((r) => r.subjectId ?? ''))
    if (subjects.size < minSubjects) continue

    // The wording used most often wins. A tie goes to the longest, because
    // the fuller sentence is more likely to be the complete one and the
    // shorter is more likely to be somebody's abbreviation.
    const counts = new Map<string, number>()
    for (const r of group) {
      const t = (r.item ?? '').trim()
      if (t) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    const title = ranked[0]?.[0] ?? ''
    if (!title) continue

    out.push({
      title,
      level: group[0].level as string,
      section: group.find((r) => r.section)?.section ?? null,
      answerType: group.find((r) => r.answerType)?.answerType ?? null,
      records: group.length,
      subjects: subjects.size,
      variants: ranked.slice(1).map(([t]) => t),
      ids: group.map((r) => r.id),
    })
  }

  return out.sort((a, b) => b.records - a.records || a.title.localeCompare(b.title))
}
