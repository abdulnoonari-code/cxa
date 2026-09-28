// The version stamp, and the ways it could quietly start lying.
//
// A number on a screen that says which code is running is only worth
// having if it is right. The moment it is wrong once, it becomes the thing
// people check INSTEAD of checking properly — which is worse than not
// having it, because before it existed nobody was fooled.
//
// Nothing here can prove the number matches what is deployed. Nothing can:
// the code cannot know whether somebody dragged it into GitHub. What these
// assertions hold is everything around it — that the list is ordered, that
// it has no gaps or duplicates, that CURRENT really is the newest, and
// that the dates are dates. Those are the ways a hand-maintained list
// rots, and they are all catchable.
import { RELEASES, CURRENT, releaseLabel, behindBy } from '@/lib/release'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

let pass = 0, fail = 0
function ok(n: string, c: boolean, extra = '') { if (c) pass++; else { fail++; console.log('FAIL: ' + n + (extra ? ' — ' + extra : '')) } }
function eq(n: string, a: unknown, b: unknown) { ok(n, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`) }

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

// ════════ THE LIST IS A LIST ════════
{
  ok('there are releases', RELEASES.length > 0, `${RELEASES.length}`)

  const numbers = RELEASES.map((r) => r.update)
  eq('newest first', numbers, [...numbers].sort((a, b) => b - a))
  eq('no update number appears twice', numbers.length, new Set(numbers).size)

  // A gap means an update was shipped and never recorded here, which is
  // the failure this file exists to catch: the stamp says 121 while 119
  // was never listed, and somebody concludes 119 is deployed.
  const gaps: number[] = []
  for (let i = 1; i < numbers.length; i++) {
    for (let n = numbers[i] + 1; n < numbers[i - 1]; n++) gaps.push(n)
  }
  eq('no update number is missing from the middle of the list', gaps, [])

  eq('CURRENT is the newest', CURRENT.update, Math.max(...numbers))
  ok('CURRENT is the first row, not a copy of it', CURRENT === RELEASES[0])
}

// ════════ EVERY ROW IS FILLED IN ════════
{
  for (const r of RELEASES) {
    ok(`${r.update} has a date in it`, /^\d{4}-\d{2}-\d{2}$/.test(r.on), `${r.update}: ${r.on}`)
    ok(`  …that is a real date`, !Number.isNaN(new Date(r.on + 'T00:00:00Z').getTime()), r.on)
    ok(`  …and says something`, r.what.trim().length > 15, `${r.update}: "${r.what}"`)
    // A full stop is added on the screen. Two full stops is the sort of
    // thing nobody fixes because nobody owns it.
    ok(`  …without a trailing full stop`, !r.what.trim().endsWith('.'), r.what)
  }

  // Dates must not go backwards as the numbers go up.
  for (let i = 1; i < RELEASES.length; i++) {
    const newer = new Date(RELEASES[i - 1].on).getTime()
    const older = new Date(RELEASES[i].on).getTime()
    ok(`${RELEASES[i - 1].update} is not dated before ${RELEASES[i].update}`, newer >= older,
       `${RELEASES[i - 1].on} vs ${RELEASES[i].on}`)
  }
}

// ════════ THE LABEL READS AS A LABEL ════════
{
  const label = releaseLabel()
  ok('the label names the update', label.includes(String(CURRENT.update)), label)
  // \w{3,5} rather than \w{3}: en-GB abbreviates September as "Sept",
  // four letters, in current ICU and as "Sep" in older builds. Pinning
  // three would be an assertion about which Node built the page.
  ok('  …and carries a date a person can read', /\d{1,2} \w{3,5} \d{4}/.test(label), label)
  ok('  …with no NaN or Invalid in it', !/NaN|Invalid|undefined/.test(label), label)

  // A bad date must degrade to the raw string rather than to "Invalid
  // Date", which is the shape of failure that ends up on a screenshot.
  const broken = releaseLabel({ update: 1, on: 'not-a-date', what: 'x' })
  ok('a broken date falls back to the raw text, not "Invalid Date"',
     broken.includes('not-a-date') && !/Invalid/.test(broken), broken)
}

// ════════ BEHIND, LEVEL AND AHEAD ARE THREE ANSWERS ════════
{
  eq('two behind', behindBy(CURRENT.update + 2), 2)
  // null, not 0. "Up to date" and "I cannot tell" must not render alike —
  // the same rule the forecast follows for a date it cannot work out.
  eq('level is null, not zero', behindBy(CURRENT.update), null)
  eq('ahead is null too', behindBy(CURRENT.update - 3), null)
}

// ════════ IT IS ON A SCREEN, AND ONLY ON THE RIGHT ONE ════════
{
  const setup = readFileSync(join(SRC, 'app/setup/page.tsx'), 'utf8')
  ok('the Setup screen shows the running version', /releaseLabel\(\)/.test(setup))
  ok('  …and the history under it', /RELEASES\.slice\(1\)/.test(setup))

  // The version belongs on Setup and nowhere else. A number repeated in a
  // second place is a number that will disagree with itself.
  function walk(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) out.push(...walk(p))
      else if (/\.tsx?$/.test(p)) out.push(p)
    }
    return out
  }
  const users = walk(join(SRC, 'app'))
    .filter((p) => /from '@\/lib\/release'/.test(readFileSync(p, 'utf8')))
    .map((p) => p.replace(SRC, ''))
  eq('only the Setup screen reads the release', users, ['/app/setup/page.tsx'])
}

console.log(`${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
