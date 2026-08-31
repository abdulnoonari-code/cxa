// Reading requirements out of a specification.
//
// The twin of the obligation reader, and the line between them is the whole
// design of this file:
//
//   • An **obligation** names a party and a duty. "The Contractor shall submit
//     the ITP fourteen days before work starts." You close it by somebody
//     doing a thing.
//   • A **requirement** states something that must be true of the plant, with
//     an acceptance you can measure or a standard you can cite. "Insulation
//     resistance shall be not less than 1000 MΩ." You close it by proving it.
//
// A clause can genuinely be both — "the Contractor shall ensure insulation
// resistance is not less than 1000 MΩ" is a duty *and* a criterion — and this
// file does not pretend otherwise. It reads for criteria; the obligation
// reader reads for duties; where they overlap the clause appears on both
// registers, which is correct, because both things are true of it.
//
// What it will not do is invent an acceptance criterion. A sentence with no
// number, no standard and no measurable property is not a requirement here,
// however emphatically it is written.

import { parseCriteria } from '@/lib/test-io'
import { VERIFICATION_METHODS, CRITICALITIES } from '@/lib/requirements'

export { VERIFICATION_METHODS, CRITICALITIES }

const DUTY = /\b(shall|must|is to be|are to be|is required to|shall be|will be)\b/i

// Definitions, governing law and the rest of the legal machinery. Same
// exclusion as the obligation reader, for the same reason.
const NOT_A_DUTY = /\bshall\s+(?:mean|be deemed|be construed|have the meaning|not be construed|apply|survive|be governed)\b/i

// A published standard, cited by number. This is a real acceptance criterion
// even with no figure in the sentence, because the figure lives in the
// standard.
const STANDARD =
  /\b(IEC|IEEE|BS\s?EN|BS|EN|ISO|NFPA|ASTM|ANSI|NEMA|DIN|AS\/NZS|CIGRE|ASHRAE|UL)\s?[-–]?\s?\d{2,5}(?:[-–:.]\d+)*\b/i

// The shapes an acceptance criterion takes when it is not a bare number.
const PROPERTY =
  /\b(shall be capable of|shall have|shall be rated|shall withstand|shall achieve|shall not exceed|shall be not less than|shall be no less than|shall be no greater than|shall be maintained (?:at|below|above)|shall be limited to|shall operate (?:within|between)|shall be provided with|rated at|minimum of|maximum of|shall be demonstrated|shall be proven|shall be verified|shall be tested|shall be free from|shall be suitable for)\b/i

const MEASURE = /\d\s*(?:%|kV|V|kA|A|mA|MΩ|Ω|µΩ|uΩ|mΩ|ms|s|min|hours?|hrs?|Hz|K|°C|degC|bar|kPa|MPa|Pa|mm|cm|m|km|kg|t|dB|lux|W|kW|MW|VA|kVA|MVA|Nm|pu)\b/i

// A clause that is clearly a procedural duty and carries no criterion is the
// obligation reader's business, not this one's.
// A period of time — the shape of a deadline rather than a performance limit.
const PERIOD = /\b\d{1,3}\)?\s*(?:working\s+|business\s+|calendar\s+)?(?:days?|weeks?|months?)\b/i

const PROCEDURAL =
  /\b(submit|notify|give notice|attend|witness|approve|issue the|deliver to|hand over|make available|coordinate|liaise|appoint|employ|insure|indemnify|pay)\b/i

// Order is specificity again. "Type test certificates shall be provided"
// contains the word "test", but what closes it out is a piece of paper, not a
// measurement — so certificate is checked before test.
const METHOD_PATTERNS: { method: string; pattern: RegExp }[] = [
  { method: 'certificate', pattern: /\b(certificates?|certified|type test report|conformity)\b/i },
  { method: 'demonstration', pattern: /\b(demonstrat(?:e|ed|ion|ing)|simulat(?:e|ed|ion)|operat(?:e|ed|ing) in the presence|functional check)\b/i },
  { method: 'test', pattern: /\b(test(?:ed|ing|s)?|measur(?:e|ed|ement|ing)|verified by test|readings?)\b/i },
  { method: 'inspection', pattern: /\b(inspect(?:ed|ion|s)?|visual(?:ly)?|examin(?:e|ed|ation)|check(?:ed|s)? by sight)\b/i },
  { method: 'analysis', pattern: /\b(calculat(?:e|ed|ion)|analys(?:is|ed|e)|study|modelled|simulation study)\b/i },
  { method: 'training', pattern: /\b(training|competen(?:ce|t)|familiaris|instructed)\b/i },
  { method: 'review', pattern: /\b(review(?:ed)?|documented|drawings? shall|schedule shall|record shall)\b/i },
]

// Words that make a criterion a safety or contractual matter rather than a
// preference. These are the ones that should block a gate.
const CRITICAL =
  /\b(safety|safe|earth(?:ing)?|bond(?:ing)?|protection|interlock|trip|emergency|fire|arc flash|personnel|shock|lethal|isolation|lock[- ]?out|explosion|hazard)\b/i
const MINOR = /\b(cosmetic|aesthetic|preferab|desirable|where practicable|as far as reasonably|labell?ing colour)\b/i

