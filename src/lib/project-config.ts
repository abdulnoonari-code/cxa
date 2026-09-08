// What this project actually commissions.
//
// ── Why this exists ──────────────────────────────────────────────────────
//
// The application ships with five commissioning levels and eight
// disciplines because that is the full ladder. Almost no real job runs all
// of it. A switchroom retrofit has no Factory Acceptance — the gear is
// already on site. A single-system handover has no Integrated Systems
// Test, because there is nothing to integrate it with. A purely electrical
// scope has no mechanical discipline in it at all.
//
// Until now the application had no way to be told any of that, so every
// screen scored the job against rungs of a ladder nobody was ever going to
// climb: an L1 column that stays empty for eighteen months and a
// "0 of 5 levels complete" that is not a measure of anything.
//
// ── The rule that governs the whole file ─────────────────────────────────
//
// NARROWING THE SCOPE NEVER DELETES ANYTHING, AND NEVER HIDES ANYTHING
// THAT EXISTS.
//
// It is very tempting to make an out-of-scope level simply disappear. It
// must not. If somebody has raised four L1 defects and then someone else
// switches L1 off, those four defects are still real, still open, and
// still somebody's problem — and a screen that quietly stops showing them
// is worse than one that never had the setting. So an out-of-scope level
// with records in it is shown, marked as out of scope, and counted in a
// warning that says exactly what turning it off would conceal.
//
// The second rule follows from the first: the scope is a STATEMENT ABOUT
// INTENT, not a filter over data. It says "we do not plan to do L1 on this
// job". It never says "L1 does not exist".
//
// Pure: no database, no clock.

import { LEVELS } from '@/lib/checklist'

/**
 * The cookie that carries the result of the last save.
 *
 * It lives here rather than beside the server action that sets it because
 * a 'use server' file may export ONLY async functions — exporting a string
 * constant from one fails the build. The same rule caught INVITE_COOKIE in
 * update 84; this is the second time, so it is written down.
 */
export const RESULT_COOKIE = 'cx_config_result'

export type ProjectConfig = {
  /** Which commissioning levels this project plans to do. Never empty. */
  levels: string[]
  /** Which disciplines are in scope. Empty means "all of them". */
  disciplines: string[]
  /** The specifications and standards the job is commissioned against. */
  standards: string
  /** What "ready" means on this job, in the client's own words. */
  readyMeans: string
}

/** Everything on, nothing said. What a project has until somebody decides. */
export const DEFAULT_CONFIG: ProjectConfig = {
  levels: LEVELS.map((l) => l.value),
  disciplines: [],
  standards: '',
  readyMeans: '',
}

const VALID_LEVELS = new Set(LEVELS.map((l) => l.value))

function textOf(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function listOf(v: unknown, allowed: Set<string> | null): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    if (typeof x !== 'string') continue
    const s = x.trim()
    if (!s || out.includes(s)) continue
    if (allowed && !allowed.has(s)) continue
    out.push(s)
  }
  return out
}

/**
 * Read a stored configuration, whatever shape it turns out to be in.
 *
 * A JSON column is a promise nobody enforces: it can hold a string, null,
 * an array, a number, or an object written by a version of this
 * application that no longer exists. Every one of those has to come back
 * as a usable configuration rather than an exception on a page load, so
 * anything unreadable falls back to the default — which is EVERYTHING IN
 * SCOPE, never nothing. Failing open is the only safe direction here: a
 * parse bug that silently narrowed a project's scope would hide real work.
 */
export function parseConfig(raw: unknown): ProjectConfig {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return { ...DEFAULT_CONFIG }
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_CONFIG }

  const o = value as Record<string, unknown>
  const levels = listOf(o.levels, VALID_LEVELS)

  return {
    // No levels at all is not a project, it is a typo or a bad write. A
    // job with nothing to commission cannot be what anybody meant.
    levels: levels.length > 0 ? orderLevels(levels) : [...DEFAULT_CONFIG.levels],
    disciplines: listOf(o.disciplines, null),
    standards: textOf(o.standards, 4000),
    readyMeans: textOf(o.readyMeans, 4000),
  }
}

