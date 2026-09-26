// The CxNivora mark, drawn once and rendered two ways.
//
// ── Why the shapes are data ─────────────────────────────────────────────
//
// The same mark has to appear on a web page, where it is SVG, and on the
// first page of a PDF, where it is drawn into a canvas a point at a time by
// pdfkit. Keeping two hand-made copies in step is how a logo ends up
// slightly different on the document a client receives from the one on the
// site they were shown — which is exactly the kind of small wrongness that
// makes a product look like a side project.
//
// So each mark is a short list of shapes in a 100 × 100 box, and there are
// two renderers. Change the geometry once.

import type { Brand } from '@/lib/brand'

export type Ink = 'anchor' | 'accent' | 'ground'

export type Shape =
  | { kind: 'path'; d: string; fill?: Ink; stroke?: Ink; width?: number; cap?: 'round' | 'butt' }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; r?: number; fill: Ink }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill?: Ink; stroke?: Ink; width?: number }

/**
 * Three marks, one per direction.
 *
 * Each is designed to survive being 16 px in a browser tab — which is where
 * most of them will actually be seen — so none of them has a detail thinner
 * than about a twelfth of its width, and none depends on a colour that
 * disappears when it is printed in grey.
 */
export const MARKS: Record<Brand['mark'], Shape[]> = {
  // A hexagon: a nut, a bolt head, a plate. Plant, not software. The tick is
  // cut through it rather than sitting on top, so the mark stays one object.
  hex: [
    { kind: 'path', d: 'M50 3 L91 26.5 L91 73.5 L50 97 L9 73.5 L9 26.5 Z', fill: 'anchor' },
    { kind: 'path', d: 'M30 50 L44 64 L71 35', stroke: 'accent', width: 11, cap: 'round' },
  ],

  // A dial with a needle at two o'clock. An instrument reading true — and
  // the most restrained of the three, which is the point of it.
  dial: [
    { kind: 'circle', cx: 50, cy: 50, r: 42, stroke: 'anchor', width: 11 },
    { kind: 'path', d: 'M50 50 L76 29', stroke: 'accent', width: 10, cap: 'round' },
    { kind: 'circle', cx: 50, cy: 50, r: 8, fill: 'anchor' },
  ],

  // Five ascending bars: L1 to L5. The only one of the three that means
  // something, and the meaning is the thing this application is built on.
  levels: [
    { kind: 'rect', x: 6, y: 70, w: 13, h: 24, r: 3.5, fill: 'anchor' },
    { kind: 'rect', x: 25, y: 56, w: 13, h: 38, r: 3.5, fill: 'anchor' },
    { kind: 'rect', x: 44, y: 42, w: 13, h: 52, r: 3.5, fill: 'anchor' },
    { kind: 'rect', x: 63, y: 28, w: 13, h: 66, r: 3.5, fill: 'anchor' },
    { kind: 'rect', x: 82, y: 6, w: 13, h: 88, r: 3.5, fill: 'accent' },
  ],
}

/**
 * `invert` is for the mark on a dark background.
 *
 * Found by rendering the cover and looking at it: the hexagon is drawn in
 * the anchor colour, the cover band IS the anchor colour, and the result was
 * an orange tick floating on navy with no hexagon at all. The same happened
 * to four of the five level bars. A logo that disappears on the one surface
 * it appears largest on is not a logo.
 *
 * So on a dark ground the anchor shapes are drawn in the light one. The
 * accent is left alone — it is chosen to hold up against both.
 */
function inkOf(brand: Brand, ink: Ink | undefined, fallback: string, invert = false): string {
  if (ink === 'anchor') return invert ? brand.colors.ground : brand.colors.anchor
  if (ink === 'accent') return brand.colors.accent
  if (ink === 'ground') return invert ? brand.colors.anchor : brand.colors.ground
  return fallback
}

/** The mark as SVG, for a web page. */
export function markSvg(brand: Brand, size = 32, invert = false): string {
  const parts = MARKS[brand.mark].map((shape) => {
    if (shape.kind === 'rect') {
      return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="${shape.r ?? 0}" fill="${inkOf(brand, shape.fill, 'none', invert)}"/>`
    }
    if (shape.kind === 'circle') {
      const fill = shape.fill ? inkOf(brand, shape.fill, 'none', invert) : 'none'
      const stroke = shape.stroke ? ` stroke="${inkOf(brand, shape.stroke, 'none', invert)}" stroke-width="${shape.width ?? 1}"` : ''
      return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" fill="${fill}"${stroke}/>`
    }
    const fill = shape.fill ? inkOf(brand, shape.fill, 'none', invert) : 'none'
    const stroke = shape.stroke
      ? ` stroke="${inkOf(brand, shape.stroke, 'none', invert)}" stroke-width="${shape.width ?? 1}" stroke-linecap="${shape.cap ?? 'butt'}" stroke-linejoin="round"`
      : ''
    return `<path d="${shape.d}" fill="${fill}"${stroke}/>`
  })

  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${brand.name}">${parts.join('')}</svg>`
}

/**
 * The same mark, drawn into a PDF.
 *
 * `doc` is a pdfkit document. It is typed loosely on purpose: pdfkit has no
 * types in this project, and inventing a wrong interface for it here would
 * be worse than saying plainly that this is the one place that touches it.
 */
type PdfLike = {
  save: () => PdfLike
  restore: () => PdfLike
  translate: (x: number, y: number) => PdfLike
  scale: (f: number) => PdfLike
  path: (d: string) => PdfLike
  roundedRect: (x: number, y: number, w: number, h: number, r: number) => PdfLike
  rect: (x: number, y: number, w: number, h: number) => PdfLike
  circle: (cx: number, cy: number, r: number) => PdfLike
  fill: (color?: string) => PdfLike
  stroke: (color?: string) => PdfLike
  lineWidth: (w: number) => PdfLike
  lineCap: (cap: string) => PdfLike
  lineJoin: (join: string) => PdfLike
}

export function drawMark(doc: PdfLike, brand: Brand, x: number, y: number, size: number, invert = false): void {
  doc.save()
  doc.translate(x, y).scale(size / 100)

  for (const shape of MARKS[brand.mark]) {
    if (shape.kind === 'rect') {
      doc.roundedRect(shape.x, shape.y, shape.w, shape.h, shape.r ?? 0).fill(inkOf(brand, shape.fill, '#000', invert))
      continue
    }
    if (shape.kind === 'circle') {
      doc.circle(shape.cx, shape.cy, shape.r)
      if (shape.fill) doc.fill(inkOf(brand, shape.fill, '#000', invert))
      else doc.lineWidth(shape.width ?? 1).stroke(inkOf(brand, shape.stroke, '#000', invert))
      continue
    }
    doc.path(shape.d)
    if (shape.fill) doc.fill(inkOf(brand, shape.fill, '#000', invert))
    else {
      doc.lineWidth(shape.width ?? 1).lineCap(shape.cap ?? 'butt').lineJoin('round')
      doc.stroke(inkOf(brand, shape.stroke, '#000', invert))
    }
  }

  doc.restore()
}
