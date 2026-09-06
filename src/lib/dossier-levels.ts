// The two-scope picture, and the rule findings, as pages of the handover pack.
//
// Everything built in updates 56 to 58 lives on screens. A screen is read by
// the person doing the work; a handover pack is read by the person accepting
// it, months later, usually with a contract open. If the distinction between
// a device and an assembly only exists on screen, the pack goes on printing
// one completion figure over both — and that figure is the most misleading
// number this product can produce.
//
// ── Why the findings are IN the pack ────────────────────────────────────
//
// Because a pack that hides what is missing gets found out, and one that
// names it gets negotiated. That principle is already written at the top of
// report.ts, for the gaps the dossier has always known about. The free rule
// checks find a different and sharper class of thing — a check passed while
// the line it depends on failed, a defect closed with no photograph — and
// leaving those out of the document while showing them on a screen would be
// the pack quietly disagreeing with the application that produced it.

import type { ReportTable } from '@/lib/docgen'
import { TAG_LEVELS, SYSTEM_LEVELS, pct, type Cell, type SystemPicture } from '@/lib/scope'
import { levelCode } from '@/lib/levels'

function cellText(c: Cell): string {
  if (c.total === 0) return '—'
  const p = pct(c)
  return `${p}%  ${c.done}/${c.total}${c.failed > 0 ? `  (${c.failed} failed)` : ''}`
}

/**
 * One row per device, three columns.
 *
 * A dash rather than "0%" for a level with nothing recorded. Zero percent is a
 * statement about work that exists and has not been done; a dash is the
 * absence of any work at all, and in a document somebody signs those must not
 * look the same. The note under the table says so in words, because a dash on
 * its own is a symbol and symbols get read past.
 */
export function deviceLevelTable(picture: SystemPicture): ReportTable {
  const rows: (string | number | null)[][] = picture.tags.map((t) => [
    t.code,
    ...TAG_LEVELS.map((l) => cellText(t.cells[l])),
    t.offScope.total > 0 ? `${t.offScope.total} system-level` : '—',
  ])

  rows.push(['All devices', ...TAG_LEVELS.map((l) => cellText(picture.tagTotals[l])), ''])

  return {
    title: 'Device-level work — L1 to L3, per tag',
    columns: ['Tag', ...TAG_LEVELS.map((l) => levelCode(l)), 'Recorded off scope'],
    widths: [2.2, 1.4, 1.4, 1.4, 1.4],
    rows,
    // The total row, and any row carrying a failure.
    emphasise: new Set(
      picture.tags
        .map((t, i) => (TAG_LEVELS.some((l) => t.cells[l].failed > 0) ? i : -1))
        .filter((i) => i >= 0)
    ),
  }
}

/** The assembly's own testing, kept on its own so it is never added to the above. */
export function systemLevelTable(picture: SystemPicture): ReportTable {
  return {
    title: 'System-level work — L4 and L5, on the assembly itself',
    columns: ['Level', 'What it proves', 'State'],
    widths: [1, 3.4, 1.6],
    rows: [
      [
        levelCode('L4_fpt'),
        'The assembly works on its own — interlocking, sequences, changeover.',
        cellText(picture.own['L4_fpt']),
      ],
      [
        levelCode('L5_ist'),
        'The assembly works with the systems around it.',
        cellText(picture.own['L5_ist']),
      ],
    ],
    emphasise: new Set(
      SYSTEM_LEVELS.map((l, i) => (picture.own[l].failed > 0 || picture.own[l].total === 0 ? i : -1)).filter(
        (i) => i >= 0
      )
    ),
  }
}

/** The sentence printed under the two tables. */
export function scopeNote(picture: SystemPicture): string {
  const parts = [
    'The two halves are reported separately and are never added together. One figure across L1 to L5 would let this system read most of the way finished on the strength of factory tests alone, with no functional testing carried out.',
    'A dash means nothing is recorded at that level — which is not the same as nothing being done, and not the same as zero per cent. Zero per cent is work that exists and is outstanding.',
  ]
  if (picture.systemHoldingTagWork.total > 0) {
    parts.push(
      `${picture.systemHoldingTagWork.total} device-level check${picture.systemHoldingTagWork.total === 1 ? ' is' : 's are'} recorded against the system rather than against a tag. They are counted here, and nothing has been moved, but which device was checked cannot be told from which was not.`
    )
  }
  return parts.join(' ')
}

export type PackFinding = {
  rule: string
  level: 'blocking' | 'warning' | 'note'
  title: string
  count: number
  examples: string[]
}

const WORD: Record<string, string> = {
  blocking: 'Would not stand up',
  warning: 'Worth a look',
  note: 'Noted',
}

/**
 * The free rule findings, as a table in the pack.
 *
 * Ordered blocking first, and the examples are printed rather than summarised
 * — a receiving party cannot act on "six records affected" and can act on
 * six references. Capped at three examples per finding so one noisy rule
 * cannot push the signature page off the end of the document.
 */
export function findingsTable(findings: PackFinding[]): ReportTable | null {
  if (findings.length === 0) return null

  const order = { blocking: 0, warning: 1, note: 2 }
  const sorted = [...findings].sort((a, b) => order[a.level] - order[b.level])

  return {
    title: 'What the automatic checks found',
    columns: ['Severity', 'Finding', 'Records', 'Examples'],
    widths: [1.3, 2.6, 0.8, 3],
    rows: sorted.map((f) => [
      WORD[f.level],
      f.title,
      f.count,
      f.examples.slice(0, 3).join(' · ') + (f.count > 3 ? ' …' : ''),
    ]),
    emphasise: new Set(sorted.map((f, i) => (f.level === 'blocking' ? i : -1)).filter((i) => i >= 0)),
  }
}

export const FINDINGS_NOTE =
  'These are rules, not an opinion. Each one counts records and reports what it counted — no model reads them and nothing is stored, so they describe the records as they stood when this document was produced. They say what cannot be verified by somebody who was not there; they do not say the work was done badly.'
