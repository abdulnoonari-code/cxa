// What a check is connected to, worked out at the moment it is shown.
//
// The import stores the Links to cell exactly as it was typed. This turns
// that text into something the screen can use — and, more importantly, into
// two findings that no single record can produce on its own.
//
// ── Why the text is resolved here and not at import ─────────────────────
//
// Because the answer changes. Line 12 passes on Tuesday and fails on
// Thursday; a requirement is added the week after the script was imported;
// an asset is renamed. A link resolved once at import would be a photograph
// of what was true that morning, kept on screen for months. Resolved on
// every read, it is either right or it says it cannot tell.
//
// ── The finding this file exists for ────────────────────────────────────
//
// A check that PASSED while the line it depends on has FAILED. Both records
// are individually fine. Line 34 failed — that is honest. Line 40 passed —
// somebody did the work and it was good. Nothing in either row is wrong, and
// no screen that shows one check at a time can ever show the problem: the
// thing line 40 was standing on gave way, and line 40 still reads complete.
//
// That is the shape of almost every commissioning record that turns out to
// be worthless at handover. Nothing was falsified. The pieces just stopped
// agreeing with each other and nobody was looking at both.

import { parseLinks, type LinkKind } from '@/lib/script-io'

export type LinkTarget = {
  label: string
  href: string | null
  /** For a link to another check, what that check's status is now. */
  status?: string | null
}

/** Everything a link might resolve against, keyed by what gets typed. */
export type LinkContext = {
  /** Checks on the same script sheet, by their serial number. */
  siblings: Map<string, LinkTarget>
  /** Tags and systems, by code, lower-cased. */
  subjects: Map<string, LinkTarget>
  /** Requirements and obligations, by reference, lower-cased. */
  records: Map<string, LinkTarget>
}

export const EMPTY_CONTEXT: LinkContext = {
  siblings: new Map(),
  subjects: new Map(),
  records: new Map(),
}

export type ResolvedLink = {
  raw: string
  kind: LinkKind
  label: string
  href: string | null
  /**
   * ok         — found, and nothing to say about it
   * warning    — found, and what it points at is not in a state this check
   *              can stand on
   * missing    — it should have been findable and was not
   * unverified — nothing here can check it, and it is kept as written
   */
  state: 'ok' | 'warning' | 'missing' | 'unverified'
  note: string | null
}

const DONE = new Set(['pass', 'na'])

export function resolveLinks(raw: string | null | undefined, ctx: LinkContext): ResolvedLink[] {
  if (!raw) return []

  return parseLinks(raw).map((link): ResolvedLink => {
    if (link.kind === 'line') {
      const target = ctx.siblings.get(link.serial ?? '')
      if (!target) {
        return {
          raw: link.raw,
          kind: link.kind,
          label: `Line ${link.serial}`,
          href: null,
          state: 'missing',
          note: 'That line is not on this script any more. It may have been deleted.',
        }
      }
      const status = target.status ?? 'pending'
      return {
        raw: link.raw,
        kind: link.kind,
        label: `${link.serial}. ${target.label}`,
        href: target.href,
        state: status === 'fail' ? 'warning' : DONE.has(status) ? 'ok' : 'warning',
        note:
          status === 'fail'
            ? 'This has failed.'
            : DONE.has(status)
              ? null
              : 'This has not been done yet.',
      }
    }

    if (link.kind === 'subject') {
      const target = ctx.subjects.get(link.raw.trim().toLowerCase())
      if (target) return { raw: link.raw, kind: link.kind, label: target.label, href: target.href, state: 'ok', note: null }
      // Not a tag. A drawing number looks exactly like one, so this is not a
      // fault — it is the commonest thing in the column.
      return {
        raw: link.raw,
        kind: 'reference',
        label: link.raw,
        href: null,
        state: 'unverified',
        note: 'Not a tag on this project — kept as written.',
      }
    }

    if (link.kind === 'requirement' || link.kind === 'obligation') {
      const target = ctx.records.get(link.raw.trim().toLowerCase())
      if (target) return { raw: link.raw, kind: link.kind, label: target.label, href: target.href, state: 'ok', note: null }
      return {
        raw: link.raw,
        kind: link.kind,
        label: link.raw,
        href: null,
        state: 'missing',
        note: 'There is no record with that reference on this project.',
      }
    }

    return {
      raw: link.raw,
      kind: 'reference',
      label: link.raw,
      href: null,
      state: 'unverified',
      note: null,
    }
  })
}

