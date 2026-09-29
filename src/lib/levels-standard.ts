// THE CxNIVORA HIERARCHY.
//
// One definition. Every screen, every sheet and every test reads it from
// here, so the application cannot describe its own structure two ways.
//
// ── The six levels ──────────────────────────────────────────────────────
//
//     Project        Bang Pakong Substation
//       Asset          22 kV Switchroom
//         System         MV Switchgear
//           Subsystem      Incomer                    (optional)
//             Equipment      MV Panel — ABB UniGear   THE KIND
//               Tag            MV-SWGR-001            THE ITEM
//               Tag            MV-SWGR-002
//               …              …
//
// ── The one that was wrong, and why it matters more than the rest ───────
//
// EQUIPMENT AND TAG ARE TWO LEVELS, NOT ONE.
//
// Equipment is a KIND of plant — "MV Panel", "Dry Transformer", "125 VDC
// Battery". Tag is one numbered item of that kind — MV-SWGR-001.
//
// Earlier versions of this file made Equipment an attribute hanging off a
// tag rather than a level above it. It reads as a small difference and it
// is not, because of this:
//
//     "we can 100 MVSG, so hundred checklist"
//
// A hundred MV switchgear panels are a hundred tags of ONE equipment. If
// Equipment is not a level, the checklist has nowhere to attach except to
// each tag, and a hundred identical panels means a hundred identical
// checklists, typed or imported or copied — and then corrected in a
// hundred places when the procedure changes, and quietly inconsistent
// forever after somebody misses three.
//
// With Equipment as a level, the checklist attaches ONCE, to the kind, and
// reaches every tag under it — including the tags imported next month,
// because applying it again only fills the gaps.
//
// That is the whole reason this level exists. Anything that collapses
// Equipment back into Tag brings the hundred checklists back with it.
//
// ── Why Subsystem is the only optional one ──────────────────────────────
//
// Bays, panels and sections are real on a big switchboard and absent on a
// small one. Everything else is always there: a tag is always of some
// kind, that kind always sits in a system, and a system is always
// somewhere. A level that is sometimes missing in the middle is a level
// people leave blank everywhere, which is how the tree went flat before.

export type LevelKey = 'project' | 'asset' | 'system' | 'subsystem' | 'equipment' | 'tag'

export type Level = {
  key: LevelKey
  /** Depth below the project. The project itself is 0. */
  depth: number
  /** Singular, as every screen must say it. */
  label: string
  plural: string
  /** A real one, from a real substation. */
  example: string
  /** One line: what this level IS. */
  means: string
  /**
   * False for the levels a project may switch OFF entirely.
   *
   * Project, System and Tag are the spine: a job always has a job, the
   * thing being commissioned, and the item carrying the tag. Everything
   * else is a choice, because a switchroom retrofit has one room and no
   * use for an Asset level, and a job of forty one-off items has no use
   * for Equipment.
   */
  optional: boolean
  /** The table it lives in. */
  table: string
  /** True for the levels that are a column of the setup sheet. */
  column: boolean
}

export const HIERARCHY: Level[] = [
  {
    key: 'project',
    depth: 0,
    label: 'Project',
    plural: 'Projects',
    example: 'Bang Pakong Substation',
    means: 'The job itself. Not a column — you are already inside it when you press the button.',
    optional: false,
    table: 'projects',
    column: false,
  },
  {
    key: 'asset',
    depth: 1,
    label: 'Asset',
    plural: 'Assets',
    example: '22 kV Switchroom',
    means: 'A switchroom, building or zone that holds systems.',
    optional: true,
    table: 'areas',
    column: true,
  },
  {
    key: 'system',
    depth: 2,
    label: 'System',
    plural: 'Systems',
    example: 'MV Switchgear',
    means: 'A functional system with a boundary, commissioned as one thing.',
    optional: false,
    table: 'systems',
    column: true,
  },
  {
    key: 'subsystem',
    depth: 3,
    label: 'Subsystem',
    plural: 'Subsystems',
    example: 'Incomer',
    means: 'A bay, panel or section within a system. Switch it off on a job with no bays.',
    optional: true,
    table: 'subsystems',
    column: true,
  },
  {
    key: 'equipment',
    depth: 4,
    label: 'Equipment',
    plural: 'Equipment',
    example: 'MV Panel — ABB UniGear ZS1',
    means: 'A KIND of plant. The checklist attaches here, once, and reaches every tag beneath it.',
    optional: true,
    table: 'equipment_types',
    column: true,
  },
  {
    key: 'tag',
    depth: 5,
    label: 'Tag',
    plural: 'Tags',
    example: 'MV-SWGR-001',
    means: 'One numbered item of that equipment. A hundred panels are a hundred tags of one Equipment.',
    optional: false,
    table: 'equipment',
    column: true,
  },
]

