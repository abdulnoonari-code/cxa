// The navigation, as one model.
//
// It used to live as thirty-four hand-written <Link> tags inside the sidebar
// component, in seven flat groups. That is how the same thing came to appear
// in three places: Checklists sat beside Functional Tests and Integrated
// Functional Tests, which are the same register filtered to L4 and L5;
// Document Control sat beside Document Review and Files; Contacts, Project
// Team and Roles were three separate top-level entries for the same people.
//
// Two rules fix it, and they are the whole point of this file:
//
//   1. **A register is a top-level item. A view of a register is a child of
//      it.** Functional Tests is not a peer of Checklists — it is Checklists
//      at L4. Saying so in the model is what stops the list growing every time
//      somebody wants a filtered page.
//
//   2. **Children appear only in context.** A child is rendered when it, or
//      its parent, is the page you are on. So the rail shows twenty-one items
//      most of the time and opens up where you are working. Nothing is hidden
//      — everything is one click from its parent — but nothing competes
//      either, which matters now the rail is light rather than dark.
//
// `note` is not decoration. It is printed as the title attribute so hovering
// an item says what it is a view of, which is the question the old flat list
// kept raising.

export type NavItem = {
  href: string
  label: string
  icon: string
  note?: string
  children?: NavItem[]
}

export type NavSection = {
  label: string
  items: NavItem[]
}

