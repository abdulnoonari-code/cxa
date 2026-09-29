// ONE WORD PER LEVEL, EVERYWHERE.
//
// ── Why this file exists ────────────────────────────────────────────────
//
// "we need to keep on standard from project detail sheet till with assets"
//
// The structure is defined once in src/lib/levels-standard.ts. The words
// on the screens were not — they were typed into forty files over several
// months, and they drifted:
//
//   · the asset list sheet said Equipment for the KIND
//   · the Equipment & Tags register headed that same column "Type"
//   · the hold points screen headed a column of TAGS "Equipment"
//   · the tree badged a tag "Equipment" while the column said "Tag"
//   · the areas table was called Area on some screens and Asset on others
//
// Every one of those is defensible on its own and together they are an
// application that cannot be learned, because the same thing has four
// names depending on where you are standing.
//
// So the vocabulary is swept. A column heading naming a level must use
// THE word for that level, and the words that used to mean something
// else are banned outright.
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { HIERARCHY, LEVEL_BY_KEY } from '@/lib/levels-standard'
import { subjectLabel } from '@/lib/subjects'

let pass = 0, fail = 0
function ok(n: string, c: boolean, extra = '') { if (c) pass++; else { fail++; console.log('FAIL: ' + n + (extra ? ' — ' + extra : '')) } }
function eq(n: string, a: unknown, b: unknown) { ok(n, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`) }

const ROOT = join(process.cwd(), 'src')
const files: string[] = []
;(function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.tsx$/.test(p)) files.push(p)
  }
})(ROOT)

ok('there are screens to sweep', files.length > 40, `${files.length}`)

// ════════ THE WORDS ════════
{
  eq('the five levels a screen can name',
     HIERARCHY.filter((l) => l.key !== 'project').map((l) => l.label),
     ['Asset', 'System', 'Subsystem', 'Equipment', 'Tag'])

  // The screens and the standard must agree about the two that were
  // swapped. This duplicates an assertion in levels-standard.check.mts on
  // purpose: it is the pair that actually went wrong, and a second place
  // that would go red is cheap.
  eq('a row from the equipment table is a Tag', subjectLabel('equipment'), 'Tag')
  eq('the kind is called Equipment', LEVEL_BY_KEY.equipment.label, 'Equipment')
}

// ════════ NO COLUMN HEADING USES A RETIRED WORD ════════
//
// Each of these meant a level once and now means a different one, or
// nothing at all. A heading is the worst place for them, because a
// heading is what somebody reads to work out what a column is.
{
  const BANNED: { word: string; why: string }[] = [
    { word: 'Type', why: 'ambiguous since Equipment became a level — say Equipment, or say which type it is' },
    { word: 'Equipment Type', why: 'the kind is now called Equipment' },
    { word: 'Area', why: 'the level is called Asset' },
    { word: 'Areas', why: 'the level is called Assets' },
  ]

  // Only simple text headings — <th>Word</th>. A heading carrying markup
  // is left alone rather than guessed at.
  const HEADING = /<th[^>]*>\s*([A-Za-z][A-Za-z &/]*?)\s*<\/th>/g

  const offences: string[] = []
  for (const path of files) {
    const text = readFileSync(path, 'utf8')
    const rel = path.replace(process.cwd() + '/', '')
    for (const m of text.matchAll(HEADING)) {
      const heading = m[1].trim()
      const banned = BANNED.find((b) => b.word.toLowerCase() === heading.toLowerCase())
      if (banned) offences.push(`${rel}: <th>${heading}</th> — ${banned.why}`)
    }
  }

  ok('no column heading uses a retired word', offences.length === 0, offences.join('\n         '))
}

// ════════ THE SCREENS THAT NAME A LEVEL NAME IT RIGHT ════════
//
// Named one by one rather than pattern-matched, because these are the
// screens somebody actually learns the vocabulary from, and a rule loose
// enough to cover all of them would be loose enough to pass anything.
{
  const MUST: { file: string; heading: string; why: string }[] = [
    { file: 'src/app/equipment/page.tsx', heading: 'Tag', why: 'the register is a list of tags' },
    { file: 'src/app/equipment/page.tsx', heading: 'Equipment', why: 'the kind each tag is' },
    { file: 'src/app/equipment-types/page.tsx', heading: 'Equipment code', why: 'this screen is the kinds' },
    { file: 'src/app/assets/page.tsx', heading: 'Asset', why: 'the tree is headed by the asset' },
    { file: 'src/app/holdpoints/page.tsx', heading: 'Tag', why: 'the rows are tags, not kinds' },
    { file: 'src/app/documents/page.tsx', heading: 'Tag', why: 'the rows are tags, not kinds' },
  ]

  for (const { file, heading, why } of MUST) {
    const path = join(process.cwd(), file)
    const text = files.includes(path) ? readFileSync(path, 'utf8') : ''
    ok(`${file} heads a column "${heading}" — ${why}`,
       new RegExp(`<th[^>]*>\\s*${heading}\\s*</th>`).test(text))
  }
}

// ════════ THE SWEEP CAN ACTUALLY SEE A HEADING ════════
//
// A regex that matches nothing passes every file. This is the assertion
// that stops the whole section being a loop that proves it ran.
{
  const HEADING = /<th[^>]*>\s*([A-Za-z][A-Za-z &/]*?)\s*<\/th>/g
  let seen = 0
  const words = new Set<string>()
  for (const path of files) {
    for (const m of readFileSync(path, 'utf8').matchAll(HEADING)) {
      seen++
      words.add(m[1].trim())
    }
  }
  ok('the sweep found real headings', seen > 100, `${seen}`)
  ok('  …across many distinct words', words.size > 30, `${words.size}`)
  ok('  …including ones it is looking for', words.has('Tag') && words.has('Equipment'),
     [...words].slice(0, 12).join(', '))

  // And it must be capable of failing: a banned word IS findable by the
  // same regex, on a string shaped like the real thing.
  const sample = '<th style={{ width: 30 }}>Type</th>'
  const found = [...sample.matchAll(/<th[^>]*>\s*([A-Za-z][A-Za-z &/]*?)\s*<\/th>/g)].map((m) => m[1])
  eq('the regex would catch a banned heading', found, ['Type'])
}

console.log(`${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
