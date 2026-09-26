// The brand, and the one thing it may never do.
//
// ── Why a palette needs assertions at all ──────────────────────────────
//
// Because on this application colour is not decoration. Green means passed,
// amber means warning, red means failed, and those three do work that words
// would otherwise have to do on every row of every screen. A brand colour
// that sits next door to one of them takes that away quietly: nothing looks
// broken, and a half-finished bar starts reading as a finished one.
//
// It has happened here once already — an emerald brand, which is why that
// palette did not last. So the distances are measured and held, and the two
// directions that were rejected are kept in the suite as the evidence for
// why the one that was chosen was chosen.
import { BRANDS, CXNIVORA, RESERVED, distance, contrast, toRgb } from '@/lib/brand'
import { MARKS, markSvg } from '@/lib/mark'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

let pass = 0, fail = 0
function ok(n: string, c: boolean, extra = '') { if (c) pass++; else { fail++; console.log('FAIL: ' + n + (extra ? ' — ' + extra : '')) } }
function eq(n: string, a: unknown, b: unknown) { ok(n, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`) }

/** Hue in degrees. Used to say "the same colour, darker" and mean it. */
function hue(hex: string): number {
  const { r, g, b } = toRgb(hex)
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min
  if (d === 0) return 0
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return (h * 60 + 360) % 360
}

// Derived from this file's own location, not typed. The previous version of
// this suite lived in a scratch directory with /home/claude/cxa/src written
// into it, and when the machine it was written on was recycled the suite went
// with it — 4,734 assertions, gone, while the code they guarded was safe in
// the repository the whole time. A check that does not live beside the thing
// it checks is a check that exists until the next time something is tidied.
//
// Run it with:
//   node --experimental-strip-types --import ./src/checks/register.mjs \
//        src/checks/brand.check.mts
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(SRC, '..', 'public')

// ════════ THE BRAND IS NEVER A VERDICT ════════
//
// THE ONE THAT MATTERS, AND IT HAS BEEN REWRITTEN ONCE — READ THIS BEFORE
// TOUCHING A NUMBER IN IT.
//
// The first version of this block asserted one thing: the accent must be at
// least 260 from each of the three reserved colours. It was written at the
// same sitting as the palette it was measuring, and 260 was picked because
// it was the number that let the violet through and kept the other two out.
// That is not a threshold, that is a description with a threshold's manners,
// and when the brand changed it did what a description does — it failed, and
// it would have been "fixed" by lowering 260 to 130, which fixes nothing.
//
// What actually prevented the emerald accident was never a distance. It was
// that a brand colour got used on a thing whose MEANING was its colour — a
// progress bar. So the rule is in two parts now, and only one of them is a
// number:
//
//   1. STRUCTURAL. The brand tokens and the verdict tokens are separate, and
//      nothing that carries a verdict may be painted in a brand token. That
//      is asserted by reading the stylesheet, further down, and it is the
//      part that does the work.
//
//   2. NUMERIC. Two colours that appear on the same screen must still be
//      distinguishable from one another. 120 is the floor, and it is not a
//      number I chose to fit anything: the level ramp in this application
//      has shipped for months with its two closest steps 75 apart and
//      nobody has ever mistaken an L3 chip for an L4. So 120 is comfortably
//      past what this application has already proven readable, and every
//      brand-against-verdict pair below clears it by a wide margin.
{
  const READABLE = 120
  for (const [meaning, hex] of Object.entries(RESERVED)) {
    const d = distance(CXNIVORA.colors.accent, hex)
    ok(`the accent can be told apart from the colour that means ${meaning} (${Math.round(d)})`, d >= READABLE, `${Math.round(d)}`)
    const da = distance(CXNIVORA.colors.anchor, hex)
    ok(`  …so can the anchor (${Math.round(da)})`, da >= READABLE, `${Math.round(da)}`)
  }

  // The one that was closest, and why it is not close any more.
  //
  // #0097B8 against the old #05c07a was 135 — above the floor, but only
  // just, and both were teals. The green moved to a green. If this ever
  // drops back under 180 somebody has walked the verdict green back towards
  // the brand, which is the exact failure the emerald palette was.
  const toPassed = distance(CXNIVORA.colors.accent, RESERVED.passed)
  ok(`the accent against the green that means passed is ${Math.round(toPassed)}`, toPassed >= 180, `${Math.round(toPassed)}`)
  ok('the green that means passed leans yellow, not cyan',
     toRgb(RESERVED.passed).g > toRgb(RESERVED.passed).b + 60,
     `g ${toRgb(RESERVED.passed).g} b ${toRgb(RESERVED.passed).b}`)

  // Every brand direction on offer has to clear the floor, not just the one
  // being worn. A direction that cannot be chosen safely should not be in
  // the list to be chosen from.
  for (const b of BRANDS) {
    for (const [meaning, hex] of Object.entries(RESERVED)) {
      const d = distance(b.colors.accent, hex)
      ok(`${b.id}: accent vs ${meaning} (${Math.round(d)})`, d >= READABLE, `${Math.round(d)}`)
    }
  }
}

// ════════ IT CAN BE READ ════════
//
// Two different minimums, and conflating them is how a brand ends up with
// text nobody over fifty can read on a sunlit platform:
//
//   a SHAPE needs 3.0 against what is behind it before an eye finds its edge
//   TEXT     needs 4.5 before an eye reads it
//
// The accent is a shape. accentInk is the same colour taken down until it is
// text. Every brand in the list must carry both, because the brand that is
// worn changes and the one being tested is whichever is worn today.
{
  const c = CXNIVORA.colors
  ok('body text on paper is well past the minimum', contrast(c.ink, c.ground) >= 7, `${contrast(c.ink, c.ground).toFixed(2)}`)
  ok('secondary text still passes', contrast(c.muted, c.ground) >= 4.5, `${contrast(c.muted, c.ground).toFixed(2)}`)
  ok('the anchor is a proper dark', contrast(c.anchor, c.ground) >= 10, `${contrast(c.anchor, c.ground).toFixed(2)}`)
  ok('and the ground is light enough to be paper', contrast(c.ground, '#FFFFFF') < 1.2)

  // The cover puts the accent ON the anchor. If those two are close the
  // logo disappears on the one surface it appears largest.
  ok('the accent holds up on the anchor band', contrast(c.accent, c.anchor) >= 3, `${contrast(c.accent, c.anchor).toFixed(2)}`)
  ok('and the ground does too', contrast(c.ground, c.anchor) >= 10, `${contrast(c.ground, c.anchor).toFixed(2)}`)

  for (const b of BRANDS) {
    const k = b.colors
    ok(`${b.id}: the accent is findable as a shape on paper`, contrast(k.accent, k.ground) >= 3, `${contrast(k.accent, k.ground).toFixed(2)}`)
    ok(`${b.id}: accentInk is readable as text on paper`, contrast(k.accentInk, k.ground) >= 4.5, `${contrast(k.accentInk, k.ground).toFixed(2)}`)
    ok(`${b.id}: and white is readable on accentInk`, contrast(k.accentInk, '#FFFFFF') >= 4.5, `${contrast(k.accentInk, '#FFFFFF').toFixed(2)}`)
    // Same colour, darker — not a second colour that happens to be legible.
    // Hue is what says "same colour"; distance cannot, because darkening
    // anything moves it. Six degrees is tighter than an eye can resolve.
    ok(`${b.id}: accentInk is the same hue as the accent`, Math.abs(hue(k.accent) - hue(k.accentInk)) <= 6,
       `${hue(k.accent).toFixed(0)}° vs ${hue(k.accentInk).toFixed(0)}°`)
    ok(`${b.id}: and it is darker, not lighter`, contrast(k.accentInk, k.ground) > contrast(k.accent, k.ground))
    ok(`${b.id}: accentInk is readable on the wash too`, contrast(k.accentInk, k.accentWash) >= 4.5, `${contrast(k.accentInk, k.accentWash).toFixed(2)}`)
  }
}

// ════════ THREE COLOURS, NOT SIX ════════
{
  for (const b of BRANDS) {
    const hexes = Object.values(b.colors)
    ok(`${b.id}: every colour is a real hex`, hexes.every((h) => /^#[0-9A-Fa-f]{6}$/.test(h)), hexes.join(' '))
    // The THREE that matter, not all eight. `ink` equalling `anchor` is a
    // legitimate choice — the first version of this assertion failed the
    // cyan direction for exactly that, which was the assertion being wrong
    // rather than the palette.
    const three = [b.colors.anchor, b.colors.accent, b.colors.ground].map((h) => h.toUpperCase())
    ok(`${b.id}: the three are three`, new Set(three).size === 3, three.join(' '))
    void hexes
    ok(`${b.id}: it says what it is going for`, b.intent.length > 60)
    eq(`${b.id}: it is called CxNivora`, b.name, 'CxNivora')
  }
  eq('three directions were offered', BRANDS.length, 3)
  eq('and one is worn', CXNIVORA.id, 'instrument')
}

// ════════ THE MARK SURVIVES A DARK BACKGROUND ════════
//
// Found by rendering a cover page and looking at it: the mark's body is the
// anchor colour and the cover band IS the anchor colour, so four of five
// bars were invisible and the logo was one violet stripe.
{
  for (const b of BRANDS) {
    const light = markSvg(b, 40, false)
    const dark = markSvg(b, 40, true)
    ok(`${b.id}: the mark renders`, light.startsWith('<svg') && light.includes('</svg>'))
    ok(`${b.id}: and differs on a dark ground`, light !== dark, 'identical — it would vanish on the cover')
    ok(`${b.id}: the anchor colour is not painted onto the anchor`, !dark.includes(`fill="${b.colors.anchor}"`), dark.slice(0, 160))
    ok(`${b.id}: the light version does use it`, light.includes(b.colors.anchor))
    ok(`${b.id}: and the accent survives both`, light.includes(b.colors.accent) && dark.includes(b.colors.accent))
  }

  // Nothing in a mark may be thinner than about a twelfth of its box, or it
  // disappears at 16px in a browser tab — where most of them are seen.
  for (const [name, shapes] of Object.entries(MARKS)) {
    ok(`the ${name} mark has shapes`, shapes.length > 0)
    for (const shape of shapes) {
      if ('width' in shape && shape.width !== undefined) {
        ok(`  …and no hairlines in ${name} (${shape.width})`, shape.width >= 8, `${shape.width}`)
      }
      if (shape.kind === 'rect') {
        ok(`  …and nothing narrower than a twelfth in ${name}`, shape.w >= 8, `${shape.w}`)
      }
    }
  }

  ok('the mark has no user input in it, so it is safe to inject as SVG',
     !markSvg(CXNIVORA, 20).includes('<script'))
}

// ════════ THE SCREEN WEARS THE SAME THREE ════════
{
  const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8')
  const token = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1]?.toUpperCase()

  const c = CXNIVORA.colors
  eq('the bright brand token IS the brand accent', token('color-brand'), c.accent.toUpperCase())
  eq('and --color-primary is the darkened step, not the bright one', token('color-primary'), c.accentInk.toUpperCase())
  eq('and the tint is the brand wash', token('color-primary-light'), c.accentWash.toUpperCase())
  eq('and the page rail is the brand anchor', token('rail-bg'), c.anchor.toUpperCase())

  // --color-primary is what sits behind a button label. If somebody ever
  // "simplifies" it back to the bright cyan, white-on-it drops to 3.43 and
  // every primary button in the application becomes hard to read in
  // daylight — which is the only light this is used in.
  ok('white is readable on --color-primary', contrast(token('color-primary')!, '#FFFFFF') >= 4.5,
     `${contrast(token('color-primary')!, '#FFFFFF').toFixed(2)}`)

  // Two brands live at once is the failure; these are the fingerprints of
  // every palette this application has worn. The violet set is on the list
  // now too — it shipped, briefly, and its tokens are the ones most likely
  // to be left behind.
  for (const stale of ['#0369a1', '#075985', '#e8f4fd', '#22d3ee', '#0b1017',
                       '#6d4aff', '#1e1b4b', '#9c86ff', '#eeebff', '#15133a', '#211e5c']) {
    ok(`the old palette's ${stale} is gone`, !css.toLowerCase().includes(stale), stale)
  }

  // ── The structural rule, which is the one that actually does the work ──
  //
  // Every colour on a screen that MEANS something — the three verdicts, the
  // in-progress state, the five commissioning levels — has to be tellable
  // apart from the brand, or it stops meaning anything and starts reading as
  // the product's own furniture.
  //
  // This block caught a real one the day it was written: --level-2 was
  // #0891b2, a cyan, which measured 20 from the brand cyan. Twenty is the
  // same colour. An L2 chip and a brand rule would have been indistinguish-
  // able, and the level of a check is not decoration.
  const MEANINGFUL = [
    'color-success-solid', 'color-warning-solid', 'color-danger-solid',
    'color-progress', 'level-1', 'level-2', 'level-3', 'level-4', 'level-5',
  ]
  for (const name of MEANINGFUL) {
    const v = token(name)
    ok(`--${name} is declared`, !!v, name)
    if (!v) continue
    const d = distance(v, c.accent)
    ok(`--${name} can be told apart from the brand (${Math.round(d)})`, d >= 120, `${v} is ${Math.round(d)} from ${c.accent}`)
    ok(`  …and is not literally a brand token`,
       ![c.accent, c.accentInk, c.anchor].map((h) => h.toUpperCase()).includes(v), v)
  }

  // The level ramp exists twice — here as static CSS and in lib/levels.ts
  // for anything data-driven. They drifted once already.
  const levels = readFileSync(join(SRC, 'lib/levels.ts'), 'utf8')
  for (const [key, cssName] of [['L1_fat', 'level-1'], ['L2_iv', 'level-2'], ['L3_prefunctional', 'level-3'],
                                ['L4_fpt', 'level-4'], ['L5_ist', 'level-5']] as const) {
    const solid = levels.match(new RegExp(`${key}:\\s*\\{\\s*solid:\\s*'(#[0-9A-Fa-f]{6})'`))?.[1]?.toUpperCase()
    eq(`lib/levels.ts ${key} agrees with --${cssName}`, solid, token(cssName))
  }

  // In progress is neither good nor bad AND must not be the brand.
  const progress = token('color-progress')!
  ok('  …and still not green', distance(progress, RESERVED.passed) >= 200, `${Math.round(distance(progress, RESERVED.passed))}`)

  // The status bar of an installed phone app. It was #0369a1 for two
  // rebrands because nobody opens manifest.ts.
  const manifestSrc = readFileSync(join(SRC, 'app/manifest.ts'), 'utf8')
  ok('the installed app is tinted from the brand, not from a typed hex',
     /theme_color: CXNIVORA\.colors\.anchor/.test(manifestSrc))
  const layoutSrc = readFileSync(join(SRC, 'app/layout.tsx'), 'utf8')
  ok('  …and so is the browser chrome', /themeColor: CXNIVORA\.colors\.anchor/.test(layoutSrc))
  // Comments are stripped first: this file's own explanation of what the
  // old hex WAS is not the old hex still being used, and the first version
  // of this assertion could not tell the difference.
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  ok('  …with no hex left behind in either', !/#0369a1/i.test(strip(manifestSrc) + strip(layoutSrc)))
}

// ════════ THE OLD NAME IS GONE — WITH ONE EXCEPTION ════════
{
  function walk(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) out.push(...walk(path))
      else if (/\.(ts|tsx|css)$/.test(path)) out.push(path)
    }
    return out
  }

  const offenders: string[] = []
  for (const path of walk(SRC)) {
    const text = readFileSync(path, 'utf8')
    if (!/CxSentinel|cxsentinel/.test(text)) continue

    // THE EXCEPTION, and it is not an oversight. `DB_NAME` is the name of a
    // database sitting on somebody's phone. Renaming it hands them a fresh
    // empty one while the old database — with every defect they raised in a
    // basement and have not yet sent — is orphaned, unreachable and
    // invisible. A rename is not worth one lost defect.
    if (path.endsWith('/offline-db.ts')) {
      ok('the phone database keeps its old name on purpose', /const DB_NAME = 'cxsentinel-site'/.test(text))
      ok('  …and says why, at length', /orphaned/.test(text) && /not worth one lost defect/.test(text))
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      const hits = (code.match(/cxsentinel/gi) ?? []).length
      eq('  …and that is the ONLY place it survives in code', hits, 1)
      continue
    }
    offenders.push(path.replace(SRC, ''))
  }
  eq('the old name is gone from every other file', offenders, [])

  const manifest = readFileSync(join(SRC, 'app/manifest.ts'), 'utf8')
  ok('the installed app is called CxNivora', /CxNivora/.test(manifest) && !/CxSentinel/.test(manifest))
  const layout = readFileSync(join(SRC, 'app/layout.tsx'), 'utf8')
  ok('so is the browser tab', /CxNivora/.test(layout))
}

