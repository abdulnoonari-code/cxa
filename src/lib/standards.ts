// The standards a commissioning record cites, and the line this file will not cross.
//
// ── WHAT THIS FILE DOES ──────────────────────────────────────────────────
//
// It RECOGNISES standard references in text. "IEC 62271-100", "NFPA 70E",
// "ANSI/NETA ATS-2021 Section 7.2.2", "Tier III" — it finds them, names the
// body, and records where it saw them.
//
// ── WHAT THIS FILE WILL NEVER DO ─────────────────────────────────────────
//
// It will never say what a standard REQUIRES.
//
// Not a torque figure, not an insulation resistance minimum, not a test
// voltage, not a duration, not a temperature rise limit. Not "per IEC 60076
// the minimum is…". Not even a hedged version of one.
//
// Two reasons, and the second is the serious one.
//
//   1. Those documents are copyrighted. Their content is sold, not
//      redistributed, and reproducing acceptance tables inside an
//      application is not something to do casually.
//
//   2. A WRONG FIGURE WITH A STANDARD NUMBER NEXT TO IT IS THE MOST
//      DANGEROUS OUTPUT THIS APPLICATION COULD PRODUCE. A bare number
//      invites checking. A number labelled "per IEC 62271-1" does not — it
//      arrives pre-trusted, gets written onto a test sheet, and is signed
//      for. The citation is precisely what removes the scepticism that
//      would otherwise catch it.
//
// This is the same rule the defect assessment already lives under: it names
// the measurement that would settle a question and never supplies the limit,
// because the limit comes from the project specification or the manufacturer
// data. This file extends that rule to standards, where the temptation is
// stronger and the consequence is worse.
//
// So what is here is a MAP, not a manual. Enough to say "this document cites
// the switchgear standard" and to link a record to it. What the clause says
// stays in the clause, which somebody with the actual document reads.

export type StandardBody = {
  key: string
  /** How it is written on a drawing or a certificate. */
  label: string
  /** Who publishes it, in full, because the initials are not universal. */
  publisher: string
  /** What kind of work it governs — for grouping, not for guidance. */
  domain: string
}

export const STANDARD_BODIES: StandardBody[] = [
  {
    key: 'iec',
    label: 'IEC',
    publisher: 'International Electrotechnical Commission',
    domain: 'Electrical equipment and installations, used across most of the world outside North America.',
  },
  {
    key: 'nfpa',
    label: 'NFPA',
    publisher: 'National Fire Protection Association',
    domain: 'Fire, life safety and electrical safety, dominant in North America and common on data centre projects everywhere.',
  },
  {
    key: 'ansi',
    label: 'ANSI / IEEE',
    publisher: 'American National Standards Institute / Institute of Electrical and Electronics Engineers',
    domain: 'North American electrical equipment and practice.',
  },
  {
    key: 'neta',
    label: 'ANSI/NETA',
    publisher: 'InterNational Electrical Testing Association',
    domain: 'Acceptance and maintenance testing of electrical power equipment. The one commissioning engineers cite most.',
  },
  {
    key: 'uptime',
    label: 'Uptime Institute',
    publisher: 'Uptime Institute',
    domain: 'Data centre infrastructure Tier classification and certification.',
  },
  {
    key: 'iso',
    label: 'ISO',
    publisher: 'International Organization for Standardization',
    domain: 'Management systems — quality, energy, environment.',
  },
  {
    key: 'bsen',
    label: 'BS EN',
    publisher: 'British Standards Institution / European Committee for Standardization',
    domain: 'European adoptions, frequently specified on projects with UK or EU consultants.',
  },
]

export function bodyOf(key: string): StandardBody | null {
  return STANDARD_BODIES.find((b) => b.key === key) ?? null
}

/**
 * Well-known families, with SCOPE only.
 *
 * "What subject this standard covers" — never "what it requires". The
 * difference is the whole point of the file header. `scope` exists so a
 * screen can say "this is the HV switchgear standard" rather than showing a
 * bare number, and for nothing else.
 *
 * A citation that is not in this list is still recognised and recorded; it
 * simply has no scope note beside it. Recognition does not depend on this
 * list being complete, and it never will be.
 */
export type StandardFamily = {
  body: string
  /** The number as it is normally written, without a part or year. */
  code: string
  scope: string
}