export const LEVEL_BY_KEY: Record<LevelKey, Level> = Object.fromEntries(
  HIERARCHY.map((l) => [l.key, l]),
) as Record<LevelKey, Level>

/** The levels that are columns of the setup sheet, in sheet order. */
export const SHEET_LEVELS: Level[] = HIERARCHY.filter((l) => l.column)

/**
 * What one Equipment carrying N tags saves.
 *
 * Stated as a function because it is the argument for the level existing,
 * and an argument that cannot be evaluated is a slogan. One checklist of
 * `checks` items against `tags` tags is `checks` records to maintain
 * instead of `checks * tags`.
 */
export function checklistsSaved(tags: number, checks: number): { withLevel: number; without: number } {
  const n = Math.max(0, Math.floor(tags))
  const c = Math.max(0, Math.floor(checks))
  return { withLevel: c, without: n * c }
}

// ── Which levels THIS job uses ──────────────────────────────────────────
//
// "okay but we should have options" — and he is right. Six levels is the
// full ladder and almost no job climbs all of it. A switchroom retrofit
// has one room and no use for an Asset. A job of forty one-off items has
// no use for Equipment.
//
// So a project says which levels it uses, the same way it already says
// which commissioning levels it runs. THE SPINE CANNOT BE SWITCHED OFF:
// Project, System and Tag. A job always has a job, a thing being
// commissioned, and an item carrying the tag.
//
// ── What switching a level off does and does not do ─────────────────────
//
// It removes the COLUMN from the setup sheet and the LEVEL from the tree.
// It does not delete anything. A project that turns Equipment off after
// using it keeps every equipment record and every checklist attached to
// one — they simply stop being asked for. Turning it back on shows them
// again, unchanged. Hiding is reversible; deleting is not, and a setting
// that quietly deletes is a setting nobody can safely experiment with.

export type LevelsInUse = Partial<Record<LevelKey, boolean>>

/** Every level on, which is what a project that has said nothing gets. */
export const ALL_LEVELS: LevelsInUse = Object.fromEntries(
  HIERARCHY.map((l) => [l.key, true]),
) as LevelsInUse

/**
 * The levels this project actually uses, in order.
 *
 * Unset means ON. A project that has never opened the setting runs the
 * full ladder, which is the safe direction: nothing is hidden from
 * somebody who has not chosen to hide it.
 */
export function levelsInUse(chosen: LevelsInUse | null | undefined): Level[] {
  return HIERARCHY.filter((l) => !l.optional || chosen?.[l.key] !== false)
}

/** The sheet's columns for this project, in sheet order. */
export function sheetColumnsFor(chosen: LevelsInUse | null | undefined): Level[] {
  return levelsInUse(chosen).filter((l) => l.column)
}

/**
 * Turning a level off is refused when it is the one holding the tree up.
 *
 * Returns the reason, or null when the change is fine. Stated as a
 * function so the screen and the importer give the same answer — a rule
 * enforced in one place and not the other is a rule people learn twice.
 */
export function refuseToSwitchOff(key: LevelKey): string | null {
  const level = LEVEL_BY_KEY[key]
  if (!level) return `There is no level called "${key}".`
  if (!level.optional) {
    return `${level.label} cannot be switched off — every job has one, and the levels below it hang from it.`
  }
  return null
}
