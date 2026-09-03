// An AI reading of a contractual obligation.
//
// This is the most dangerous of the three assessments in this application,
// and it is worth saying why before any of the code.
//
// A defect is a fact about metal. A photograph is a fact about light. An
// obligation is a POSITION — somebody owes somebody else something, under a
// contract, with money attached to the answer. "This obligation has been
// discharged" is not an observation, it is a claim that a party has been
// released from a liability, and it is the sort of sentence that gets read
// out in a meeting where people are arguing about a final account.
//
// So the boundary here is drawn tighter than anywhere else in this app:
//
//   1. **It may never say an obligation is met, discharged, satisfied,
//      closed, waived or complete.** Not hedged, not qualified. That is a
//      decision, it belongs to the parties, and the model has not read the
//      contract — it has read one clause out of it.
//
//   2. **It may never supply a period the clause does not state.** The
//      pattern is identical to the acceptance-limit rule on defects: if a
//      notice period is not in the words, the model does not know it.
//      "Typically 14 days" is exactly the sort of confident, plausible,
//      wrong number that gets relied on.
//
//   3. **It may not attribute an obligation to a party the clause does not
//      name.** Half the disputes on a project are about who owed what.
//
// What it CAN do, and what makes it worth having:
//
//   - say what evidence would discharge the obligation, so somebody knows
//     what to go and collect;
//   - describe how the record currently stands against it, without ruling;
//   - point at wording that will cause an argument later.
//
// The third one is the quiet value. An obligation with no deadline, no named
// party, or a term nobody defined is a dispute that has not happened yet, and
// it is far cheaper to notice at handover than in adjudication.

import { readReview, overreaches, caveatFor } from '@/lib/photo'
import type { Confidence, Reading } from '@/lib/photo'
import { readJsonObject } from '@/lib/ai'

export { readReview, overreaches, caveatFor }
export type { Confidence, Reading }

/**
 * The refusals come before the format, deliberately.
 *
 * A model reads a prompt in order, and the last thing before "now produce
 * JSON" is the thing it is holding when it starts writing. Putting the output
 * shape first and the boundaries last is how you get a well-formatted answer
 * that quietly decided something.
 */
export const OBLIGATION_SYSTEM = [
  'You are assisting a commissioning engineer reading a contractual obligation on a power project.',
  '',
  'BEFORE ANYTHING ELSE, what you must never do:',
  '',
  '- NEVER say an obligation is met, discharged, satisfied, complete, closed, waived or no longer required. That is a decision for the parties to the contract, not for you. You have seen one clause, not the contract.',
  '- NEVER supply a notice period, a deadline, a duration or a warranty length that the clause does not state. If it is not in the words in front of you, you do not know it. Say the clause does not state one.',
  '- NEVER assign the obligation to a party the clause does not name. If it is unclear who owes it, that ambiguity IS the finding.',
  '- NEVER invent a standard, a specification number or a document title.',
  '',
  '"I cannot tell from this clause" is a complete and useful answer. A clause quoted out of context often genuinely cannot be assessed, and saying so is worth more than a confident guess about somebody\'s contractual exposure.',
  '',
  'What you are for, in three parts:',
  '',
  '1. WHAT WOULD DISCHARGE IT. Name the specific evidence that would prove this obligation done — a named test record, a signed certificate, a transmittal, a manufacturer document. Be concrete enough that somebody could go and look for it.',
  '2. HOW THE RECORD STANDS. Describe what is recorded against it and what is missing. Describe. Do not rule.',
  '3. WHERE THE WORDING WILL CAUSE TROUBLE. Undefined terms, no stated deadline, no named party, "to the satisfaction of" with nobody named, obligations that depend on something outside the contract. If the wording is clear, say so plainly rather than inventing a concern.',
  '',
  'Write for an engineer, not a lawyer. Short sentences. No legal advice — you are pointing at what to check and who to ask.',
].join('\n')

export function obligationPrompt(input: {
  statement: string
  clause: string | null
  party: string | null
  type: string | null
  dueDate: string | null
  status: string
  evidence: string | null
  source: string | null
}): string {
  const lines = [
    'Assess this obligation.',
    '',
    `OBLIGATION: ${input.statement}`,
  ]
  if (input.clause) lines.push(`CLAUSE: ${input.clause}`)
  if (input.source) lines.push(`FROM DOCUMENT: ${input.source}`)
  if (input.party) lines.push(`RECORDED AS OWED BY: ${input.party}`)
  if (input.type) lines.push(`RECORDED TYPE: ${input.type}`)
  lines.push(`RECORDED STATUS: ${input.status}`)
  lines.push(`DUE DATE ON RECORD: ${input.dueDate ?? 'none recorded'}`)
  lines.push(`EVIDENCE ON RECORD: ${input.evidence?.trim() || 'nothing recorded'}`)

  lines.push(
    '',
    'The recorded party, type, status and due date were entered by a person and may be wrong. If the clause itself says something different, say so — that disagreement is worth more than either value on its own.',
    '',
    'Reply with ONLY a JSON object, no other text:',
    '{',
    '  "confidence": "clear" | "partial" | "cannot_tell",',
    '  "discharge": "the specific evidence that would prove this done",',
    '  "standing": "what is recorded against it and what is missing — describe, do not rule",',
    '  "risk": "wording that will cause an argument, or the words \\"No wording problems seen.\\"",',
    '  "disagreement": "where the clause and the recorded fields differ, or empty string",',
    '  "ask": "the single most useful question to put to the other party, or empty string"',
    '}'
  )
  return lines.join('\n')
}

