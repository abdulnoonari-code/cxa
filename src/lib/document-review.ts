// An AI reading of an uploaded document, in two halves.
//
// Somebody attaches a PDF to a check and the record now says "evidence
// attached". Nobody opens it again until handover, and at handover it turns
// out to be the wrong revision, or a scan of a blank form, or a certificate
// for a different tag. The attachment made the record LOOK complete, which is
// worse than an empty field — an empty field gets chased.
//
// So this asks two different questions, and keeping them apart is the whole
// design.
//
// ── Half one: is this usable as evidence? ────────────────────────────────
//
// What does the document appear to be, does it match what it was filed as,
// and is it legible, complete and signed. This half never says a document is
// acceptable, approved or sufficient — those are decisions, and they belong
// to whoever signs the check.
//
// ── Half two: what does it say? ──────────────────────────────────────────
//
// Values pulled out of the page — readings, dates, tag numbers, instrument
// serials. And here is the rule that governs every line of this file:
//
//     AN EXTRACTED VALUE IS WHAT THE MODEL READ, NOT WHAT IS TRUE.
//
// If a scanned test sheet says 1000 MΩ and the model reports 1000 MΩ, that is
// a claim about the PAGE, not about the cable. The page may be the wrong
// page. The reading may have been taken on the wrong circuit. The model may
// have misread 100.0 as 1000. Every extracted value therefore travels with
// where it was found, and none of them is ever written into a test record,
// counted in a figure, or compared against an acceptance criterion
// automatically. They are a head start on typing, and a way to notice that
// the certificate is for tag 3 when it is filed against tag 8.
//
// That last one is the reason this is worth building. It is the same question
// as the before-and-after photograph comparison: not "what does this show"
// but "is this actually about the thing it is filed against".

import { readReview, overreaches, caveatFor } from '@/lib/photo'
import type { Confidence, Reading } from '@/lib/photo'
import { readJsonObject } from '@/lib/ai'

export { readReview, overreaches, caveatFor }
export type { Confidence, Reading }

export const DOCUMENT_SYSTEM = [
  'You are assisting a commissioning engineer who has been handed a document as evidence on a power project.',
  '',
  'BEFORE ANYTHING ELSE, what you must never do:',
  '',
  '- NEVER say a document is acceptable, approved, sufficient, satisfactory, or that it closes or verifies anything. Whether evidence is good enough is a decision made by the person who signs, not by you.',
  '- NEVER state a value that is not printed on the page. If a field is blank, illegible, or cut off, say so. A plausible invented reading is the worst thing you can produce here.',
  '- NEVER decide whether a reading passes. You do not have the acceptance criterion, and the one you are thinking of may not be the one that applies.',
  '- NEVER guess what a document is from its file name alone. If the content does not say, the file name is not evidence.',
  '',
  '"I cannot tell" is a complete and useful answer, and a blurred scan is the commonest reason for it.',
  '',
  'You are answering two separate questions.',
  '',
  'FIRST — is this usable as evidence?',
  '  What the document appears to be, from its content. Whether that matches what it was filed against. Whether it is legible, complete, dated and signed. Anything missing that an engineer would need before accepting it.',
  '  The most valuable thing you can notice is a MISMATCH: a certificate for a different tag, a different revision, a different date, a different piece of equipment. Say that first and say it plainly.',
  '',
  'SECOND — what does it say?',
  '  Pull out the values that are actually printed: readings and their units, dates, tag or serial numbers, instrument identifiers, names and titles of signatories.',
  '  For each one, say WHERE on the document you found it. A value with no location is a value nobody can check.',
  '  Quote the units exactly as printed. Do not convert anything.',
].join('\n')

export function documentPrompt(input: {
  fileName: string
  filedAgainst: string
  filedAs: string | null
  text: string
}): string {
  return [
    'Assess this document as evidence.',
    '',
    `FILE NAME: ${input.fileName}`,
    `FILED AGAINST: ${input.filedAgainst}`,
    `FILED AS: ${input.filedAs ?? 'not stated'}`,
    '',
    'DOCUMENT CONTENT (extracted text — layout is lost, and a scanned page may give little or nothing):',
    '---',
    input.text.slice(0, 12000),
    '---',
    '',
    'If the content above is empty or nearly so, the document is probably a scan with no text layer. Say that rather than guessing from the file name — it is a real and useful finding, because a scan cannot be searched or checked by anything downstream.',
    '',
    'Reply with ONLY a JSON object, no other text:',
    '{',
    '  "confidence": "clear" | "partial" | "cannot_tell",',
    '  "appears_to_be": "what this document is, from its content",',
    '  "matches_filing": "yes" | "no" | "cannot_tell",',
    '  "mismatch": "what does not line up, or empty string",',
    '  "problem": "what is missing or unusable about it as evidence, or empty string",',
    '  "recommendation": "what to do about it",',
    '  "values": [ { "label": "what it is", "value": "exactly as printed", "where": "where on the document" } ]',
    '}',
    '',
    'Leave "values" as an empty list rather than inventing entries.',
  ].join('\n')
}

export type ExtractedValue = {
  label: string
  value: string
  where: string
}