export const KNOWN_FAMILIES: StandardFamily[] = [
  // ── IEC ────────────────────────────────────────────────────────────────
  { body: 'iec', code: 'IEC 60076', scope: 'Power transformers.' },
  { body: 'iec', code: 'IEC 62271', scope: 'High-voltage switchgear and controlgear.' },
  { body: 'iec', code: 'IEC 61439', scope: 'Low-voltage switchgear and controlgear assemblies.' },
  { body: 'iec', code: 'IEC 60947', scope: 'Low-voltage switchgear and controlgear devices.' },
  { body: 'iec', code: 'IEC 60364', scope: 'Low-voltage electrical installations.' },
  { body: 'iec', code: 'IEC 61850', scope: 'Communication networks and systems for substation automation.' },
  { body: 'iec', code: 'IEC 62305', scope: 'Protection against lightning.' },
  { body: 'iec', code: 'IEC 60529', scope: 'Degrees of protection provided by enclosures — the IP code.' },
  // The published title of this one contains "exceeding 1 kV AC". That figure
  // is part of a NAME, not a requirement — but the rule against numbers in a
  // scope is absolute on purpose, and a rule with one reasonable exception is
  // a rule with an unreasonable one waiting behind it. Worded without it.
  { body: 'iec', code: 'IEC 61936', scope: 'Power installations above low voltage.' },
  { body: 'iec', code: 'IEC 62040', scope: 'Uninterruptible power systems.' },

  // ── NFPA ───────────────────────────────────────────────────────────────
  { body: 'nfpa', code: 'NFPA 70', scope: 'National Electrical Code.' },
  { body: 'nfpa', code: 'NFPA 70B', scope: 'Electrical equipment maintenance.' },
  { body: 'nfpa', code: 'NFPA 70E', scope: 'Electrical safety in the workplace.' },
  { body: 'nfpa', code: 'NFPA 72', scope: 'National Fire Alarm and Signaling Code.' },
  { body: 'nfpa', code: 'NFPA 75', scope: 'Fire protection of information technology equipment.' },
  { body: 'nfpa', code: 'NFPA 76', scope: 'Fire protection of telecommunications facilities.' },
  { body: 'nfpa', code: 'NFPA 110', scope: 'Emergency and standby power systems.' },
  { body: 'nfpa', code: 'NFPA 111', scope: 'Stored electrical energy emergency and standby power systems.' },
  { body: 'nfpa', code: 'NFPA 25', scope: 'Inspection, testing and maintenance of water-based fire protection systems.' },

  // ── ANSI / IEEE ────────────────────────────────────────────────────────
  { body: 'ansi', code: 'IEEE C57', scope: 'Transformers.' },
  { body: 'ansi', code: 'IEEE C37', scope: 'Switchgear, circuit breakers and protective relays.' },
  { body: 'ansi', code: 'IEEE 3007', scope: 'Recommended practice for the operation and maintenance of industrial and commercial power systems.' },
  { body: 'ansi', code: 'IEEE 493', scope: 'Design of reliable industrial and commercial power systems.' },

  // ── NETA ───────────────────────────────────────────────────────────────
  { body: 'neta', code: 'ANSI/NETA ATS', scope: 'Acceptance testing specifications for electrical power equipment and systems.' },
  { body: 'neta', code: 'ANSI/NETA MTS', scope: 'Maintenance testing specifications for electrical power equipment and systems.' },
  { body: 'neta', code: 'ANSI/NETA ECS', scope: 'Commissioning specifications for electrical power equipment and systems.' },

  // ── Uptime Institute ───────────────────────────────────────────────────
  { body: 'uptime', code: 'Uptime Tier', scope: 'Data centre Tier classification, I to IV.' },
  { body: 'uptime', code: 'Uptime TCDD', scope: 'Tier Certification of Design Documents.' },
  { body: 'uptime', code: 'Uptime TCCF', scope: 'Tier Certification of Constructed Facility.' },

  // ── ISO ────────────────────────────────────────────────────────────────
  { body: 'iso', code: 'ISO 9001', scope: 'Quality management systems.' },
  { body: 'iso', code: 'ISO 50001', scope: 'Energy management systems.' },
  { body: 'iso', code: 'ISO 14001', scope: 'Environmental management systems.' },
]

export type Citation = {
  /** The body it belongs to, or 'unknown' when the shape is right but the family is not listed. */
  body: string
  /** Exactly as written in the text. Never normalised — the part and year matter. */
  raw: string
  /** The family it belongs to, if recognised. */
  family: string | null
  /** Scope of that family, if known. Never a requirement. */
  scope: string | null
}