export type ObligationReading = Reading & {
  discharge: string
  standing: string
  risk: string
  disagreement: string
  ask: string
}

/**
 * Read the reply.
 *
 * Parsed here rather than through the photograph reader, and that is not
 * duplication — it is the fix for a bug that would have made this feature
 * fail every single time. The shared reader requires a `problem` or a
 * `recommendation` field and returns null without one. This prompt asks for
 * `discharge`, `standing` and `risk` instead, so every reply would have been
 * declared unreadable AFTER the call was paid for.
 *
 * The rule the shared reader was really expressing is "reject an empty
 * answer", and that is kept — but measured against the fields this assessment
 * actually asked for.
 */
export function readObligationReview(raw: string): ObligationReading | null {
  const parsed = readJsonObject(raw)
  if (!parsed) return null

  const str = (k: string): string => {
    const v = parsed[k]
    return typeof v === 'string' ? v.trim() : ''
  }

  const discharge = str('discharge')
  const standing = str('standing')
  const risk = str('risk')

  // An object with none of the three is an empty answer, whatever else it has.
  if (!discharge && !standing && !risk) return null

  // Unrecognised confidence becomes the cautious one, never the confident one.
  const c = str('confidence')
  const confidence: Confidence = c === 'clear' || c === 'partial' ? c : 'cannot_tell'

  return {
    confidence,
    // The shared Reading shape, filled from the fields this assessment uses,
    // so `overreaches` and the rest keep working against real content.
    problem: standing,
    recommendation: discharge,
    discharge,
    standing,
    risk,
    disagreement: str('disagreement'),
    ask: str('ask'),
  }
}

// ── The two guards ───────────────────────────────────────────────────────
//
// The system prompt states the boundaries; these check whether they held.
// Instructions are not a guarantee, and a reading that crosses the line has
// to be visibly marked rather than quietly shown.

const DISCHARGE_CLAIMS = [
  /\bhas been (?:met|discharged|satisfied|fulfilled|completed|closed)\b/i,
  /\b(?:is|are) (?:now )?(?:met|discharged|satisfied|fulfilled|complete|closed out)\b/i,
  /\bno longer (?:required|applicable|outstanding)\b/i,
  /\bthis obligation (?:is|has been) (?:waived|released|superseded)\b/i,
  /\bcan be (?:closed|signed off|accepted)\b/i,
  /\bnothing further is (?:required|needed)\b/i,
]

/**
 * Did it decide the contractual question?
 *
 * The negative half of this matters as much as the positive: describing what
 * is missing, naming evidence, and saying an obligation *appears* unmet must
 * all pass, or the feature is unusable. It is the assertion that something IS
 * discharged that is forbidden.
 */
export function claimsDischarged(reading: ObligationReading): boolean {
  const text = `${reading.problem} ${reading.recommendation} ${reading.discharge} ${reading.standing} ${reading.risk}`
  return DISCHARGE_CLAIMS.some((re) => re.test(text))
}

// A bare period, not attached to a quote. "within 14 days" invented by the
// model is the failure; "the clause says 'within 14 days'" is the job.
const PERIOD = /\b(?:within|after|before|not less than|no later than)\s+\d+\s*(?:calendar |working |business )?(?:day|days|week|weeks|month|months|year|years)\b/i
const QUOTED = /["“”'']/

export function inventsAPeriod(reading: ObligationReading, clauseText: string): boolean {
  const text = `${reading.discharge} ${reading.standing} ${reading.risk}`
  const match = PERIOD.exec(text)
  if (!match) return false

  // If the same period appears in the clause itself, it was read, not invented.
  if (PERIOD.test(clauseText)) {
    const inClause = PERIOD.exec(clauseText)?.[0]?.toLowerCase()
    if (inClause && text.toLowerCase().includes(inClause)) return false
  }

  // A period inside quotation marks is being reported, not asserted.
  const around = text.slice(Math.max(0, match.index - 30), match.index + match[0].length + 30)
  return !QUOTED.test(around)
}

export const DISCHARGE_NOTE =
  'This reading states that the obligation has been met. Only the parties to the contract can decide that — treat the text as a description of the record and nothing more.'

export const PERIOD_NOTE =
  'This reading gives a time period that does not appear in the clause. Check it against the contract before relying on it; a plausible invented deadline is worse than none.'

/** The line that always appears, whatever else does. */
export function obligationCaveat(reading: ObligationReading): string {
  if (claimsDischarged(reading)) return DISCHARGE_NOTE
  if (reading.confidence === 'cannot_tell') {
    return 'The model could not assess this clause. That is usually because it is quoted without the definitions or the schedule it depends on.'
  }
  return 'A reading of the clause as written, not a legal opinion and not a decision about whether anybody has been released from anything.'
}

export function obligationTone(reading: ObligationReading): 'danger' | 'warning' | 'neutral' {
  if (claimsDischarged(reading)) return 'danger'
  if (reading.confidence === 'cannot_tell') return 'warning'
  return 'neutral'
}

/**
 * Not worth spending a paid call on.
 *
 * An obligation recorded as five words has nothing in it to assess, and an
 * assessment of five words will be invented rather than read. Better to say
 * so on screen for nothing than to charge for a guess.
 */
export function tooThinToAssess(input: { statement: string; clause: string | null }): string | null {
  const words = `${input.statement} ${input.clause ?? ''}`.trim().split(/\s+/).filter(Boolean)
  if (words.length < 6) {
    return 'There is not enough here to assess — the obligation is recorded in a few words. Paste the clause as written and it becomes worth reading.'
  }
  return null
}
