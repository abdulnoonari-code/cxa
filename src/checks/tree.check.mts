// The tree, and the things that have no place in it.
//
// ── The bug this exists for ─────────────────────────────────────────────
//
// A real register looked like this on the tree screen:
//
//     Plant Room                     Asset
//     Substation A                   Asset
//     ACB — AC Distribution Board    Equipment
//     ACSP — Access Control & Alarm  Equipment
//     BATT — 125VDC Battery          Equipment
//     BTP — 115/22kV Transformer     Equipment
//
// Six rows, ONE indent, assets and equipment interleaved, and nothing
// anywhere saying that the bottom four were unplaced rather than top-level
// things. "it has mixed it all" — and it had.
//
// The cause was a kindness: a tag with no system was hung off the PROJECT
// so it would still appear, rather than vanishing. That is the right
// instinct and the wrong place, because the project's other children are
// the top of the tree, and being a sibling of a substation is a claim.
//
// The rule now: EQUIPMENT IS NEVER A SIBLING OF AN ASSET. Nothing is
// hidden — unplaced tags are listed under the tree with a heading saying
// what they are.
import { partitionProjectChildren, type Subject } from '@/lib/subjects'

let pass = 0, fail = 0
function ok(n: string, c: boolean, extra = '') { if (c) pass++; else { fail++; console.log('FAIL: ' + n + (extra ? ' — ' + extra : '')) } }
function eq(n: string, a: unknown, b: unknown) { ok(n, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`) }

const sub = (type: Subject['type'], name: string): Subject =>
  ({ type, id: `${type}-${name}`, code: null, name, parent: { type: 'project', id: 'p1' } })

// ════════ THE REGISTER FROM THE SCREENSHOT ════════
{
  const children = [
    sub('area', 'Plant Room'),
    sub('area', 'Substation A'),
    sub('equipment', 'ACB'),
    sub('equipment', 'ACSP'),
    sub('equipment', 'BATT'),
    sub('equipment', 'BTP'),
  ]
  const { structure, unplaced } = partitionProjectChildren(children)

  eq('the two assets are the tree', structure.map((s) => s.name), ['Plant Room', 'Substation A'])
  eq('the four tags are not', unplaced.map((s) => s.name), ['ACB', 'ACSP', 'BATT', 'BTP'])

  // The property, stated as a property rather than as this one example.
  ok('no equipment is left among the structure',
     !structure.some((s) => s.type === 'equipment' || s.type === 'component'))
  ok('nothing but leaves is moved out',
     unplaced.every((s) => s.type === 'equipment' || s.type === 'component'))
}

// ════════ NOTHING IS LOST ════════
//
// The old behaviour was wrong but it was not destructive: every tag was on
// the screen somewhere. Separating them must not quietly drop any.
{
  const children = [
    sub('site', 'Bang Pakong'),
    sub('equipment', 'MV-01'),
    sub('area', '22 kV Switchroom'),
    sub('component', 'CT-1'),
    sub('system', 'MV Switchgear'),
  ]
  const { structure, unplaced } = partitionProjectChildren(children)

  eq('every child ends up on one side or the other', structure.length + unplaced.length, children.length)
  eq('  …and none on both',
     new Set([...structure, ...unplaced].map((s) => s.id)).size, children.length)
  eq('  …with the order inside each side kept',
     [structure.map((s) => s.name), unplaced.map((s) => s.name)],
     [['Bang Pakong', '22 kV Switchroom', 'MV Switchgear'], ['MV-01', 'CT-1']])
}

// ════════ EVERY LEVEL THAT CAN HOLD SOMETHING STAYS IN THE TREE ════════
//
// Sites, areas, systems and subsystems are structure whether or not they
// have anything under them yet. An empty system is a system somebody is
// about to fill, and hiding it is how a register looks finished when it is
// not.
{
  for (const t of ['site', 'area', 'system', 'subsystem'] as const) {
    const { structure, unplaced } = partitionProjectChildren([sub(t, 'x')])
    eq(`a ${t} is structure`, structure.length, 1)
    eq(`  …and not unplaced`, unplaced.length, 0)
  }
  for (const t of ['equipment', 'component'] as const) {
    const { structure, unplaced } = partitionProjectChildren([sub(t, 'x')])
    eq(`a ${t} hanging off the project is unplaced`, unplaced.length, 1)
    eq(`  …and not structure`, structure.length, 0)
  }
}

// ════════ THE ORDINARY CASES ════════
{
  const empty = partitionProjectChildren([])
  eq('an empty project partitions to nothing', [empty.structure, empty.unplaced], [[], []])

  const allPlaced = partitionProjectChildren([sub('area', 'A'), sub('system', 'S')])
  eq('a properly placed register has no unplaced list at all', allPlaced.unplaced, [])

  const nonePlaced = partitionProjectChildren([sub('equipment', 'MV-01'), sub('equipment', 'MV-02')])
  eq('a register imported before systems existed is entirely unplaced', nonePlaced.structure, [])
  eq('  …and every tag is still accounted for', nonePlaced.unplaced.length, 2)
}

console.log(`${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
