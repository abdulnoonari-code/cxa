// Obligations.
//
// An obligation is a duty owed by a named party: "the Contractor shall submit
// the ITP fourteen days before work starts", "the Vendor shall attend the
// first energization", "the Client shall provide permanent power by 1 March".
//
// It is not a requirement. A requirement is a technical acceptance criterion
// proved by a test — insulation resistance ≥ 1000 MΩ. An obligation is
// discharged by somebody doing a thing, and the only question that matters is
// **who**. They are kept apart because they close out differently, and mixing
// them turns a technical register into a paperwork register.
//
// Everything here is derived from the record. Nothing is stored twice.

// ── Who owes it ──────────────────────────────────────────────────────────
//
// The parties on a commissioning job, in the order they appear in a contract
// chain. Every one of them is somebody who can be told "clause 7.1 was yours".
export const PARTIES = [
  { value: 'client', label: 'Client / Owner', hint: 'The party the plant is being built for.' },
  { value: 'epc', label: 'EPC / Main Contractor', hint: 'Holds the head contract and answers for the whole works.' },
  { value: 'contractor', label: 'Contractor', hint: 'Carries out the installation work.' },
  { value: 'subcontractor', label: 'Subcontractor', hint: 'Works under a contractor on part of the scope.' },
  { value: 'vendor', label: 'Vendor / Supplier', hint: 'Supplies the plant, and usually its FAT and commissioning support.' },
  { value: 'cx_manager', label: 'Commissioning Manager (CxM)', hint: 'Runs the commissioning programme.' },
  { value: 'cx_authority', label: 'Commissioning Authority (CxA)', hint: 'Independently verifies that the process was followed.' },
  { value: 'operator', label: 'Operator / O&M', hint: 'Takes the plant over and runs it.' },
  { value: 'consultant', label: 'Designer / Consultant', hint: 'Owns the design intent the plant is tested against.' },
  { value: 'authority', label: 'Authority / Utility', hint: 'Grid operator, inspectorate, fire authority — approvals outside the contract.' },
] as const

export type PartyValue = (typeof PARTIES)[number]['value']

export function partyLabel(value: string | null | undefined): string {
  return PARTIES.find((p) => p.value === value)?.label ?? 'Not assigned'
}

export function partyShort(value: string | null | undefined): string {
  switch (value) {
    case 'client':
      return 'Client'
    case 'epc':
      return 'EPC'
    case 'contractor':
      return 'Contractor'
    case 'subcontractor':
      return 'Subcontractor'
    case 'vendor':
      return 'Vendor'
    case 'cx_manager':
      return 'CxM'
    case 'cx_authority':
      return 'CxA'
    case 'operator':
      return 'Operator'
    case 'consultant':
      return 'Designer'
    case 'authority':
      return 'Authority'
    default:
      return 'Unassigned'
  }
}

// ── What kind of duty it is ──────────────────────────────────────────────
export const OBLIGATION_TYPES = [
  { value: 'provide', label: 'Provide', hint: 'Hand something over — a document, a spare, an access, a supply.' },
  { value: 'perform', label: 'Perform', hint: 'Carry out work, a test or an inspection.' },
  { value: 'witness', label: 'Witness / attend', hint: 'Be present at something somebody else does.' },
  { value: 'approve', label: 'Review or approve', hint: 'Make a decision on somebody else’s submission.' },
  { value: 'notify', label: 'Give notice', hint: 'Tell somebody, usually a stated number of days beforehand.' },
  { value: 'maintain', label: 'Maintain / keep', hint: 'Keep a condition true for a period — insurance, calibration, records.' },
  { value: 'comply', label: 'Comply with', hint: 'Meet a standard, a code or a procedure.' },
  { value: 'other', label: 'Other', hint: 'Anything that is none of the above.' },
] as const

export function typeLabel(value: string | null | undefined): string {
  return OBLIGATION_TYPES.find((t) => t.value === value)?.label ?? 'Other'
}

// ── Where it has got to ──────────────────────────────────────────────────
//
// Submitted and accepted are separate, for the same reason a punch item's
// cleared and accepted are separate: one party says it is done, another party
// agrees. Collapsing them lets the party who owes the duty close their own
// obligation.
export const OBLIGATION_STATUSES = [
  { value: 'open', label: 'Open', hint: 'Owed, and nothing has happened yet.' },
  { value: 'in_progress', label: 'In progress', hint: 'Being worked on.' },
  { value: 'submitted', label: 'Submitted', hint: 'The owing party says it is discharged. Nobody has agreed yet.' },
  { value: 'accepted', label: 'Accepted', hint: 'The receiving party has accepted it. This is the only closed state.' },
  { value: 'waived', label: 'Waived', hint: 'Formally given up by the party it was owed to.' },
  { value: 'not_applicable', label: 'Not applicable', hint: 'Does not apply to this project or this scope.' },
] as const