// ════════ THE ICONS ARE THE MARK ════════
{
  for (const icon of ['icon-192.png', 'icon-512.png', 'apple-icon.png']) {
    const bytes = readFileSync(join(PUBLIC, icon))
    ok(`${icon} is a real PNG`, bytes.length > 800 && bytes[1] === 0x50 && bytes[2] === 0x4e, `${bytes.length} bytes`)
  }
  // The brand colours must actually be IN the icon — decoded, not scanned
  // for raw bytes. PNG data is compressed, so the first version of this
  // searched the file for the RGB triplet, never found it, and would have
  // gone on never finding it however wrong the icon became.
  const decoded = execFileSync('python3', ['-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
w, h = im.size
px = im.load()
seen = set()
for y in range(0, h, 4):
    for x in range(0, w, 4):
        seen.add(px[x, y])
print(';'.join(f'{r},{g},{b}' for r, g, b in seen))
`, join(PUBLIC, 'icon-512.png')], { encoding: 'utf8' })

  const colours = decoded.trim().split(';').map((t) => t.split(',').map(Number))
  const near = (hex: string) => {
    const want = toRgb(hex)
    return colours.some(([r, g, b]) => Math.abs(r - want.r) < 10 && Math.abs(g - want.g) < 10 && Math.abs(b - want.b) < 10)
  }
  ok('the icon is painted in the brand anchor', near(CXNIVORA.colors.anchor))
  ok('  …with the accent on it', near(CXNIVORA.colors.accent))
  ok('  …and nothing left of the old azure', !near('#0369a1'))
  ok('  …and nothing left of the violet either', !near('#6D4AFF') && !near('#1E1B4B'))
}

console.log(`${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
