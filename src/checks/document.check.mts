// The documents, and the one thing they must not do to somebody's name.
//
// ── Why this file exists ────────────────────────────────────────────────
//
// A PDF from this application goes to a client. Everything else can be
// fixed next week; a document that has already been issued cannot.
//
// pdfkit's built-in fonts are the fourteen PDF standard fonts, encoded in
// WinAnsi — 256 slots, Latin only. Handed a character outside that set
// they do not fail and they do not warn. They print something:
//
//     4.2 GΩ at 5 kV        ->   4.2 G:'BRµbÔ$´U%ôTä@
//
// That went out on eight documents before anybody noticed. toWinAnsi()
// exists to stop it, and the assertions here exist to stop it coming back
// — including the source check below, which would have caught a real
// instance of exactly that, in a change that was itself meant to fix it.
//
// The assertions are of two kinds: ones that read the SOURCE, and ones
// that BUILD A REAL PDF and read the words back off the page. Source that
// looks right and a page that IS right are different things.
import { toPdf, type Report } from '@/lib/docgen'
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

let pass = 0, fail = 0
function ok(n: string, c: boolean, extra = '') { if (c) pass++; else { fail++; console.log('FAIL: ' + n + (extra ? ' — ' + extra : '')) } }

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = mkdtempSync(join(tmpdir(), 'cxdoc-'))

// ════════ NO BUILT-IN FONT NAME IS HARDCODED INSIDE toPdf ════════
//
// THE ONE THAT WOULD HAVE CAUGHT THE ITALIC BUG, and it costs nothing.
//
// Inside toPdf there are about sixty doc.font(...) calls. Every one must
// name one of the three variables decided once at the top — BODY, BOLD,
// ASIDE — and never a font directly, because a font named directly is a
// font that does not follow when the decision at the top changes.
{
  const text = readFileSync(join(SRC, 'lib/docgen.ts'), 'utf8')
  const start = text.indexOf('export async function toPdf')
  ok('toPdf was found', start > 0)
  const body = text.slice(start)

  const hardcoded = [...body.matchAll(/\.font\(\s*'([^']+)'\s*\)/g)].map((m) => m[1])
  ok('no doc.font() inside toPdf names a font directly',
     hardcoded.length === 0,
     hardcoded.join(', ') + ' — use BODY, BOLD or ASIDE, which follow the document')

  // All three must be declared once, at the top, so a change to any of
  // them reaches every call site. This is the assertion that matters: the
  // last time the font was changed here, BODY and BOLD were updated and
  // the eight italic runs were missed, because they named their font
  // themselves.
  for (const name of ['BODY', 'BOLD', 'ASIDE']) {
    ok(`${name} is declared once for the whole document`,
       new RegExp(`const ${name} = '`).test(body), name)
  }
}

// ════════ A DOCUMENT USES THE BUILT-IN FONTS, AND NOTHING ELSE ════════
//
// No font is embedded, so a report stays a few kilobytes and renders the
// same in every reader. If that ever changes it should be a decision
// somebody made, not something that arrived with a library upgrade.
{
  const english: Report = {
    title: 'Defect Report',
    project: 'Bang Pakong 230/22 kV Substation',
    standfirst: 'Insulation resistance measured 4.2 GΩ at 5 kV on 95 mm² cable.',
    // An italic run, deliberately. Without one the Helvetica-Oblique
    // assertion below passes by drawing nothing, which is the shape of
    // assertion that is green and proves nothing.
    cards: [{
      title: 'SUDB-MV-SWGR',
      cards: [{
        heading: 'P-014 — Neutral earthing conductor not bonded',
        paragraphs: [{ label: 'What must be done', text: 'Torque to 55 Nm.', note: 'Agreed action, recorded by A. Jabbar.' }],
      }],
    }],
    generatedAt: new Date('2026-09-27T09:00:00Z'),
  }
  const pdf = await toPdf(english)
  const raw = pdf.toString('latin1')
  ok('the document embeds no font', !/FontFile2|FontFile3/.test(raw))
  ok('  …and uses the built-in Helvetica', /BaseFont\s*\/Helvetica/.test(raw))
  ok('  …including the italic', /Helvetica-Oblique/.test(raw))
  ok('  …and stays small', pdf.length < 20000, `${pdf.length} bytes`)
}

// ════════ THE COVER BAND FITS ITS OWN TITLE ════════
//
// It was a fixed 232pt. A title that wraps pushed the subtitle down onto
// the accent strip at the foot of the band, which cut it in half. Found by
// rendering a Thai cover; it was never a Thai problem — a long English
// title does it too, and several of this application's own titles are long.
//
// ── The first version of this check was green and proved nothing ────────
//
// It asserted that the subtitle sits below the title. That is true whether
// the band grows or not, because the subtitle flows after the title either
// way — what changes is whether the BAND grows with them. Putting the fixed
// height back left the suite at 30 passed, 0 failed, which is how an
// assertion that tests nothing announces itself if you plant the bug back
// and watch. If you do not plant it back, it never announces itself at all.
//
// So this measures the thing that actually moves: where the first line
// BELOW the band lands. If the band is fixed, DOCUMENT is at the same y
// whatever the title does. If it fits itself to the title, it moves down.
{
  const cover = (title: string): Report => ({
    title,
    subtitle: 'This subtitle must not be sitting on the accent strip',
    project: 'Bang Pakong 230/22 kV Substation',
    generatedAt: new Date('2026-09-27T09:00:00Z'),
  })

  const yOfDocument = async (title: string, name: string) => {
    const file = join(out, name)
    writeFileSync(file, await toPdf(cover(title)))
    const bbox = execFileSync('pdftotext', ['-bbox', file, '-'], { encoding: 'utf8' })
    const m = /<word xMin="[\d.]+" yMin="([\d.]+)"[^>]*>DOCUMENT<\/word>/.exec(bbox)
    return m ? parseFloat(m[1]) : NaN
  }

  const short = await yOfDocument('Defect Report', 'short.pdf')
  const long = await yOfDocument(
    'Integrated Systems Test — Readiness, Outstanding Items and the Agreed Actions Arising From Them',
    'long.pdf',
  )

  ok('both covers were measured', Number.isFinite(short) && Number.isFinite(long), `${short} / ${long}`)
  ok('a long title pushes the band down rather than overflowing it',
     long > short + 20,
     `DOCUMENT is at ${short} with a short title and ${long} with a long one — if those are equal the band is a fixed height again`)

  // And the short one must not have grown: the minimum is 232, so an
  // ordinary cover is exactly the cover it always was.
  ok('a short title leaves the band at its original height',
     Math.abs(short - 297) < 12, `${short} — the ordinary cover moved`)
}

console.log(`${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
