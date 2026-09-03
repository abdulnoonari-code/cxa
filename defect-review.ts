// Assessing a punch item from what it says.
//
// The app already had two things that look like this and are not it:
//
//   `issues.ai_comment` — a handful of RULES, shown as "Automatic check". It
//   notices a missing description. It has never looked at the defect.
//
//   `lib/photo.ts` — an AI reading of a PHOTOGRAPH. Excellent when there is
//   one, and most punch items are raised without one.
//
// So a defect described as "Fuel line weep at filter housing joint, Category
// A, GEN-01, L3" got nothing from either. This file is the missing third
// thing: what an engineer would say if you read him the punch item over the
// phone.
//
// It reuses the boundary machinery from `lib/photo.ts` on purpose —
// `readReview`, `overreaches` and `caveatFor` are about what an AI reading may
// claim, not about photographs, and having two copies of the rule about what
// the model is forbidden to say is how the two copies drift apart.

import { readReview, overreaches, caveatFor, type Confidence, type Reading } from '@/lib/photo'
import { CATEGORY_BLOCKS } from '@/lib/punchlist'

export { readReview, overreaches, caveatFor }
export type { Confidence, Reading }

/**
 * What the model is told.
 *
 * As with the photograph, most of this is refusals, and they come first. A
 * model asked about an electrical defect will produce a confident paragraph
 * about something it half-recognises, and on site that paragraph gets
 * actioned by somebody who was not there when the item was raised.
 *
 * The addition here, which the photo prompt does not need: **it has not seen
 * the plant.** A photograph is at least evidence of something. A punch item is
 * one sentence somebody typed on a phone, and everything the model offers is
 * therefore a place to look rather than a finding.
 */
export const DEFECT_SYSTEM = [
  'You are a commissioning engineer looking at a punch item — a defect recorded during the commissioning of an electrical or mechanical installation. Answer as one engineer briefing another, in the discipline the item belongs to.',
  '',
  'BE TECHNICAL. Generic advice is worse than nothing here, because the person reading it already knows the generic advice. Specifically:',
  '- Use the correct term for the component and the failure mode. "Seep at a threaded joint, consistent with an under-torqued fitting or a perished bonded seal" — not "a leak".',
  '- Name the failure MECHANISM, not just the symptom. Thermal cycling, galvanic corrosion, cold flow of the conductor under a compression lug, tracking across a contaminated surface, cavitation, water ingress at the gland.',
  '- Say WHICH MEASUREMENT would settle it, WHAT INSTRUMENT takes it, and WHAT WOULD BE COMPARED against. Insulation resistance at 5 kV with a megohmmeter, against the value in the spec. Contact resistance with a micro-ohmmeter, against the manufacturer routine test figure. Torque with a calibrated wrench, against the approved figure on the drawing.',
  '- Say what this BLOCKS: which commissioning level or activity cannot honestly proceed while it is open.',
  '- Triage it: does this look like an INSTALLATION defect, a COMMISSIONING defect, a DESIGN or SUPPLY problem, or a documentation problem? They go to different people and that is the most useful single sentence you can produce.',
  '',
  'You have NOT seen the plant. All you have is what somebody typed. Everything you offer is a place to look, never a finding.',
  '',
  'What you must never do:',
  '- Never say the defect is fixed, closed, acceptable, approved, compliant or safe. You are not entitled to decide that; a named person is.',
  '- Never state a cause as fact. Give the mechanism as what usually causes this, and say it is where to look first.',
  '- Never invent an acceptance figure, a torque value, a rating, a setting or a standard clause number. Name the QUANTITY to measure and say the limit must come from the project specification or the manufacturer data — never supply the number yourself.',
  '- You may name a standard FAMILY (IEC 60694, IEEE 43, the project spec) only where it is genuinely the usual reference, and you must say the clause has to be confirmed against the project documents.',
  '- Never assume equipment, a manufacturer, a voltage or a design the item does not mention.',
  '- Never tell anybody to work on live equipment, to bypass a protection, or to defeat an interlock. If the sensible next step involves isolation, say that the work needs isolation and a permit and stop there.',
  '',
  '"There is not enough here to assess" is a complete and useful answer. A two-word punch item does not contain enough, and an admission is worth more than a confident guess.',
  '',
  'Write the way a commissioning engineer talks: short, concrete, no hedging padding, no bullet lists inside the fields.',
  '',
  'Answer as JSON with exactly these keys and nothing else:',
  '{"confidence":"clear|partial|cannot_tell","kind":"installation|commissioning|design|documentation|unclear","problem":"...","likely_cause":"...","verification":"...","blocks":"...","recommendation":"..."}',
  '',
  '- confidence: how much the description actually supports what you are saying.',
  '- kind: which of the four this looks like. "unclear" if you genuinely cannot tell.',
  '- problem: what this item is, technically, in one or two sentences.',
  '- likely_cause: the mechanism that usually produces this. Empty string if you genuinely cannot say.',
  '- verification: the measurement or test that would settle it, the instrument, and what it is compared against. Never the limit itself.',
  '- blocks: which commissioning level or activity cannot honestly proceed while this is open. Empty string if nothing.',
  '- recommendation: the next action, and who it goes to. Never a decision.',
].join('\n')

