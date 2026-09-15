// What must be done about a defect — and who says so.
//
// ── The one rule this file exists to enforce ────────────────────────────
//
// There are two kinds of sentence that can appear under "what must be done",
// and they must never be printed as though they were the same thing:
//
//   AGREED    Somebody with a name wrote it, on a date. It is an instruction.
//             A contractor can be asked to do it and held to it.
//
//   SUGGESTED A language model looked at a photograph and produced a sentence.
//             It is a prompt to go and look. Nobody has agreed it, nobody has
//             priced it, and it may be wrong about a machine it has never
//             seen.
//
// A defect report that blurs those two is not a slightly worse document. It
// is a document that issues a machine's guess to a contractor over a
// commissioning engineer's name — and the first time one of those guesses is
// wrong about a 115 kV disconnector, the argument is not about the wording.
//
// So `remedyFor` never returns a bare string. It returns the text AND the
// provenance sentence that has to be printed with it, and the callers — the
// PDF, the Word file, the phone screen — print both or neither.
//
// ── Why the AI text is carried at all ──────────────────────────────────
//
// Because leaving it out is its own kind of dishonesty. Somebody stood in
// front of a panel, photographed a defect, and the application told them on
// screen what it thought should happen. Producing a report that silently
// omits that, while the screen still shows it, means two versions of the
// same item disagree depending on where you look. Carry it, label it, and
// let the reader discount it.

export type RemedyState = 'agreed' | 'suggested' | 'none'

export type RemedyLike = {
  required_action?: string | null
  action_set_by?: string | null
  action_set_at?: string | null
  ai_recommendation?: string | null
  ai_model?: string | null
}

export type Remedy = {
  state: RemedyState
  /** The words themselves. Empty when nothing is on record. */
  text: string
  /**
   * The line that must be printed under the words. Never empty — the state
   * with nothing to say has the most important sentence of the three.
   */
  provenance: string
  /** For a screen that wants to colour it. */
  tone: 'ok' | 'warning' | 'neutral'
}

