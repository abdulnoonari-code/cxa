// The manual, as data.
//
// ── Why this is a file and not just words on a page ──────────────────────
//
// A manual is a list somebody has to remember to update, and a list somebody
// has to remember to update is a list that goes stale. The Setup page had
// exactly this problem: three SQL steps were added and none of them was
// registered, so the screen whose whole job was to say what was outstanding
// said nothing was.
//
// So the screens are held here as data, keyed by the same href the navigation
// uses, and an assertion walks NAV and fails if any route in the rail has no
// entry here. Add a screen to the application and the manual refuses to
// pretend it documented it.
//
// `covers` is how one entry legitimately documents several routes — the five
// per-level checklist pages are one screen five times, and Roles and Contacts
// are explained inside the Team entry rather than repeated. It is deliberately
// explicit: saying "this entry also covers /roles" is a decision somebody
// wrote down, whereas silence is a gap nobody notices.

export type Fact = {
  /** The short uppercase label in the left column. */
  label: string
  text: string
}

export type ScreenEntry = {
  href: string
  title: string
  /** One line under the heading. Optional — most entries do not need it. */
  lede?: string
  /** Other routes this same entry documents. See the note above. */
  covers?: string[]
  facts: Fact[]
}

export type ManualGroup = {
  id: string
  title: string
  standfirst: string
  screens: ScreenEntry[]
}