export function defectPrompt(input: {
  ref: string | null
  title: string
  description: string | null
  tag: string
  level: string | null
  category: string | null
  severity: string | null
  discipline: string | null
  location: string | null
}): string {
  // Category A/B/C means nothing to a model on its own — what matters is what
  // it BLOCKS, and the app already has that sentence.
  const category = input.category
    ? `Category ${input.category} — ${CATEGORY_BLOCKS[input.category] ?? 'meaning not recorded'}`
    : 'Not categorised yet'

  return [
    `Punch item ${input.ref ?? '(no ref)'}`,
    `What is wrong: "${input.title}"`,
    input.description ? `Detail: "${input.description}"` : 'Detail: none was recorded.',
    `Raised against: ${input.tag}`,
    input.level ? `At commissioning level: ${input.level}` : null,
    `Category: ${category}`,
    input.severity ? `Severity: ${input.severity}` : null,
    input.discipline ? `Discipline: ${input.discipline}` : null,
    input.location ? `Location on site: ${input.location}` : null,
    '',
    'Assess it. If the description is too thin to assess, say so and say what it should have said.',
  ]
    .filter(Boolean)
    .join('\n')
}

// ── Reading the answer ───────────────────────────────────────────────────

export const DEFECT_KINDS: Record<string, { label: string; goes: string }> = {
  installation: { label: 'Installation defect', goes: 'Back to the installing contractor.' },
  commissioning: { label: 'Commissioning defect', goes: 'Stays with the commissioning team — a setting, a sequence or a result.' },
  design: { label: 'Design or supply problem', goes: 'To the designer or the vendor. Reworking it on site will not fix it.' },
  documentation: { label: 'Documentation problem', goes: 'The plant may be fine; the record is not.' },
  unclear: { label: 'Not clear from the description', goes: 'Nobody can be sent this until the item says more.' },
}

/**
 * Which of the four this is.
 *
 * The most useful single sentence an assessment can produce, because these
 * four go to four different people. An installation defect and a design
 * problem look identical on a punch list and are nothing alike: one is rework,
 * the other is a change and a cost.
 */
export function kindLabel(value: string | null | undefined): string {
  return DEFECT_KINDS[value ?? 'unclear']?.label ?? DEFECT_KINDS.unclear.label
}

export function kindGoes(value: string | null | undefined): string {
  return DEFECT_KINDS[value ?? 'unclear']?.goes ?? DEFECT_KINDS.unclear.goes
}

export type DefectReading = Reading & {
  likelyCause: string
  /** The measurement that would settle it, and the instrument. Never the limit. */
  verification: string
  /** What cannot honestly proceed while this is open. */
  blocks: string
  kind: string
}

/**
 * Read the model's reply, including the extra key this prompt asks for.
 *
 * Delegates the shared part to `readReview` so the cautious default — an
 * unrecognised confidence becomes `cannot_tell`, never `clear` — is applied in
 * one place rather than two.
 */
export function readDefectReview(raw: string): DefectReading | null {
  const base = readReview(raw)
  if (!base) return null

  let likelyCause = ''
  let verification = ''
  let blocks = ''
  let kind = 'unclear'

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : raw
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      const o = JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>
      const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
      likelyCause = str(o.likely_cause)
      verification = str(o.verification)
      blocks = str(o.blocks)
      // An unrecognised kind becomes 'unclear', never a guess — the same
      // cautious default the confidence uses, for the same reason.
      const k = str(o.kind).toLowerCase()
      kind = DEFECT_KINDS[k] ? k : 'unclear'
    } catch {
      /* the shared reader already succeeded; the extra keys are optional */
    }
  }

  return { ...base, likelyCause, verification, blocks, kind }
}

