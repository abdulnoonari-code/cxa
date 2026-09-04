// Checking a document without a model, and being better at it.
//
// The AI reading of a document costs money, needs a key, and paraphrases.
// Most of what makes that reading worth having does not need a model at all,
// and for the single most valuable check a model is actively WORSE.
//
// ── The mismatch check ───────────────────────────────────────────────────
//
// "Is this certificate about the tag it is filed against?" A model reads the
// page, forms an impression, and writes a sentence. This reads the page,
// looks for the tag, and reports whether the characters are there. It cannot
// be creative, cannot round TR-02 to TR-2, and cannot decide that a document
// is "probably about" the right transformer. For a question whose answer is
// a string comparison, determinism is not a compromise — it is the better
// tool, and it is free.
//
// ── What is here, and what is honestly not ───────────────────────────────
//
// These rules find things that have a SHAPE: a tag, a date, a signature
// block, a number with a unit, a standard number. They cannot tell you what a
// document is, whether an argument holds, or whether a photograph shows what
// somebody claims. That is what the AI reading is for, and why it stays.
//
// Every finding says which rule produced it, so nothing here can be mistaken
// for judgement. A rule that fires is a rule that fired.

import { findCitations, type Citation } from '@/lib/standards'

export type FindingLevel = 'blocking' | 'warning' | 'note'

export type Finding = {
  level: FindingLevel
  /** Short label for the list. */
  title: string
  /** What was actually found or not found. */
  detail: string
  /** Which rule produced this, so it is never mistaken for judgement. */
  rule: string
}

export type Measurement = {
  label: string
  value: string
  unit: string
  where: string
}

export type RulesReading = {
  findings: Finding[]
  measurements: Measurement[]
  citations: Citation[]
  /** Whether the tag it is filed against appears in the document at all. */
  tagFound: boolean | null
  /** Other tags found that are NOT the one it is filed against. */
  otherTags: string[]
  wordCount: number
}

// ── Tags ─────────────────────────────────────────────────────────────────
//
// Commissioning tags are conventionally letters, a separator and digits:
// TR-02, SWB-1A, DB/L3/07, GEN-001. Loose enough to catch real site
// conventions, tight enough that it does not match "Rev-2" or a date.

const TAG = /\b[A-Z]{2,6}[-/][A-Z0-9]{1,6}(?:[-/][A-Z0-9]{1,6}){0,2}\b/g

/**
 * Is the expected tag present, and what else is?
 *
 * Compared with separators and case normalised, because TR-02, tr-02 and
 * TR/02 are the same piece of equipment on three different forms and nobody
 * should have to care. Leading zeros are NOT normalised: TR-02 and TR-2 are
 * treated as different, because on a project with more than nine
 * transformers they usually are, and a false "matches" is worse than a false
 * "check this".
 */
export function tagsIn(text: string, expected: string | null): { found: boolean | null; others: string[] } {
  const norm = (s: string) => s.toUpperCase().replace(/[\s/]/g, '-')
  // The pattern is upper-case only, so the TEXT is normalised before matching
  // rather than the matches afterwards. An earlier version normalised only
  // the tag and then searched the raw text, which meant "tr/02" on a form
  // never matched "TR-02" on the record — the exact case this check exists
  // for, missed because of a slash.
  const flat = norm(text)
  const matches = [...new Set(flat.match(TAG) ?? [])]

  if (!expected || !expected.trim()) return { found: null, others: matches.slice(0, 12) }

  const want = norm(expected.trim())
  const found = matches.includes(want) || flat.includes(want)
  const others = matches.filter((m) => m !== want).slice(0, 12)
  return { found, others }
}

// ── Dates and signatures ─────────────────────────────────────────────────

const DATE_PATTERNS = [
  /\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/,
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4}\b/i,
]

export function hasDate(text: string): boolean {
  return DATE_PATTERNS.some((re) => re.test(text))
}

// A signature BLOCK, not a signature. Nothing here can tell whether anybody
// actually signed — only whether the page has somewhere for them to.
const SIGNATURE_WORDS =
  /\b(signed|signature|witnessed(?:\s+by)?|approved\s+by|checked\s+by|tested\s+by|carried\s+out\s+by|name\s*(?:&|and)\s*signature|for\s+and\s+on\s+behalf)\b/i

