// Photo evidence on a punch item, and what an AI is allowed to say about it.
//
// A punch item is a defect somebody walked up to and saw. The photograph is
// the only part of that anybody else will ever see, which makes it the most
// load-bearing evidence in the whole application — and the easiest to fake.
//
// Four positions govern this file:
//
//   1. **The photo is evidence. The AI reading is not.** The picture is the
//      record. What a model says about it is a prompt to go and look, never a
//      finding, never a status, and never counted in any figure.
//
//   2. **"I cannot tell" is a first-class answer.** A blurred photo, a shot
//      taken from ten metres away, a picture of the wrong panel — the honest
//      output is an admission. A model that always produces a confident
//      recommendation is worse than useless on a construction site, because
//      the confident wrong answer is the one that gets acted on.
//
//   3. **The AI never closes anything.** It cannot mark an item fixed,
//      accepted or verified. Only a named person does that, on the record,
//      with their name against it.
//
//   4. **The question worth asking is about the pair, not the picture.** "What
//      is wrong in this photo" is a party trick. "Does this after-photo show
//      the same place as the before-photo, with that defect addressed" is the
//      question a commissioning engineer actually has — because a fix photo of
//      a different panel is the commonest way a punch list gets closed out
//      without the work being done.

export type PhotoKind = 'defect' | 'fix'

export const PHOTO_KINDS: { value: PhotoKind; label: string; hint: string }[] = [
  { value: 'defect', label: 'Defect — before', hint: 'What was wrong when the item was raised.' },
  { value: 'fix', label: 'Fix — after', hint: 'What it looked like once the work was done.' },
]

export function kindLabel(value: string | null | undefined): string {
  return PHOTO_KINDS.find((k) => k.value === value)?.label ?? 'Defect — before'
}

export function kindBadgeClass(value: string | null | undefined): string {
  return value === 'fix' ? 'badge badge-success' : 'badge badge-warning'
}

// ── What the file has to be ──────────────────────────────────────────────

/** What a browser and the vision API will both accept. */
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

/** 5 MB. Bigger than any phone photo worth keeping, small enough to send. */
export const MAX_BYTES = 5 * 1024 * 1024

export type FileProblem = { reason: string; hint: string }

/**
 * Whether a file can be accepted at all.
 *
 * Refused before anything is uploaded or sent, so a HEIC straight off an
 * iPhone fails with a sentence somebody can act on rather than a broken image
 * on the punch list six weeks later.
 */
export function checkFile(input: { name: string; type: string; size: number }): FileProblem | null {
  if (input.size === 0) return { reason: 'That file is empty.', hint: 'Pick the photo again.' }

  if (input.size > MAX_BYTES) {
    return {
      reason: `That photo is ${(input.size / 1024 / 1024).toFixed(1)} MB, and the limit is ${MAX_BYTES / 1024 / 1024} MB.`,
      hint: 'Most phones can share a smaller copy — or take the shot again at a lower resolution.',
    }
  }

  const type = (input.type || '').toLowerCase()
  if (!ACCEPTED_TYPES.includes(type as (typeof ACCEPTED_TYPES)[number])) {
    // HEIC is worth naming, because every iPhone on site produces it and the
    // fix takes ten seconds if you know what to do.
    const heic = /heic|heif/i.test(type) || /\.(heic|heif)$/i.test(input.name)
    return {
      reason: heic
        ? 'That is a HEIC photo, which browsers cannot display.'
        : `${input.type || 'That file type'} is not an image this app can show.`,
      hint: heic
        ? 'On an iPhone: Settings → Camera → Formats → Most Compatible, or share the photo to Files as JPEG first.'
        : 'Use JPEG, PNG or WebP.',
    }
  }

  return null
}

// ── What the AI is asked, and what it may say back ───────────────────────

export type Confidence = 'clear' | 'partial' | 'cannot_tell'

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  clear: 'The photo shows this clearly',
  partial: 'Partly visible — worth checking on site',
  cannot_tell: 'Cannot tell from this photo',
}

export function confidenceBadgeClass(value: string | null | undefined): string {
  switch (value) {
    case 'clear':
      return 'badge badge-info'
    case 'partial':
      return 'badge badge-warning'
    default:
      return 'badge badge-neutral'
  }
}

export function isConfidence(value: unknown): value is Confidence {
  return value === 'clear' || value === 'partial' || value === 'cannot_tell'
}

/**
 * The instructions the model is given.
 *
 * Most of this is about what NOT to do. A model asked to look at a photo of an
 * electrical panel will happily produce a confident paragraph about something
 * it half-recognises, and on a construction site that paragraph gets actioned.
 * So the refusals are stated first and stated plainly.
 */
export const REVIEW_SYSTEM = [
  'You are helping a commissioning engineer look at a photograph of a defect on an electrical or mechanical installation.',
  '',
  'What you are for: pointing out what is worth looking at, in the words a site engineer would use.',
  '',
  'What you must never do:',
  '- Never say a defect is fixed, closed, acceptable, approved or safe. You are not entitled to decide that; a named person is.',
  '- Never invent a detail you cannot see. If the photo is blurred, too far away, badly lit, or shows something other than what the item describes, say so and stop.',
  '- Never guess a measurement, a torque figure, a rating or a standard number from a photograph.',
  '- Never describe a person, a face, or anything on a nameplate you cannot actually read.',
  '',
  '"I cannot tell from this photo" is a complete and useful answer. Prefer it over a confident guess every single time.',
  '',
  'Answer as JSON with exactly these keys and nothing else:',
  '{"confidence":"clear|partial|cannot_tell","problem":"...","recommendation":"..."}',
  '',
  '- confidence: how much the photograph actually supports what you are saying.',
  '- problem: what you can see, in one or two plain sentences. If you cannot see enough, say exactly that and say what a better photo would show.',
  '- recommendation: what the engineer should do or check next. Never a decision, always an action. If you cannot tell, recommend the photograph that would settle it.',
].join('\n')