export function statusLabel(value: string | null | undefined): string {
  return OBLIGATION_STATUSES.find((s) => s.value === value)?.label ?? 'Open'
}

const SETTLED = new Set(['accepted', 'waived', 'not_applicable'])

export function isOutstanding(status: string | null | undefined): boolean {
  return !SETTLED.has(status ?? 'open')
}

export function isAwaitingAcceptance(status: string | null | undefined): boolean {
  return status === 'submitted'
}

export function statusBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case 'accepted':
      return 'badge badge-success'
    case 'waived':
    case 'not_applicable':
      return 'badge badge-neutral'
    case 'submitted':
      return 'badge badge-info'
    case 'in_progress':
      return 'badge badge-warning'
    default:
      return 'badge badge-warning'
  }
}

export function partyBadgeClass(party: string | null | undefined): string {
  switch (party) {
    case 'client':
    case 'authority':
      return 'badge badge-info'
    case 'cx_manager':
    case 'cx_authority':
      return 'badge badge-success'
    case 'epc':
    case 'contractor':
    case 'subcontractor':
      return 'badge badge-warning'
    case 'vendor':
    case 'consultant':
    case 'operator':
      return 'badge badge-neutral'
    default:
      return 'badge badge-danger'
  }
}

// ── Reading a clause ─────────────────────────────────────────────────────
//
// This is a rule reader, not a language model. It looks for the two things
// that make a sentence an obligation in a contract: a modal of duty (shall,
// must, is to, is responsible for) and a party to whom it attaches. Where it
// cannot see a party it says so rather than guessing, because an obligation
// filed against the wrong company is worse than one filed against nobody.

const DUTY = /\b(shall|must|is required to|are required to|is to\b|are to\b|is responsible for|are responsible for|undertakes to|agrees to|will be responsible)\b/i

// "shall not", "shall be deemed", "shall mean" — the word is there but the
// sentence is a prohibition, a definition or a piece of legal machinery
// rather than a duty somebody discharges.
const NOT_A_DUTY = /\bshall\s+(?:mean|be deemed|be construed|have the meaning|not be construed|apply|survive|be governed)\b/i

