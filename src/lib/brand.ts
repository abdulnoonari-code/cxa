// CxNivora — the brand, as data.
//
// ── Why the brand is a file and not a set of hex codes in a stylesheet ──
//
// Because it has to be applied in two places that cannot share CSS: the
// screen, which is CSS, and the documents, which are drawn into a PDF a
// point at a time. Every previous attempt to keep those in step by hand
// drifted — the header on the punch list was a different blue from the
// header on the ITP for four weeks and nobody noticed, because nobody has
// both open at once.
//
// ── The rule that constrains every colour below ─────────────────────────
//
// THREE COLOURS ARE ALREADY SPOKEN FOR AND MAY NOT BE BORROWED:
//
//     green  means passed
//     amber  means warning
//     red    means failed
//
// A brand in any of those families means colour alone can no longer say
// what a thing IS. An emerald brand was tried once here and made a
// half-finished progress bar look like a completed one, which is why that
// palette did not last. So a CxNivora brand colour is never green, amber or
// red, and the assertion suite checks the distance.
//
// ── What "three colours" means here ─────────────────────────────────────
//
//   anchor   the dark one. Headers, the rail, the cover band, body text.
//   accent   the bright one. One per screen, one per page. It is what the
//            eye is pulled to, so it is spent on the thing that matters.
//   ground   the light one. Paper. Everything sits on it.
//
// Three is a discipline, not a limit: a palette of six is a palette nobody
// can apply consistently, and the semantic three above still exist on top.

export type Brand = {
  id: string
  /** The name as it is written, everywhere, always. */
  name: string
  /** One line under the name on a cover page. */
  line: string
  /** A sentence saying what this direction is going for. */
  intent: string
  colors: {
    /** The dark anchor. */
    anchor: string
    /** A softer step of the anchor, for secondary text on paper. */
    anchorSoft: string
    /** The one bright colour. Used as a GRAPHIC: the mark, a rule, a band,
     *  a filled button. Never as small type on paper — see accentInk. */
    accent: string
    /**
     * The accent, darkened until it is legible as text.
     *
     * This step exists because two different rules apply to the same
     * colour. A coloured shape has to reach 3:1 against what is behind it
     * before an eye can find its edge; coloured TEXT has to reach 4.5:1
     * before an eye can read it. A brand accent picked to be bright enough
     * to pull the eye almost never clears 4.5, and the usual answers are
     * both bad: dull the accent until the brand goes grey, or set 3:1 text
     * and let the reader squint.
     *
     * So there are two steps. The bright one is spent on shapes. The dark
     * one is spent on words. They are the same colour to look at and only
     * the second is ever a sentence.
     */
    accentInk: string
    /** A pale wash of the accent, for panel fills. */
    accentWash: string
    /** Paper. */
    ground: string
    /** Hairlines and table borders. */
    rule: string
    /** Body text on paper. */
    ink: string
    /** Secondary text on paper. */
    muted: string
  }
  /** Which mark to draw. See lib/mark.ts — the drawing is separate. */
  mark: 'hex' | 'dial' | 'levels'
}

export const BRANDS: Brand[] = [
  {
    id: 'copper',
    name: 'CxNivora',
    line: 'Commissioning assurance',
    intent:
      'Industrial and warm. Navy is the colour of drawings and switchgear; copper is the colour of the conductor itself. Reads as plant, not as software — which is the room these documents are opened in.',
    colors: {
      anchor: '#15243F',
      anchorSoft: '#3D4E6D',
      accent: '#B4652A',
      accentInk: '#8F4C17',
      accentWash: '#FBF0E7',
      ground: '#FAF8F5',
      rule: '#DCD6CC',
      ink: '#171C26',
      muted: '#5E6675',
    },
    mark: 'hex',
  },
  {
    id: 'instrument',
    name: 'CxNivora',
    line: 'Commissioning assurance',
    intent:
      'Precise and cool. Graphite and a clear cyan — the palette of a calibrated instrument. The most neutral of the three, and the one that stays out of the way of a photograph of a defect.',
    colors: {
      anchor: '#11161E',
      anchorSoft: '#3A4451',
      accent: '#0097B8',
      accentInk: '#046C86',
      accentWash: '#E7F6FA',
      ground: '#F7F9FA',
      rule: '#D8DFE5',
      ink: '#11161E',
      muted: '#586471',
    },
    mark: 'dial',
  },
  {
    id: 'level',
    name: 'CxNivora',
    line: 'Commissioning assurance',
    intent:
      'Confident and modern, and the only mark that means something: five ascending bars for L1 to L5. Reads as a software product rather than a contractor, which matters if this is ever sold to somebody other than you.',
    colors: {
      anchor: '#1E1B4B',
      anchorSoft: '#443F7A',
      accent: '#6D4AFF',
      accentInk: '#5636E0',
      accentWash: '#EEEBFF',
      ground: '#F8F8FC',
      rule: '#DEDCEA',
      ink: '#15132E',
      muted: '#5B5878',
    },
    mark: 'levels',
  },
]

