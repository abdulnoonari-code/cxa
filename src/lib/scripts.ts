// A test script as a script, rather than as two hundred loose checks.
//
// Everything imported from a script has been landing in the checklist
// register, which is correct — it is the same kind of record — and then being
// shown grouped by equipment tag, which is not how anybody uses it. A tester
// does not work through "all the checks on GIS-115-CB-01". They open the
// procedure and go down it: line 1 to line 232, in sections, in order, with
// the ones above already done.
//
// So this reassembles the script from the register. Nothing is stored twice
// and nothing is duplicated — the checks ARE the script, sorted back into the
// order they were written in.
//
// ── The ordering is the whole file ─────────────────────────────────────
//
// Serial numbers are text, because real procedures number things 4.2 and A-7
// and 10a, and a column that refuses those forces somebody to renumber a
// document they did not write. Text sorting puts 10 before 2, which on a two
// hundred line script means the order is wrong everywhere and the tester
// cannot trust the screen. So the comparison walks digits and letters
// separately, and only falls back to the row it was imported from.

export type ScriptCheck = {
  id: string
  serial: string | null
  section: string | null
  item: string | null
  status: string | null
  notes: string | null
  answerType: string | null
  evidenceRef: string | null
  links: string | null
  level: string | null
  sourceRef: string | null
  subjectId: string | null
  equipmentId: string | null
  attachments: number
}

export type ScriptSection = {
  path: string
  checks: ScriptCheck[]
}

export type Script = {
  /** The sheet name it was imported from — its identity. */
  sheet: string
  level: string | null
  /** The tags or systems it runs against. Usually one. */
  subjects: string[]
  checks: ScriptCheck[]
  sections: ScriptSection[]
  total: number
  answered: number
  passed: number
  failed: number
  na: number
  /** Checks with a photograph or file against them. */
  withEvidence: number
}

/**
 * Compare two serial numbers the way a person reads them.
 *
 * "10" after "2". "4.2" after "4.1" and before "5". "A-7" after "A-6". A
 * missing serial sorts last rather than first, because a check somebody added
 * by hand belongs at the end of the procedure, not before line 1.
 */
export function compareSerial(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1

  const chunk = (s: string) => s.match(/\d+|\D+/g) ?? []
  const ax = chunk(a)
  const bx = chunk(b)

  for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
    const x = ax[i]
    const y = bx[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) {
      const d = Number(x) - Number(y)
      if (d !== 0) return d
    } else {
      const d = x.localeCompare(y, undefined, { sensitivity: 'base' })
      if (d !== 0) return d
    }
  }
  return 0
}

const DONE = new Set(['pass', 'na'])

/** `SCRIPT:Test Script:84` → `Test Script`. */
export function sheetOfRef(sourceRef: string | null | undefined): string | null {
  if (!sourceRef) return null
  const parts = sourceRef.split(':')
  return parts.length >= 3 ? parts.slice(1, -1).join(':') : null
}

/**
 * Group the register's checks back into the scripts they came from.
 *
 * Checks with no source reference — typed in by hand — are not scripts and
 * are left out entirely rather than gathered into an "Other" pile. A screen
 * that shows procedures should not invent one.
 */
export function scriptsFrom(checks: ScriptCheck[], subjectName: (id: string | null) => string): Script[] {
  const bySheet = new Map<string, ScriptCheck[]>()
  for (const c of checks) {
    const sheet = sheetOfRef(c.sourceRef)
    if (!sheet) continue
    const list = bySheet.get(sheet)
    if (list) list.push(c)
    else bySheet.set(sheet, [c])
  }

  const out: Script[] = []
  for (const [sheet, list] of bySheet) {
    const sorted = [...list].sort((a, b) => compareSerial(a.serial, b.serial))

    // Sections in the order they first appear, which is the order of the
    // procedure. Sorting them alphabetically would put "10. Burn in test"
    // before "2. Safety", which is the same mistake as sorting the lines.
    const sections: ScriptSection[] = []
    const index = new Map<string, ScriptSection>()
    for (const c of sorted) {
      const path = c.section ?? ''
      let section = index.get(path)
      if (!section) {
        section = { path, checks: [] }
        index.set(path, section)
        sections.push(section)
      }
      section.checks.push(c)
    }

    const subjects = [...new Set(sorted.map((c) => c.subjectId))].map(subjectName).filter(Boolean)

    out.push({
      sheet,
      level: sorted.find((c) => c.level)?.level ?? null,
      subjects,
      checks: sorted,
      sections,
      total: sorted.length,
      answered: sorted.filter((c) => c.status && c.status !== 'pending').length,
      passed: sorted.filter((c) => c.status === 'pass').length,
      failed: sorted.filter((c) => c.status === 'fail').length,
      na: sorted.filter((c) => c.status === 'na').length,
      withEvidence: sorted.filter((c) => c.attachments > 0).length,
    })
  }

  return out.sort((a, b) => a.sheet.localeCompare(b.sheet))
}

/**
 * How far through a script is, as a percentage of lines with an answer.
 *
 * Answered, not passed. A script is finished when every line has been dealt
 * with; whether it passed is a different question and gets its own number.
 * Merging the two produces a figure that goes DOWN when somebody finds a
 * fault, which is the opposite of what progress means.
 */
export function progress(s: Script): number {
  if (s.total === 0) return 0
  return Math.round((s.answered / s.total) * 100)
}

/** The one line at the top of a script. */
export function scriptState(s: Script): { text: string; tone: 'ok' | 'warning' | 'danger' | 'plain' } {
  if (s.total === 0) return { text: 'Nothing in this script', tone: 'plain' }
  if (s.failed > 0) {
    return {
      text: `${s.failed} of ${s.total} failed. ${s.answered} of ${s.total} answered.`,
      tone: 'danger',
    }
  }
  if (s.answered < s.total) {
    return { text: `${s.total - s.answered} lines still to do, of ${s.total}.`, tone: 'warning' }
  }
  const done = s.checks.filter((c) => DONE.has(c.status ?? '')).length
  return { text: `All ${s.total} lines answered, ${done} clear.`, tone: 'ok' }
}
