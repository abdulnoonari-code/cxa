// QR codes for tags.
//
// ── What the code actually contains ─────────────────────────────────────
//
// A URL to this application, pointing at that thing's own page:
//
//     https://<your site>/assets/equipment/<id>
//
// NOT the tag number. That is the decision worth defending, because the
// obvious choice is to encode "SUDB-Q01" and it is the wrong one: a phone
// camera reading a bare tag number shows the person a piece of text and
// leaves them exactly where they started. A URL opens the item — its
// checks, its issues, its documents — in one scan, in the field, with wet
// hands and a hard hat on.
//
// The tag is still PRINTED on the label beside the code, in large type,
// because a label whose only content is a QR code is useless the moment
// somebody's phone is flat, and because the person sticking it on needs to
// read it to know where it goes.
//
// ── Why the site address is read from the request ───────────────────────
//
// A label is printed once and lives on a switchboard for twenty years. If
// the address were hard-coded and the site later moved, every label on the
// job would point at nothing. Taking it from the request that asked for the
// label means the code always points at the site the person is actually
// using — the preview deployment while testing, the real one in the field.
//
// ── Correction level ────────────────────────────────────────────────────
//
// Q: about 25% of the code can be damaged and it still reads. The default
// is M (15%). These labels go on plant, in dust, behind doors, and get
// scuffed by cable pulling. The cost is a slightly denser code, which at
// the size these are printed at is not a problem.

import QRCode from 'qrcode'
import type { SubjectType } from '@/lib/subjects'

/** Everything a QR label needs. Deliberately no database types in here. */
export type LabelSubject = {
  type: SubjectType | 'component'
  id: string
  /** The tag or code, printed large. */
  code: string
  /** What it is, printed small under the tag. */
  name: string
  /** Where it sits, printed smaller still. Optional. */
  place?: string | null
}

/**
 * The address a scan should open.
 *
 * `origin` comes from the request. It is validated rather than trusted: a
 * Host header is supplied by the caller and a bad one would put somebody
 * else's address on every label of the job.
 */
export function targetUrl(origin: string, subject: { type: string; id: string }): string {
  const base = origin.replace(/\/+$/, '')
  return `${base}/assets/${subject.type}/${subject.id}`
}

/**
 * The origin to print into the codes, from the request.
 *
 * Vercel puts the real host in x-forwarded-host and the scheme in
 * x-forwarded-proto; a direct request has neither and Host is right.
 * Anything that does not look like a host is refused rather than used,
 * because the value ends up printed on labels that outlive the deployment.
 */
export function originFrom(headers: {
  get(name: string): string | null
}): string | null {
  const host = headers.get('x-forwarded-host') ?? headers.get('host')
  if (!host) return null
  // Letters, digits, dots, hyphens and an optional port. No scheme, no path,
  // no credentials, no spaces.
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return null
  const proto = headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  if (proto !== 'http' && proto !== 'https') return null
  return `${proto}://${host}`
}

/** One QR code as an SVG string, ready to drop into a page or a print sheet. */
export async function qrSvg(text: string, size = 128): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'Q',
    margin: 1,
    width: size,
    color: { dark: '#000000', light: '#ffffff' },
  })
}

/**
 * The SVG with its fixed width and height stripped, so it scales to whatever
 * box it is put in.
 *
 * The library writes width="128" height="128" as well as a viewBox. Left
 * alone, a label printed at 22mm renders a 128px code inside it and either
 * overflows or sits in a corner. Removing the two attributes and keeping the
 * viewBox is what makes one generated code usable at any print size.
 */
export function fluid(svg: string): string {
  return svg.replace(/\s(width|height)="[^"]*"/g, '')
}

export const LABEL_SIZES = [
  { value: 'small', label: 'Small — 24 per sheet', perRow: 4, mm: 45 },
  { value: 'medium', label: 'Medium — 12 per sheet', perRow: 3, mm: 62 },
  { value: 'large', label: 'Large — 6 per sheet', perRow: 2, mm: 95 },
] as const

export type LabelSize = (typeof LABEL_SIZES)[number]['value']

export function labelSize(value: string | null | undefined): (typeof LABEL_SIZES)[number] {
  return LABEL_SIZES.find((s) => s.value === value) ?? LABEL_SIZES[1]
}

/** What a scan of this label will open, in words, for the print sheet footer. */
export function scanNote(origin: string | null): string {
  return origin
    ? `Each code opens that item on ${origin.replace(/^https?:\/\//, '')} — its checks, its punch items and its documents.`
    : 'Each code opens that item in CxSentinel — its checks, its punch items and its documents.'
}