export const MANUAL_GROUPS: ManualGroup[] = [
  {
    id: 'g-project',
    title: 'Project',
    standfirst: 'Where the job is defined, and where you look first thing in the morning.',
    screens: [
      {
        href: '/projects',
        title: 'All Projects',
        lede: 'The only screen with no left-hand rail, because you are not inside a project yet.',
        facts: [
          { label: 'You see', text: 'One card per project you may open: client, location, start to target, and three figures — tags, checks, resolved per cent.' },
          { label: 'You can', text: 'Open a project, create one, or delete one.' },
          { label: 'Note', text: 'Deleting a project asks for your own login password, per project. If some rows refuse to delete it says so rather than reporting success.' },
        ],
      },
      {
        href: '/project',
        title: 'Project Details',
        lede: 'The plan on one page, with the timeline at the top of it.',
        facts: [
          { label: 'You see', text: 'The timeline — milestones as diamonds, gates as flags, today as a dashed line — then name, client, location and dates.' },
          { label: 'You can', text: 'Edit the project details and save them.' },
          { label: 'Note', text: 'Anything with no date is listed rather than drawn. The chart never guesses a position for an undated item.' },
        ],
      },
      {
        href: '/milestones',
        title: 'Milestones & Timeline',
        facts: [
          { label: 'You see', text: 'The timeline, then one card per milestone in date order, with an Overdue badge where it applies.' },
          { label: 'You can', text: 'Add a milestone; edit target date, status and notes in place; delete one.' },
          { label: 'It works out', text: 'Overdue, from the target date and the status. A milestone marked complete is never shown as late.' },
        ],
      },
      {
        href: '/gates',
        title: 'Gates',
        lede: 'A stage gate is a set of requirements assessed against the records.',
        facts: [
          { label: 'You see', text: 'One card per gate: verdict, met out of total mandatory rules, the subject it applies to, and up to four blockers named.' },
          { label: 'You can', text: 'Create a gate from a template, open it, remove it, and download every gate requirement to Excel to import back marked up.' },
          { label: 'It works out', text: 'Most rules from the records themselves. Only rules of type manual confirmation wait for a person.' },
          { label: 'Note', text: 'A gate is an assessment, not an authorisation. It reports whether the records support proceeding; it does not release anybody to proceed.' },
        ],
      },
      {
        href: '/plan',
        title: 'Plan & Progress',
        facts: [
          { label: 'You see', text: 'Five rows, L1 to L5: total, pass, fail, pending, N/A, evidence, per cent complete and status. Then the five nearest milestones.' },
          { label: 'It works out', text: 'Evidence is the share of checks with at least one attachment. Status is Blocked if anything failed, Not started if the level is empty, otherwise In progress or Complete.' },
          { label: 'Note', text: 'Read-only. The evidence column is the one to watch: a level at 100 per cent complete with 40 per cent evidence will not survive a handover review.' },
        ],
      },
      {
        href: '/project/configuration',
        title: 'Configuration',
        lede: 'What this job commissions. Not the Setup screen — that one checks the database, this one describes the work.',
        facts: [
          { label: 'You can', text: 'Tick the levels in scope, the disciplines, the standards you work to, and write what ready means on this job.' },
          { label: 'It works out', text: 'A warning if a level you have just put out of scope already has records against it.' },
          { label: 'Note', text: 'Narrowing scope never deletes or hides anything. Records at an out-of-scope level stay where they are and are still counted; they are simply marked out of scope.' },
          { label: 'Needs first', text: 'Database step part 37, or there is nowhere for the configuration to be saved.' },
        ],
      },
      {
        href: '/dashboard',
        title: 'Dashboard',
        lede: 'What needs you today, across the whole project.',
        facts: [
          { label: 'You see', text: 'Project health, then What needs you — actions grouped safety, blocking, due, setup, each with a sentence saying why and a button that goes there.' },
          { label: 'You can', text: 'Choose which of the ten panels appear. Four are on by default, and the choice is yours alone, kept in your browser.' },
          { label: 'It works out', text: 'Everything, live: gate blockers, unanswered gate rules, calibration about to expire, notices not yet sent, contacts with no email, and requirements citing a superseded revision.' },
          { label: 'Note', text: 'Nothing on the action list is tickable. A line disappears when the record behind it is fixed, and not before.' },
        ],
      },
      {
        href: '/knowledge',
        title: 'Technical Design',
        lede: 'Fifteen commissioning calculators, each carrying the formula and the standard behind its answer. It holds no project data, so it needs no sign-in.',
        facts: [
          { label: 'You see', text: 'A grid of tool cards in three groups \u2014 electrical, white space and cooling, and planning. Open one and it takes the whole screen, with the headline answers pinned to the top as you type.' },
          { label: 'Electrical', text: 'Load bank sizing, the generator test regimes, UPS and battery, insulation resistance, earth and soil resistivity, cable volt drop, CT burden and accuracy limit factor, and harmonic limits.' },
          { label: 'Cooling', text: 'White space airflow and cooling capacity factor, containment measured as Rack Cooling Index and Return Temperature Index, heat rejection corrected for altitude, chilled water flow, and the pump and fan laws.' },
          { label: 'Planning', text: 'A room layout planner you drag equipment around, which flags any unit whose hot discharge is feeding another one\u2019s intake, and a reference page of air balance tolerances.' },
          { label: 'Careful', text: 'Where two standards genuinely disagree \u2014 on insulation temperature correction, the affinity laws, balance tolerances and load bank clearances \u2014 the page says so rather than picking one quietly, and where there is no limit at all it says that too.' },
        ],
      },
      {
        href: '/setup',
        title: 'Setup',
        lede: 'Diagnostics. Nothing on this page changes anything.',
        facts: [
          { label: 'You see', text: 'Every database step and whether it is in place; who can reach the data; whether the door is open; and whether AI is configured.' },
          { label: 'Note', text: 'The Who can get in card reads OPEN when there is no owner address and nobody on any team. That is the state a brand-new deployment starts in. Fix it before real data goes in.' },
          { label: 'Note', text: 'The AI card shows the host and the model only. It never shows the key, and no screen anywhere in the application ever does.' },
        ],
      },
    ],
  },
  {
    id: 'g-assets',
    title: 'Assets',
    standfirst:
      'The register everything else joins to. Get this right and the rest follows; get it wrong and every count downstream inherits the error.',
    screens: [
      {
        href: '/systems',
        title: 'Systems',
        facts: [
          { label: 'You see', text: 'One card per system with its readiness bar, blockers, and counts of equipment, parts, checks, tests and open items. A trailing card lists tags in no system.' },
          { label: 'You can', text: 'Import from a spreadsheet, export the current systems, add one by hand, assign or remove tags, edit stage and responsible engineer, and print QR labels.' },
          { label: 'Note', text: 'Only System ID is required, and it must match the code used in your test scripts exactly.' },
        ],
      },
      {
        href: '/equipment-types',
        title: 'Equipment Types',
        facts: [
          { label: 'You see', text: 'The catalogue behind the tags — type code, name, discipline, manufacturer, model, rating, and how many tags use it.' },
          { label: 'You can', text: 'Import, export, add by hand, search and delete.' },
          { label: 'Note', text: 'Safe to import after the tag list. Matching is on type code, so it backfills manufacturer and rating onto types that were created automatically from a tag list.' },
          { label: 'Note', text: 'Deleting a type does not delete the tags that referenced it.' },
          { label: 'Needs first', text: 'Database step part 35, or the catalogue screen cannot be used at all.' },
        ],
      },
      {
        href: '/equipment',
        title: 'Equipment & Tags',
        lede: 'The tag register. One hundred rows a page.',
        facts: [
          { label: 'You see', text: 'Tag, description, category, building, floor, location, part count and status — with a red Critical badge where marked.' },
          { label: 'You can', text: 'Import (needs manage), export, add one by hand, filter, open, edit, delete, and print QR labels.' },
          { label: 'It works out', text: 'The asset tree, from this one sheet. Area, System and Subsystem columns create the hierarchy, and a value in Part of tag files the row as a component of that tag.' },
          { label: 'Note', text: 'Column headings are alias-matched, so a contractor’s own file usually works untouched: Tag No, KKS and Asset ID all mean Tag; Vendor, OEM and Make all mean Manufacturer.' },
          { label: 'Careful', text: 'This is the only place in the application where the word Level means a storey rather than a commissioning level.' },
        ],
      },
      {
        href: '/assets',
        title: 'Asset Tree',
        facts: [
          { label: 'You see', text: 'The whole hierarchy in one indented table — site, area, system, subsystem, equipment, part — with checks, tests, open issues, held points and requirements against each row.' },
          { label: 'It works out', text: 'Everything, per request. A parent can never read ready while a child has failed.' },
          { label: 'Note', text: 'Above 250 tags the leaves are folded away and each branch shows a count instead. The counts still include everything beneath.' },
        ],
      },
      {
        href: '/assets/report',
        title: 'Asset Report',
        lede: 'Whether the register can be trusted. Run this after every import.',
        facts: [
          { label: 'You see', text: 'Findings worst first, each with a count, a severity, what it costs, example tags and a button to the list. Then the breakdown: tags by system, discipline, install status and type.' },
          { label: 'It works out', text: 'Eleven checks — no tag number, duplicate tags, duplicate system numbers, duplicate type codes, tags in no system, systems with no equipment, tags not linked to a type, tags with no location, a category that contradicts its type, catalogue entries nothing uses, and types with neither make nor model.' },
          { label: 'You can', text: 'Download it as Excel. It also prints cleanly.' },
        ],
      },
      {
        href: '/qr',
        title: 'QR Labels',
        facts: [
          { label: 'You can', text: 'Print labels for systems, subsystems, equipment, parts, areas, sites or equipment types, filtered by a search, at your choice of label size.' },
          { label: 'Note', text: 'A scan opens that item on this site — its checks, its punch items, its documents. Capped at 600 labels per sheet, said out loud rather than silently trimmed.' },
        ],
      },
    ],
  },
  {
    id: 'g-testing',
    title: 'Testing & commissioning',
    standfirst: 'Where the work is actually recorded.',
    screens: [
      {
        href: '/itp',
        title: 'Inspection & Test Plan',
        lede: 'Who holds which inspection point. Derived live from the checklist and test registers — nothing on this screen is stored separately.',
        facts: [
          { label: 'Point types', text: 'H hold, W witness, R review, S surveillance. Only H and W carry a release: work stops until somebody signs.' },
          { label: 'You see', text: 'Counts by type, who holds what, findings, and the plan grouped by level or shown as the ITP matrix.' },
          { label: 'You can', text: 'Download the plan to mark up, import it back, set the point type and party per row, set project defaults, and export to PDF, Word or Excel.' },
          { label: 'Note', text: 'In the matrix the column heading says who and the letter says what. A letter in brackets is a project default that has not been agreed; it stays a default and is not promoted.' },
          { label: 'Careful', text: 'The import never creates an activity. A row matching no existing check or test is an error, and one error means nothing is imported.' },
          { label: 'Needs first', text: 'Checks or tests must exist. Database step part 20.' },
        ],
      },
      {
        href: '/holdpoints',
        title: 'Hold & Witness Points',
        facts: [
          { label: 'You see', text: 'A queue, ordered rejected, notified, awaiting notice, awaiting work, released. Then the assignment table and the signature register.' },
          { label: 'You can', text: 'Give notice — pick recipients from Contacts, set the inspection date, write it, open it in your email, then mark it sent. Sign a point with a decision, your typed full name and company. Sign again after rework.' },
          { label: 'Who', text: 'Signing needs approve. Giving notice needs record. Changing a point type needs review.' },
          { label: 'Note', text: 'The signature register is append-only at the database level, not by convention. Nothing in the application can alter a signature once it is given.' },
          { label: 'Needs first', text: 'Contacts with email addresses. Without one, notice cannot be given at all.' },
        ],
      },
      {
        href: '/checklists',
        title: 'Checklists',
        lede: 'The register of every commissioning check at every level, grouped by tag. Twenty-five tags a page.',
        covers: ['/checklists/l1', '/checklists/l2', '/checklists/l3', '/checklists/l4', '/checklists/l5'],
        facts: [
          { label: 'You see', text: 'Project-wide figures at the top, then per tag: each check with its level, result, review state, comment and attached documents.' },
          { label: 'You can', text: 'Set a result and comment, attach evidence, add a check by hand, filter, import a checklist, import a test script, export the project, delete a tag’s checklist, or delete every check in the project behind a password.' },
          { label: 'Careful', text: 'The figures at the top count the whole project. The checks listed below are only the tags on the page you are looking at. They will not agree, and they are not meant to.' },
          { label: 'One level', text: 'The five level pages show what that level proves, what must come before it and what it blocks, then its checks with an Evidence column. A check marked Pass with nothing attached gets a No evidence badge — the most useful thing on the screen.' },
          { label: 'Note', text: 'Those pages are read-only, and are built from the project roll-up rather than the tag list, so checks raised against a system appear on them too.' },
        ],
      },
      {
        href: '/library',
        title: 'Check Library',
        lede: 'One definition, applied to many tags, so the wording lives in one place.',
        facts: [
          { label: 'You see', text: 'Checks already repeated across tags, offered as candidate definitions; then each definition with its coverage, failures and drifted count.' },
          { label: 'You can', text: 'Make definitions from the repeated checks, apply a definition to tags, change the wording, or add one by hand.' },
          { label: 'Careful', text: 'Changing a definition rewords only unanswered checks. Checks somebody has already answered keep the exact wording they were signed against, and are then reported on Rule Checks as drifted.' },
          { label: 'Needs first', text: 'Database step part 30, or definitions cannot be created.' },
        ],
      },
      {
        href: '/scripts',
        title: 'Test Scripts',
        lede: 'The same checks again, in the shape of the procedure they came from — in order, in sections, ready to work down on site.',
        facts: [
          { label: 'You see', text: 'One card per imported sheet with a per cent answered figure — answered, deliberately not passed. Open one and you get the script in order, by section.' },
          { label: 'You can', text: 'Answer each line Yes, No, N/A or Not done — or Pass and Fail where the sheet was written that way — and add a remark. The page returns you to the line you just answered.' },
          { label: 'Note', text: 'Nothing is hidden behind an expander. This is the screen somebody uses standing in a switchroom.' },
        ],
      },
      {
        href: '/tests',
        title: 'Test Records',
        lede: 'Measurements, their acceptance criteria, and the instrument that took them.',
        facts: [
          { label: 'You can', text: 'Record a result, set approval, raise a punch item from a failure, add or import tests, export to PDF, Word or Excel, and filter.' },
          { label: 'It works out', text: 'The verdict. You enter the reading; pass or fail is derived from the acceptance criteria — max, min, range or text.' },
          { label: 'Careful', text: 'On import the supplier’s own Result column is read and then overruled. Every row claiming a result its own measured value does not support is reported by row number.' },
          { label: 'Careful', text: 'An instrument that is out of calibration, or missing, produces a Not acceptable block and disables the approval control. This is deliberate.' },
        ],
      },
      {
        href: '/instruments',
        title: 'Test Instruments',
        facts: [
          { label: 'You see', text: 'Every instrument with its certificate and calibration status, and a header count of expired and expiring.' },
          { label: 'You can', text: 'Add an instrument, update a certificate number and expiry in place, or delete one.' },
          { label: 'It works out', text: 'Valid, expiring or expired from the expiry date — and that status is what blocks acceptance over on Test Records.' },
        ],
      },
      {
        href: '/tasks',
        title: 'Tasks',
        facts: [
          { label: 'You see', text: 'Task, level, owner, due date, priority and status — with overdue derived, never stored.' },
          { label: 'You can', text: 'Add a task, filter by status, assignee or level, and edit status, due date and level in place.' },
          { label: 'Note', text: 'A task is work to be done. A punch item is a defect found. They are different registers on purpose.' },
          { label: 'Needs first', text: 'Database step part 36, which adds the level column to a task.' },
        ],
      },
      {
        href: '/issues',
        title: 'Punch List',
        lede: 'Defects, by category and level, and what each one blocks. Fifty a page.',
        facts: [
          { label: 'You see', text: 'Six figures over the whole project — open, Category A open, overdue, awaiting acceptance, uncategorised, and the age of the oldest open item.' },
          { label: 'You can', text: 'Raise an item, including a photograph with a caption in the same form; import a marked-up sheet; export to PDF, Word, Excel or PDF with photographs; filter on six dimensions; and bulk-raise items from failed checks.' },
          { label: 'Note', text: 'An uncategorised item is treated as blocking until somebody assesses it. That is the safe direction to be wrong in.' },
          { label: 'Needs first', text: 'Database step part 21, or no photograph attached to a punch item will save.' },
        ],
      },
      {
        href: '/levels',
        title: 'Level Summary',
        facts: [
          { label: 'You see', text: 'The five levels side by side, defects on the left and tasks on the right: open, serious, late, total and closed per cent. Plus a row for records carrying no level at all.' },
          { label: 'You can', text: 'Click any number. Every one of them opens the filtered list behind it.' },
          { label: 'Note', text: 'Empty levels are still shown. A zero shows as a dash, and nought out of nought shows as a dash rather than 0 or 100 per cent — there is no percentage of nothing.' },
        ],
      },
    ],
  },
  {
    id: 'g-trace',
    title: 'Traceability',
    standfirst:
      'From what the plant was required to do, to the document that says so, to the record that proves it.',
    screens: [
      {
        href: '/requirements',
        title: 'Requirements',
        facts: [
          { label: 'You see', text: 'Each requirement with its statement, acceptance criteria, source document, revision and clause — and the checks or tests linked as proof.' },
          { label: 'You can', text: 'Add one, link a check or test as proof, unlink, re-read and accept a stale one, or remove it.' },
          { label: 'It works out', text: 'Verified per cent, blocking count, and stale source — a requirement citing a revision that is no longer the effective one.' },
        ],
      },
      {
        href: '/doc-control',
        title: 'Document Control',
        facts: [
          { label: 'You see', text: 'Numbered controlled documents, their revision history, which revision is effective, and how many requirements cite each.' },
          { label: 'You can', text: 'Register a document, issue a revision, attach a file, and extract Obligations or Requirements from a revision’s text.' },
          { label: 'Note', text: 'Extraction is pattern-matching on the wording — shall, must, is responsible for — not AI. A scanned PDF with no text layer is refused rather than half-read.' },
        ],
      },
      {
        href: '/documents',
        title: 'Document Review',
        facts: [
          { label: 'You see', text: 'Every file attached to a checklist item, with an intake badge: Passed intake check, or Needs a look.' },
          { label: 'It works out', text: 'Free rules over each document — does it mention the tag it is filed against, does it carry a date and a signature block, which standards it cites, and what numbered measurements appear in it.' },
          { label: 'You can', text: 'Upload, check documents in a batch of forty, or ask a model to read one — that last only when AI is configured.' },
        ],
      },
      {
        href: '/files',
        title: 'Files',
        facts: [
          { label: 'You see', text: 'Everything uploaded anywhere in the project, in one flat list with category chips.' },
          { label: 'Note', text: 'Three different things, deliberately kept apart. Files is anything uploaded. Document Review is evidence against a check. Document Control is numbered revisions.' },
        ],
      },
      {
        href: '/obligations',
        title: 'Obligations',
        facts: [
          { label: 'You see', text: 'What each party owes under the contract — party, kind, state, the level it bites at, owner, due date, evidence, and the clause it came from. Forty a page.' },
          { label: 'You can', text: 'Read it — upload a contract or specification and extract the duty clauses — then edit, import, export, or undo the read if it was the wrong document.' },
          { label: 'It works out', text: 'Outstanding, overdue, awaiting acceptance, unassigned, and a breakdown per party.' },
        ],
      },
    ],
  },
  {
    id: 'g-quality',
    title: 'Quality',
    standfirst:
      'The screens that argue with the records. This is the part of the application that earns its keep.',
    screens: [
      {
        href: '/readiness',
        title: 'Readiness',
        facts: [
          { label: 'You see', text: 'Per-system cards: percentage, stage, verdict, blockers, warnings and the equipment beneath. Plus a card for tags in no system.' },
          { label: 'Note', text: 'Read-only, and worked out live from checks, tests and punch items. The banner is the point: this is an assessment, not an authorisation.' },
        ],
      },
      {
        href: '/rules',
        title: 'Rule Checks',
        lede: 'Free checks over the punch list, the photographs and the dates. No AI, nothing stored, nothing to dismiss.',
        facts: [
          { label: 'You see', text: 'Findings in four areas — checks and dependencies, photographs, punch list, dates and progress — each with a severity, a count, examples and a link.' },
          { label: 'You can', text: 'Open a worked example that adds sample records built to trip each rule, so you can see what each one catches, then remove them again.' },
          { label: 'Note', text: 'Everything recomputes on load. There is no acknowledge button, because a finding that can be dismissed is a finding that will be.' },
        ],
      },
      {
        href: '/validity',
        title: 'Validity Review',
        lede: 'Not what has been done — whether the record supports what it claims.',
        facts: [
          { label: 'You see', text: 'Contradictions, gaps, things worth a look, and how many records were examined. Then each finding with its detail and why it matters.' },
          { label: 'You can', text: 'Filter by severity and export to PDF or Word, with the filter carried into the file.' },
          { label: 'Note', text: 'Everything above is arithmetic. There is one optional AI button, Read the list, described under Where AI is used.' },
        ],
      },
      {
        href: '/review',
        title: 'Review & Approvals',
        facts: [
          { label: 'You see', text: 'The approval chain for checklist items, which is separate from pass and fail. A check can pass and still be waiting on somebody.' },
          { label: 'You can', text: 'Set a review state per check with a reason if rejected, or apply one to everything currently filtered.' },
        ],
      },
      {
        href: '/dossier',
        title: 'Handover Packs',
        facts: [
          { label: 'You see', text: 'A chooser, not the pack: one row per project, site, area, system or subsystem with a verdict — Nothing to hand over, Not ready, Incomplete record, or Records support handover.' },
          { label: 'You can', text: 'Generate the pack as PDF or Word, optionally with closed punch items, optionally with photographs.' },
          { label: 'Careful', text: 'The chooser skips some queries to stay fast, so a generated pack can report gaps the chooser did not show. Trust the pack, not the list.' },
        ],
      },
    ],
  },
  {
    id: 'g-manage',
    title: 'Manage, people and reports',
    standfirst: 'The registers around the work, and the documents that come out of it.',
    screens: [
      {
        href: '/meetings',
        title: 'Meetings',
        facts: [
          { label: 'You see', text: 'Commissioning meetings with title, date, attendees and notes — and, highlighted separately, the decisions and actions taken at them.' },
          { label: 'You can', text: 'Add a meeting, open any row to edit it in place, and delete one.' },
          { label: 'Note', text: 'The decisions field is kept apart from the notes on purpose. Minutes get skimmed; a decision that changed the programme is what somebody comes back looking for months later.' },
        ],
      },
      {
        href: '/notifications',
        title: 'Alerts & Notices',
        facts: [
          { label: 'You see', text: 'Live alerts computed from instruments, tests, checks, issues and contacts — then the notice register, newest first, with the full text of each notice.' },
          { label: 'Note', text: 'A notice is immutable once written. On a witness point the notice is what proves the client was invited, so nothing may alter it afterwards.' },
          { label: 'Note', text: 'Notices are created from Hold & Witness Points, not here.' },
        ],
      },
      {
        href: '/team',
        title: 'Project Team',
        lede: 'Who is on the project, and what they may do. Roles and Contacts are set from here.',
        covers: ['/roles', '/contacts'],
        facts: [
          { label: 'You see', text: 'Each member with their company, role and capability list, then a full role-by-capability matrix using this project’s own resolved role list.' },
          { label: 'You can', text: 'Add somebody to the project, change a role, reset a password, or remove them.' },
          { label: 'Invitations', text: 'There is no emailed invitation link. Tick Create a sign-in account for them and a temporary password is generated and shown to you once, on this screen. It is never logged and never written to the audit trail. You pass it on yourself.' },
          { label: 'Roles', text: 'A project may rename a built-in role, change what it may do, switch it off, or add one of its own — and import and export the lot as a spreadsheet. Super Admin and Project Admin always keep every capability.' },
          { label: 'Contacts', text: 'People outside the login system who receive inspection notices. A contact is not a login. Somebody can be both, and is then added in both places.' },
          { label: 'Needs first', text: 'The manage capability. Without it you see a read-only view.' },
        ],
      },
      {
        href: '/reports/daily',
        title: 'Daily Report',
        facts: [
          { label: 'You see', text: 'One day, built from the audit log: test entries, check entries, failures, notices, signatures and gate answers; who entered work; then the day sectioned by activity.' },
          { label: 'You can', text: 'Step back and forward a day, jump to a date, and export PDF, Word or Excel.' },
          { label: 'Careful', text: 'This is who entered work into the system, not a manpower return. The page prints that caveat on itself.' },
        ],
      },
      {
        href: '/reports',
        title: 'Progress Report',
        facts: [
          { label: 'You see', text: 'A one-page printable report: four figures — checks resolved, approved, evidence on file and blocking items — then progress by level, status by equipment, what is blocking handover, punch by category, the schedule, the approval chains and the failed checks.' },
          { label: 'You can', text: 'Download the whole thing as Excel, or print the page as it stands.' },
          { label: 'It works out', text: 'The headline sentence at the top is generated from the figures beneath it, not written by anybody, so it cannot drift away from what the records say.' },
        ],
      },
      {
        href: '/audit',
        title: 'Audit Trail',
        facts: [
          { label: 'You see', text: 'The last 300 changes: when, who, with their role, what action, which record, and old value to new value.' },
          { label: 'Note', text: 'Nothing here can be edited or deleted — the database itself refuses it. This is also where import failures are written: every bad row, with its reason and its row number in your original file.' },
        ],
      },
    ],
  },
]

/**
 * Routes that are not screens of the application and so have no entry.
 *
 * Only one: the manual itself. Kept as a named list rather than a special
 * case inside the check, so adding to it is a visible decision somebody has
 * to write down.
 */
export const NOT_A_SCREEN = ['/manual']

/** Every route the manual documents, including the ones covered inside another entry. */
export function documentedHrefs(): string[] {
  return MANUAL_GROUPS.flatMap((g) => g.screens.flatMap((s) => [s.href, ...(s.covers ?? [])]))
}

/**
 * Routes in the navigation that the manual says nothing about.
 *
 * This is the whole reason the manual is data. Call it with `allHrefs()` from
 * the nav model and it names what has been added to the application and not
 * yet written down — which is the failure a manual has, rather than being
 * wrong.
 */
export function undocumented(navHrefs: string[]): string[] {
  const known = new Set([...documentedHrefs(), ...NOT_A_SCREEN])
  return navHrefs.filter((h) => !known.has(h))
}

/** Entries pointing at a route the rail does not have — the other direction. */
export function documentsNothing(navHrefs: string[]): string[] {
  const real = new Set(navHrefs)
  return documentedHrefs().filter((h) => !real.has(h))
}