export function hasSignatureBlock(text: string): boolean {
  return SIGNATURE_WORDS.test(text)
}

// ── Measurements ─────────────────────────────────────────────────────────
//
// Units an electrical commissioning document actually carries. Ordered
// longest-first inside the alternation so MΩ is not matched as Ω.

const UNITS = [
  'GΩ', 'MΩ', 'kΩ', 'mΩ', 'µΩ', 'uΩ', 'Ω',
  'kV', 'mV', 'V',
  'kA', 'mA', 'A',
  'kW', 'MW', 'W',
  'kVA', 'MVA', 'VA',
  'kvar', 'MVAr', 'kVAr',
  'Hz',
  '°C', 'degC',
  'Nm', 'N·m', 'lbf-ft',
  'ppm', 'µS/cm',
  'kJ', 'ms', 's',
  '%',
]

const NUMBER_UNIT = new RegExp(
  String.raw`([<>]?\s?\d[\d,]*(?:\.\d+)?)\s*(` +
    UNITS.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
    String.raw`)(?![A-Za-z])`,
  'g'
)

/**
 * Pull out every number that carries a unit.
 *
 * The label is the words immediately before it, which on a test sheet is
 * usually the row heading. Crude, and honest about being crude: the label is
 * offered as a hint, and `where` gives the surrounding text so somebody can
 * find it on the page and check.
 *
 * These are NOT test results. Nothing here is written into a test record or
 * compared against an acceptance criterion — the same rule as the AI
 * extraction, for the same reason. A number on a page is a claim about the
 * page.
 */
export function measurementsIn(text: string, limit = 40): Measurement[] {
  const flat = text.replace(/\s+/g, ' ')
  const out: Measurement[] = []
  let m: RegExpExecArray | null
  NUMBER_UNIT.lastIndex = 0

  while ((m = NUMBER_UNIT.exec(flat)) !== null && out.length < limit) {
    const before = flat.slice(Math.max(0, m.index - 60), m.index)
    // The last few words before the number, minus any trailing punctuation.
    const label =
      before
        .split(/[|;•\t]|\s{2,}/)
        .pop()
        ?.replace(/[^A-Za-z0-9 ()°/.-]/g, ' ')
        .trim()
        .split(/\s+/)
        .slice(-5)
        .join(' ') || 'unlabelled'

    out.push({
      label,
      value: m[1].replace(/\s+/g, ''),
      unit: m[2],
      where: flat.slice(Math.max(0, m.index - 40), Math.min(flat.length, m.index + m[0].length + 25)).trim(),
    })
  }
  return out
}

// ── The whole reading ────────────────────────────────────────────────────

/**
 * Run every rule over a document.
 *
 * Free, instant, deterministic, and repeatable — run it twice on the same
 * file and you get the same answer, which is the one thing an AI reading can
 * never promise. That is why this is stored separately from the AI columns
 * and labelled differently on screen: a rules stub must never borrow an AI's
 * authority, and an AI must never borrow a rule's repeatability.
 */