// Order is the whole trick: "commissioning authority" must beat "authority",
// "subcontractor" must beat "contractor", "main contractor" must beat
// "contractor". The first match in this list wins.
//
// None of these require a definite article, because the commonest place a
// party is named is a heading — "7  CONTRACTOR OBLIGATIONS" — and a heading
// does not say "the".
const PARTY_PATTERNS: { party: PartyValue; pattern: RegExp }[] = [
  { party: 'cx_authority', pattern: /\b(commissioning authority|cx\s*a\b|cxa\b|independent commissioning|third[- ]party commissioning)\b/i },
  { party: 'cx_manager', pattern: /\b(commissioning manager|cx\s*m\b|cxm\b|commissioning lead|commissioning team|commissioning engineer)\b/i },
  { party: 'subcontractor', pattern: /\b(sub[- ]?contractors?|specialist contractors?|installers?)\b/i },
  { party: 'epc', pattern: /\b(epc|main contractors?|principal contractors?|general contractors?)\b/i },
  { party: 'contractor', pattern: /\b(contractors?|contractor['’]s)\b/i },
  { party: 'vendor', pattern: /\b(vendors?|suppliers?|manufacturers?|oem)\b/i },
  { party: 'client', pattern: /\b(clients?|owners?|employer|purchaser|developer|beneficiary)\b/i },
  { party: 'authority', pattern: /\b(utility|grid operator|network operator|authority having jurisdiction|ahj|inspectorate|fire authority|regulator)\b/i },
  { party: 'operator', pattern: /\b(operators?|o\s*&\s*m|facilities team|end users?)\b/i },
  { party: 'consultant', pattern: /\b(designers?|design engineer|consultants?|engineer of record|architect)\b/i },
]

// Verbs, in every form a specification writes them — "provide", "providing"
// and "provides" are the same duty, and matching only the bare stem files a
// third of a real document as "other".
const TYPE_PATTERNS: { type: string; pattern: RegExp }[] = [
  { type: 'notify', pattern: /\b(notif(?:y|ies|ication)|notice|inform(?:s|ing)?|advise[sd]?|give notice|prior notification)\b/i },
  { type: 'witness', pattern: /\b(witness(?:es|ing|ed)?|attend(?:s|ing)?|be present|observe)\b/i },
  { type: 'approve', pattern: /\b(approv(?:e|es|ing|al)|review and (?:accept|comment)|accept(?:ance)? of|endorse|sign[- ]off)\b/i },
  { type: 'provide', pattern: /\b(provid(?:e|es|ing)|submit(?:s|ting)?|suppl(?:y|ies|ying)|issu(?:e|es|ing)|deliver(?:s|ing)?|furnish(?:es|ing)?|hand over|make available|upload|report to)\b/i },
  { type: 'perform', pattern: /\b(carry out|carries out|perform(?:s|ing)?|execut(?:e|es|ing)|conduct(?:s|ing)?|undertak(?:e|es|ing)|test(?:s|ed|ing)?(?!\s+(?:instrument|equipment|set|kit|gear))|inspect(?:s|ing)?|commission(?:s|ing)?|install(?:s|ing)?|demonstrat(?:e|es|ing)|record(?:s|ing)?|verif(?:y|ies|ication)|validat(?:e|es|ing)|log(?:s|ging)?)\b/i },
  { type: 'maintain', pattern: /\b(maintain(?:s|ed|ing)?|keep(?:s|ing)?|kept|retain(?:s|ed|ing)?|preserv(?:e|es|ed|ing)|calibrat)\b/i },
  { type: 'comply', pattern: /\b(compl(?:y|ies) with|in accordance with|conform(?:s|ing)? to|meet the requirements of|as per)\b/i },
]

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90,
}

/** The number of days' notice a clause demands, when it names one. */
export function noticeDaysIn(text: string): number | null {
  // Contracts write a period as "fourteen (14) days" — the word and the
  // numeral together, because that is how you stop an argument about a typo.
  // Reading only for a bare numeral misses every one of them, so the
  // parenthesised form is unwrapped before anything else is tried.
  const flat = text.replace(/\b[a-z]+\s*\((\d{1,3})\)/gi, ' $1 ').replace(/\((\d{1,3})\)/g, ' $1 ')

  const digits = flat.match(
    /\b(\d{1,3})\s*(?:working\s+|business\s+|calendar\s+)?days?['’]?\s*(?:prior|notice|before|in advance|ahead|of)/i
  )
  if (digits) return Number(digits[1])

  const bounded = flat.match(
    /\b(?:not less than|no less than|at least|minimum(?: of)?|within)\s+(\d{1,3})\s*(?:working\s+|business\s+|calendar\s+)?days?\b/i
  )
  if (bounded) return Number(bounded[1])

  // Spelled out with no numeral beside it.
  const words = flat.match(
    /\b([a-z]+)\s+(?:working\s+|business\s+|calendar\s+)?days?['’]?\s*(?:prior|notice|before|in advance|ahead)/i
  )
  const spelled = words ? NUMBER_WORDS[words[1].toLowerCase()] : undefined
  return spelled ?? null
}

export function partyIn(text: string): PartyValue | null {
  for (const { party, pattern } of PARTY_PATTERNS) {
    if (pattern.test(text)) return party
  }
  return null
}

export function typeIn(text: string): string {
  for (const { type, pattern } of TYPE_PATTERNS) {
    if (pattern.test(text)) return type
  }
  return 'other'
}

export type Candidate = {
  clause: string | null
  page: number | null
  statement: string
  party: PartyValue | null
  obligation_type: string
  noticeDays: number | null
  /** the heading the clause sits under, so a bare "shall" sentence has context */
  context: string | null
}

/**
 * Read a document's paragraphs and pull out the sentences that place a duty
 * on somebody.
 *
 * Conservative on purpose. It is better to miss a clause the engineer then
 * adds by hand than to fill a register with two hundred rows of legal
 * boilerplate that he has to delete one at a time — the second is how a tool
 * like this gets abandoned in week one.
 */
export function readObligations(
  paragraphs: { index: number; clause: string | null; text: string; heading: boolean; page: number | null }[]
): Candidate[] {
  const found: Candidate[] = []
  let heading: string | null = null

  for (const para of paragraphs) {
    if (para.heading) {
      heading = para.text
      continue
    }
    if (!DUTY.test(para.text)) continue
    if (NOT_A_DUTY.test(para.text)) continue
    // Fragments are almost always a table cell or a broken line, not a duty.
    if (para.text.length < 25) continue

    found.push({
      clause: para.clause,
      page: para.page,
      statement: para.text,
      // The party may be named in the clause itself or in the heading above it
      // — "7  CONTRACTOR'S OBLIGATIONS" followed by "shall submit…" is the
      // commonest shape there is.
      party: partyIn(para.text) ?? (heading ? partyIn(heading) : null),
      obligation_type: typeIn(para.text),
      noticeDays: noticeDaysIn(para.text),
      context: heading,
    })
  }

  return found
}

// ── The register, added up ───────────────────────────────────────────────

export type ObligationLike = {
  status: string | null
  party: string | null
  due_date: string | null
}

export type ObligationSummary = {
  total: number
  outstanding: number
  awaitingAcceptance: number
  accepted: number
  overdue: number
  unassigned: number
  byParty: { party: string; label: string; total: number; outstanding: number; overdue: number }[]
}

const DAY = 24 * 60 * 60 * 1000

function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
}

export function daysOverdue(item: ObligationLike, today: Date = new Date()): number | null {
  if (!isOutstanding(item.status)) return null
  if (!item.due_date) return null
  const late = Math.round((startOfDay(today) - startOfDay(new Date(item.due_date))) / DAY)
  return late > 0 ? late : null
}

export function summarise(items: ObligationLike[], today: Date = new Date()): ObligationSummary {
  const byParty = new Map<string, { party: string; label: string; total: number; outstanding: number; overdue: number }>()
  const summary: ObligationSummary = {
    total: items.length,
    outstanding: 0,
    awaitingAcceptance: 0,
    accepted: 0,
    overdue: 0,
    unassigned: 0,
    byParty: [],
  }

  for (const item of items) {
    const key = item.party ?? 'unassigned'
    const bucket = byParty.get(key) ?? {
      party: key,
      label: item.party ? partyLabel(item.party) : 'Not assigned to anybody',
      total: 0,
      outstanding: 0,
      overdue: 0,
    }
    bucket.total += 1

    if (isOutstanding(item.status)) {
      summary.outstanding += 1
      bucket.outstanding += 1
      if (!item.party) summary.unassigned += 1
      if (isAwaitingAcceptance(item.status)) summary.awaitingAcceptance += 1
      if (daysOverdue(item, today) !== null) {
        summary.overdue += 1
        bucket.overdue += 1
      }
    } else if (item.status === 'accepted') {
      summary.accepted += 1
    }

    byParty.set(key, bucket)
  }

  summary.byParty = [...byParty.values()].sort((a, b) => b.outstanding - a.outstanding || b.total - a.total)
  return summary
}

export type ObligationVerdict = { label: string; tone: 'danger' | 'warning' | 'neutral' | 'success'; detail: string }

/**
 * The one-line reading. Like every other verdict in CxSentinel it refuses to
 * authorise: a clean obligation register means nobody currently owes anything
 * that is recorded here, not that the contract has been performed.
 */
export function verdict(summary: ObligationSummary): ObligationVerdict {
  if (summary.total === 0) {
    return {
      label: 'NOTHING RECORDED',
      tone: 'neutral',
      detail:
        'No obligations on record. That does not mean nobody owes anything — it means no contract or specification has been read into CxSentinel yet.',
    }
  }
  // A register can be both late and half-assigned, and reporting only the
  // higher-ranked of the two loses the other. The label takes the more urgent
  // problem; the detail says both.
  const unassignedNote =
    summary.unassigned > 0
      ? ` ${summary.unassigned} outstanding obligation${
          summary.unassigned === 1 ? ' has' : 's have'
        } no party against them — an obligation nobody owns is one nobody will discharge.`
      : ''

  if (summary.overdue > 0) {
    return {
      label: 'OVERDUE',
      tone: 'danger',
      detail: `${summary.overdue} obligation${summary.overdue === 1 ? ' is' : 's are'} past an agreed date.${unassignedNote}`,
    }
  }
  if (summary.unassigned > 0) {
    return {
      label: 'NOT ALL ASSIGNED',
      tone: 'warning',
      detail: unassignedNote.trim(),
    }
  }
  if (summary.outstanding > 0) {
    return {
      label: 'OUTSTANDING',
      tone: 'neutral',
      detail: `${summary.outstanding} obligation${summary.outstanding === 1 ? '' : 's'} still owed, none of them late.`,
    }
  }
  return {
    label: 'ALL DISCHARGED',
    tone: 'success',
    detail: `All ${summary.total} recorded obligations are accepted, waived or not applicable. That is a statement about this register, not about the contract.`,
  }
}

export function verdictBadgeClass(tone: ObligationVerdict['tone']): string {
  switch (tone) {
    case 'danger':
      return 'badge badge-danger'
    case 'warning':
      return 'badge badge-warning'
    case 'success':
      return 'badge badge-success'
    default:
      return 'badge badge-neutral'
  }
}

// ── References ───────────────────────────────────────────────────────────

const REF_PATTERN = /^OBL-(\d+)$/i

/** The next reference. Reads the highest issued, so a deleted one never comes back. */
export function nextRef(existing: (string | null)[]): string {
  let highest = 0
  for (const ref of existing) {
    const match = (ref ?? '').trim().match(REF_PATTERN)
    if (!match) continue
    const n = Number(match[1])
    if (Number.isFinite(n) && n > highest) highest = n
  }
  return `OBL-${String(highest + 1).padStart(4, '0')}`
}

export function refSeries(existing: (string | null)[], count: number): string[] {
  const start = Number(nextRef(existing).slice(4))
  return Array.from({ length: count }, (_, i) => `OBL-${String(start + i).padStart(4, '0')}`)
}
