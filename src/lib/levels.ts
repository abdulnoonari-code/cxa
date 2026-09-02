// The commissioning levels, and the colour each one carries.
//
// The levels are the spine of this whole application: a check, a test, a punch
// item, a gate and an ITP activity all sit at one of five levels, and the
// single most useful thing a screen can tell you at a glance is which. Until
// now every level printed as the same grey badge, so a page of two hundred
// checks gave the eye nothing to sort by.
//
// Three rules govern the palette, and they are why it is a cool ramp rather
// than a pretty one:
//
//   1. **A level must never be mistakeable for a status.** Green, amber and
//      red are spoken for — Pass, Warning, Fail. The level ramp stays in the
//      cool half of the wheel (slate, cyan, indigo, violet, fuchsia) so a red
//      badge on a screen always means something went wrong and never means
//      "this is an integrated systems test".
//
//   2. **It has to read as ordered.** The ramp advances one way, slate through
//      to fuchsia, so L5 is visibly further along than L2 without reading the
//      label. Levels are a sequence, not a set of categories.
//
//   3. **The label still says the level.** Colour is the second signal, never
//      the only one — for print, for photocopies, and for the eight percent of
//      men who would otherwise be reading an unlabelled ramp.

import { LEVELS } from '@/lib/checklist'

export type LevelTone = {
  /** The solid, for rules, dots and chart marks. */
  solid: string
  /** The badge background. */
  bg: string
  /** The badge border. */
  border: string
  /** Text on the badge background — all of these pass AA at 12px. */
  text: string
}

export const LEVEL_TONES: Record<string, LevelTone> = {
  L1_fat: { solid: '#64748b', bg: '#f1f5f9', border: '#cbd5e1', text: '#475569' },
  L2_iv: { solid: '#0891b2', bg: '#ecfeff', border: '#a5f3fc', text: '#0e7490' },
  L3_prefunctional: { solid: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe', text: '#4338ca' },
  L4_fpt: { solid: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', text: '#6d28d9' },
  L5_ist: { solid: '#c026d3', bg: '#fdf4ff', border: '#f5d0fe', text: '#a21caf' },
}

const UNKNOWN: LevelTone = { solid: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0', text: '#64748b' }

export function levelTone(value: string | null | undefined): LevelTone {
  return (value && LEVEL_TONES[value]) || UNKNOWN
}

/** "L3", for a badge or a narrow column. */
export function levelCode(value: string | null | undefined): string {
  if (!value) return '—'
  const label = LEVELS.find((l) => l.value === value)?.label
  if (label) return label.split('—')[0].trim()
  return value.split('_')[0].toUpperCase()
}

/** "Pre-functional / Static", without the L3 prefix. */
export function levelName(value: string | null | undefined): string {
  if (!value) return 'No level'
  const label = LEVELS.find((l) => l.value === value)?.label
  if (!label) return value
  const parts = label.split('—')
  return parts.length > 1 ? parts.slice(1).join('—').trim() : label
}

/** "L3 — Pre-functional / Static". */
export function levelLabel(value: string | null | undefined): string {
  if (!value) return 'No level'
  return LEVELS.find((l) => l.value === value)?.label ?? value
}

/** Where a level sits in the sequence. Unknown levels sort last, not first. */
export function levelIndex(value: string | null | undefined): number {
  const i = LEVELS.findIndex((l) => l.value === value)
  return i === -1 ? LEVELS.length : i
}

/**
 * Inline style for a level badge.
 *
 * A style object rather than a CSS class because the five levels come from
 * data, and generating `.level-L3_prefunctional` for each of them means the
 * stylesheet has to change every time a project adds a level.
 */
export function levelBadgeStyle(value: string | null | undefined): React.CSSProperties {
  const tone = levelTone(value)
  return {
    background: tone.bg,
    border: `1px solid ${tone.border}`,
    color: tone.text,
  }
}

/** The left-edge rule that marks a card or a table section as belonging to a level. */
export function levelRuleStyle(value: string | null | undefined): React.CSSProperties {
  return { borderLeft: `3px solid ${levelTone(value).solid}` }
}

// ── What each level is for ───────────────────────────────────────────────
//
// The five levels are a sequence and each one only means anything because of
// what came before it. An L4 functional test on equipment that never had its
// L2 installation verification is a test of something nobody confirmed was
// built correctly — and that is the single most common way a commissioning
// programme produces a thick pack of paper that proves nothing.
//
// Printed on each level's screen so somebody arriving at it knows what they
// are being asked to establish, rather than just ticking a list.

export type LevelMeaning = {
  /** What passing this level actually establishes. */
  proves: string
  /** What has to be true before it is honest to start. */
  before: string
  /** What cannot proceed while it is incomplete. */
  blocks: string
}

export const LEVEL_MEANING: Record<string, LevelMeaning> = {
  L1_fat: {
    proves: 'The equipment left the factory built to the specification and passed its routine tests there.',
    before: 'Nothing on site. This happens before delivery, and the evidence is the vendor’s test pack.',
    blocks: 'Accepting delivery on trust. An item with no FAT record is an item nobody has ever tested.',
  },
  L2_iv: {
    proves: 'What arrived is what was ordered, and it has been installed where and how the design says.',
    before: 'The equipment is delivered, set, and the installation is complete enough to inspect.',
    blocks: 'Everything. Energising or testing something whose installation was never verified tests the wrong question.',
  },
  L3_prefunctional: {
    proves: 'It is safe and correct to energise: terminations, earthing, insulation, settings, protection, cleanliness.',
    before: 'L2 is complete for the same equipment. Static checks on an unverified installation prove nothing.',
    blocks: 'First energisation, and every functional test that depends on it.',
  },
  L4_fpt: {
    proves: 'It does what it is supposed to do, on its own, under real conditions and against stated criteria.',
    before: 'L3 is complete and the equipment has been energised under a released hold point.',
    blocks: 'Integrated testing — a system cannot be proved as part of a whole until it works alone.',
  },
  L5_ist: {
    proves: 'The systems work together: transfers, sequences, interlocks, failure modes, and the response to a real loss.',
    before: 'Every system in the test is L4 complete. One unproven system invalidates the whole integrated result.',
    blocks: 'Handover. This is the last thing between the plant and the people who will operate it.',
  },
}

export function levelMeaning(value: string | null | undefined): LevelMeaning | null {
  return (value && LEVEL_MEANING[value]) || null
}

/** The level that must be complete before this one honestly starts. */
export function levelBefore(value: string | null | undefined): string | null {
  const i = LEVELS.findIndex((l) => l.value === value)
  return i > 0 ? LEVELS[i - 1].value : null
}

/** The level this one unlocks. */
export function levelAfter(value: string | null | undefined): string | null {
  const i = LEVELS.findIndex((l) => l.value === value)
  return i !== -1 && i < LEVELS.length - 1 ? LEVELS[i + 1].value : null
}

/** Every level with its tone, for legends and for the assertions. */
export function levelLegend(): { value: string; code: string; name: string; tone: LevelTone }[] {
  return LEVELS.map((l) => ({
    value: l.value,
    code: levelCode(l.value),
    name: levelName(l.value),
    tone: levelTone(l.value),
  }))
}