export function reviewByRules(input: {
  text: string
  fileName: string
  expectedTag: string | null
}): RulesReading {
  const text = input.text ?? ''
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const findings: Finding[] = []

  // A thin document is REPORTED, not abandoned. An earlier version returned
  // here, which skipped the tag check — the most valuable check in the file,
  // switched off by exactly the documents that most need looking at. Twelve
  // words is plenty to notice that a certificate names TR-02 while being
  // filed against TR-08.
  if (words < 20) {
    findings.push({
      level: 'warning',
      title: 'Almost nothing could be read from this file',
      detail:
        'It is most likely a scan or a photograph of a page rather than a document with a text layer. Nothing in this application can search it, and neither can whoever receives the handover pack. The checks below still ran on what little text there is.',
      rule: 'text-layer',
    })
  }

  const { found: tagFound, others: otherTags } = tagsIn(text, input.expectedTag)

  // The one that earns the whole file.
  if (input.expectedTag && tagFound === false) {
    findings.push({
      level: 'blocking',
      title: `This document does not mention ${input.expectedTag}`,
      detail:
        otherTags.length > 0
          ? `It is filed against ${input.expectedTag}, but the tags it does name are: ${otherTags.slice(0, 6).join(', ')}. A certificate for the wrong tag makes a record look complete while proving nothing.`
          : `It is filed against ${input.expectedTag} and that tag does not appear anywhere in the text. It may be a scan, or it may be about something else.`,
      rule: 'tag-match',
    })
  } else if (input.expectedTag && tagFound === true) {
    findings.push({
      level: 'note',
      title: `Mentions ${input.expectedTag}`,
      detail:
        'The tag it is filed against does appear in the document. That is a match on the characters, not a check that anybody has signed.',
      rule: 'tag-match',
    })
  }

  // Only worth saying on a document that HAS text. On a scan it is noise —
  // of course there is no date, there are no words.
  if (words >= 20 && !hasDate(text)) {
    findings.push({
      level: 'warning',
      title: 'No date found',
      detail:
        'No recognisable date anywhere in the text. An undated test record cannot be placed against an installation date, a calibration window, or a revision.',
      rule: 'date-present',
    })
  }

  if (words >= 20 && !hasSignatureBlock(text)) {
    findings.push({
      level: 'warning',
      title: 'No signature block found',
      detail:
        'Nothing resembling "signed", "witnessed by", "tested by" or similar. The page may still be signed by hand — this only says the words are not in the text.',
      rule: 'signature-block',
    })
  }

  const citations = findCitations(text)
  if (words >= 20 && citations.length === 0) {
    findings.push({
      level: 'note',
      title: 'No standard is cited',
      detail:
        'The document names no standard. That is not a fault — plenty of valid records do not — but a test certificate that states which specification it was tested to is worth more at handover than one that does not.',
      rule: 'standards-cited',
    })
  }

  return {
    findings,
    measurements: measurementsIn(text),
    citations,
    tagFound,
    otherTags,
    wordCount: words,
  }
}

/** Worst level present, for the badge. */
export function verdictOf(reading: RulesReading): FindingLevel | 'clean' {
  if (reading.findings.some((f) => f.level === 'blocking')) return 'blocking'
  if (reading.findings.some((f) => f.level === 'warning')) return 'warning'
  if (reading.findings.length > 0) return 'note'
  return 'clean'
}

/**
 * The line printed under every rules reading.
 *
 * It says what rules ARE, and — as importantly — what they are not. Somebody
 * who reads "no signature block found" and concludes the document is unsigned
 * has been misled by a check that only ever looked at characters.
 */
export const RULES_NOTE =
  'These checks are rules, not an AI. They look for patterns — a tag, a date, the word "signed", a number with a unit, a standard number — and report what they found. They are free, instant, and give the same answer every time. They cannot tell you what a document is or whether it is any good; a rule that finds no signature block has not read the page, it has searched it.'

// ── Classifying a defect without a model ─────────────────────────────────
//
// The AI defect assessment names the KIND of defect — installation,
// commissioning, design or documentation — because those four go to four
// different people, and an installation defect and a design problem look
// identical on a punch list while being nothing alike: one is rework, the
// other is a change and a cost.
//
// Most of the time that classification is decided by a handful of words.
// "Not terminated", "loose", "missing gland" is installation. "Setting
// wrong", "did not trip", "sequence" is commissioning. "Clash", "insufficient
// clearance", "as-built does not match" is design. "Certificate missing",
// "no calibration record" is documentation.
//
// So it is worth doing for free, with two rules that keep it honest:
//
//   1. **Unclear is the default, not the fallback.** A short punch item
//      genuinely cannot be classified, and guessing produces confident
//      nonsense sent to the wrong person.
//   2. **A tie is unclear.** If two kinds score equally the answer is that it
//      could be either, which is itself worth knowing.

export type DefectKind = 'installation' | 'commissioning' | 'design' | 'documentation' | 'unclear'

