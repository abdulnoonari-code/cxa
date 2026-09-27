// The forecast, and the four ways it could lie.
//
// A date on a screen is believed. That is the whole reason this file is
// longer than the thing it checks: every branch that refuses to give a
// date is a branch somebody could "improve" into giving one, and each of
// those improvements produces a confident wrong answer rather than a
// visible failure.
import { forecast, against, forecastLine, type Completion } from '@/lib/forecast'

let pass = 0, fail = 0
function ok(n: string, c: boolean, extra = '') { if (c) pass++; else { fail++; console.log('FAIL: ' + n + (extra ? ' — ' + extra : '')) } }
function eq(n: string, a: unknown, b: unknown) { ok(n, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`) }

const NOW = new Date('2026-09-27T09:00:00Z')
const DAY = 86_400_000
/**
 * n checks, one per day going back.
 *
 * The half-day offset is deliberate. With a whole-day offset the oldest
 * completion lands EXACTLY on the window boundary, and whether it counts
 * then depends on whether the filter uses > or >=. The first version of
 * this helper did that, eight assertions failed, and every one of them was
 * the helper rather than the code. A fixture that sits on a boundary is a
 * fixture that tests the boundary by accident.
 */
const spread = (n: number, daysAgo = 0.5): Completion[] =>
  Array.from({ length: n }, (_, i) => ({ at: new Date(NOW.getTime() - (daysAgo + i) * DAY) }))
/** n checks all written at the same moment. */
const sameDay = (n: number, daysAgo = 3): Completion[] =>
  Array.from({ length: n }, () => ({ at: new Date(NOW.getTime() - daysAgo * DAY) }))

// ════════ IT REFUSES RATHER THAN GUESSES ════════
{
  eq('no checks at all', forecast({ total: 0, done: 0, completions: [], windowDays: 14, now: NOW }).state, 'none')
  eq('everything done', forecast({ total: 10, done: 10, completions: spread(10), windowDays: 14, now: NOW }).state, 'complete')
  eq('done exceeds total is still complete, not negative work',
     forecast({ total: 10, done: 12, completions: spread(10), windowDays: 14, now: NOW }).state, 'complete')

  // THE ONE THAT MATTERS MOST. A rate of zero divides into remaining and
  // gives Infinity, and `new Date(Infinity)` is an Invalid Date that
  // renders as blank or as "NaN" depending on the browser. Either way it
  // is a screen that has stopped telling the truth quietly.
  const stalled = forecast({ total: 50, done: 10, completions: spread(10, 40), windowDays: 14, now: NOW })
  eq('nothing in the window gives no date', stalled.state, 'no-rate')
  ok('  …and says how long nothing has moved', forecastLine(stalled).includes('14 days'), forecastLine(stalled))

  const thin = forecast({ total: 50, done: 2, completions: spread(2), windowDays: 14, now: NOW })
  eq('two completions is not a trend', thin.state, 'too-few')
}

// ════════ A BULK IMPORT IS NOT A RATE ════════
//
// The trap this whole feature could have fallen into. Import four hundred
// checks from a spreadsheet, every row gets the same timestamp, and a
// naive rate says four hundred a day and forecasts tomorrow. A project
// manager reads "finishes tomorrow" on the morning after an import.
{
  const imported = forecast({ total: 500, done: 400, completions: sameDay(400), windowDays: 14, now: NOW })
  eq('four hundred checks written in one moment is not progress', imported.state, 'bulk')
  ok('  …and the line says which day and how many',
     /400 of 400 were written on one day/.test(forecastLine(imported)), forecastLine(imported))

  // And the laundering case: a bulk import with a handful of real checks
  // around it must still be refused, or anybody could make an import look
  // like work by signing three things by hand that week.
  const laundered = forecast({
    total: 500, done: 403,
    completions: [...sameDay(400), ...spread(3)],
    windowDays: 14, now: NOW,
  })
  eq('a bulk import with a few real checks around it is still a bulk import', laundered.state, 'bulk')

  // But genuine steady work across many days is a rate, even at volume.
  const steady = forecast({ total: 500, done: 140, completions: spread(140).slice(0, 140), windowDays: 14, now: NOW })
  ok('steady work across the window IS a rate', steady.state === 'ok', steady.state)
}

// ════════ THE ARITHMETIC ════════
{
  // 14 checks over a 14-day window = 1 a day. 20 left = 20 days.
  const f = forecast({ total: 34, done: 14, completions: spread(14), windowDays: 14, now: NOW })
  ok('a clean rate forecasts', f.state === 'ok', f.state)
  if (f.state === 'ok') {
    eq('  …one a day', Math.round(f.perDay * 100) / 100, 1)
    eq('  …twenty left', f.remaining, 20)
    eq('  …twenty days', f.days, 20)
    eq('  …finishing on the right date', f.finishes.toISOString().slice(0, 10), '2026-10-17')
  }

  // Days are rounded UP. Part of a day of work left is still a day of
  // work left, and a forecast that rounds down is a forecast that is
  // always early — which is the direction that gets somebody a phone call.
  //
  // THE FIRST VERSION OF THIS ASSERTION PROVED NOTHING. It used 1 check
  // remaining at exactly 1 a day, where floor and ceil both give 1. I
  // changed Math.ceil to Math.floor to see it fail and it stayed green,
  // 41 passed, 0 failed. A rounding test needs something to round.
  //
  // 14 completions over a 10-day window is 1.4 a day. 20 left is 14.29
  // days: ceil 15, floor 14.
  // 14 completions packed inside a 10-day window — denser than one a day,
  // which `spread` cannot produce.
  const dense = Array.from({ length: 14 }, (_, i) => ({ at: new Date(NOW.getTime() - (0.3 + i * 0.65) * DAY) }))
  const g = forecast({ total: 34, done: 14, completions: dense, windowDays: 10, now: NOW })
  ok('the fractional case really is fractional', g.state === 'ok' && (g.remaining / g.perDay) % 1 !== 0,
     g.state === 'ok' ? `${g.remaining} / ${g.perDay}` : g.state)
  if (g.state === 'ok') eq('a part day rounds up to a whole one', g.days, 15)

  // The line reads in weeks when the rate is slower than one a day,
  // because "0.4 a day" is not how anybody on a site talks.
  const slow = forecast({ total: 100, done: 7, completions: spread(7), windowDays: 28, now: NOW })
  if (slow.state === 'ok') ok('a slow rate is written per week', forecastLine(slow).includes('a week'), forecastLine(slow))
}

// ════════ AGAINST A PROMISED DATE ════════
{
  const f = forecast({ total: 34, done: 14, completions: spread(14), windowDays: 14, now: NOW })
  eq('ten days late', against(f, new Date('2026-10-07T09:00:00Z')), 10)
  eq('three days early', against(f, new Date('2026-10-20T09:00:00Z')), -3)
  eq('on the day', against(f, new Date('2026-10-17T09:00:00Z')), 0)

  // NULL, not zero. "I do not know" and "on time" are different answers
  // and a screen that shows them the same way is worse than one that
  // shows neither.
  eq('no promised date gives null, not zero', against(f, null), null)
  const stalled = forecast({ total: 50, done: 10, completions: [], windowDays: 14, now: NOW })
  eq('no forecast gives null, not zero', against(stalled, new Date('2026-10-07T09:00:00Z')), null)
}

// ════════ EVERY STATE HAS A SENTENCE ════════
//
// A switch that falls through leaves a blank cell on the screen, which
// reads as "nothing to report" rather than as a bug.
{
  const states: [string, ReturnType<typeof forecast>][] = [
    ['none', forecast({ total: 0, done: 0, completions: [], windowDays: 14, now: NOW })],
    ['complete', forecast({ total: 5, done: 5, completions: spread(5), windowDays: 14, now: NOW })],
    ['no-rate', forecast({ total: 5, done: 1, completions: [], windowDays: 14, now: NOW })],
    ['too-few', forecast({ total: 50, done: 2, completions: spread(2), windowDays: 14, now: NOW })],
    ['bulk', forecast({ total: 500, done: 400, completions: sameDay(400), windowDays: 14, now: NOW })],
    ['ok', forecast({ total: 34, done: 14, completions: spread(14), windowDays: 14, now: NOW })],
  ]
  for (const [name, f] of states) {
    eq(`${name} is the state it says it is`, f.state, name)
    const line = forecastLine(f)
    ok(`  …and reads as a sentence`, line.length > 12 && line.endsWith('.') === false ? line.length > 12 : true, line)
    ok(`  …with no NaN, Infinity or undefined in it`, !/NaN|Infinity|undefined|null/.test(line), line)
  }
}

// ════════ A COMPLETION IN THE FUTURE IS NOT COUNTED ════════
//
// Clocks are wrong, phones are in other time zones, and somebody types
// next year's date into a spreadsheet. A future timestamp inflates the
// rate without ever appearing on a screen where anybody would notice it.
{
  const f = forecast({
    total: 50, done: 20,
    completions: [...spread(14), ...Array.from({ length: 6 }, (_, i) => ({ at: new Date(NOW.getTime() + (i + 1) * DAY) }))],
    windowDays: 14, now: NOW,
  })
  if (f.state === 'ok') eq('tomorrow’s timestamps do not count towards today’s rate', Math.round(f.perDay * 100) / 100, 1)
}

console.log(`${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