// ── Words that are never acceptable, whatever the model says ─────────────

/**
 * Advice that could hurt somebody.
 *
 * Separate from `overreaches`, which is about the model claiming a decision.
 * This is about the model giving an instruction that gets a commissioning
 * engineer injured. The prompt forbids it; this checks anyway, because a
 * prompt is not a guarantee and this is the one class of output where being
 * wrong is not a paperwork problem.
 */
const UNSAFE =
  /\b(while (it is )?(still )?(live|energi[sz]ed)|without isolat(ing|ion)|bypass(ing)? the (protection|interlock|trip)|defeat(ing)? the interlock|override the (protection|trip|interlock)|jumper out|strap out the trip)\b/i

export function unsafeAdvice(reading: DefectReading): boolean {
  // Every field, not just the recommendation. A model that puts it in the
  // verification step — "measure it while energised" — is just as dangerous.
  return UNSAFE.test(
    `${reading.problem} ${reading.likelyCause} ${reading.verification} ${reading.blocks} ${reading.recommendation}`
  )
}

/**
 * A supplied acceptance figure, which the prompt forbids and this catches.
 *
 * The model may say WHICH quantity to measure. It may not say what the limit
 * is, because it does not have the project specification and a fabricated
 * limit is the one output here that could get a defect signed off wrongly.
 */
const SUPPLIED_LIMIT =
  /\b(should be|must be|shall be|needs to be|has to be|acceptance (is|criteria is)|limit is|minimum of|maximum of|at least|no more than|no less than|greater than|less than)\s*(approximately|about|around|circa|~)?\s*[<>≥≤]?\s*\d/i

export function suppliesALimit(reading: DefectReading): boolean {
  return SUPPLIED_LIMIT.test(`${reading.verification} ${reading.recommendation} ${reading.problem}`)
}

export const LIMIT_NOTE =
  'This reading appears to supply an acceptance figure. It does not have your specification — take the limit from the project documents or the manufacturer data, never from here.'

export const UNSAFE_NOTE =
  'This reading suggests working on or around live or unprotected equipment. Do not act on it. Isolation and a permit are a person’s decision, made on site, and nothing generated here can authorise either.'

/**
 * What to print beside a defect reading.
 *
 * Safety outranks everything: a reading that suggests live working is flagged
 * for that even if it also overreaches, because that is the sentence somebody
 * needs to read first.
 */
export function defectCaveat(reading: DefectReading): string {
  if (unsafeAdvice(reading)) return UNSAFE_NOTE
  if (suppliesALimit(reading)) return LIMIT_NOTE
  if (overreaches(reading)) {
    return 'This reading claims something only a person may decide. Treat it as a description of the punch item and nothing more — closing this item is your signature, not the model’s.'
  }
  if (reading.confidence === 'cannot_tell') {
    return 'There was not enough in the description to assess. Adding detail to the item is worth more than another attempt at this.'
  }
  if (reading.confidence === 'partial') {
    return 'Based on a thin description. Worth checking against what is actually on site before anybody acts on it.'
  }
  return 'Based only on what the punch item says. The app has not seen the plant — this is somewhere to look, not a diagnosis.'
}

/** How alarming the caveat is, for the colour of the badge beside it. */
export function caveatTone(reading: DefectReading): 'danger' | 'warning' | 'neutral' {
  if (unsafeAdvice(reading)) return 'danger'
  if (suppliesALimit(reading)) return 'danger'
  if (overreaches(reading)) return 'danger'
  if (reading.confidence === 'cannot_tell') return 'neutral'
  return 'warning'
}

// ── Is the item even worth asking about ──────────────────────────────────

/**
 * Whether there is enough here to be worth spending a call on.
 *
 * Every review costs money and takes a few seconds. A punch item whose entire
 * content is "fix panel" will come back "there is not enough here to assess",
 * which the app can say for free and instantly — and which is a more useful
 * thing to put in front of somebody, because it tells them to write a better
 * item rather than to try again.
 */
export function tooThinToAssess(input: { title: string; description: string | null }): string | null {
  const words = `${input.title} ${input.description ?? ''}`.trim().split(/\s+/).filter(Boolean)
  if (words.length < 4) {
    return 'There is not enough here to assess — under four words in total. Say what is wrong, on what, and what state it is in.'
  }
  if (!input.description && input.title.trim().split(/\s+/).length < 6) {
    return 'The title is short and there is no detail. Add what needs to happen before this can be closed, then ask again.'
  }
  return null
}