export type DocumentReading = Reading & {
  appearsToBe: string
  matchesFiling: 'yes' | 'no' | 'cannot_tell'
  mismatch: string
  values: ExtractedValue[]
}

/**
 * Read the reply.
 *
 * Parsed standalone for the same reason as the obligation reader, plus one of
 * its own: a document with nothing wrong with it has an empty `problem` AND
 * an empty `recommendation`. Requiring either would have declared every clean
 * document unreadable — the feature would have worked only on bad documents,
 * which is exactly backwards.
 */
export function readDocumentReview(raw: string): DocumentReading | null {
  const parsed = readJsonObject(raw)
  if (!parsed) return null

  const str = (k: string): string => {
    const v = parsed[k]
    return typeof v === 'string' ? v.trim() : ''
  }

  const rawMatch = str('matches_filing').toLowerCase()
  // Anything unrecognised becomes "cannot tell", never "yes". A model that
  // answers "probably" must not be promoted into agreement.
  const matchesFiling: DocumentReading['matchesFiling'] =
    rawMatch === 'yes' ? 'yes' : rawMatch === 'no' ? 'no' : 'cannot_tell'

  const values: ExtractedValue[] = []
  const list = parsed['values']
  if (Array.isArray(list)) {
    for (const item of list.slice(0, 40)) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const label = typeof row.label === 'string' ? row.label.trim() : ''
      const value = typeof row.value === 'string' ? row.value.trim() : ''
      if (!label || !value) continue
      values.push({
        label,
        value,
        // A value with no stated location is kept but marked, rather than
        // dropped. Somebody can still check it; they just have to hunt.
        where: typeof row.where === 'string' && row.where.trim() ? row.where.trim() : 'location not stated',
      })
    }
  }

  const appearsToBe = str('appears_to_be')
  const problem = str('problem')
  const recommendation = str('recommendation')

  // An empty answer is one that says nothing about the document at all — not
  // one that says the document is fine.
  if (!appearsToBe && !problem && !recommendation && values.length === 0) return null

  const c = str('confidence')
  const confidence: Confidence = c === 'clear' || c === 'partial' ? c : 'cannot_tell'

  return {
    confidence,
    problem,
    recommendation,
    appearsToBe,
    matchesFiling,
    mismatch: str('mismatch'),
    values,
  }
}

// ── Guards ───────────────────────────────────────────────────────────────

const APPROVAL_CLAIMS = [
  /\b(?:is|looks|appears) (?:acceptable|approved|satisfactory|sufficient|adequate|compliant)\b/i,
  /\b(?:meets|satisfies|complies with) (?:the )?(?:requirement|specification|standard|criteria)\b/i,
  /\bcan be accepted\b/i,
  /\bverifies\b/i,
  /\bpasses\b/i,
  /\bthis (?:closes|completes) the check\b/i,
]

/** Did it decide whether the evidence is good enough? That is the signer's job. */
export function claimsApproval(reading: DocumentReading): boolean {
  const text = `${reading.problem} ${reading.recommendation} ${reading.appearsToBe} ${reading.mismatch}`
  return APPROVAL_CLAIMS.some((re) => re.test(text))
}

export const APPROVAL_NOTE =
  'This reading judges whether the document is good enough. It is not entitled to — accepting evidence is your signature, not the model\'s. Read the rest as a description of the page.'

/**
 * The line printed above every extracted value, without exception.
 *
 * Not a disclaimer for the sake of one. Extracted values look exactly like
 * recorded data on screen, and the difference — one was measured and signed
 * for, the other was read off a scan by a model — is the entire difference
 * between evidence and typing.
 */
export const VALUES_NOTE =
  'These are what the model read on the page, not verified measurements. Nothing here is written into any test record, counted in any figure, or checked against an acceptance criterion. Use them to save typing and to notice when a certificate is not about the thing it is filed against.'

export function documentCaveat(reading: DocumentReading): string {
  if (claimsApproval(reading)) return APPROVAL_NOTE
  if (reading.matchesFiling === 'no') {
    return 'The model thinks this document is not about the thing it is filed against. That is the finding worth acting on — check it before anything else.'
  }
  if (reading.confidence === 'cannot_tell') {
    return 'The model could not read this document. A scanned page with no text layer is the usual reason, and it means nothing downstream can search or check it either.'
  }
  return 'A description of the document, not a decision about whether it is good enough.'
}

export function documentTone(reading: DocumentReading): 'danger' | 'warning' | 'neutral' {
  if (claimsApproval(reading)) return 'danger'
  if (reading.matchesFiling === 'no') return 'danger'
  if (reading.confidence === 'cannot_tell') return 'warning'
  return 'neutral'
}

/**
 * Whether there is enough text to be worth a paid call.
 *
 * A scanned photograph of a form extracts to almost nothing. Sending 40
 * characters and asking what the document is produces a confident answer
 * derived from the file name, which is precisely what the system prompt
 * forbids — better not to ask.
 */
export function tooLittleText(text: string): string | null {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (trimmed.length < 120) {
    return 'Almost no text could be read from this file, so there is nothing to assess. It is most likely a scan or a photograph of a page rather than a document with a text layer — which also means nothing else in this application can search it.'
  }
  return null
}