// Patterns, in the order they are tried. Longest and most specific first, so
// "ANSI/NETA ATS-2021" is not swallowed by the bare ANSI pattern.
//
// Each allows an optional part (-100) and an optional year, because on a real
// certificate both are usually present and both matter: IEC 62271-100 and
// IEC 62271-200 are different equipment.
const PATTERNS: { body: string; re: RegExp }[] = [
  { body: 'neta', re: /\bANSI\s*\/\s*NETA\s+(ATS|MTS|ECS)(?:[\s-]*(?:20)?\d{2})?\b/gi },
  { body: 'neta', re: /\bNETA\s+(ATS|MTS|ECS)(?:[\s-]*(?:20)?\d{2})?\b/gi },
  { body: 'uptime', re: /\bUptime\s+Institute\b[^.\n]{0,40}?\bTier\s*(?:I{1,3}V?|IV|[1-4])\b/gi },
  { body: 'uptime', re: /\bTier\s*(?:IV|I{1,3})\b(?=[\s,.)]|$)/g },
  { body: 'uptime', re: /\b(?:TCDD|TCCF)\b/g },
  { body: 'iec', re: /\bIEC\s*\d{5}(?:-\d{1,3})*(?:\s*:\s*(?:19|20)\d{2})?\b/gi },
  { body: 'bsen', re: /\bBS\s*(?:EN\s*)?(?:IEC\s*)?\d{3,5}(?:-\d{1,3})*(?:\s*:\s*(?:19|20)\d{2})?\b/gi },
  { body: 'nfpa', re: /\bNFPA\s*\d{1,3}[A-E]?(?:\s*[-:]\s*(?:19|20)\d{2})?\b/gi },
  { body: 'ansi', re: /\bIEEE\s*(?:C?\d{2,4}(?:\.\d{1,2})*)(?:[-.]\d{1,4})?(?:\s*[-:]\s*(?:19|20)\d{2})?\b/gi },
  { body: 'ansi', re: /\bANSI\s*\/?\s*(?:C\d{2}(?:\.\d{1,2})*)\b/gi },
  { body: 'iso', re: /\bISO\s*\d{4,5}(?:-\d{1,3})?(?:\s*:\s*(?:19|20)\d{2})?\b/gi },
]

/** The family a citation belongs to, by longest matching code. */
function familyFor(raw: string): StandardFamily | null {
  const flat = raw.replace(/\s+/g, ' ').toUpperCase()
  let best: StandardFamily | null = null
  for (const f of KNOWN_FAMILIES) {
    if (flat.startsWith(f.code.toUpperCase()) && (!best || f.code.length > best.code.length)) best = f
  }
  // "Tier III" on its own belongs to the Uptime Tier family without starting
  // with its code.
  if (!best && /^TIER\s*(IV|I{1,3}|[1-4])$/.test(flat)) {
    best = KNOWN_FAMILIES.find((f) => f.code === 'Uptime Tier') ?? null
  }
  return best
}

/**
 * Find every standard cited in a piece of text.
 *
 * Deterministic, free, and instant — no model, no key, no network. Which is
 * also why it is more trustworthy than a model for this particular job: it
 * cannot paraphrase a standard number, and paraphrasing a standard number is
 * how "IEC 62271-100" becomes "IEC 62271-200" in a handover pack.
 *
 * Deduplicated on the exact text, so a certificate that cites the same
 * standard in its header and its results table reports it once.
 */
export function findCitations(text: string): Citation[] {
  if (!text) return []

  const seen = new Set<string>()
  const found: Citation[] = []
  // Spans already claimed by a more specific pattern, so the bare ANSI or IEC
  // rule cannot re-report part of a NETA match.
  const claimed: [number, number][] = []
  const overlaps = (a: number, b: number) => claimed.some(([s, e]) => a < e && b > s)

  for (const { body, re } of PATTERNS) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const start = m.index
      const end = start + m[0].length
      if (overlaps(start, end)) continue
      claimed.push([start, end])

      const raw = m[0].replace(/\s+/g, ' ').trim()
      const key = raw.toUpperCase()
      if (seen.has(key)) continue
      seen.add(key)

      const family = familyFor(raw)
      found.push({
        body: family?.body ?? body,
        raw,
        family: family?.code ?? null,
        scope: family?.scope ?? null,
      })
    }
  }

  return found.sort((a, b) => a.raw.localeCompare(b.raw))
}

/** Group citations by body, for display. */
export function byBody(citations: Citation[]): { body: StandardBody | null; items: Citation[] }[] {
  const groups = new Map<string, Citation[]>()
  for (const c of citations) {
    const list = groups.get(c.body)
    if (list) list.push(c)
    else groups.set(c.body, [c])
  }
  return [...groups.entries()].map(([key, items]) => ({ body: bodyOf(key), items }))
}

/**
 * The sentence printed under any list of citations, without exception.
 *
 * It exists so that nobody reads a standard number on this screen as a
 * statement that the standard was complied with, or that this application
 * knows what it says. Finding a citation is finding a string of characters.
 */
export const CITATION_NOTE =
  'These are standards NAMED in the document. Finding one is not evidence that it was followed, and this application does not hold the content of any standard — no limit, torque, voltage or duration here comes from one. What a clause requires is in the standard itself, which somebody has to read.'
