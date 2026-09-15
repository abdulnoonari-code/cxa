// What an import did, in words, on the screen of the person who ran it.
//
// ── The defect this closes ───────────────────────────────────────────────
//
// The equipment import wrote a rich, accurate record of everything it did —
// into the audit log. It wrote nothing to the screen. On success it refreshed
// the page and returned; on a parse error it recorded the error and returned.
// Both look identical from the chair: the page redraws, the counts are the
// same as before, and no message appears.
//
// So somebody exports 1,800 tags, corrects them, uploads the file, and the
// EPC's sheet legitimately repeats TX-01 on two rows. Nothing is written.
// Nothing is said. They carry on believing the register is loaded, and find
// out three weeks later when a checklist has nowhere to attach itself.
//
// "No message" was the normal outcome of a successful import, so "no message"
// carried no information at all. That is the whole bug: not that the failure
// was unreported, but that success and failure were reported the same way.
//
// ── Why a cookie and not the URL ─────────────────────────────────────────
//
// The same reasoning as the project configuration screen. A result in the
// address bar survives a bookmark, a share and a history entry — somebody
// opens /equipment tomorrow from their history and is told 1,284 tags were
// just imported. This is a message about something that happened one second
// ago, and it should live about that long.
//
// The cookie is short-lived and this module never touches it. Encoding and
// decoding are here; setting and reading are the caller's job, because a
// 'use server' file may export only async functions and a page may not write
// cookies at all.

export const IMPORT_COOKIE = 'cx_import'

/** How long the banner survives. Long enough to redirect, not long enough to bookmark. */
export const IMPORT_COOKIE_SECONDS = 30

/**
 * A cookie has about 4 kB and browsers drop the whole thing if it is bigger.
 * A silently dropped cookie would put this module straight back where it
 * started — an import that says nothing — so everything below is capped, and
 * `encodeOutcome` checks the result and sheds detail until it fits.
 */
const MAX_COOKIE_BYTES = 3400
const MAX_PROBLEMS = 8
const MAX_PROBLEM_CHARS = 240
const MAX_FILE_CHARS = 80

export type ImportKind =
  /** Rows were written. There may still be problems worth saying. */
  | 'done'
  /** Nothing was written, on purpose, because the file had errors in it. */
  | 'refused'
  /** The file was opened and no tag column was found in it. */
  | 'unreadable'
  /** The file was read and had no rows. */
  | 'empty'

export type ImportOutcome = {
  kind: ImportKind
  /** The file the person chose, so the message names the thing they clicked. */
  file: string
  added?: number
  updated?: number
  removed?: number
  /** "3 systems", "12 components" — things created alongside the tags. */
  extra?: string[]
  /** Whole sentences, already written for a person. Not error codes. */
  problems?: string[]
  /** Columns that were in the file and could not be stored, and what to run. */
  ignored?: string[]
}

const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…')

const clean = (list: string[] | undefined, max: number): string[] | undefined => {
  if (!list || list.length === 0) return undefined
  return list.slice(0, max).map((s) => clip(String(s).replace(/\s+/g, ' ').trim(), MAX_PROBLEM_CHARS))
}

/**
 * The outcome as a cookie value.
 *
 * Sheds detail rather than overflowing: problems first, because there can be
 * hundreds of them, then the extras. The counts and the file name are never
 * dropped — they are the sentence, and a banner that has lost its sentence is
 * worse than no banner.
 */
export function encodeOutcome(o: ImportOutcome): string {
  const base: ImportOutcome = {
    kind: o.kind,
    file: clip(String(o.file ?? '').replace(/\s+/g, ' ').trim() || 'the file', MAX_FILE_CHARS),
    ...(typeof o.added === 'number' ? { added: o.added } : {}),
    ...(typeof o.updated === 'number' ? { updated: o.updated } : {}),
    ...(typeof o.removed === 'number' ? { removed: o.removed } : {}),
  }

  const extra = clean(o.extra, 8)
  let problems = clean(o.problems, MAX_PROBLEMS)
  const ignored = clean(o.ignored, 4)

  const build = (p: string[] | undefined) =>
    encodeURIComponent(
      JSON.stringify({
        ...base,
        ...(extra ? { extra } : {}),
        ...(p ? { problems: p } : {}),
        ...(ignored ? { ignored } : {}),
      })
    )

  let out = build(problems)
  while (out.length > MAX_COOKIE_BYTES && problems && problems.length > 1) {
    problems = problems.slice(0, problems.length - 1)
    out = build(problems)
  }
  // Still too big with one problem left: drop the problems entirely rather
  // than lose the cookie. The audit trail still has all of them, and the
  // banner says so.
  if (out.length > MAX_COOKIE_BYTES) out = build(undefined)
  return out
}