/** Levels always come back in ladder order, however they were stored. */
export function orderLevels(levels: string[]): string[] {
  return LEVELS.map((l) => l.value).filter((v) => levels.includes(v))
}

/** The object to write back. Ordered and trimmed, so two saves of the same
 *  choices produce the same row and the audit trail does not fill with
 *  differences that are not differences. */
export function serialiseConfig(c: ProjectConfig): ProjectConfig {
  return {
    levels: orderLevels(c.levels.length > 0 ? c.levels : DEFAULT_CONFIG.levels),
    disciplines: [...new Set(c.disciplines.map((d) => d.trim()).filter(Boolean))].sort(),
    standards: c.standards.trim().slice(0, 4000),
    readyMeans: c.readyMeans.trim().slice(0, 4000),
  }
}

/** Read a submitted form. Absent checkboxes mean "not chosen", not "unchanged". */
export function configFromForm(
  levels: string[],
  disciplines: string[],
  standards: string,
  readyMeans: string
): ProjectConfig {
  return serialiseConfig({
    levels: listOf(levels, VALID_LEVELS),
    disciplines: listOf(disciplines, null),
    standards,
    readyMeans,
  })
}

export function inScope(config: ProjectConfig, level: string | null | undefined): boolean {
  // Something with no level is not out of scope — it has no scope at all,
  // which is a different problem and is reported elsewhere as itself.
  if (!level) return true
  return config.levels.includes(level)
}

export function levelLabel(value: string): string {
  return LEVELS.find((l) => l.value === value)?.label ?? value
}

export type ScopeWarning = {
  level: string
  label: string
  records: number
  /** What switching this level off would conceal, in words. */
  message: string
}

/**
 * Levels that are out of scope but have records against them.
 *
 * This is the whole safety mechanism for the narrowing rule. Somebody
 * turns L1 off; four L1 punch items already exist; those four are still
 * open and still somebody's. The setting is honoured — L1 stops being
 * counted as work to do — and this warning makes sure it can never be a
 * way of making four defects disappear.
 */
export function scopeWarnings(config: ProjectConfig, recordsByLevel: Record<string, number>): ScopeWarning[] {
  const out: ScopeWarning[] = []
  for (const l of LEVELS) {
    if (config.levels.includes(l.value)) continue
    const n = recordsByLevel[l.value] ?? 0
    if (n === 0) continue
    out.push({
      level: l.value,
      label: l.label,
      records: n,
      message: `${n} record${n === 1 ? '' : 's'} already exist at ${
        l.label.split('—')[0].trim()
      }, and this project says that level is out of scope. They are still open and still counted — nothing has been deleted or hidden — but they will not appear as work this project plans to do. Either put the level back in scope, or close them out.`,
    })
  }
  return out
}

/** The sentence that says what this project is, in one line. */
export function configNote(config: ProjectConfig): string {
  const all = config.levels.length === LEVELS.length
  const levelPart = all
    ? 'All five commissioning levels'
    : `${config.levels.length} of ${LEVELS.length} levels — ${config.levels
        .map((v) => levelLabel(v).split('—')[0].trim())
        .join(', ')}`
  const discPart =
    config.disciplines.length === 0
      ? 'every discipline'
      : `${config.disciplines.length} discipline${config.disciplines.length === 1 ? '' : 's'}`
  const stdPart = config.standards ? 'standards recorded' : 'no standards recorded yet'
  return `${levelPart} · ${discPart} · ${stdPart}`
}

/** True when the project is still on the defaults and nobody has decided. */
export function isUnconfigured(config: ProjectConfig): boolean {
  return (
    config.levels.length === LEVELS.length &&
    config.disciplines.length === 0 &&
    config.standards === '' &&
    config.readyMeans === ''
  )
}
