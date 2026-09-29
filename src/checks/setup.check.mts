// The one page that sets up the whole project.
//
// ── What can go wrong here, and why a test is worth it ──────────────────
//
// This list is a TABLE OF CONTENTS pointing at eleven screens and twenty
// route handlers that live somewhere else. Nothing in the type system ties
// a string like '/obligations/template' to the file that serves it. Rename
// or move one route and the button goes on rendering perfectly and returns
// a 404 when somebody presses it — and they press it while setting up a
// real job, which is the worst moment to find out.
//
// So every href in the list is checked against the files on disk.
import fs from 'fs'
import path from 'path'
import { SETUP_SHEETS, ASSET_SHEET, HIERARCHY_LEVELS, HIERARCHY_COLUMNS } from '@/lib/setup-sheets'
import { HIERARCHY_HEADER } from '@/lib/hierarchy-io'

let pass = 0, fail = 0
function ok(n: string, c: boolean, extra = '') { if (c) pass++; else { fail++; console.log('FAIL: ' + n + (extra ? ' — ' + extra : '')) } }
function eq(n: string, a: unknown, b: unknown) { ok(n, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`) }

const APP = path.join(process.cwd(), 'src', 'app')
const served = (href: string, kind: 'route' | 'page') => {
  const file = kind === 'route' ? 'route.ts' : 'page.tsx'
  return fs.existsSync(path.join(APP, href.replace(/^\//, ''), file))
}

// ════════ EVERY BUTTON POINTS AT SOMETHING THAT EXISTS ════════
for (const s of [ASSET_SHEET, ...SETUP_SHEETS]) {
  if (s.exportHref) ok(`${s.key}: Export → ${s.exportHref}`, served(s.exportHref, 'route'))
  if (s.templateHref) ok(`${s.key}: Blank → ${s.templateHref}`, served(s.templateHref, 'route'))
  ok(`${s.key}: the screen → ${s.page}`, served(s.page, 'page'))
}

// Planted check: the assertion above must actually fail on a bad path, or
// it is a loop that proves the loop ran.
ok('a route that does not exist is not reported as served', !served('/no-such-route-at-all', 'route'))
ok('a page that does not exist is not reported as served', !served('/no-such-page-at-all', 'page'))

// ════════ THE LIST IS USABLE AS A LIST ════════
{
  const steps = SETUP_SHEETS.map((s) => s.step)
  eq('the steps run 1..n with no gaps and no repeats', steps, steps.map((_, i) => i + 1))

  const keys = SETUP_SHEETS.map((s) => s.key)
  eq('every key is distinct', new Set(keys).size, keys.length)

  // ── THE ASSET LIST IS NOT ONE OF THE OTHERS ──
  //
  // It was row 1 of a table of eleven, which put it on a level with the
  // punch list. It is the file every other sheet depends on — everything
  // else attaches to tags that only this one creates. If it ever gets
  // folded back into the list, this goes red.
  eq('the asset list stands on its own', ASSET_SHEET.key, 'hierarchy')
  ok('  …and is marked as the one to start with', ASSET_SHEET.first === true)
  ok('  …and is not also in the list below it',
     !SETUP_SHEETS.some((s) => s.key === ASSET_SHEET.key))
  ok('  …and its export doubles as its template, so there is no format to guess at',
     !!ASSET_SHEET.exportHref && ASSET_SHEET.templateHref === null)
  ok('nothing in the list below claims to be the starting point',
     !SETUP_SHEETS.some((s) => s.first))

  for (const s of SETUP_SHEETS) {
    ok(`${s.key} says what it builds`, s.builds.length > 20 && /[.!?]$/.test(s.builds), s.builds)
    // A row with no import form must offer somewhere to go instead, or it
    // is a dead row on a page whose whole job is telling you what to do.
    if (s.linkOnly) ok(`${s.key} is a link-only row and still names a screen`, !!s.page)
  }
}

// ════════ EVERY SHEET WITH AN IMPORT HAS A WAY TO GET THE FORMAT ════════
//
// The lesson from the hierarchy sheet: the hard part was never uploading,
// it was knowing what the file had to look like. A row offering an Import
// box and no Export and no Blank is that same trap, rebuilt.
for (const s of [ASSET_SHEET, ...SETUP_SHEETS]) {
  if (s.linkOnly) continue
  ok(`${s.key} offers a sheet to start from`, !!(s.exportHref || s.templateHref),
     'an Import box with no Export and no Blank is a format to guess at')
}

// ════════ THE HIERARCHY IS STATED ONCE AND STATED WHOLE ════════
{
  eq('six levels', HIERARCHY_LEVELS.map((l) => l.label),
     ['Project', 'Asset', 'System', 'Subsystem', 'Equipment', 'Tag'])
  eq('the depths are 0..5 in order', HIERARCHY_LEVELS.map((l) => l.depth), [0, 1, 2, 3, 4, 5])
  for (const l of HIERARCHY_LEVELS) {
    ok(`${l.label} has an example`, l.example.length > 0)
    ok(`${l.label} says what it is`, l.note.length > 10 && /[.!?]$/.test(l.note))
  }
  // EQUIPMENT IS A LEVEL, and Tag sits under it. Collapse the two and a
  // hundred identical panels need a hundred checklists, because there is
  // nowhere above a tag for one to attach.
  {
    const equipment = HIERARCHY_LEVELS.find((l) => l.label === 'Equipment')
    const tag = HIERARCHY_LEVELS.find((l) => l.label === 'Tag')
    ok('Equipment is one of the levels', !!equipment)
    ok('  …and Tag sits directly under it', !!equipment && !!tag && tag.depth === equipment.depth + 1)
  }
}

// ════════ THE PAGE CANNOT ADVERTISE A COLUMN THE READER IGNORES ════════
//
// The chips on the setup card are the promise; HIERARCHY_HEADER is what the
// export writes and the importer reads. They were separate strings, and a
// separate string is a string that drifts — somebody adds a column to the
// sheet and the page still names the old six, or the page names a seventh
// that no importer has ever looked at.
//
// This is the same lesson as the exported example sheet, which the reader
// refused on the very first try because two files held two copies of one
// format.
{
  eq('the chips on the page are exactly the columns of the sheet',
     HIERARCHY_COLUMNS.map((c) => c.name), [...HIERARCHY_HEADER])

  const levels = HIERARCHY_COLUMNS.filter((c) => c.level).map((c) => c.name)
  eq('five of them are levels of the tree', levels,
     ['Asset', 'System', 'Subsystem', 'Equipment', 'Tag'])

  // EQUIPMENT IS A LEVEL. An earlier version of this file asserted the
  // opposite, on the reasoning that a type carried down by accident puts
  // the switchgear checklist on a transformer. That risk is real and the
  // answer to it is the fill-down RESET, not refusing the level — and
  // refusing it meant a hundred identical panels needed a hundred
  // checklists, because there was nowhere above a tag to attach one.
  ok('Equipment is marked as a level',
     HIERARCHY_COLUMNS.some((c) => c.name === 'Equipment' && c.level))
  ok('Description is the only column that is not a level',
     HIERARCHY_COLUMNS.filter((c) => !c.level).map((c) => c.name).join() === 'Description')

  // Every level named on the card must be a level named in the hierarchy
  // diagram below it, or the page contradicts itself half a screen apart.
  for (const name of levels) {
    ok(`"${name}" is also in the hierarchy diagram`,
       HIERARCHY_LEVELS.some((l) => l.label === name))
  }
}

console.log(`${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
