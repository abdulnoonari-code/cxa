// THE CxNIVORA HIERARCHY, and the options on it.
//
// ── Why this file is worth more than it looks ───────────────────────────
//
// The structure of this application has been described in four places at
// once — the sheet header, the tree page, the setup screen and my own
// explanations — and they disagreed, repeatedly, for a week. Every time
// one was corrected the others were not, and the person using it was left
// to work out which description was the real one.
//
// src/lib/levels-standard.ts is now the only description. This file holds
// it to its shape, and holds the rest of the application to it.
import {
  HIERARCHY, LEVEL_BY_KEY, SHEET_LEVELS, ALL_LEVELS,
  levelsInUse, sheetColumnsFor, refuseToSwitchOff, checklistsSaved,
  type LevelKey,
} from '@/lib/levels-standard'
import { HIERARCHY_HEADER, HIERARCHY_EXAMPLE, hierarchyFromRows } from '@/lib/hierarchy-io'

let pass = 0, fail = 0
function ok(n: string, c: boolean, extra = '') { if (c) pass++; else { fail++; console.log('FAIL: ' + n + (extra ? ' — ' + extra : '')) } }
function eq(n: string, a: unknown, b: unknown) { ok(n, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`) }

// ════════ THE SIX LEVELS, IN ORDER ════════
{
  eq('six levels', HIERARCHY.map((l) => l.key),
     ['project', 'asset', 'system', 'subsystem', 'equipment', 'tag'])
  eq('depths run 0..5 with no gaps', HIERARCHY.map((l) => l.depth), [0, 1, 2, 3, 4, 5])
  eq('labelled as he says them', HIERARCHY.map((l) => l.label),
     ['Project', 'Asset', 'System', 'Subsystem', 'Equipment', 'Tag'])

  for (const l of HIERARCHY) {
    ok(`${l.label} says what it is`, l.means.length > 15 && /[.!?]$/.test(l.means), l.means)
    ok(`${l.label} has a real example`, l.example.length > 0)
    ok(`${l.label} names its table`, /^[a-z_]+$/.test(l.table))
    eq(`${l.label} is indexed by its own key`, LEVEL_BY_KEY[l.key].label, l.label)
  }

  eq('every level has its own table', new Set(HIERARCHY.map((l) => l.table)).size, HIERARCHY.length)
}

// ════════ EQUIPMENT AND TAG ARE TWO LEVELS ════════
//
// The one that was wrong, and the reason the whole file exists. Collapse
// these two and a hundred identical panels need a hundred checklists.
{
  const equipment = LEVEL_BY_KEY.equipment
  const tag = LEVEL_BY_KEY.tag

  ok('Equipment sits directly above Tag', tag.depth === equipment.depth + 1)
  ok('they are different tables', equipment.table !== tag.table)
  eq('Equipment is the kinds table', equipment.table, 'equipment_types')
  eq('Tag is the items table', tag.table, 'equipment')

  // The argument for the level, evaluated rather than asserted.
  const { withLevel, without } = checklistsSaved(100, 18)
  eq('one checklist of 18 checks covers a hundred panels', withLevel, 18)
  eq('  …and without the level it is eighteen hundred', without, 1800)
  ok('  …which is the whole point', without > withLevel * 50)

  eq('nothing saved when there is one tag', checklistsSaved(1, 18), { withLevel: 18, without: 18 })
  eq('a nonsense count cannot go negative', checklistsSaved(-5, -5), { withLevel: 0, without: 0 })
}

// ════════ THE SPINE CANNOT BE SWITCHED OFF ════════
{
  eq('three levels are the spine', HIERARCHY.filter((l) => !l.optional).map((l) => l.key),
     ['project', 'system', 'tag'])
  eq('three are optional', HIERARCHY.filter((l) => l.optional).map((l) => l.key),
     ['asset', 'subsystem', 'equipment'])

  for (const key of ['project', 'system', 'tag'] as LevelKey[]) {
    const reason = refuseToSwitchOff(key)
    ok(`${key} is refused`, reason !== null)
    ok(`  …with a reason that names it`, !!reason && reason.includes(LEVEL_BY_KEY[key].label))
  }
  for (const key of ['asset', 'subsystem', 'equipment'] as LevelKey[]) {
    eq(`${key} may be switched off`, refuseToSwitchOff(key), null)
  }
  ok('a level that does not exist is refused, not waved through',
     refuseToSwitchOff('nonsense' as LevelKey) !== null)
}

// ════════ SAYING NOTHING MEANS THE FULL LADDER ════════
//
// The safe direction: nothing is hidden from somebody who has not chosen
// to hide it.
{
  eq('no setting at all runs all six', levelsInUse(null).map((l) => l.key),
     ['project', 'asset', 'system', 'subsystem', 'equipment', 'tag'])
  eq('an empty setting is the same', levelsInUse({}).length, 6)
  eq('ALL_LEVELS is the same', levelsInUse(ALL_LEVELS).length, 6)

  // Only an explicit false removes a level. A missing key is not a "no".
  eq('a level set true is in', levelsInUse({ asset: true }).map((l) => l.key).includes('asset'), true)
  eq('a level set false is out', levelsInUse({ asset: false }).map((l) => l.key).includes('asset'), false)
}

// ════════ THE SHEET FOLLOWS THE SETTING ════════
{
  eq('the full sheet is five columns plus description',
     SHEET_LEVELS.map((l) => l.label), ['Asset', 'System', 'Subsystem', 'Equipment', 'Tag'])

  eq('a job with no assets loses that column',
     sheetColumnsFor({ asset: false }).map((l) => l.label),
     ['System', 'Subsystem', 'Equipment', 'Tag'])

  eq('a job of one-off items loses Equipment too',
     sheetColumnsFor({ asset: false, subsystem: false, equipment: false }).map((l) => l.label),
     ['System', 'Tag'])

  ok('and the spine survives every setting',
     sheetColumnsFor({ asset: false, subsystem: false, equipment: false, system: false, tag: false } as never)
       .map((l) => l.label).join(',') === 'System,Tag')
}

// ════════ THE APPLICATION AGREES WITH THE STANDARD ════════
//
// The sheet header is written in hierarchy-io.ts and the levels here.
// They were separate lists of words, which is how four descriptions of one
// structure came to disagree.
{
  eq('the sheet header is the levels, then Description',
     [...HIERARCHY_HEADER], [...SHEET_LEVELS.map((l) => l.label), 'Description'])
}

// ════════ A HUNDRED PANELS, WRITTEN ONCE ════════
//
// The shape the sheet has to support, read by the real reader.
{
  const rows: string[][] = [
    ['22 kV Switchroom', 'MV Switchgear', 'Incomer', 'MV Panel', 'MV-SWGR-001', 'Incomer'],
  ]
  for (let i = 2; i <= 100; i++) {
    rows.push(['', '', '', '', `MV-SWGR-${String(i).padStart(3, '0')}`, ''])
  }
  rows.push(['', 'Transformers', '', 'Dry Transformer', 'TX-01', '22/0.4 kV'])

  const h = hierarchyFromRows([[...HIERARCHY_HEADER], ...rows])

  eq('no problems', h.problems, [])
  eq('a hundred and one tags', h.tags.length, 101)
  eq('written with Equipment named twice', h.equipmentTypes, ['MV Panel', 'Dry Transformer'])
  ok('every panel carried the equipment down',
     h.tags.slice(0, 100).every((t) => t.equipmentType === 'MV Panel'),
     JSON.stringify(h.tags.slice(0, 3)))
  eq('  …and the transformer did not inherit it', h.tags[100].equipmentType, 'Dry Transformer')
  eq('  …nor its description', h.tags[1].description, '')
}

// ════════ A NEW LEVEL CLEARS THE EQUIPMENT UNDER IT ════════
//
// The trap that made me refuse to fill Equipment down at all. The reset is
// the right answer; refusing cost a hundred checklists.
{
  const HEAD = [...HIERARCHY_HEADER]
  const sheet = (...r: unknown[][]) => hierarchyFromRows([HEAD, ...r])

  const bySystem = sheet(
    ['Room A', 'MV Switchgear', '', 'MV Panel', 'MV-01', 'a'],
    ['', 'Transformers', '', '', 'TX-01', 'b'],
  )
  eq('a new system clears the equipment', bySystem.tags[1].equipmentType, '')

  const byAsset = sheet(
    ['Room A', 'MV Switchgear', '', 'MV Panel', 'MV-01', 'a'],
    ['Room B', 'LV Distribution', '', '', 'LV-01', 'b'],
  )
  eq('a new asset clears it too', byAsset.tags[1].equipmentType, '')

  const bySub = sheet(
    ['Room A', 'MV Switchgear', 'Incomer', 'MV Panel', 'MV-01', 'a'],
    ['', '', 'Feeder 1', '', 'MV-02', 'b'],
  )
  eq('and so does a new subsystem', bySub.tags[1].equipmentType, '')

  const same = sheet(
    ['Room A', 'MV Switchgear', 'Incomer', 'MV Panel', 'MV-01', 'a'],
    ['', '', '', '', 'MV-02', 'b'],
  )
  eq('but staying in place carries it down', same.tags[1].equipmentType, 'MV Panel')
}

// ════════ "EQUIPMENT" USED TO MEAN THE TAG ════════
//
// Every register anybody already has calls the item "Equipment". Now that
// Equipment is a level, a sheet whose only item column is called that
// would otherwise load with no tags at all.
{
  const legacy = hierarchyFromRows([
    ['System', 'Equipment', 'Description'],
    ['MV Switchgear', 'MV-01', 'The incomer'],
  ])
  eq('a sheet with Equipment and no Tag reads Equipment as the tag', legacy.problems, [])
  eq('  …the tag is that column', legacy.tags[0].tag, 'MV-01')
  eq('  …and there is no equipment level', legacy.equipmentTypes, [])

  const both = hierarchyFromRows([
    ['System', 'Equipment', 'Tag'],
    ['MV Switchgear', 'MV Panel', 'MV-01'],
  ])
  eq('a sheet with both is unambiguous', both.problems, [])
  eq('  …Equipment is the kind', both.equipmentTypes, ['MV Panel'])
  eq('  …and Tag is the tag', both.tags[0].tag, 'MV-01')
}

// ════════ THE EXAMPLE SHEET TEACHES THE SHAPE ════════
//
// An example that writes the Equipment on every row teaches the wrong
// habit, and the wrong habit is the hundred checklists.
{
  const equipmentCol = HIERARCHY_HEADER.indexOf('Equipment')
  ok('the example has an Equipment column', equipmentCol >= 0)

  const blanks = HIERARCHY_EXAMPLE.filter((r) => (r[equipmentCol] ?? '') === '').length
  ok('the example leaves the Equipment cell blank on repeat rows', blanks >= 2,
     `${blanks} blank of ${HIERARCHY_EXAMPLE.length}`)

  const h = hierarchyFromRows([[...HIERARCHY_HEADER], ...HIERARCHY_EXAMPLE])
  eq('and it still imports cleanly', h.problems, [])
  ok('with more tags than equipment, which is the lesson',
     h.tags.length > h.equipmentTypes.length,
     `${h.tags.length} tags, ${h.equipmentTypes.length} equipment`)
}

console.log(`${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
