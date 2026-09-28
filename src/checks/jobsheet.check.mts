// The one-sheet importer, against the sheets people actually send.
//
// Every importer in this application was built from my guess at what a
// commissioning register looks like, and that guess has never been checked
// against a real file. So the fixtures below are not tidy: they have title
// rows above the table, merged-looking blanks, a subsystem column somebody
// left out, headers spelled six different ways, and a copy-paste that went
// one row too far. Those are the sheets, not the exception.
//
// The rule this file holds above all others: A JOB HALF IMPORTED IS WORSE
// THAN ONE NOT IMPORTED, because the half that is there looks finished.
import { planFromRows } from '@/lib/jobsheet-io'
import { matchLevel } from '@/lib/checklist-io'

let pass = 0, fail = 0
function ok(n: string, c: boolean, extra = '') { if (c) pass++; else { fail++; console.log('FAIL: ' + n + (extra ? ' — ' + extra : '')) } }
function eq(n: string, a: unknown, b: unknown) { ok(n, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`) }

const HEAD = ['System', 'Subsystem', 'Tag', 'Description', 'Level', 'Check', 'Notes']

// ════════ THE ORDINARY CASE ════════
{
  const p = planFromRows([
    HEAD,
    ['SUDB-MV-SWGR', 'Incomer', 'SUDB-MV-SWGR-01', '22 kV incomer', 'L2', 'Busbar bolt torque', '55 Nm'],
    ['SUDB-MV-SWGR', 'Incomer', 'SUDB-MV-SWGR-01', '22 kV incomer', 'L3', 'Insulation resistance', '>100 MOhm'],
    ['SUDB-MV-SWGR', 'Feeder 1', 'SUDB-MV-SWGR-02', 'Feeder to DCDB', 'L2', 'Busbar bolt torque', '55 Nm'],
    ['DCDB-01', '', 'DCDB-01-MAIN', 'DC main board', 'L2', 'Earth continuity', ''],
  ])
  eq('no problems', p.problems, [])
  eq('four checks', p.checks.length, 4)
  eq('two systems', p.systems, ['SUDB-MV-SWGR', 'DCDB-01'])
  eq('two subsystems, both under the right system',
     p.subsystems, [{ system: 'SUDB-MV-SWGR', name: 'Incomer' }, { system: 'SUDB-MV-SWGR', name: 'Feeder 1' }])
  eq('three tags', p.tags.map((t) => t.tag), ['SUDB-MV-SWGR-01', 'SUDB-MV-SWGR-02', 'DCDB-01-MAIN'])
  eq('a tag keeps its description', p.tags[0].description, '22 kV incomer')
  eq('a tag with no subsystem is allowed', p.tags[2].subsystem, '')
  eq('the level is translated to the application’s own value', p.checks[0].level, 'L2_iv')
  eq('the notes column carries the acceptance criteria', p.checks[1].notes, '>100 MOhm')
}

// ════════ FILL-DOWN, WHICH IS THE WHOLE POINT ════════
//
// Nobody repeats the tag on twenty rows. They type it once and leave the
// rest blank, or merge the cells, which comes through as blanks.
{
  const p = planFromRows([
    HEAD,
    ['SUDB-MV-SWGR', 'Incomer', 'SUDB-MV-SWGR-01', '22 kV incomer', 'L2', 'Busbar bolt torque', ''],
    ['', '', '', '', 'L2', 'Phase identification', ''],
    ['', '', '', '', 'L3', 'Insulation resistance', ''],
    ['', 'Feeder 1', 'SUDB-MV-SWGR-02', 'Feeder to DCDB', 'L2', 'Busbar bolt torque', ''],
    ['', '', '', '', 'L3', 'Phase rotation', ''],
  ])
  eq('a blank sheet of blanks still parses', p.problems, [])
  eq('five checks', p.checks.length, 5)
  eq('two tags, not five', p.tags.length, 2)
  eq('the system carried all the way down', p.systems, ['SUDB-MV-SWGR'])
  eq('the second tag took its own subsystem', p.tags[1].subsystem, 'Feeder 1')
  eq('  …and the rows under it inherited that, not the first one’s',
     p.rows[4].subsystem, 'Feeder 1')
}

// ════════ A NEW TAG DOES NOT INHERIT THE OLD ONE'S SUBSYSTEM ════════
//
// The trap in fill-down. Tag A is under "Incomer". Tag B is named on its
// own row with the subsystem left blank because it has none. Carrying the
// subsystem forward would file B under Incomer, where its owner will never
// look for it, and nothing on any screen would say so.
{
  const p = planFromRows([
    HEAD,
    ['SW-01', 'Incomer', 'TAG-A', 'A', 'L2', 'Check one', ''],
    ['', '', 'TAG-B', 'B', 'L2', 'Check two', ''],
  ])
  eq('no problems', p.problems, [])
  eq('the first tag keeps its subsystem', p.tags[0].subsystem, 'Incomer')
  eq('the NEW tag does not inherit it', p.tags[1].subsystem, '')
  eq('  …and neither does its description', p.tags[1].description, 'B')
}

// ════════ A TITLE ABOVE THE TABLE ════════
//
// Every real sheet has one. A company name, a project number, a blank row,
// then the table. An importer that insists the header is row 1 refuses
// nearly every file it is given.
{
  const p = planFromRows([
    ['BANG PAKONG 230/22 kV SUBSTATION — PACKAGE 2'],
    ['Commissioning register, rev C'],
    [],
    HEAD,
    ['SW-01', '', 'TAG-A', 'A', 'L2', 'Check one', ''],
  ])
  eq('the header is found further down', p.problems, [])
  eq('and the row under it is read', p.checks.length, 1)
  eq('  …with the right row number for the error list', p.rows[0].row, 5)
}

// ════════ HEADERS SPELLED HOWEVER ════════
{
  const p = planFromRows([
    ['Sys', 'Bay', 'KKS', 'Equipment Description', 'Cx Level', 'Activity', 'Acceptance Criteria'],
    ['SW-01', 'Bay 1', 'TAG-A', 'The incomer', 'Level 2', 'Torque', '55 Nm'],
  ])
  eq('no problems', p.problems, [])
  eq('one check', p.checks.length, 1)
  eq('the description column was not stolen by the tag column', p.tags[0].description, 'The incomer')
  eq('and the preview says which column each field came from',
     p.columns.description, 'Equipment Description')
}

// ════════ IT REFUSES RATHER THAN GUESSES ════════
{
  const noHeader = planFromRows([['a', 'b'], ['c', 'd']])
  ok('a sheet with no recognisable header is refused', noHeader.problems.length > 0)
  eq('  …and nothing is planned from it', noHeader.checks.length, 0)

  const missing = planFromRows([['System', 'Tag'], ['SW-01', 'TAG-A']])
  ok('a header missing Level and Check is refused', missing.problems.some((p) => /missing/i.test(p.message)),
     JSON.stringify(missing.problems))
  eq('  …and nothing is planned', missing.checks.length, 0)

  const badLevel = planFromRows([HEAD, ['SW-01', '', 'TAG-A', 'A', 'L9', 'Check one', '']])
  ok('an unknown level is named, not guessed', badLevel.problems.some((p) => p.column === 'Level' && p.value === 'L9'),
     JSON.stringify(badLevel.problems))
  eq('  …and that row is not planned', badLevel.checks.length, 0)

  const noCheck = planFromRows([HEAD, ['SW-01', '', 'TAG-A', 'A', 'L2', '', '']])
  ok('a tag with no check on the row is reported', noCheck.problems.some((p) => p.column === 'Check'))

  const orphan = planFromRows([HEAD, ['', '', '', '', 'L2', 'Check one', '']])
  ok('a first row with nothing to inherit from is reported, not left blank',
     orphan.problems.some((p) => p.column === 'System'), JSON.stringify(orphan.problems))
}

// ════════ THE COPY-PASTE THAT WENT ONE ROW TOO FAR ════════
{
  const p = planFromRows([
    HEAD,
    ['SW-01', '', 'TAG-A', 'A', 'L2', 'Busbar bolt torque', ''],
    ['SW-01', '', 'TAG-A', 'A', 'L2', 'Busbar bolt torque', ''],
  ])
  ok('the same check twice on the same tag is reported', p.problems.some((x) => /already on row 2/.test(x.message)),
     JSON.stringify(p.problems))
  // Case and spacing must not let it through — "Busbar Bolt Torque" is the
  // same check to everybody except a string comparison.
  const q = planFromRows([
    HEAD,
    ['SW-01', '', 'TAG-A', 'A', 'L2', 'Busbar bolt torque', ''],
    ['SW-01', '', 'TAG-A', 'A', 'L2', 'BUSBAR BOLT TORQUE', ''],
  ])
  ok('  …whatever case it is typed in', q.problems.some((x) => /already on row/.test(x.message)))
}

// ════════ ONE TAG IN TWO PLACES ════════
//
// A typo in one of the two rows. Picking either one files the equipment
// somewhere its owner will not look, and nothing would ever say so.
{
  const p = planFromRows([
    HEAD,
    ['SW-01', '', 'TAG-A', 'A', 'L2', 'Check one', ''],
    ['SW-02', '', 'TAG-A', 'A', 'L3', 'Check two', ''],
  ])
  ok('a tag under two systems is reported', p.problems.some((x) => /under "SW-01".*and "SW-02"/.test(x.message)),
     JSON.stringify(p.problems))

  const q = planFromRows([
    HEAD,
    ['SW-01', 'Incomer', 'TAG-A', 'A', 'L2', 'Check one', ''],
    ['SW-01', 'Feeder 1', 'TAG-A', 'A', 'L3', 'Check two', ''],
  ])
  ok('a tag under two subsystems is reported', q.problems.some((x) => x.column === 'Subsystem'),
     JSON.stringify(q.problems))
}

// ════════ BLANK ROWS AND STRAY SPACES ════════
{
  const p = planFromRows([
    HEAD,
    ['SW-01', '', 'TAG-A', 'A', 'L2', 'Check one', ''],
    [],
    ['', '', '', '', '', '', ''],
    ['SW-02', '', 'TAG-B', 'B', 'L2', 'Check two', ''],
  ])
  eq('blank rows are skipped, not reported', p.problems, [])
  eq('  …and do not break the fill-down', p.checks.length, 2)
  eq('  …and the second block keeps its own system', p.tags[1].system, 'SW-02')
}

// ════════ NOTHING IS WRITTEN ════════
//
// The parser must be pure. If it ever grows a database call, an import
// preview starts changing the job it is previewing.
{
  const p = planFromRows([HEAD, ['SW-01', '', 'TAG-A', 'A', 'L2', 'Check one', '']])
  ok('a plan is a plan, not an action', typeof p === 'object' && 'checks' in p && 'problems' in p)
  eq('  …and says how many of each thing it would make',
     [p.systems.length, p.subsystems.length, p.tags.length, p.checks.length], [1, 0, 1, 1])
}

// ════════ THE LEVEL SPELLINGS PEOPLE ACTUALLY TYPE ════════
//
// Found by the fixture above. matchLevel's own comment claimed "Level 2"
// worked. It did not, and had not since it was written: the pattern was
// /^l\s*([1-5])/ — an l, spaces, a digit — so after the "l" of "Level"
// came an "e" and the match failed. It fell through to a label search where
// "level 2" is not a substring of "L2 — Installation Verification (IV)".
//
// The commonest spelling in the industry, silently refused, under a comment
// saying it was handled. Comments are what people read when checking
// whether something works.
{
  for (const [raw, want] of [
    ['L2', 'L2_iv'], ['l2', 'L2_iv'], ['L 2', 'L2_iv'],
    ['Level 2', 'L2_iv'], ['LEVEL 2', 'L2_iv'], ['level-2', 'L2_iv'],
    ['Lvl 2', 'L2_iv'], ['Stage 2', 'L2_iv'], ['CX2', 'L2_iv'],
    ['Phase 3', 'L3_prefunctional'], ['L2 - IV', 'L2_iv'], ['L5', 'L5_ist'],
  ] as const) {
    eq(`"${raw}" is level ${want}`, matchLevel(raw), want)
  }

  // And it must still refuse. A level this application does not have is a
  // mistake in the sheet, and guessing at it puts a check at the wrong
  // level, where it will hold the wrong gate.
  for (const raw of ['L9', 'Level 9', 'L', '2', 'Level two', 'levelling', 'the level of the busbar', '']) {
    eq(`"${raw}" is not a level`, matchLevel(raw), null)
  }
}

// ════════ THE TEMPLATE THIS APPLICATION HANDS OUT ════════
//
// The blank sheet is written by src/app/jobsheet/template/route.ts and read
// by src/lib/jobsheet-io.ts. Nothing connects those two files, so nothing
// stopped them disagreeing — and they did, immediately.
//
// The template ends with two italic lines explaining the fill-down and
// telling somebody to delete the example rows. Both landed in the System
// column and were read as rows with a system and no check on them. The
// first thing anybody downloads from this screen was refused by the
// importer on the same screen, with an error naming rows 8 and 9.
//
// Found by writing the file with one and reading it with the other. Neither
// was wrong on its own.
{
  const TEMPLATE_ROWS = [
    ['System', 'Subsystem', 'Tag', 'Description', 'Level', 'Check', 'Notes', 'ITP'],
    ['SUDB-MV-SWGR', 'Incomer', 'SUDB-MV-SWGR-01', '22 kV incomer', 'L2', 'Busbar bolt torque', '55 Nm', ''],
    ['', '', '', '', 'L3', 'Insulation resistance', '>100 MOhm at 5 kV', 'Witness'],
    ['', 'Feeder 1', 'SUDB-MV-SWGR-02', 'Feeder to DCDB', 'L2', 'Busbar bolt torque', '55 Nm', ''],
    ['', '', '', '', 'L3', 'Phase rotation', 'R-Y-B', ''],
    ['DCDB-01', '', 'DCDB-01-MAIN', 'DC main board', 'L2', 'Earth continuity', 'less than 0.1 Ohm', ''],
    [],
    ['Leave System, Subsystem, Tag and Description blank to carry them down from the row above — as rows 3 and 5 do.'],
    ['Only System, Tag, Level and Check are required. Delete these five example rows and this note before importing.'],
  ]
  const p = planFromRows(TEMPLATE_ROWS)
  eq('the blank template imports with no problems at all', p.problems, [])
  eq('  …five checks', p.checks.length, 5)
  eq('  …three tags', p.tags.length, 3)
  eq('  …and the ITP column is read', p.checks[1].itp, 'witness')
}

// ════════ A FOOTNOTE IS SKIPPED, A MISTAKE IS NOT ════════
//
// The rule that lets the template through must not become a rule that
// swallows rows. It is narrow: one cell, first column, sentence-shaped.
{
  const footer = planFromRows([
    HEAD,
    ['SW-01', '', 'TAG-A', 'A', 'L2', 'Check one', ''],
    ['Prepared by A. Jabbar, Commissioning Manager, 27 September 2026.'],
  ])
  eq('a prose footer is ignored', footer.problems, [])
  eq('  …and does not become a system', footer.systems, ['SW-01'])

  // A short thing on its own is NOT prose. "SW-02" alone is somebody
  // starting a block and forgetting the rest, and that must be reported.
  const stray = planFromRows([
    HEAD,
    ['SW-01', '', 'TAG-A', 'A', 'L2', 'Check one', ''],
    ['SW-02'],
  ])
  ok('a bare system name on its own row is still reported',
     stray.problems.some((x) => x.column === 'Check' || x.column === 'Level'),
     JSON.stringify(stray.problems))

  // And a row with a real check on it is never skipped, however long the
  // system name is.
  const long = planFromRows([
    HEAD,
    ['A very long system name that goes past fifty characters easily', '', 'TAG-A', 'A', 'L2', 'Check one', ''],
  ])
  eq('a long system name with a check on the row is kept', long.checks.length, 1)
}

console.log(`${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
