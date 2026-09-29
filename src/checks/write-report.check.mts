// Counting only what the database actually accepted.
//
// Three importers counted every write as a success because the error was
// thrown away. The banner said "1,842 tags added" whether the database
// wrote 1,842 rows or none — and the count is the one thing somebody
// checks to find out whether the import worked.
import { newTally, record, recordBatch, tallySentence, failureLines, anyFailed } from '@/lib/write-report'

let pass = 0, fail = 0
function ok(n: string, c: boolean, extra = '') { if (c) pass++; else { fail++; console.log('FAIL: ' + n + (extra ? ' — ' + extra : '')) } }
function eq(n: string, a: unknown, b: unknown) { ok(n, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`) }

// Semicolon deliberate: an arrow returning a parenthesised object
// followed by a bare block parses as one expression without it.
const err = (message: string) => ({ message });

// ════════ EVERYTHING LANDS ════════
{
  const t = newTally()
  for (let i = 1; i <= 412; i++) ok(`row ${i} reported as written`, record(t, null, { label: `T-${i}`, row: i }) === true)
  pass -= 411 // the 412 above are one property, not 412 assertions
  eq('all counted', t.done, 412)
  eq('nothing failed', t.failed, [])
  ok('and nothing is reported as failed', !anyFailed(t))
  eq('the sentence says what happened', tallySentence(t, 'tag'), '412 tags added.')
  eq('no failure lines', failureLines(t), [])
}

// ════════ THE BUG: A REFUSED WRITE IS NOT A WRITE ════════
{
  const t = newTally()
  record(t, null, { label: 'MV-001', row: 2 })
  record(t, err('duplicate key value violates unique constraint "equipment_tag_unique_ci"'), { label: 'mv-001', row: 3 })
  record(t, null, { label: 'TX-001', row: 4 })

  eq('only the two that landed are counted', t.done, 2)
  eq('  …and the refusal is kept', t.failed.length, 1)
  ok('  …with the row it came from', t.failed[0].row === 3)
  ok('  …and the database’s own words', /equipment_tag_unique_ci/.test(t.failed[0].message))
  eq('the sentence leads with the failure', tallySentence(t, 'tag'),
     '1 tag could not be written — 2 added.')
  ok('and record() says so to its caller', record(newTally(), err('no'), { label: 'x' }) === false)
}

// ════════ A BATCH THAT FAILS FAILS FOR EVERY ROW IN IT ════════
//
// The importers write in chunks. A chunk of four hundred refused as one
// statement is four hundred rows that did not land, not one.
{
  const rows = Array.from({ length: 400 }, (_, i) => ({ label: `T-${i + 1}`, row: i + 2 }))
  const t = newTally()
  ok('a good batch returns true', recordBatch(t, null, rows.slice(0, 100)) === true)
  eq('  …and counts all of them', t.done, 100)

  ok('a refused batch returns false', recordBatch(t, err('column "floor" does not exist'), rows.slice(100)) === false)
  eq('  …none of them counted', t.done, 100)
  eq('  …and every row recorded', t.failed.length, 300)
  eq('the sentence is honest about the size of it', tallySentence(t, 'tag'),
     '300 tags could not be written — 100 added.')
}

// ════════ ONE REASON IS ONE LINE ════════
//
// Four hundred rows refused for the same reason is a wall nobody reads,
// and the one different reason hiding in the middle of it is the one
// that mattered.
{
  const t = newTally()
  recordBatch(t, err('column "floor" does not exist'),
    Array.from({ length: 400 }, (_, i) => ({ label: `T-${i}`, row: i + 2 })))
  record(t, err('duplicate key value violates unique constraint "equipment_tag_unique_ci"'), { label: 'MV-001', row: 9 })

  const lines = failureLines(t)
  eq('two reasons, two lines', lines.length, 2)
  ok('the big one says how many and where it starts',
     /400× 400 rows, first at 2: column "floor" does not exist/.test(lines[0]), lines[0])
  ok('the single one names its row', /row 9/.test(lines[1]), lines[1])
  ok('  …and is not lost behind the four hundred', lines.length === 2)
}

// ════════ A FEW ROWS ARE LISTED, MANY ARE SUMMARISED ════════
{
  const few = newTally()
  for (const row of [3, 5, 9]) record(few, err('same reason'), { label: `T-${row}`, row })
  ok('three rows are named', /rows 3, 5, 9/.test(failureLines(few)[0]), failureLines(few)[0])

  const one = newTally()
  record(one, err('same reason'), { label: 'T-1', row: 7 })
  ok('one row is singular', /row 7:/.test(failureLines(one)[0]), failureLines(one)[0])

  const many = newTally()
  for (let i = 0; i < 20; i++) record(many, err('same reason'), { label: `T-${i}`, row: i + 2 })
  ok('twenty are counted, not listed', /20 rows, first at 2/.test(failureLines(many)[0]), failureLines(many)[0])
}

// ════════ WRITES WITH NO ROW NUMBER ════════
//
// Not every write comes from a sheet row — a system created on the way to
// placing a tag has no row of its own.
{
  const t = newTally()
  record(t, err('permission denied'), { label: 'MV Switchgear' })
  record(t, err('permission denied'), { label: 'Transformers' })
  eq('no row number is kept as null', t.failed[0].row, null)
  ok('and the line names the things instead',
     /MV Switchgear, Transformers: permission denied/.test(failureLines(t)[0]), failureLines(t)[0])
}

// ════════ THE AWKWARD CASES ════════
{
  const empty = newTally()
  eq('nothing at all', tallySentence(empty, 'tag'), '0 tags added.')
  eq('  …and no lines', failureLines(empty), [])

  const one = newTally()
  record(one, null, { label: 'T-1', row: 2 })
  eq('one is singular', tallySentence(one, 'tag'), '1 tag added.')

  const oneFail = newTally()
  record(oneFail, err('nope'), { label: 'T-1', row: 2 })
  eq('one failure is singular too', tallySentence(oneFail, 'tag'), '1 tag could not be written — 0 added.')

  // A database that refuses without saying why must still produce a line.
  const silent = newTally()
  record(silent, err(''), { label: 'T-1', row: 2 })
  ok('a refusal with no message still says something',
     /gave no reason/.test(silent.failed[0].message), silent.failed[0].message)
  const undef = newTally()
  record(undef, {} as { message?: string }, { label: 'T-1', row: 2 })
  ok('and so does one with no message field at all', undef.failed.length === 1 && undef.done === 0)

  // The verb is caller's choice — systems are "created", checks "applied".
  const verb = newTally()
  verb.done = 5
  eq('the verb can be changed', tallySentence(verb, 'system', 'created'), '5 systems created.')
}

// ════════ MANY DIFFERENT REASONS ARE CAPPED ════════
{
  const t = newTally()
  for (let i = 0; i < 25; i++) record(t, err(`reason number ${i}`), { label: `T-${i}`, row: i + 2 })
  const lines = failureLines(t, 10)
  eq('ten lines and a tally of the rest', lines.length, 11)
  ok('the last line says how many kinds were left out',
     /and 15 more kinds of refusal/.test(lines[10]), lines[10])
}

console.log(`${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
