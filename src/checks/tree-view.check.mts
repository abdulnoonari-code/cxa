// The asset tree, grouped by Equipment and filtered.
//
// Filtering a tree is the part that looks obvious and is not. A leaf that
// matches is useless on its own: without the branch it hangs from, the
// result is a flat list of tags with no idea where any of them are. So a
// row survives when it matches OR when anything beneath it does, and its
// ancestors come with it.
import {
  filterRows, recount, rowMatches, choicesFor, anyFilter, NO_FILTERS,
  type TreeRow, type Filters,
} from '@/lib/tree-view'

let pass = 0, fail = 0
function ok(n: string, c: boolean, extra = '') { if (c) pass++; else { fail++; console.log('FAIL: ' + n + (extra ? ' — ' + extra : '')) } }
function eq(n: string, a: unknown, b: unknown) { ok(n, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`) }

const F = (o: Partial<Filters> = {}): Filters => ({ ...NO_FILTERS, ...o })

const r = (
  key: string, parentKey: string | null, depth: number,
  kind: TreeRow['kind'], label: string, code: string | null = null, status: string | null = null,
): TreeRow => ({ key, parentKey, depth, kind, label, code, status, subject: null, tagCount: 0 })

// A small but real substation: two areas, three systems, tags of two
// equipment kinds, in depth-first order exactly as the page builds them.
const TREE: TreeRow[] = [
  r('a1', null, 0, 'area', 'MV Switchroom', 'R101'),
  r('s1', 'a1', 1, 'system', 'MV Switchgear', 'MVS-01'),
  r('e1', 's1', 2, 'equipment', 'MV Panel'),
  r('t1', 'e1', 3, 'tag', 'MV-SWGR-001', 'MV-SWGR-001', 'installed'),
  r('t2', 'e1', 3, 'tag', 'MV-SWGR-002', 'MV-SWGR-002', 'received'),
  r('s2', 'a1', 1, 'system', 'Transformers', 'TX-01'),
  r('e2', 's2', 2, 'equipment', 'Dry Transformer'),
  r('t3', 'e2', 3, 'tag', 'TX-001', 'TX-001', 'installed'),
  r('a2', null, 0, 'area', 'Chiller Plant', 'R202'),
  r('s3', 'a2', 1, 'system', 'Chilled Water', 'CHW-01'),
  r('e3', 's3', 2, 'equipment', 'Chiller'),
  r('t4', 'e3', 3, 'tag', 'CH-001', 'CH-001', 'not_delivered'),
]

const keys = (rows: TreeRow[]) => rows.map((x) => x.key)

// ════════ NO FILTER IS NOT A FILTER ════════
{
  ok('an empty filter is recognised as empty', !anyFilter(NO_FILTERS))
  ok('one value makes it a filter', anyFilter(F({ status: 'installed' })))
  eq('no filter returns the tree untouched', filterRows(TREE, NO_FILTERS).length, TREE.length)
}

// ════════ A MATCHING LEAF BRINGS ITS BRANCH ════════
//
// The property the whole file exists for.
{
  const out = filterRows(TREE, F({ q: 'CH-001' }))
  eq('the tag and its whole ancestry survive', keys(out), ['a2', 's3', 'e3', 't4'])
  ok('  …and nothing from the other area does',
     !keys(out).some((k) => ['a1', 's1', 'e1', 't1', 't2', 's2', 'e2', 't3'].includes(k)))

  // Ancestors come in tree order, not match order — a branch printed
  // after its own leaf is not a tree.
  eq('the branch is still in depth order', out.map((x) => x.depth), [0, 1, 2, 3])
}

// ════════ FILTERING BY STATUS ════════
{
  const out = filterRows(TREE, F({ status: 'installed' }))
  eq('only the installed tags, with their branches', keys(out),
     ['a1', 's1', 'e1', 't1', 's2', 'e2', 't3'])
  ok('the received tag is gone', !keys(out).includes('t2'))
  ok('the not_delivered tag is gone', !keys(out).includes('t4'))
  ok('and its empty area went with it', !keys(out).includes('a2'))
}

// ════════ FILTERING BY EQUIPMENT, AREA AND SYSTEM ════════
{
  eq('by equipment kind', keys(filterRows(TREE, F({ equipment: 'MV Panel' }))),
     ['a1', 's1', 'e1', 't1', 't2'])
  eq('by area code', keys(filterRows(TREE, F({ area: 'R202' }))), ['a2', 's3', 'e3', 't4'])
  eq('by area name works too', keys(filterRows(TREE, F({ area: 'Chiller Plant' }))), ['a2', 's3', 'e3', 't4'])
  eq('by system code', keys(filterRows(TREE, F({ system: 'TX-01' }))), ['a1', 's2', 'e2', 't3'])

  // A dropdown filter must be answered by TAGS, not by a branch whose
  // name happens to match. "Chilled Water" as a system filter must not
  // drag in a system row from elsewhere with no matching tags under it.
  const none = filterRows(TREE, F({ system: 'NOT-A-SYSTEM' }))
  eq('a system nothing is under returns nothing', none, [])
}

// ════════ TWO FILTERS AT ONCE ════════
{
  eq('area AND status', keys(filterRows(TREE, F({ area: 'R101', status: 'received' }))),
     ['a1', 's1', 'e1', 't2'])
  eq('a combination nothing satisfies is empty',
     filterRows(TREE, F({ area: 'R202', status: 'installed' })), [])
  // The tag matches both; its branch comes with it, which is the point
  // of the whole file. An earlier version of this assertion expected the
  // bare tag and was simply wrong about what a tree filter is for.
  eq('free text AND status keeps the one tag and its branch',
     keys(filterRows(TREE, F({ q: 'MV-SWGR', status: 'installed' }))), ['a1', 's1', 'e1', 't1'])
}

// ════════ FREE TEXT REACHES EVERY LEVEL ════════
{
  ok('a system name is findable', keys(filterRows(TREE, F({ q: 'Transformers' }))).includes('s2'))
  ok('an equipment kind is findable', keys(filterRows(TREE, F({ q: 'Chiller' }))).includes('e3'))
  ok('an area is findable', keys(filterRows(TREE, F({ q: 'Switchroom' }))).includes('a1'))
  eq('case does not matter', keys(filterRows(TREE, F({ q: 'ch-001' }))), ['a2', 's3', 'e3', 't4'])
  eq('a search that hits nothing returns nothing', filterRows(TREE, F({ q: 'zzzz' })), [])
}

// ════════ COUNTS FOLLOW THE FILTER ════════
//
// A branch that still claims forty tags while showing two is a branch
// that has just lied about the thing the filter was for.
{
  const all = recount(TREE)
  eq('the first area counts three tags', all.find((x) => x.key === 'a1')!.tagCount, 3)
  eq('the MV system counts two', all.find((x) => x.key === 's1')!.tagCount, 2)
  eq('a tag counts itself', all.find((x) => x.key === 't1')!.tagCount, 1)

  const filtered = recount(filterRows(TREE, F({ status: 'installed' })))
  eq('after filtering, the area counts only what is shown',
     filtered.find((x) => x.key === 'a1')!.tagCount, 2)
  eq('  …and the MV system only one', filtered.find((x) => x.key === 's1')!.tagCount, 1)
}

// ════════ THE DROPDOWNS COME FROM THE TREE ════════
{
  eq('the areas offered', choicesFor(TREE, 'area').map((c) => c.value), ['R202', 'R101'])
  eq('the equipment kinds offered', choicesFor(TREE, 'equipment').map((c) => c.label),
     ['Chiller', 'Dry Transformer', 'MV Panel'])
  eq('sorted by label', choicesFor(TREE, 'system').map((c) => c.label),
     ['Chilled Water', 'MV Switchgear', 'Transformers'])

  const dupes = choicesFor([...TREE, r('e4', 's1', 2, 'equipment', 'MV Panel')], 'equipment')
  eq('a kind used twice is offered once', dupes.length, 3)
}

// ════════ A BROKEN PARENT CHAIN CANNOT HANG THE PAGE ════════
//
// A row pointing at a parent that is not in the list, or at itself,
// would loop the ancestry walk forever.
{
  const orphan: TreeRow[] = [
    r('x1', 'missing', 1, 'tag', 'T-1', 'T-1', 'installed'),
    r('x2', 'x2', 1, 'tag', 'T-2', 'T-2', 'installed'),
  ]
  const out = filterRows(orphan, F({ status: 'installed' }))
  eq('both survive without looping', keys(out), ['x1', 'x2'])
  const counted = recount(orphan)
  eq('and counting them terminates', counted.length, 2)
}

// ════════ rowMatches ON ITS OWN ════════
{
  const tag = r('t', 'e', 3, 'tag', 'MV-SWGR-001', 'MV-SWGR-001', 'installed')
  const ancestry = [r('e', 's', 2, 'equipment', 'MV Panel'), r('s', null, 1, 'system', 'MV Switchgear', 'MVS-01')]

  ok('matches its own code', rowMatches(tag, F({ q: 'swgr' }), ancestry))
  ok('matches an ancestor filter', rowMatches(tag, F({ equipment: 'MV Panel' }), ancestry))
  ok('does not match a different equipment', !rowMatches(tag, F({ equipment: 'Chiller' }), ancestry))
  ok('matches its status', rowMatches(tag, F({ status: 'installed' }), ancestry))
  ok('does not match another status', !rowMatches(tag, F({ status: 'received' }), ancestry))
}

console.log(`${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
