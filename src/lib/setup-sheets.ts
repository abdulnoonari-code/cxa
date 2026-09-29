import { HIERARCHY, SHEET_LEVELS } from '@/lib/levels-standard'
// Every spreadsheet that sets up a project, in the order somebody does them.
//
// ── Why this list exists ────────────────────────────────────────────────
//
// "at configuration page we should have all import and export for this
// sheet which run through all project … like one page with setup all
// project and then we look each page."
//
// He is right, and the reason he kept getting lost is worth writing down.
// Every register in this application grew its own screen, and each screen
// grew its own Export button, its own blank template and its own file box.
// Nine screens, twenty-odd buttons, no two in the same place. Setting up a
// new job meant knowing which nine screens to visit and in what order —
// knowledge that existed nowhere except in my head.
//
// So the buttons are gathered onto ONE page, in the order the work is
// actually done, and each row says what it builds. The screens keep their
// own buttons; nothing was taken away. This is a table of contents, not a
// replacement.
//
// AFTER AN IMPORT YOU LAND ON THE SCREEN THAT OWNS THAT SHEET, not back
// here — which is exactly "then we look each page". That is not a
// compromise, it is the flow he described.

export type SetupSheet = {
  /** Matches the action wired up on the Configuration page. */
  key: string
  /** Step number, shown in the first column. */
  step: number
  title: string
  /** One line: what importing this sheet actually creates. */
  builds: string
  /** GET route handing back the project's own data as a sheet. */
  exportHref: string | null
  /** GET route handing back an empty sheet with the right columns. */
  templateHref: string | null
  /** The screen that owns this register — where an import lands. */
  page: string
  /**
   * True for the one sheet that builds the tree itself. Everything below
   * it attaches to tags that must already exist, which is the whole reason
   * this list is ordered rather than alphabetical.
   */
  first?: boolean
  /**
   * Set when there is no spreadsheet at all and the row is a link only —
   * documents are files, not rows.
   */
  linkOnly?: boolean
}

/**
 * THE PROJECT ASSET LIST. One file, on its own, above everything else.
 *
 * It was row 1 of a table of eleven, and that was the mistake: it is not
 * one of eleven. It is THE file — the one that has to exist before any of
 * the others mean anything, because every one of them attaches to tags
 * that this file creates. A table put it on a level with the punch list.
 *
 * Its export doubles as its template: an empty project exports worked
 * example rows to type over, so there is never a format to guess at.
 */
export const ASSET_SHEET: SetupSheet = {
  key: 'hierarchy',
  step: 0,
  title: 'The project asset list',
  builds: 'Assets, systems, subsystems, equipment types and every tag — the whole tree, in one file.',
  exportHref: '/project/hierarchy/export',
  templateHref: null,
  page: '/project',
  first: true,
}

/**
 * Everything else, in the order it is done — all of it attaching to tags
 * the asset list has already created.
 */
export const SETUP_SHEETS: SetupSheet[] = [
  {
    key: 'equipment-types',
    step: 1,
    title: 'Equipment types',
    builds: 'Manufacturer, model and rating for each type the hierarchy named.',
    exportHref: '/equipment-types/export',
    templateHref: '/equipment-types/template',
    page: '/equipment-types',
  },
  {
    key: 'systems',
    step: 2,
    title: 'System detail',
    builds: 'Discipline, boundary and who is responsible, for systems that already exist.',
    exportHref: '/systems/export',
    templateHref: '/systems/template',
    page: '/systems',
  },
  {
    key: 'equipment',
    step: 3,
    title: 'Tag detail',
    builds: 'Serial numbers, location, install status and category against existing tags.',
    exportHref: '/equipment/export',
    templateHref: '/equipment/template',
    page: '/equipment',
  },
  {
    key: 'checklists',
    step: 4,
    title: 'Checklists',
    builds: 'The checks themselves, L1 to L5, against the tags in the tree.',
    exportHref: '/checklists/export',
    templateHref: '/checklists/template',
    page: '/checklists',
  },
  {
    key: 'itp',
    step: 5,
    title: 'ITP',
    builds: 'Inspection and test plan activities, with the witness and hold points.',
    exportHref: '/itp/export',
    templateHref: null,
    page: '/itp',
  },
  {
    key: 'tests',
    step: 6,
    title: 'Test records',
    builds: 'Test sheets and their results against tags and systems.',
    exportHref: '/tests/export',
    templateHref: '/tests/template',
    page: '/tests',
  },
  {
    key: 'obligations',
    step: 7,
    title: 'Obligations',
    builds: 'What the contract and the specification require, and which document says so.',
    exportHref: '/obligations/export',
    templateHref: '/obligations/template',
    page: '/obligations',
  },
  {
    key: 'roles',
    step: 8,
    title: 'People & roles',
    builds: 'Who is on the job and what each of them is allowed to sign.',
    exportHref: '/roles/export',
    templateHref: '/roles/template',
    page: '/roles',
  },
  {
    key: 'issues',
    step: 9,
    title: 'Punch list',
    builds: 'Defects and observations carried in from an existing punch list.',
    exportHref: '/issues/export',
    templateHref: '/issues/template',
    page: '/issues',
  },
  {
    key: 'documents',
    step: 10,
    title: 'Documents',
    builds: 'Drawings, specifications and manuals. These are files rather than a sheet, so they are uploaded on their own screen.',
    exportHref: null,
    templateHref: null,
    page: '/doc-control',
    linkOnly: true,
  },
]

/**
 * The tree, as words, for a screen to draw.
 *
 * "i want clear hirarchy" — so it is stated once, here, and the
 * Configuration page renders it. Depth is the indent; `via` names the
 * column in the setup sheet that creates it.
 */
export const HIERARCHY_LEVELS: { depth: number; label: string; example: string; note: string }[] =
  HIERARCHY.map((l) => ({ depth: l.depth, label: l.label, example: l.example, note: l.means }))


/**
 * The columns of the asset list, drawn as the sheet's own header row.
 *
 * DERIVED from the standard in src/lib/levels-standard.ts rather than
 * typed out again. It was typed out again, and the day Equipment became a
 * level the page went on calling it "Equipment Type" and describing it as
 * not-a-level — a screen contradicting the importer behind it.
 *
 * A sentence with six bold words in it DESCRIBES the file. A row of column
 * chips LOOKS like it, which is a shorter distance to travel when somebody
 * is about to open the thing in Excel.
 *
 * `level` is false only for Description, which is a sentence about one
 * tag rather than a level of the tree.
 */
export const HIERARCHY_COLUMNS: { name: string; level: boolean }[] = [
  ...SHEET_LEVELS.map((l) => ({ name: l.label, level: true })),
  { name: 'Description', level: false },
]