const KIND_WORDS: { kind: DefectKind; words: RegExp[] }[] = [
  {
    kind: 'installation',
    words: [
      /\bloose\b/i, /\bnot (?:terminated|fixed|secured|tightened|fitted|installed)\b/i,
      /\bmissing (?:gland|lug|bolt|screw|washer|clamp|bracket|cover|label)\b/i,
      /\bdamaged?\b/i, /\bbent\b/i, /\bcorroded?\b/i, /\bpaint/i,
      /\bcable\s+(?:not|un)/i, /\bearth(?:ing)?\s+(?:not|missing|loose)/i,
      /\bglands?\b/i, /\btorque\b/i, /\bworkmanship\b/i, /\bincorrectly (?:fitted|mounted|routed)\b/i,
    ],
  },
  {
    kind: 'commissioning',
    words: [
      /\bdid ?n[o']t trip\b/i, /\bfail(?:ed|s)? to (?:trip|start|stop|transfer|close|open)\b/i,
      /\bsetting?s?\b/i, /\brelay\b/i, /\bsequence\b/i, /\binterlock\b/i,
      /\btest (?:failed|not passed)\b/i, /\bout of (?:tolerance|range|spec)\b/i,
      /\bcalibrat/i, /\balarm (?:did ?n[o']t|not)\b/i, /\btransfer\b/i, /\btiming\b/i,
      /\breading\b/i, /\bfunction(?:al)? test\b/i,
    ],
  },
  {
    kind: 'design',
    words: [
      /\bclash(?:es|ing)?\b/i, /\binsufficient (?:clearance|space|access|capacity)\b/i,
      /\bas[- ]built\b/i, /\bdoes ?n[o']t match (?:the )?(?:drawing|design|schematic)\b/i,
      /\bundersized?\b/i, /\bwrong (?:rating|size|type|specification)\b/i,
      /\bnot (?:shown|indicated) on (?:the )?drawing\b/i, /\bdesign change\b/i,
      /\bincompatib/i, /\bno (?:space|room) (?:for|to)\b/i,
    ],
  },
  {
    kind: 'documentation',
    words: [
      /\bcertificate\b/i, /\bno (?:record|certificate|report|manual|datasheet)\b/i,
      /\bmissing (?:document|record|certificate|drawing|manual|report)\b/i,
      /\bnot (?:submitted|issued|transmitted|provided)\b/i,
      /\bo\s*&\s*m\b/i, /\btest report\b/i, /\bcalibration (?:certificate|record)\b/i,
      /\bnot signed\b/i, /\btransmittal\b/i, /\brevision\b/i,
    ],
  },
]

export type DefectRules = {
  kind: DefectKind
  /** Why it landed there — the words that matched, so nobody has to trust it. */
  matched: string[]
  findings: Finding[]
  citations: Citation[]
}

export function classifyDefect(input: { title: string; description: string | null }): DefectRules {
  const text = `${input.title} ${input.description ?? ''}`.trim()
  const findings: Finding[] = []
  const words = text.split(/\s+/).filter(Boolean).length

  if (words < 4) {
    findings.push({
      level: 'warning',
      title: 'Too short to classify',
      detail:
        'A punch item of three words or fewer cannot be sorted by anything, human or otherwise. Say what is wrong and where, and this becomes useful.',
      rule: 'defect-length',
    })
    return { kind: 'unclear', matched: [], findings, citations: [] }
  }

  const scores = new Map<DefectKind, string[]>()
  for (const { kind, words: patterns } of KIND_WORDS) {
    const hits: string[] = []
    for (const re of patterns) {
      const m = re.exec(text)
      if (m) hits.push(m[0].toLowerCase())
    }
    if (hits.length > 0) scores.set(kind, hits)
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1].length - a[1].length)

  // No match, or a tie, is unclear — and says so rather than picking one.
  let kind: DefectKind = 'unclear'
  let matched: string[] = []
  if (ranked.length === 1 || (ranked.length > 1 && ranked[0][1].length > ranked[1][1].length)) {
    kind = ranked[0][0]
    matched = ranked[0][1]
  } else if (ranked.length > 1) {
    findings.push({
      level: 'note',
      title: 'Could be more than one kind of defect',
      detail: `The wording points equally at ${ranked
        .filter((r) => r[1].length === ranked[0][1].length)
        .map((r) => r[0])
        .join(' and ')}. Worth deciding by hand, because they go to different people.`,
      rule: 'defect-kind',
    })
    matched = ranked.flatMap((r) => r[1])
  }

  if (kind !== 'unclear') {
    findings.push({
      level: 'note',
      title: `Reads as ${kind}`,
      detail: `Matched on: ${matched.slice(0, 6).join(', ')}. A keyword classification, not a judgement — change it if it is wrong.`,
      rule: 'defect-kind',
    })
  }

  return { kind, matched, findings, citations: findCitations(text) }
}