export type RequirementCandidate = {
  clause: string | null
  page: number | null
  statement: string
  /** the acceptance as written, e.g. "≥ 1000 MΩ" or "IEC 62271-100" */
  acceptance: string | null
  verification_method: string
  criticality: string
  /** what made this a requirement rather than prose — shown to the engineer */
  because: 'measured value' | 'stated limit' | 'published standard' | 'stated property'
  context: string | null
}

export function methodIn(text: string): string {
  for (const { method, pattern } of METHOD_PATTERNS) {
    if (pattern.test(text)) return method
  }
  // A criterion with no stated means of proof is a test until somebody says
  // otherwise — a measurable thing is measured.
  return 'test'
}

export function criticalityIn(text: string): string {
  if (CRITICAL.test(text)) return 'critical'
  if (MINOR.test(text)) return 'minor'
  return 'normal'
}

/**
 * The acceptance criterion, as written, plus what kind of thing it is.
 *
 * `parseCriteria` from the test importer is reused deliberately: a criterion
 * written in a specification and a criterion written in a testing
 * contractor's spreadsheet are the same sentence, and reading them two
 * different ways is how the two registers end up disagreeing.
 */
export function acceptanceIn(text: string): { acceptance: string | null; because: RequirementCandidate['because'] } | null {
  // The standard is checked FIRST, and this is not a preference — a standard
  // number contains a hyphen ("IEC 62271-100"), and a number-hyphen-number is
  // exactly what a range looks like. Read the other way round, "in accordance
  // with IEC 62271-100" becomes an acceptance criterion of "100 to 62271",
  // which is nonsense that would sit in the register looking plausible.
  const standard = text.match(STANDARD)
  if (standard) return { acceptance: standard[0], because: 'published standard' }

  const parsed = parseCriteria(text)
  if (parsed.criteria_type !== 'text') {
    const unit = parsed.unit ? ` ${parsed.unit}` : ''
    const acceptance =
      parsed.criteria_type === 'range'
        ? `${parsed.expected_min} – ${parsed.expected_max}${unit}`
        : parsed.criteria_type === 'min'
          ? `≥ ${parsed.expected_min}${unit}`
          : `≤ ${parsed.expected_max}${unit}`
    return { acceptance, because: 'stated limit' }
  }

  if (MEASURE.test(text)) {
    const measure = text.match(new RegExp(MEASURE.source, 'i'))
    return { acceptance: measure ? measure[0].trim() : null, because: 'measured value' }
  }
  if (PROPERTY.test(text)) return { acceptance: null, because: 'stated property' }
  return null
}

/**
 * Read a document's paragraphs for requirements.
 *
 * Conservative, like the obligation reader and for the same reason: a
 * register the engineer has to prune line by line is a register he abandons.
 * A sentence must state a limit, cite a standard, carry a measurement or
 * describe a property to get in.
 */
export function readRequirements(
  paragraphs: { index: number; clause: string | null; text: string; heading: boolean; page: number | null }[]
): RequirementCandidate[] {
  const found: RequirementCandidate[] = []
  let heading: string | null = null

  for (const para of paragraphs) {
    if (para.heading) {
      heading = para.text
      continue
    }
    if (!DUTY.test(para.text)) continue
    if (NOT_A_DUTY.test(para.text)) continue
    if (para.text.length < 25) continue

    const found_acceptance = acceptanceIn(para.text)
    if (!found_acceptance) continue

    // A purely procedural clause with only a soft "stated property" signal is
    // somebody's duty, not a property of the plant.
    if (found_acceptance.because === 'stated property' && PROCEDURAL.test(para.text)) continue

    // "shall submit the ITP not less than fourteen (14) days before work
    // starts" parses as a perfectly good numeric limit — and it is a deadline
    // owed by a party, not a property of the plant. A period of time on a
    // procedural clause belongs on the obligations register and nowhere else.
    if (PROCEDURAL.test(para.text) && PERIOD.test(para.text)) continue

    found.push({
      clause: para.clause,
      page: para.page,
      statement: para.text,
      acceptance: found_acceptance.acceptance,
      verification_method: methodIn(para.text),
      criticality: criticalityIn(para.text),
      because: found_acceptance.because,
      context: heading,
    })
  }

  return found
}

export function becauseLabel(because: RequirementCandidate['because']): string {
  switch (because) {
    case 'stated limit':
      return 'States a limit'
    case 'published standard':
      return 'Cites a standard'
    case 'measured value':
      return 'Carries a measurement'
    default:
      return 'States a property'
  }
}

// ── References ───────────────────────────────────────────────────────────

const REF_PATTERN = /^REQ-(\d+)$/i

export function nextRequirementRef(existing: (string | null)[]): string {
  let highest = 0
  for (const ref of existing) {
    const match = (ref ?? '').trim().match(REF_PATTERN)
    if (!match) continue
    const n = Number(match[1])
    if (Number.isFinite(n) && n > highest) highest = n
  }
  return `REQ-${String(highest + 1).padStart(4, '0')}`
}

export function requirementRefSeries(existing: (string | null)[], count: number): string[] {
  const start = Number(nextRequirementRef(existing).slice(4))
  return Array.from({ length: count }, (_, i) => `REQ-${String(start + i).padStart(4, '0')}`)
}
