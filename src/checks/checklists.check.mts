// Several checklists on one tag.
//
// "even one tag have multiple checklist so how we can do that"
//
// A tag does not have A checklist. It has an L2 checklist and an L3
// checklist, and sometimes two different L3 checklists from two different
// documents — the manufacturer's and the consultant's. They are separate
// pieces of work, signed at different times by different people, and the
// screen ran them together in one undivided column ordered by level.
import { groupByLevel, isDone, makeRef } from '@/lib/check-groups'

let pass = 0, fail = 0
function ok(n: string, c: boolean, extra = '') { if (c) pass++; else { fail++; console.log('FAIL: ' + n + (extra ? ' — ' + extra : '')) } }
function eq(n: string, a: unknown, b: unknown) { ok(n, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`) }

// Semicolon deliberate: an arrow returning a parenthesised object followed
// by a bare block parses as one expression without it, and the error it
// produces (TS1005 '=>' expected) points at the block, not at this line.
const c = (id: string, level: string, status: string, sourceRef: string | null) => ({ id, level, status, sourceRef });

// ════════ TWO DOCUMENTS, ONE LEVEL, ONE TAG ════════
//
// The case the whole thing exists for: an L3 checklist from the
// manufacturer and another L3 checklist from the consultant, both on
// MV-SWGR-01. They must not merge into one list of checks.
{
  const groups = groupByLevel([
    c('1', 'L2', 'passed', makeRef('file', 'ABB IV Sheet', 1)),
    c('2', 'L2', 'pending', makeRef('file', 'ABB IV Sheet', 2)),
    c('3', 'L3', 'passed', makeRef('file', 'ABB Static Tests', 1)),
    c('4', 'L3', 'pending', makeRef('file', 'Consultant L3', 1)),
    c('5', 'L3', 'pending', makeRef('file', 'Consultant L3', 2)),
  ])

  eq('two levels', groups.map((g) => g.level), ['L2', 'L3'])
  eq('L2 came from one document', groups[0].sets.length, 1)
  eq('L3 came from two', groups[1].sets.length, 2)
  eq('  …named separately', groups[1].sets.map((s) => s.source?.name), ['ABB Static Tests', 'Consultant L3'])
  eq('  …and kept apart', groups[1].sets.map((s) => s.checks.length), [1, 2])

  eq('the level counts its own done', [groups[0].done, groups[1].done], [1, 1])
  eq('and so does each document', groups[1].sets.map((s) => s.done), [1, 0])
}

// ════════ HAND-TYPED CHECKS ARE NOT A DOCUMENT ════════
//
// They go last, under an honest heading, rather than into an "Other" pile
// pretending to be a file somebody could go and look up.
{
  const groups = groupByLevel([
    c('1', 'L2', 'pending', null),
    c('2', 'L2', 'pending', makeRef('file', 'IV Sheet', 1)),
    c('3', 'L2', 'pending', 'not a parseable ref'),
  ])
  eq('one level', groups.length, 1)
  eq('two sets', groups[0].sets.length, 2)
  eq('the document comes first', groups[0].sets[0].source?.name, 'IV Sheet')
  eq('  …and the typed-in ones last, with no source', groups[0].sets[1].source, null)
  eq('  …both unparseable and absent refs land there', groups[0].sets[1].checks.map((x) => x.id), ['1', '3'])
}

// ════════ A SHEET NAME WITH A COLON IN IT ════════
//
// "SUDB: MV SWGR" is a sheet name EPCs actually send. Split on the wrong
// colon and it becomes the same group as a sheet called "SUDB".
{
  const groups = groupByLevel([
    c('1', 'L3', 'pending', makeRef('file', 'SUDB: MV SWGR', 1)),
    c('2', 'L3', 'pending', makeRef('file', 'SUDB', 1)),
  ])
  eq('they are two documents, not one', groups[0].sets.length, 2)
  eq('  …with their full names', groups[0].sets.map((s) => s.source?.name), ['SUDB: MV SWGR', 'SUDB'])
}

// ════════ ORDER IS NEVER REARRANGED ════════
//
// The caller has already sorted by level then creation. This only inserts
// boundaries — a screen that silently reorders a signed-off checklist is a
// screen nobody can audit against the paper copy.
{
  const groups = groupByLevel([
    c('a', 'L2', 'pending', makeRef('file', 'S', 3)),
    c('b', 'L2', 'pending', makeRef('file', 'S', 1)),
    c('c', 'L2', 'pending', makeRef('file', 'S', 2)),
  ])
  eq('the checks stay in the order they arrived', groups[0].sets[0].checks.map((x) => x.id), ['a', 'b', 'c'])
}

// ════════ WHAT COUNTS AS DONE ════════
{
  ok('passed is done', isDone('passed'))
  ok('n/a is done — it is answered, not outstanding', isDone('N/A'))
  ok('complete is done', isDone('Complete'))
  ok('pending is not', !isDone('pending'))
  ok('failed is NOT done — a failure is outstanding work', !isDone('failed'))
  ok('blank is not', !isDone(''))
  ok('null is not', !isDone(null))
}

// ════════ THE ORDINARY CASES ════════
{
  eq('no checks, no groups', groupByLevel([]), [])

  const one = groupByLevel([c('1', 'L2', 'passed', makeRef('file', 'IV', 1))])
  eq('a single document still gets a heading, so you can see WHICH one you are signing',
     one[0].sets.length, 1)
  eq('  …named', one[0].sets[0].source?.name, 'IV')
}

console.log(`${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
