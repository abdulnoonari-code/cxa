import { CXNIVORA } from '@/lib/brand'
import { markSvg } from '@/lib/mark'

/**
 * The CxNivora mark, on a screen.
 *
 * ── Why it is the same object as the one on a PDF ───────────────────────
 *
 * The geometry lives in lib/mark.ts and is rendered two ways — as SVG here,
 * and drawn point by point into a document by lib/docgen.ts. Before that, the
 * rail carried the letters "CX" in a gradient box and the documents carried
 * nothing at all, which is how a product ends up with three logos.
 *
 * `onDark` inverts it. The mark's body is the anchor colour, and the rail IS
 * the anchor colour — without inverting, the rail shows four invisible bars
 * and one violet one. Found by rendering a cover page and looking at it.
 */
export function BrandMark({ size = 28, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <span
      className="brand-mark"
      style={{ width: size, height: size }}
      // The SVG is generated from data this application owns — there is no
      // user input anywhere in it.
      dangerouslySetInnerHTML={{ __html: markSvg(CXNIVORA, size, onDark) }}
      aria-hidden
    />
  )
}

/**
 * The mark on its own tile — the same object the phone puts on a home
 * screen, at whatever size a page needs it.
 *
 * It exists because three screens did not have it. The login page, the
 * sign-up page and /about each drew a 44px rounded square with the letters
 * "CX" typed into it, and they kept drawing it after the rail and the
 * documents had moved to the mark. So the first thing a new user ever saw
 * of this product was a logo the product does not use, and the last screen
 * to be rebranded was the first one anybody looks at.
 *
 * Found by starting the built application and looking at the login page.
 * There is no way to catch this by reading code: every file involved was
 * correct on its own.
 *
 * The padding and the corner radius are the icon generator's, so the tile
 * here and the icon on a phone are the same picture.
 */
export function BrandTile({ size = 44 }: { size?: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.22),
        background: CXNIVORA.colors.anchor,
      }}
    >
      <BrandMark size={Math.round(size * 0.56)} onDark />
    </span>
  )
}

export const BRAND_NAME = CXNIVORA.name