export function decodeOutcome(raw: string | null | undefined): ImportOutcome | null {
  if (!raw) return null
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as unknown
    if (!v || typeof v !== 'object') return null
    const o = v as Record<string, unknown>
    const kind = o.kind
    if (kind !== 'done' && kind !== 'refused' && kind !== 'unreadable' && kind !== 'empty') return null

    const num = (x: unknown) => (typeof x === 'number' && isFinite(x) && x >= 0 ? Math.floor(x) : undefined)
    // `undefined` when nothing survives the filter, not `[]`. An empty array
    // is a list that exists and has no items in it, and callers ask
    // `problems?.length` to decide whether anything went wrong — an empty
    // list would be a claim that the question was asked and answered "none",
    // when in fact every entry was unreadable.
    const list = (x: unknown) => {
      if (!Array.isArray(x)) return undefined
      const kept = x.filter((s) => typeof s === 'string' && s !== '')
      return kept.length > 0 ? kept : undefined
    }

    return {
      kind,
      file: typeof o.file === 'string' && o.file !== '' ? o.file : 'the file',
      added: num(o.added),
      updated: num(o.updated),
      removed: num(o.removed),
      extra: list(o.extra) as string[] | undefined,
      problems: list(o.problems) as string[] | undefined,
      ignored: list(o.ignored) as string[] | undefined,
    }
  } catch {
    // A cookie somebody has edited by hand, or one truncated in transit. No
    // banner is the right answer; a crash on the equipment register is not.
    return null
  }
}

const plural = (n: number, one: string, many = one + 's') => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`

/**
 * The headline. One sentence, naming the file, saying what happened to the
 * database — and when the answer is "nothing", saying that first.
 */
export function summaryLine(o: ImportOutcome): string {
  if (o.kind === 'unreadable')
    return `Nothing was imported — no tag column was found in ${o.file}.`
  if (o.kind === 'empty')
    return `Nothing was imported — ${o.file} had no rows in it.`
  if (o.kind === 'refused')
    return `Nothing was imported. ${o.file} was read and refused, and the register is exactly as it was.`

  const parts: string[] = []
  if (o.added) parts.push(`${plural(o.added, 'tag')} added`)
  if (o.updated) parts.push(`${plural(o.updated, 'tag')} updated`)
  if (o.removed) parts.push(`${plural(o.removed, 'tag')} removed`)
  if (o.extra?.length) parts.push(...o.extra)

  // A file that parsed cleanly and changed nothing. Worth saying out loud:
  // it usually means the file was already imported, and silence here is the
  // exact silence this module exists to remove.
  if (parts.length === 0) return `${o.file} was read and every row already matched. Nothing changed.`

  const last = parts.pop() as string
  const list = parts.length > 0 ? `${parts.join(', ')} and ${last}` : last
  return `Imported ${o.file} — ${list}.`
}

/** Green when it worked and there is nothing to say. Never green otherwise. */
export function toneOf(o: ImportOutcome): 'success' | 'warning' | 'danger' {
  if (o.kind !== 'done') return 'danger'
  if ((o.problems?.length ?? 0) > 0 || (o.ignored?.length ?? 0) > 0) return 'warning'
  return 'success'
}

export function alertClass(o: ImportOutcome): string {
  return `alert alert-${toneOf(o)}`
}

/** Everything under the headline, in the order a person needs it. */
export function detailLines(o: ImportOutcome): string[] {
  return [...(o.ignored ?? []), ...(o.problems ?? [])]
}

/**
 * True when there is more to see than fits in the banner — the caller points
 * at the audit trail, which has all of it.
 */
export function hasMore(o: ImportOutcome, reportedProblems: number): boolean {
  return reportedProblems > (o.problems?.length ?? 0)
}