export function brandById(id: string): Brand {
  return BRANDS.find((b) => b.id === id) ?? CXNIVORA
}

/**
 * The one CxNivora wears: graphite and cyan, with the dial mark.
 *
 * ── How this was chosen, honestly ───────────────────────────────────────
 *
 * I chose the violet direction first, on measurements, and said so. You
 * looked at all three and said you wanted this one. You were shown a cover
 * page; I was looking at a spreadsheet. Between those two, the person who
 * has to hand the document to a client is the one who should win — so this
 * is the one, and the two things the numbers were objecting to have been
 * dealt with rather than waved away.
 *
 * WHAT THE NUMBERS SAID, AND WHAT WAS DONE ABOUT IT
 *
 *   1. #0097B8 reaches only 3.25 against its ground, and text needs 4.5.
 *      TRUE, and it still is. So the bright cyan is never text. It is the
 *      mark, the cover strip, the rule down the side of a defect, the fill
 *      of a button — shapes, which need 3:1 and get 3.25. Words in the
 *      brand colour use accentInk (#046C86, 5.69) instead. Two steps, one
 *      colour, each used where it is legible. This is the ordinary answer
 *      and I should have reached for it before offering to rule the colour
 *      out.
 *
 *   2. The cyan sat 135 from the green that means passed — close enough
 *      that a chip could be misread. That was true because the green was
 *      itself a teal-green (#05c07a), leaning towards the cyan rather than
 *      away from it. The green has moved to #16A34A: a green that looks
 *      like green, which is the entire job of that colour. The gap is now
 *      193, and the change improves the verdict colour on its own terms —
 *      it is not a concession made to fit a brand.
 *
 * WHAT DID NOT MOVE: the accent is still forbidden on anything whose
 * meaning is carried by its colour. A progress bar, a state chip and a
 * gate dot take the reserved three and nothing else. That rule is what
 * actually prevented the emerald accident; distance was only ever a proxy
 * for it.
 *
 * The mark is a dial at rest — a circle, one hand, a centre. It is the
 * least clever of the three marks and the only one that survives being
 * printed at 8mm on the corner of a page, which is the size it is
 * actually seen at most often.
 */
export const CXNIVORA: Brand = BRANDS[1]

// ── Keeping the brand off the verdicts ──────────────────────────────────

/** The three colours that mean something and may not be borrowed. */
export const RESERVED = {
  /**
   * Moved from #05c07a, which was a teal-green: it leaned towards cyan
   * instead of away from it, and a teal "passed" dot beside a teal brand
   * rule is the beginning of an argument on site about whether a thing was
   * signed off. This green leans yellow, like a green does.
   */
  passed: '#16A34A',
  warning: '#ff9d0a',
  failed: '#ff2d68',
}

export function toRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

/**
 * How far apart two colours are, roughly as an eye sees it.
 *
 * Not a proper perceptual distance — a weighted Euclidean one, which is
 * enough to answer the only question being asked: could somebody mistake
 * this brand colour for "passed"?
 */
export function distance(a: string, b: string): number {
  const x = toRgb(a)
  const y = toRgb(b)
  const rMean = (x.r + y.r) / 2
  const dr = x.r - y.r
  const dg = x.g - y.g
  const db = x.b - y.b
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db)
}

/** Relative luminance, for contrast. */
export function luminance(hex: string): number {
  const { r, g, b } = toRgb(hex)
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio between two colours. */
export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const light = Math.max(la, lb)
  const dark = Math.min(la, lb)
  return (light + 0.05) / (dark + 0.05)
}