/** The prompt for a single photo. */
export function reviewPrompt(input: {
  title: string
  description: string | null
  tag: string
  category: string | null
  kind: PhotoKind
  caption: string | null
}): string {
  const lines = [
    `The punch item says: "${input.title}"`,
    input.description ? `Further description: "${input.description}"` : null,
    `It is raised against: ${input.tag}`,
    input.caption ? `Whoever uploaded this photo captioned it: "${input.caption}"` : null,
    '',
    input.kind === 'defect'
      ? 'This photograph was taken when the defect was raised. Say what you can see, and what the engineer should check next.'
      : 'This photograph was taken after the corrective work. Say what you can see. You may NOT say the defect is fixed — say what the photo does and does not show, and what would settle it.',
  ]
  return lines.filter(Boolean).join('\n')
}

/**
 * The prompt for a before-and-after pair, which is the one that earns its keep.
 *
 * Two images are sent in order. The model is asked the awkward question first:
 * is this even the same place? A fix photo of a different panel closes a punch
 * item that was never done, and nothing else in the app can catch it.
 */
export function comparePrompt(input: { title: string; description: string | null; tag: string }): string {
  return [
    `The punch item says: "${input.title}"`,
    input.description ? `Further description: "${input.description}"` : null,
    `It is raised against: ${input.tag}`,
    '',
    'You are given two photographs. The first was taken when the defect was raised. The second was taken after the corrective work.',
    '',
    'Answer these in order:',
    '1. Do both photographs appear to show the same equipment, in the same place? If you cannot tell, say so — this matters more than anything else you say.',
    '2. What changed between them, if anything you can actually see?',
    '3. What does the second photograph NOT show that an engineer would need before accepting this item?',
    '',
    'You may not say the defect is fixed or that the item can be closed. That is a named person\'s decision.',
  ]
    .filter(Boolean)
    .join('\n')
}

// ── Reading the answer back ──────────────────────────────────────────────

export type Reading = {
  confidence: Confidence
  problem: string
  recommendation: string
}

/**
 * Turn whatever came back into a reading, or nothing.
 *
 * A model that ignores the format, wraps the JSON in prose, or fences it is
 * handled. A model that returns something unusable produces `null` and the
 * screen says the review could not be read — which is far better than showing
 * an engineer a half-parsed sentence about his switchgear.
 */
export function readReview(raw: string): Reading | null {
  if (!raw || !raw.trim()) return null

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : raw
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(body.slice(start, end + 1))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null

  const o = parsed as Record<string, unknown>
  const problem = typeof o.problem === 'string' ? o.problem.trim() : ''
  const recommendation = typeof o.recommendation === 'string' ? o.recommendation.trim() : ''
  if (!problem && !recommendation) return null

  // An unrecognised confidence becomes the cautious one, never the confident
  // one. A model that returns "high" must not be read as "clear".
  const confidence: Confidence = isConfidence(o.confidence) ? o.confidence : 'cannot_tell'

  return { confidence, problem, recommendation }
}

/**
 * Words a reading is never allowed to contain, because they are decisions.
 *
 * Checked after the fact rather than trusted to the prompt. A model that
 * ignores the instruction and writes "this is now fixed and can be closed"
 * gets its confidence pulled down and a sentence added, so the engineer reads
 * the claim next to a warning about it instead of on its own.
 */
const DECISION_WORDS =
  /\b(is (now )?(fixed|resolved|repaired|rectified|complete)|can be (closed|accepted|signed off)|has been (fixed|resolved|rectified)|no further action|acceptable|approved|compliant|meets the (standard|requirement)|safe to)\b/i

export function overreaches(reading: Reading): boolean {
  return DECISION_WORDS.test(`${reading.problem} ${reading.recommendation}`)
}

export const OVERREACH_NOTE =
  'This reading claims something only a person may decide. Treat it as a description of the photograph and nothing more — closing this item is your signature, not the model’s.'

/** What to show beside a reading, given what it says and how sure it claims to be. */
export function caveatFor(reading: Reading): string {
  if (overreaches(reading)) return OVERREACH_NOTE
  if (reading.confidence === 'cannot_tell') {
    return 'The photograph did not show enough. Nothing here counts as evidence either way.'
  }
  if (reading.confidence === 'partial') {
    return 'Only partly visible. Worth a second look on site before anybody relies on it.'
  }
  return 'A description of the photograph, not a decision about the item.'
}

// ── Counting ─────────────────────────────────────────────────────────────

export type PhotoLike = { kind: string; ai_reviewed_at?: string | null }

export type PhotoSummary = {
  total: number
  defect: number
  fix: number
  reviewed: number
  /** Items that have an after-photo but no before-photo to compare it against. */
  fixWithoutDefect: boolean
}

export function summarise(photos: PhotoLike[]): PhotoSummary {
  const defect = photos.filter((p) => p.kind === 'defect').length
  const fix = photos.filter((p) => p.kind === 'fix').length
  return {
    total: photos.length,
    defect,
    fix,
    reviewed: photos.filter((p) => p.ai_reviewed_at).length,
    fixWithoutDefect: fix > 0 && defect === 0,
  }
}

/** Whether a before-and-after comparison is possible at all. */
export function canCompare(photos: PhotoLike[]): boolean {
  return photos.some((p) => p.kind === 'defect') && photos.some((p) => p.kind === 'fix')
}
