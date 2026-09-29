// The hierarchy sheet.
//
// ONE SHEET SETS UP THE WHOLE JOB: Asset, System, Subsystem, Equipment Type
// and Tags. The project is the substation — not a column, not a level, the
// thing you are already inside when you press the button.
//
// Asset, System and Subsystem are LEVELS and fill down. Equipment Type and
// Description are FACTS ABOUT ONE TAG and never fill down. That distinction
// is the source of most of the assertions below, because a level that fails
// to fill down is obvious and a fact that fills down by accident is not —
// it puts the wrong checklist on a piece of equipment, which is exactly the
// kind of wrong that gets signed off.
//
// These are not tidy sheets. They have titles above the table, blanks where
// cells were merged, headers spelled six ways, and a copy-paste that went
// one row too far. Those are the sheets people send.
import ExcelJS from 'exceljs'
import {
  hierarchyFromRows, hierarchyFromWorkbook, reconcileTree,
  HIERARCHY_HEADER, HIERARCHY_EXAMPLE, HIERARCHY_FOOTNOTES,
  type ExistingTree,
} from '@/lib/hierarchy-io'

let pass = 0, fail = 0
function ok(n: string, c: boolean, extra = '') { if (c) pass++; else { fail++; console.log('FAIL: ' + n + (extra ? ' — ' + extra : '')) } }
function eq(n: string, a: unknown, b: unknown) { ok(n, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`) }

const HEAD = [...HIERARCHY_HEADER]
/** Asset | System | Subsystem | Equipment Type | Tag | Description */
const sheet = (...rows: unknown[][]) => hierarchyFromRows([HEAD, ...rows])

const BARE: ExistingTree = { assets: [], systems: [], subsystems: [], equipmentTypes: [], tags: [] }

// ════════ THE ORDINARY CASE ════════
{
  const h = sheet(
    ['22 kV Switchroom', 'MV Switchgear', 'Incomer', 'MV Panel', 'MV-SWGR-01', '22 kV incomer'],
    ['', '', '', 'MV Panel', 'MV-SWGR-02', 'Bus section'],
    ['', '', 'Feeder 1', 'MV Panel', 'MV-SWGR-03', 'Feeder to TX-01'],
    ['', 'Transformers', '', 'Dry Transformer', 'TX-01', '22/0.4 kV'],
    ['LV Room', 'LV Distribution', '', 'LV Panel', 'LV-MDB-01', 'Main board'],
  )
  eq('no problems', h.problems, [])
  eq('two assets', h.assets, ['22 kV Switchroom', 'LV Room'])
  eq('three systems, each under its asset', h.systems, [
    { asset: '22 kV Switchroom', name: 'MV Switchgear' },
    { asset: '22 kV Switchroom', name: 'Transformers' },
    { asset: 'LV Room', name: 'LV Distribution' },
  ])
  eq('two subsystems, both under MV Switchgear', h.subsystems, [
    { asset: '22 kV Switchroom', system: 'MV Switchgear', name: 'Incomer' },
    { asset: '22 kV Switchroom', system: 'MV Switchgear', name: 'Feeder 1' },
  ])
  eq('three equipment types', h.equipmentTypes, ['MV Panel', 'Dry Transformer', 'LV Panel'])
  eq('five tags', h.tags.map((t) => t.tag), ['MV-SWGR-01', 'MV-SWGR-02', 'MV-SWGR-03', 'TX-01', 'LV-MDB-01'])
  eq('a tag keeps its description', h.tags[0].description, '22 kV incomer')
  eq('a tag keeps its equipment type', h.tags[0].equipmentType, 'MV Panel')
  eq('the asset carried down a blank cell', h.tags[3].asset, '22 kV Switchroom')
  eq('the second tag inherited the subsystem', h.tags[1].subsystem, 'Incomer')
  eq('the third took its own', h.tags[2].subsystem, 'Feeder 1')
}

// ════════ A NEW LEVEL CLEARS EVERYTHING UNDER IT ════════
//
// The trap in fill-down, and it now runs two levels deep. Without the
// reset, the first tag of a system with no bays inherits the last bay of
// the system above it — and is then filed somewhere its owner will never
// look, with nothing anywhere saying so.
{
  const h = sheet(
    ['Switchroom A', 'MV Switchgear', 'Incomer', '', 'MV-01', 'A'],
    ['', 'Transformers', '', '', 'TX-01', 'B'],
  )
  eq('no problems', h.problems, [])
  eq('a new system clears the subsystem', h.tags[1].subsystem, '')
  eq('  …and only one subsystem exists', h.subsystems.length, 1)

  const g = sheet(
    ['Switchroom A', 'MV Switchgear', 'Incomer', '', 'MV-01', 'A'],
    ['Switchroom B', '', '', '', 'XX-01', 'B'],
  )
  ok('a new asset with no system under it is reported rather than inherited',
     g.problems.some((p) => p.column === 'System'), JSON.stringify(g.problems))

  const j = sheet(
    ['Switchroom A', 'MV Switchgear', 'Incomer', '', 'MV-01', 'A'],
    ['Switchroom B', 'MV Switchgear', '', '', 'MV-11', 'B'],
  )
  eq('a new asset clears the subsystem too', j.tags[1].subsystem, '')
  eq('  …and the same system name in two assets is two systems', j.systems.length, 2)
}

// ════════ EQUIPMENT TYPE IS NOT A LEVEL AND MUST NOT FILL DOWN ════════
//
// The one that is invisible when it goes wrong. A transformer that silently
// inherits "MV Panel" from the row above gets the switchgear checklist, and
// somebody signs a busbar torque check against a transformer.
{
  const h = sheet(
    ['Switchroom A', 'MV Switchgear', '', 'MV Panel', 'MV-01', 'A'],
    ['', 'Transformers', '', '', 'TX-01', 'B'],
  )
  eq('no problems', h.problems, [])
  eq('the blank type stayed blank', h.tags[1].equipmentType, '')
  eq('  …and only the one named type exists', h.equipmentTypes, ['MV Panel'])

  const d = sheet(
    ['Switchroom A', 'MV Switchgear', '', 'MV Panel', 'MV-01', 'The incomer'],
    ['', '', '', 'MV Panel', 'MV-02', ''],
  )
  eq('description does not fill down either', d.tags[1].description, '')
}

// ════════ "ASSET" USED TO MEAN THE TAG ════════
//
// Every register anybody already has calls the equipment "Asset". Now that
// Asset is also the top level, a sheet whose only equipment column is called
// "Asset" would otherwise load with no tags at all — every row refused for
// naming a system and no tag, which reads as the importer being broken.
{
  const legacy = hierarchyFromRows([
    ['System', 'Asset', 'Description'],
    ['MV Switchgear', 'MV-01', 'The incomer'],
  ])
  eq('a sheet with Asset and no Tag reads Asset as the tag', legacy.problems, [])
  eq('  …the tag is the asset column', legacy.tags[0].tag, 'MV-01')
  eq('  …and there is no asset level', legacy.assets, [])

  const both = hierarchyFromRows([
    ['Asset', 'System', 'Tag'],
    ['Switchroom A', 'MV Switchgear', 'MV-01'],
  ])
  eq('a sheet with both is unambiguous and left alone', both.problems, [])
  eq('  …Asset is the level', both.assets, ['Switchroom A'])
  eq('  …and Tag is the tag', both.tags[0].tag, 'MV-01')
}

// ════════ EVERY LEVEL ABOVE SYSTEM IS OPTIONAL ════════
{
  const h = hierarchyFromRows([
    ['System', 'Tag', 'Description'],
    ['MV Switchgear', 'MV-01', 'A'],
  ])
  eq('a sheet with only System and Tag is fine', h.problems, [])
  eq('  …and names no assets', h.assets, [])
  eq('  …no subsystems', h.subsystems, [])
  eq('  …no equipment types', h.equipmentTypes, [])
  eq('  …with the system directly under the project', h.systems, [{ asset: '', name: 'MV Switchgear' }])
}

// ════════ A TITLE ABOVE THE TABLE ════════
{
  const h = hierarchyFromRows([
    ['BANG PAKONG 230/22 kV SUBSTATION'],
    ['Equipment register, rev C'],
    [],
    HEAD,
    ['', 'MV Switchgear', '', '', 'MV-01', 'A'],
  ])
  eq('the header is found further down', h.problems, [])
  eq('and the row under it is read', h.tags.length, 1)
  eq('  …with the right row number', h.rows[0].row, 5)
}

// ════════ HEADERS SPELLED HOWEVER ════════
{
  const h = hierarchyFromRows([
    ['Substation', 'Sys', 'Bay', 'Type Code', 'KKS', 'Equipment Description'],
    ['Bang Pakong', 'MV Switchgear', 'Incomer', 'MV Panel', 'MV-01', 'The incomer'],
  ])
  eq('no problems', h.problems, [])
  eq('one tag', h.tags.length, 1)
  eq('the asset column was found', h.assets, ['Bang Pakong'])
  eq('the type column was found', h.equipmentTypes, ['MV Panel'])
  eq('the description column was not stolen by the tag column', h.tags[0].description, 'The incomer')
  eq('and the preview says where each field came from', h.columns.description, 'Equipment Description')
}

// ════════ TWO COLUMNS THAT BOTH START "EQUIPMENT" ════════
//
// The case that forced exact matches to be tried across every field before
// any partial one. "Equipment No" is a tag and "Equipment Description" is a
// description, but `tag`'s aliases contain the bare word "equipment", so
// scanning left to right for a partial match claims the DESCRIPTION column
// as the tag — and then every tag in the register is a sentence.
{
  const h = hierarchyFromRows([
    ['System', 'Equipment Description', 'Equipment No'],
    ['MV Switchgear', 'The 22 kV incomer', 'MV-01'],
  ])
  eq('no problems', h.problems, [])
  eq('the tag came from Equipment No', h.columns.tag, 'Equipment No')
  eq('the description came from Equipment Description', h.columns.description, 'Equipment Description')
  eq('  …so the tag is a tag and not a sentence', h.tags[0].tag, 'MV-01')
  eq('  …and the description is the sentence', h.tags[0].description, 'The 22 kV incomer')
}

// ════════ IT REFUSES RATHER THAN GUESSES ════════
{
  const noHeader = hierarchyFromRows([['a', 'b'], ['c', 'd']])
  ok('a sheet with no recognisable header is refused', noHeader.problems.length > 0)
  eq('  …and nothing is planned', noHeader.tags.length, 0)

  const noTag = hierarchyFromRows([['System', 'Subsystem'], ['MV', 'Incomer']])
  ok('a sheet with no Tag column is refused', noTag.problems.length > 0, JSON.stringify(noTag.problems))

  const orphan = sheet(['', '', '', '', 'MV-01', 'A'])
  ok('a first row with no system to inherit is reported', orphan.problems.some((p) => p.column === 'System'))

  const noRow = sheet(['Switchroom A', 'MV Switchgear', 'Incomer', '', '', ''])
  ok('a system named with no tag on the row is reported', noRow.problems.some((p) => p.column === 'Tag'))
}

// ════════ ONE TAG, ONE PLACE ════════
{
  const a = sheet(
    ['Switchroom A', 'MV Switchgear', '', '', 'MV-01', 'A'],
    ['Switchroom B', 'MV Switchgear', '', '', 'MV-01', 'A'],
  )
  ok('a tag under two assets is reported',
     a.problems.some((x) => x.column === 'Asset'), JSON.stringify(a.problems))

  const h = sheet(
    ['Switchroom A', 'MV Switchgear', '', '', 'MV-01', 'A'],
    ['', 'Transformers', '', '', 'MV-01', 'A'],
  )
  ok('a tag under two systems is reported',
     h.problems.some((x) => /under "MV Switchgear".*and "Transformers"/.test(x.message)), JSON.stringify(h.problems))

  const b = sheet(
    ['Switchroom A', 'MV Switchgear', 'Incomer', '', 'MV-01', 'A'],
    ['', '', 'Feeder 1', '', 'MV-01', 'A'],
  )
  ok('a tag under two subsystems is reported', b.problems.some((x) => x.column === 'Subsystem'))

  const c = sheet(
    ['Switchroom A', 'MV Switchgear', 'Incomer', '', 'MV-01', 'A'],
    ['', '', 'Incomer', '', 'MV-01', 'A'],
  )
  ok('the same tag twice in the same place is reported', c.problems.some((x) => /already on row 2/.test(x.message)),
     JSON.stringify(c.problems))
}

// ════════ BLANK ROWS AND FOOTNOTES ════════
{
  const h = sheet(
    ['Switchroom A', 'MV Switchgear', '', '', 'MV-01', 'A'],
    [],
    ['', 'Transformers', '', '', 'TX-01', 'B'],
    ['Prepared by A. Jabbar, Commissioning Manager, 28 September 2026.'],
  )
  eq('blank rows and a prose footer are ignored', h.problems, [])
  eq('  …and neither becomes an asset', h.assets, ['Switchroom A'])

  const stray = sheet(['Switchroom A', 'MV Switchgear', '', '', 'MV-01', 'A'], ['Transformers'])
  ok('a bare name on its own row is still reported', stray.problems.length > 0, JSON.stringify(stray.problems))
}

// ════════ THE SHEET THIS APPLICATION EXPORTS, THROUGH REAL BYTES ════════
//
// Not a hand-typed copy of what the export route writes — the actual header,
// example rows and footnotes it uses, written into a real .xlsx and read
// back through the real workbook reader.
//
// This is the assertion I most needed and did not have. The previous pair of
// files disagreed on the first try: the exported sheet's own footnotes were
// read as data, so the very first file anybody downloaded was refused when
// they imported it back. A fixture typed out by hand here would have agreed
// with itself and said nothing.
{
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Hierarchy')
  ws.columns = HIERARCHY_HEADER.map((header) => ({ header }))
  for (const r of HIERARCHY_EXAMPLE) ws.addRow(r)
  ws.addRow([])
  for (const line of HIERARCHY_FOOTNOTES) ws.addRow([line]).font = { italic: true, size: 10 }

  const bytes = await wb.xlsx.writeBuffer()
  const h = await hierarchyFromWorkbook(bytes as ArrayBuffer)

  eq('the exported example sheet imports with no problems', h.problems, [])
  eq('  …six tags', h.tags.map((t) => t.tag),
     ['MV-SWGR-01', 'MV-SWGR-02', 'MV-SWGR-03', 'TX-01', 'TX-02', 'LV-MDB-01'])
  eq('  …two assets', h.assets, ['22 kV Switchroom', 'LV Room'])
  eq('  …three systems', h.systems.length, 3)
  eq('  …two subsystems', h.subsystems.length, 2)
  eq('  …three equipment types', h.equipmentTypes, ['MV Panel', 'Dry Transformer', 'LV Panel'])
  eq('  …the blank cells carried the asset down', h.tags[3].asset, '22 kV Switchroom')
  eq('  …and the footnotes became neither a level nor a tag',
     h.assets.some((s) => s.length > 40) || h.tags.some((t) => t.tag.length > 40), false)

  // Every footnote must still be sentence-shaped, or the narrow rule that
  // skips it stops applying and the file refuses itself again.
  for (const line of HIERARCHY_FOOTNOTES) {
    ok(`the footnote is long or ends in a full stop: "${line.slice(0, 24)}…"`,
       line.length >= 50 || /[.!?]$/.test(line))
  }

  // And the example must exercise every column, or it teaches half the sheet.
  for (let c = 0; c < HIERARCHY_HEADER.length; c++) {
    ok(`the example fills the ${HIERARCHY_HEADER[c]} column`, HIERARCHY_EXAMPLE.some((r) => (r[c] ?? '') !== ''))
  }
}

// ════════ WHAT IT DECIDES TO WRITE ════════
{
  {
    const w = reconcileTree(sheet(
      ['Switchroom A', 'MV Switchgear', 'Incomer', 'MV Panel', 'MV-01', 'A'],
      ['', '', '', 'MV Panel', 'MV-02', 'B'],
      ['', 'Transformers', '', 'Dry Transformer', 'TX-01', 'C'],
    ), BARE)
    eq('one asset to add', w.assetsToAdd, ['Switchroom A'])
    eq('two systems to add', w.systemsToAdd.map((s) => s.name), ['MV Switchgear', 'Transformers'])
    eq('one subsystem to add', w.subsystemsToAdd,
       [{ asset: 'Switchroom A', system: 'MV Switchgear', name: 'Incomer' }])
    eq('two equipment types to add', w.equipmentTypesToAdd, ['MV Panel', 'Dry Transformer'])
    eq('three tags to add', w.tagsToAdd.map((t) => t.tag), ['MV-01', 'MV-02', 'TX-01'])
    eq('nothing to update', w.tagsToUpdate, [])
  }

  // ── THE ONE THAT MATTERS: export, change nothing, import ──
  //
  // This is the loop the user will actually run, over and over. If it
  // doubles the register the damage is invisible until somebody counts,
  // which is months later, at handover.
  {
    const h = sheet(
      ['Switchroom A', 'MV Switchgear', 'Incomer', 'MV Panel', 'MV-01', 'A'],
      ['', '', 'Feeder 1', 'MV Panel', 'MV-02', 'B'],
      ['', 'Transformers', '', 'Dry Transformer', 'TX-01', 'C'],
      ['LV Room', 'LV Distribution', '', 'LV Panel', 'LV-01', 'D'],
    )
    const first = reconcileTree(h, BARE)

    // Apply it, exactly as the import action does.
    const assets = first.assetsToAdd.map((name, i) => ({ id: `a${i}`, name }))
    const assetId = (n: string) => assets.find((a) => a.name === n)?.id ?? null
    const systems = first.systemsToAdd.map((s, i) => ({ id: `s${i}`, name: s.name, area_id: assetId(s.asset) }))
    const systemId = (asset: string, name: string) =>
      systems.find((s) => s.name === name && s.area_id === assetId(asset))!.id
    const applied: ExistingTree = {
      assets,
      systems,
      subsystems: first.subsystemsToAdd.map((s, i) => ({ id: `b${i}`, name: s.name, system_id: systemId(s.asset, s.system) })),
      equipmentTypes: first.equipmentTypesToAdd.map((code, i) => ({ id: `t${i}`, type_code: code })),
      tags: first.tagsToAdd.map((t, i) => ({ id: `e${i}`, tag_id: t.tag })),
    }

    const second = reconcileTree(h, applied)
    eq('second run adds no assets', second.assetsToAdd, [])
    eq('second run adds no systems', second.systemsToAdd, [])
    eq('second run adds no subsystems', second.subsystemsToAdd, [])
    eq('second run adds no equipment types', second.equipmentTypesToAdd, [])
    eq('second run adds no tags', second.tagsToAdd, [])
    eq('  …and offers the existing tags for update instead', second.tagsToUpdate.length, 4)
  }

  // ── A REGISTER LOADED BEFORE ASSETS EXISTED ──
  //
  // His systems today have no asset above them. The first sheet carrying an
  // Asset column must ADOPT them, not duplicate the whole register beside
  // itself. This is the exact shape of a bug that shipped once before.
  {
    const h = sheet(['Switchroom A', 'MV Switchgear', '', '', 'MV-01', 'A'])
    const w = reconcileTree(h, {
      ...BARE,
      systems: [{ id: 's1', name: 'MV Switchgear', area_id: null }],
      tags: [{ id: 'e1', tag_id: 'MV-01' }],
    })
    eq('the asset is new', w.assetsToAdd, ['Switchroom A'])
    eq('but the system with no asset is adopted, not duplicated', w.systemsToAdd, [])
    eq('  …and its tag is updated rather than added', w.tagsToAdd, [])
  }

  // ── …but never adopting ANOTHER asset's system ──
  {
    const h = sheet(['Switchroom B', 'MV Switchgear', '', '', 'MV-11', 'A'])
    const w = reconcileTree(h, {
      ...BARE,
      assets: [{ id: 'a1', name: 'Switchroom A' }],
      systems: [{ id: 's1', name: 'MV Switchgear', area_id: 'a1' }],
    })
    eq('a system belonging to a different asset is not reused',
       w.systemsToAdd, [{ asset: 'Switchroom B', name: 'MV Switchgear' }])
  }

  // ── Case and spaces do not make a new thing ──
  {
    const w = reconcileTree(sheet(['  Switchroom A  ', '  MV Switchgear  ', '', ' MV Panel ', ' MV-01 ', 'A']), {
      assets: [{ id: 'a0', name: 'switchroom a' }],
      systems: [{ id: 's0', name: 'mv switchgear', area_id: 'a0' }],
      subsystems: [],
      equipmentTypes: [{ id: 't0', type_code: 'mv panel' }],
      tags: [{ id: 'e0', tag_id: 'mv-01' }],
    })
    eq('a differently-cased existing asset is matched', w.assetsToAdd, [])
    eq('a differently-cased existing system is matched', w.systemsToAdd, [])
    eq('a differently-cased existing type is matched', w.equipmentTypesToAdd, [])
    eq('a differently-cased existing tag is matched', w.tagsToAdd, [])
    eq('  …and offered for update', w.tagsToUpdate.length, 1)
  }

  // ── The same bay name under two systems ──
  {
    const h = sheet(
      ['Switchroom A', 'MV Switchgear', 'Incomer', '', 'MV-01', 'A'],
      ['', 'LV Switchgear', 'Incomer', '', 'LV-01', 'B'],
    )
    eq('two subsystems, because they are under different systems', reconcileTree(h, BARE).subsystemsToAdd.length, 2)

    const w = reconcileTree(h, {
      ...BARE,
      assets: [{ id: 'a1', name: 'Switchroom A' }],
      systems: [{ id: 's1', name: 'MV Switchgear', area_id: 'a1' }],
      subsystems: [{ id: 'b1', name: 'Incomer', system_id: 's1' }],
    })
    eq('only the genuinely missing one is added',
       w.subsystemsToAdd, [{ asset: 'Switchroom A', system: 'LV Switchgear', name: 'Incomer' }])
  }

  // ── A subsystem under a system that is not ours is invisible ──
  {
    const w = reconcileTree(sheet(['Switchroom A', 'MV Switchgear', 'Incomer', '', 'MV-01', 'A']), {
      ...BARE,
      assets: [{ id: 'a1', name: 'Switchroom A' }],
      systems: [{ id: 's1', name: 'MV Switchgear', area_id: 'a1' }],
      subsystems: [{ id: 'bX', name: 'Incomer', system_id: 'SOMEONE-ELSES-SYSTEM' }],
    })
    eq('a bay under an unknown system does not satisfy ours',
       w.subsystemsToAdd, [{ asset: 'Switchroom A', system: 'MV Switchgear', name: 'Incomer' }])
  }

  // ── Nothing in, nothing out ──
  {
    const w = reconcileTree(hierarchyFromRows([HEAD]), BARE)
    eq('an empty sheet decides to write nothing',
       [w.assetsToAdd, w.systemsToAdd, w.subsystemsToAdd, w.equipmentTypesToAdd, w.tagsToAdd, w.tagsToUpdate],
       [[], [], [], [], [], []])
  }
}

console.log(`${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
