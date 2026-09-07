// Which parts of the dashboard a person wants to see.
//
// ── Why this exists ─────────────────────────────────────────────────────
//
// The dashboard grew a panel every time something was added, and it now
// answers nine questions on one page. A commissioning manager and the
// client's project director do not want the same nine. The manager wants
// what is blocking today; the director wants one percentage and the punch
// count, and scrolls past everything else — which means everything else is
// costing them attention for nothing.
//
// So the page ships SIMPLE and the rest is opt-in. Four panels on, five
// off. Nothing is deleted; it is one tick away.
//
// ── Why a cookie and not a database table ───────────────────────────────
//
// Because this is a preference, not a record. It does not need a SQL file
// to run, cannot fail an import, and cannot be wrong in a way that misleads
// anybody about the state of the job. It also means this change adds
// nothing to the Setup page.
//
// The cost is honest and worth stating: the choice lives in one browser. On
// a different laptop the dashboard is back to simple. That is the right
// trade for a first step — and if it needs to follow a person between
// devices later, it becomes a column on their profile and everything else
// here stays as it is.

export type PanelId =
  | 'headline'
  | 'tree'
  | 'punch'
  | 'progress'
  | 'catchup'
  | 'rules'
  | 'actions'
  | 'health'
  | 'toplevel'
  | 'gates'

export type Panel = {
  id: PanelId
  label: string
  /** One sentence: what this panel answers. Shown beside the tick box AND
   *  on the panel itself, so a figure is never on screen without the
   *  sentence that stops it being read two ways. */
  means: string
  /** The screen this panel is a summary of. Every panel has one. */
  href: string
  hrefLabel: string
  /** On for a new person. Four, deliberately. */
  standard: boolean
}

export const PANELS: Panel[] = [
  {
    id: 'headline',
    label: 'Headline',
    means: 'The project name, the target date, and one health figure worked out across the areas this application actually tracks.',
    href: '/projects',
    hrefLabel: 'Project details',
    standard: true,
  },
  {
    id: 'tree',
    label: 'Project by level',
    means: 'Every site, area, system and subsystem with how far through it is. This is the project summary in hierarchy order rather than a single number.',
    href: '/assets',
    hrefLabel: 'Assets',
    standard: true,
  },
  {
    id: 'punch',
    label: 'Punch list',
    means: 'Total raised, and of those how many are open, awaiting acceptance and closed — with the priority categories underneath. The four figures always add up to the total raised.',
    href: '/issues',
    hrefLabel: 'Punch list',
    standard: true,
  },
  {
    id: 'actions',
    label: 'What needs you',
    means: 'The things worth doing next, ordered by what it costs to leave them. Every line comes from a record — fix the record and the line disappears by itself.',
    href: '/checklists',
    hrefLabel: 'Checklists',
    standard: true,
  },
  {
    id: 'progress',
    label: 'Progress by level',
    means: 'How many checks are done at each commissioning level, L1 to L5. Shows whether the job is moving forward or stalled at one level.',
    href: '/checklists',
    hrefLabel: 'Checklists',
    standard: false,
  },
  {
    id: 'catchup',
    label: 'Raised against closed',
    means: 'Defects raised and defects closed over time, cumulative. If the two lines are parallel the team is keeping up; if they diverge it is falling behind.',
    href: '/issues',
    hrefLabel: 'Punch list',
    standard: false,
  },
  {
    id: 'rules',
    label: 'What the checks found',
    means: 'Free rule checks run over the records every time the page opens. They say what could not be verified by somebody who was not there — not that the work was done badly.',
    href: '/validity',
    hrefLabel: 'Validity review',
    standard: false,
  },
  {
    id: 'health',
    label: 'Where the project stands',
    means: 'One bar per stage of the lifecycle. A hatched bar means that area is not tracked yet and is deliberately blank rather than 0%.',
    href: '/readiness',
    hrefLabel: 'Readiness',
    standard: false,
  },
  {
    id: 'toplevel',
    label: 'Top level assets',
    means: 'The sites and systems at the top of the tree, with readiness, open issues and held inspection points against each.',
    href: '/assets',
    hrefLabel: 'Assets',
    standard: false,
  },
  {
    id: 'gates',
    label: 'Gates',
    means: 'Each handover gate and whether the evidence behind it stands up. A gate is never marked passed by hand — it reads its own requirements.',
    href: '/gates',
    hrefLabel: 'Gates',
    standard: false,
  },
]

export const PANEL_COOKIE = 'cx_dash'

const VALID = new Set<string>(PANELS.map((p) => p.id))

export const STANDARD_PANELS: PanelId[] = PANELS.filter((p) => p.standard).map((p) => p.id)

/**
 * Read the cookie.
 *
 * NO cookie means a person who has never chosen — they get the standard
 * four. An EMPTY cookie means somebody deliberately unticked everything,
 * which is a different thing and is honoured: the page says so and shows
 * the chooser rather than silently putting the panels back. Quietly
 * overriding a choice is how a setting stops being believed.
 *
 * Ids that are not panels are dropped. A cookie written by an older version
 * naming a panel that no longer exists must not blank the dashboard.
 */
export function readPanels(raw: string | undefined | null): PanelId[] {
  if (raw === undefined || raw === null) return [...STANDARD_PANELS]
  const chosen = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => VALID.has(s)) as PanelId[]
  // Kept in catalogue order, not cookie order, so the page reads the same
  // way whatever order the boxes were ticked in.
  return PANELS.filter((p) => chosen.includes(p.id)).map((p) => p.id)
}

export function encodePanels(ids: readonly string[]): string {
  const keep = PANELS.filter((p) => ids.includes(p.id)).map((p) => p.id)
  return keep.join(',')
}

export function isShown(chosen: readonly PanelId[], id: PanelId): boolean {
  return chosen.includes(id)
}

export function panel(id: PanelId): Panel {
  const found = PANELS.find((p) => p.id === id)
  // Every id in PanelId is in PANELS; this is the compiler's blind spot, not
  // a case that can happen.
  if (!found) throw new Error(`unknown panel ${id}`)
  return found
}

/** "Showing 4 of 10" — the line above the chooser. */
export function panelSummary(chosen: readonly PanelId[]): string {
  if (chosen.length === 0) return 'Every panel is hidden'
  if (chosen.length === PANELS.length) return `Showing all ${PANELS.length} panels`
  return `Showing ${chosen.length} of ${PANELS.length} panels`
}

/** Whether the current choice is the one a new person gets. */
export function isStandard(chosen: readonly PanelId[]): boolean {
  return (
    chosen.length === STANDARD_PANELS.length &&
    STANDARD_PANELS.every((id) => chosen.includes(id))
  )
}