export const NAV: NavSection[] = [
  {
    label: 'Project',
    items: [
      { href: '/project', label: 'Project Details', icon: 'settings', note: 'Name, client, dates and the settings every other screen is scoped by.' },
      { href: '/projects', label: 'All Projects', icon: 'projects', note: 'Every project you can open, and where you create a new one.' },
      { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', note: 'What needs attention today, across the whole project.' },
      {
        href: '/plan',
        label: 'Plan & Progress',
        icon: 'plan',
        note: 'Progress by commissioning level, L1 through L5.',
        children: [
          { href: '/milestones', label: 'Milestones & Timeline', icon: 'milestone', note: 'The dated commitments the plan is measured against.' },
        ],
      },
    ],
  },
  {
    label: 'Assets & Checks',
    items: [
      {
        href: '/assets',
        label: 'Assets',
        icon: 'tree',
        note: 'The whole tree — site, area, system, subsystem, equipment — and what is recorded against each.',
        children: [
          { href: '/systems', label: 'Systems', icon: 'system', note: 'Systems and subsystems on their own.' },
          { href: '/equipment', label: 'Equipment & Tags', icon: 'equipment', note: 'Tagged equipment on its own.' },
        ],
      },
      {
        href: '/itp',
        label: 'Inspection & Test Plan',
        icon: 'itp',
        note: 'Every activity that has to be inspected or tested, and which party holds each point.',
        children: [
          { href: '/holdpoints', label: 'Hold & Witness Points', icon: 'hold', note: 'The hold and witness points from the plan, with their signatures.' },
        ],
      },
      {
        href: '/checklists',
        label: 'Checklists',
        icon: 'checklist',
        note: 'Every commissioning check at every level.',
        children: [
          { href: '/functional-tests', label: 'L4 — Functional Tests', icon: 'test', note: 'The same register, filtered to L4.' },
          { href: '/integrated-tests', label: 'L5 — Integrated Tests', icon: 'integrated', note: 'The same register, filtered to L5.' },
        ],
      },
      {
        href: '/tests',
        label: 'Test Records',
        icon: 'testrec',
        note: 'Measurements, their acceptance criteria and the instrument that took them.',
        children: [
          { href: '/instruments', label: 'Test Instruments', icon: 'gauge', note: 'The instruments and their calibration dates.' },
        ],
      },
    ],
  },
  {
    label: 'Traceability',
    items: [
      { href: '/requirements', label: 'Requirements', icon: 'requirement', note: 'What the plant was required to do, and what proves each one was met.' },
      {
        href: '/doc-control',
        label: 'Document Control',
        icon: 'doccontrol',
        note: 'Controlled documents and their revisions — the source everything else cites.',
        children: [
          { href: '/documents', label: 'Document Review', icon: 'document', note: 'Reviewing what has been submitted against each document.' },
          { href: '/files', label: 'Files', icon: 'files', note: 'Everything uploaded anywhere in the project, in one list.' },
        ],
      },
      { href: '/obligations', label: 'Obligations', icon: 'obligation', note: 'What each party owes under the contract, and whether it was discharged.' },
    ],
  },
  {
    label: 'Quality',
    items: [
      {
        href: '/readiness',
        label: 'Readiness',
        icon: 'readiness',
        note: 'How ready each system is, worked out from its records.',
        children: [
          { href: '/gates', label: 'Readiness Gates', icon: 'gate', note: 'The rules assessed and signed before each stage.' },
        ],
      },
      { href: '/issues', label: 'Punch List', icon: 'issue', note: 'Defects by category and level, and what each one blocks.' },
      { href: '/validity', label: 'Validity Review', icon: 'validity', note: 'Where the records contradict themselves or do not support what they claim.' },
      { href: '/review', label: 'Review & Approvals', icon: 'review', note: 'What is waiting on somebody to accept it.' },
      { href: '/dossier', label: 'Handover Packs', icon: 'dossier', note: 'The pack that proves a system was commissioned rather than merely built.' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/tasks', label: 'Tasks', icon: 'task', note: 'Work assigned to people, with dates.' },
      { href: '/meetings', label: 'Meetings', icon: 'meeting', note: 'Meetings and what was decided at them.' },
      { href: '/notifications', label: 'Alerts & Notices', icon: 'bell', note: 'Notices issued, and what is overdue.' },
    ],
  },
  {
    label: 'People',
    items: [
      {
        href: '/team',
        label: 'Project Team',
        icon: 'team',
        note: 'Who has access to this project and what they may do.',
        children: [
          { href: '/roles', label: 'Roles', icon: 'roles', note: 'The roles this project defines, and their permissions.' },
          { href: '/contacts', label: 'Contacts', icon: 'contacts', note: 'People outside the team who receive notices.' },
        ],
      },
    ],
  },
  {
    label: 'Reports',
    items: [
      { href: '/reports/daily', label: 'Daily Report', icon: 'daily', note: 'What happened on a given day, as a document.' },
      { href: '/reports', label: 'Progress Report', icon: 'report', note: 'Progress across the project, as a document.' },
      { href: '/audit', label: 'Audit Trail', icon: 'audit', note: 'Every change anybody made, in order. Nothing here can be edited.' },
    ],
  },
]

/**
 * Whether a nav href is the page being looked at.
 *
 * `/reports` must not light up on `/reports/daily` — they are two different
 * entries in the same section, and a rail that highlights both says the user
 * is in two places at once. So a parent only matches on a deeper path when
 * that deeper path is not itself a nav entry.
 */
export function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href === '/') return false
  if (!pathname.startsWith(href + '/')) return false
  return !ALL_HREFS.has(pathname)
}

const ALL_HREFS: Set<string> = new Set(
  NAV.flatMap((s) => s.items.flatMap((i) => [i.href, ...(i.children ?? []).map((c) => c.href)]))
)

/** Whether an item's children should be shown: it is open, or a child is. */
export function isOpen(pathname: string, item: NavItem): boolean {
  if (isActive(pathname, item.href)) return true
  return (item.children ?? []).some((c) => isActive(pathname, c.href))
}

/** The section a path belongs to, for the header and the document title. */
export function sectionFor(pathname: string): NavSection | null {
  for (const section of NAV) {
    for (const item of section.items) {
      if (isActive(pathname, item.href)) return section
      if ((item.children ?? []).some((c) => isActive(pathname, c.href))) return section
    }
  }
  return null
}

/** The item a path belongs to, parent first if the path is a child. */
export function trailFor(pathname: string): NavItem[] {
  for (const section of NAV) {
    for (const item of section.items) {
      if (isActive(pathname, item.href)) return [item]
      const child = (item.children ?? []).find((c) => isActive(pathname, c.href))
      if (child) return [item, child]
    }
  }
  return []
}

/** Every route the rail can reach — used by the nav assertions. */
export function allHrefs(): string[] {
  return [...ALL_HREFS]
}