// ── The findings ─────────────────────────────────────────────────────────

export type CheckLinkInput = {
  id: string
  /** From source_ref — the sheet the check was imported from. */
  sheet: string | null
  serial: string | null
  item: string | null
  status: string | null
  links: string | null
  /** What the Attachment column said. */
  evidenceRef: string | null
  /** How many files are actually attached to this check. */
  attachments: number
}

/** `SCRIPT:Test Script:84` → `Test Script`. Null for a check typed in by hand. */
export function sheetOf(sourceRef: string | null | undefined): string | null {
  if (!sourceRef) return null
  const parts = sourceRef.split(':')
  return parts.length >= 3 ? parts.slice(1, -1).join(':') : null
}

export type CheckFinding = {
  rule: string
  level: 'blocking' | 'warning' | 'note'
  title: string
  detail: string
  count: number
  examples: string[]
}

function label(c: CheckLinkInput): string {
  const n = c.serial ? `${c.serial}. ` : ''
  return `${n}${(c.item ?? '').slice(0, 60)}`
}

/**
 * What the links say that no single check can.
 *
 * Deliberately narrow. Only two things are reported, both of them facts about
 * a pair of records rather than opinions about either one.
 */
export function checkLinkFindings(checks: CheckLinkInput[]): CheckFinding[] {
  const out: CheckFinding[] = []

  // Index every check by sheet and serial, so a link can be followed.
  const bySheet = new Map<string, Map<string, CheckLinkInput>>()
  for (const c of checks) {
    if (!c.sheet || !c.serial) continue
    const m = bySheet.get(c.sheet) ?? new Map<string, CheckLinkInput>()
    m.set(c.serial, c)
    bySheet.set(c.sheet, m)
  }

  const standingOnFailure: string[] = []
  const standingOnUndone: string[] = []

  for (const c of checks) {
    if (!DONE.has(c.status ?? 'pending')) continue // only a check claiming to be done can be standing on anything
    if (!c.links || !c.sheet) continue

    for (const link of parseLinks(c.links)) {
      if (link.kind !== 'line') continue
      const target = bySheet.get(c.sheet)?.get(link.serial ?? '')
      if (!target) continue
      const status = target.status ?? 'pending'
      if (status === 'fail') standingOnFailure.push(`${label(c)} — depends on ${link.serial}, which failed`)
      else if (!DONE.has(status)) standingOnUndone.push(`${label(c)} — depends on ${link.serial}, not done`)
    }
  }

  if (standingOnFailure.length > 0) {
    out.push({
      rule: 'check/passed-while-what-it-depends-on-failed',
      level: 'blocking',
      title: 'Checks marked done that depend on a line that failed',
      detail:
        'Both records are individually fine — one failed honestly, the other passed honestly. Together they do not hold: the thing this check was standing on gave way, and this check still reads complete. No screen showing one check at a time can see it.',
      count: standingOnFailure.length,
      examples: standingOnFailure.slice(0, 5),
    })
  }

  if (standingOnUndone.length > 0) {
    out.push({
      rule: 'check/passed-before-what-it-depends-on',
      level: 'warning',
      title: 'Checks marked done before the line they depend on was done',
      detail:
        'The script says this check comes after another one, and the other one has not been carried out. That can be a deliberate change of order on the day — this is here so it is one, rather than something nobody noticed.',
      count: standingOnUndone.length,
      examples: standingOnUndone.slice(0, 5),
    })
  }

  // ── Evidence named but never uploaded ────────────────────────────────
  const promised = checks.filter((c) => (c.evidenceRef ?? '').trim() !== '' && c.attachments === 0)
  if (promised.length > 0) {
    out.push({
      rule: 'check/evidence-named-but-not-attached',
      level: 'warning',
      title: 'Checks that name their evidence but have no file attached',
      detail:
        'The Attachment column says what proves these — a photograph, a report, a certificate — and nothing has been uploaded against them. The sheet is a claim about evidence, not the evidence, and at handover only one of those is worth anything.',
      count: promised.length,
      examples: promised.map((c) => `${label(c)} — "${(c.evidenceRef ?? '').slice(0, 40)}"`).slice(0, 5),
    })
  }

  return out
}