function trimmed(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * A date as a document should print it — 14 Sep 2026, never 2026-09-14T…
 *
 * Returns '' for anything unparseable rather than "Invalid Date", which is
 * the string that ends up in a client's inbox otherwise.
 */
export function onDate(value: string | null | undefined): string {
  const raw = trimmed(value)
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function remedyFor(row: RemedyLike): Remedy {
  const agreed = trimmed(row.required_action)

  if (agreed) {
    const by = trimmed(row.action_set_by)
    const at = onDate(row.action_set_at)
    const who = by && at ? `recorded by ${by} on ${at}` : by ? `recorded by ${by}` : at ? `recorded on ${at}` : 'recorded in CxSentinel'
    return {
      state: 'agreed',
      text: agreed,
      provenance: `Agreed action, ${who}.`,
      tone: 'ok',
    }
  }

  const suggested = trimmed(row.ai_recommendation)
  if (suggested) {
    const model = trimmed(row.ai_model)
    return {
      state: 'suggested',
      text: suggested,
      // Said in full every single time, on every item, however long the
      // document gets. A caveat printed once at the front of a forty-page
      // report is a caveat nobody reads beside the item it applies to.
      provenance: `Suggested by an AI reading of this item${model ? ` (${model})` : ''} — a suggestion, not an instruction. Nobody has agreed it and nothing has been priced against it.`,
      tone: 'warning',
    }
  }

  return {
    state: 'none',
    text: '',
    provenance: 'No action has been agreed. This item says what is wrong and not what to do about it.',
    tone: 'neutral',
  }
}

/** Where a document's own summary line gets its numbers. */
export type ActionCoverage = {
  total: number
  agreed: number
  suggested: number
  none: number
}

export function actionCoverage(rows: RemedyLike[]): ActionCoverage {
  const out: ActionCoverage = { total: rows.length, agreed: 0, suggested: 0, none: 0 }
  for (const r of rows) {
    const state = remedyFor(r).state
    if (state === 'agreed') out.agreed++
    else if (state === 'suggested') out.suggested++
    else out.none++
  }
  return out
}

/**
 * The sentence at the top of a defect report about its own completeness.
 *
 * It says the awkward number first. A report issued to a contractor where
 * thirty of forty items carry no agreed remedy is a report that will come
 * back as thirty questions, and the person pressing the button should read
 * that before they send it, not after.
 */
export function coverageLine(c: ActionCoverage): string {
  if (c.total === 0) return 'There are no items in this report.'

  const items = (n: number) => `${n} item${n === 1 ? '' : 's'}`

  if (c.agreed === c.total) {
    return `Every one of the ${items(c.total)} in this report carries an agreed action.`
  }
  if (c.agreed === 0 && c.suggested === 0) {
    return `None of the ${items(c.total)} in this report carries an agreed action — each one says what is wrong and not what to do about it.`
  }

  const parts = [`${c.agreed} of ${items(c.total)} carr${c.agreed === 1 ? 'ies' : 'y'} an agreed action`]
  if (c.suggested > 0) parts.push(`${c.suggested} carr${c.suggested === 1 ? 'ies' : 'y'} only an AI suggestion, which nobody has agreed`)
  if (c.none > 0) parts.push(`${c.none} say${c.none === 1 ? 's' : ''} nothing about what to do`)
  return parts.join('; ') + '.'
}

// ── The order somebody actually works in ────────────────────────────────
//
// Not by punch number, and not by date raised. A person standing on a site
// with a phone wants the thing that stops the job at the top, and the
// observation about a label being crooked at the bottom.
//
// The sort is stable and total — every comparison ends in a tie-break on the
// reference — so the same list is the same order every time it is drawn. A
// list that reshuffles between two page loads is a list somebody loses their
// place in.

export type WorkOrderLike = {
  ref?: string | null
  category?: string | null
  severity?: string | null
  status?: string | null
  due_date?: string | null
  created_at?: string | null
}

const CATEGORY_RANK: Record<string, number> = { A: 0, B: 1, C: 2 }
const SEVERITY_RANK: Record<string, number> = { critical: 0, major: 1, minor: 2, observation: 3 }
const SETTLED = new Set(['verified', 'closed'])

/** Lower is more urgent. Exported so an assertion can pin the reasons apart. */
export function urgencyRank(row: WorkOrderLike, today: Date = new Date()): number[] {
  const settled = SETTLED.has(trimmed(row.status)) ? 1 : 0
  // Uncategorised sits between A and B, NOT below C — because it might be an
  // A and nobody has looked. Burying an unassessed defect at the bottom of the
  // list is how it stays unassessed until the week of energisation.
  //
  // (This was 1.5 when it was written, which is between B and C, and the
  // comment beside it claimed the opposite. The assertion caught the code, not
  // the comment.)
  const category = CATEGORY_RANK[trimmed(row.category)] ?? 0.5
  const overdue = (() => {
    const due = trimmed(row.due_date)
    if (!due) return 1
    const d = new Date(due)
    if (Number.isNaN(d.getTime())) return 1
    return d.getTime() < today.getTime() ? 0 : 1
  })()
  const severity = SEVERITY_RANK[trimmed(row.severity)] ?? 2.5
  return [settled, category, overdue, severity]
}

export function workOrder<T extends WorkOrderLike>(rows: T[], today: Date = new Date()): T[] {
  return [...rows].sort((a, b) => {
    const ra = urgencyRank(a, today)
    const rb = urgencyRank(b, today)
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] !== rb[i]) return ra[i] - rb[i]
    }
    // Newest first among equals — the thing just raised is the thing being
    // looked at. Then the reference, so the order never depends on the order
    // the database happened to return.
    const ca = trimmed(a.created_at)
    const cb = trimmed(b.created_at)
    if (ca !== cb) return cb.localeCompare(ca)
    return trimmed(a.ref).localeCompare(trimmed(b.ref))
  })
}
