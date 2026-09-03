import { createRequire } from 'node:module'

// Getting photographs into a document without producing a file nobody can send.
//
// A handover pack with a defect photo on it is exactly what a client asks for.
// A handover pack that is 180 MB because forty five-megabyte phone photos were
// embedded at full resolution is a file that sits in an outbox forever, and it
// is worse than no photos at all — because the person who generated it thinks
// they sent something.
//
// So this file is mostly about restraint. Three rules:
//
//   1. **Downscale before embedding.** A photograph printed 250 points wide on
//      an A4 page needs about 900 pixels across. Everything above that is
//      megabytes of detail nobody will ever see.
//
//   2. **Cap the count, and say what was left out.** A document that quietly
//      includes the first twenty photos and stops is lying by omission. It
//      states the cap, the number omitted, and where to see the rest.
//
//   3. **A photograph that cannot be fetched is named, not skipped.** A blank
//      space in a pack is indistinguishable from an item that never had a
//      photo, and those are very different things.

export type PreparedPhoto = {
  bytes: Buffer
  contentType: string
  caption: string
  note: string
}

export type PreparedGallery = {
  photos: PreparedPhoto[]
  /** How many were left out, and why — printed in the document. */
  omitted: number
  /** Photographs that exist but could not be fetched. Named, never silently dropped. */
  failed: { caption: string; reason: string }[]
  /** Roughly how many bytes the images add to the document. */
  bytes: number
  /**
   * Which limit stopped it, when something was left out.
   *
   * It matters which. "At most 24 are carried" is a wrong explanation when the
   * real reason was that eleven photographs of a switchboard filled the byte
   * budget, and somebody reading it would go looking for a twenty-fifth
   * photograph that does not exist.
   */
  stoppedBy: 'count' | 'bytes' | null
}

/** The widest a photograph is printed, in points. 250pt ≈ 88 mm on A4. */
export const PRINT_WIDTH_PT = 250

/**
 * Pixels across after downscaling.
 *
 * 900 px at 250 pt is about 260 dpi, which is past what any office printer
 * resolves and well past what anybody reads on screen.
 */
export const TARGET_PX = 900

/** How many photographs one document may carry. */
export const MAX_PHOTOS = 24

/**
 * And a hard ceiling on what they may weigh, whatever the count.
 *
 * 7 MB, not a rounder number, because a PDF embeds photographs at very nearly
 * their own size: a 12 MB budget produced a 12 MB pack, and the mail gateway
 * at most of the companies this gets sent to rejects anything over 10 MB. A
 * pack that bounces is a pack that was never delivered, and the sender does
 * not always find out.
 *
 * At the size a real site photograph shrinks to — roughly 90 KB at 900 px —
 * this budget never binds and the count is what limits the document. It binds
 * only on pathological input, which is exactly when a limit should.
 */
export const MAX_TOTAL_BYTES = 7 * 1024 * 1024

/**
 * Load sharp, if this deployment happens to have it.
 *
 * The module name is assembled at runtime, and that is deliberate rather than
 * cute. A literal `import('sharp')` is resolved at BUILD time by two separate
 * things — TypeScript, which wants the type declarations, and the bundler,
 * which wants the module — and both fail when sharp is not installed. That is
 * exactly what it did: the Vercel build stopped with
 *
 *     Cannot find module 'sharp' or its corresponding type declarations
 *
 * even though every line of this function is written to work without it. A
 * guard that only protects the runtime is not a guard at all if the build
 * refuses to produce a runtime.
 *
 * sharp is not in package.json. It arrives with Next.js for image
 * optimisation and Vercel usually ships it, so this usually finds it. When it
 * does not, photographs go into documents at their original size and the byte
 * cap does the limiting instead — the document says so rather than pretending.
 */
let cachedSharp: ((input: Buffer) => SharpLike) | null | undefined

function loadSharp(): ((input: Buffer) => SharpLike) | null {
  if (cachedSharp !== undefined) return cachedSharp

  // The name is assembled so that no build tool can fold it back into a
  // literal and start resolving it again.
  const name = ['sh', 'arp'].join('')

  // Two resolution roots, because one is not enough. `import.meta.url` inside
  // a bundled server chunk points at the chunk, not at the application, and
  // resolving from there finds nothing — which is exactly what happened: the
  // build passed, the loader silently returned null, and every photograph
  // went into documents at full size. A silent fallback that never fires
  // correctly is worse than no fallback, because nothing looks wrong.
  const roots = [`${process.cwd()}/index.js`, import.meta.url]

  for (const root of roots) {
    try {
      const mod = createRequire(root)(name) as { default?: unknown } | unknown
      const fn = (mod as { default?: unknown })?.default ?? mod
      if (typeof fn === 'function') {
        cachedSharp = fn as (input: Buffer) => SharpLike
        return cachedSharp
      }
    } catch {
      // Try the next root.
    }
  }

  cachedSharp = null
  return null
}

/** Whether this deployment can downscale. Reported in documents, not guessed at. */
export function canDownscale(): boolean {
  return loadSharp() !== null
}

type SharpLike = {
  resize: (o: object) => { jpeg: (o: object) => { toBuffer: () => Promise<Buffer> } }
}

/** Shrink one image, if the platform can. See `loadSharp` for why it might not. */
export async function shrink(bytes: ArrayBuffer, contentType: string): Promise<{ bytes: Buffer; contentType: string }> {
  const original = Buffer.from(bytes)

  // Small enough already: re-encoding would cost time and gain nothing.
  if (original.byteLength < 180_000) return { bytes: original, contentType }

  try {
    const sharp = loadSharp()
    if (!sharp) return { bytes: original, contentType }

    const out = await sharp(original)
      .resize({ width: TARGET_PX, withoutEnlargement: true, fit: 'inside' })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer()

    // If the "optimised" copy is somehow bigger, keep the original. It happens
    // with small PNGs of screenshots and there is no reason to ship the worse
    // of the two.
    return out.byteLength < original.byteLength
      ? { bytes: out, contentType: 'image/jpeg' }
      : { bytes: original, contentType }
  } catch {
    return { bytes: original, contentType }
  }
}

export type PhotoSource = {
  /** The path inside the storage bucket. Preferred — see `fetchBytes`. */
  path?: string | null
  url: string | null
  contentType: string | null
  caption: string
  note: string
}

/**
 * Get one photograph's bytes.
 *
 * By its **storage path** first, not its public URL. Three reasons, and the
 * third is the one that bites:
 *
 *   1. It works whether the bucket is public or private. Every upload in this
 *      app currently writes a public URL, which means anybody holding the link
 *      can read the photograph. The day that gets tightened — and on a real
 *      project it should be — every public URL stops working, and a report
 *      that depends on them would silently fill with "Storage returned HTTP
 *      400" instead of photographs.
 *   2. One hop instead of two. The public URL sends the serverless function
 *      out to the CDN and back for a file the same credentials can read
 *      directly.
 *   3. A serverless function is not guaranteed to be able to reach the public
 *      internet the way a browser can.
 *
 * The URL stays as a fallback for rows uploaded before `file_path` was
 * recorded, so nothing already on the system stops working.
 */
export async function fetchBytes(
  source: PhotoSource,
  download: (path: string) => Promise<{ data: Blob | null; error: unknown }>
): Promise<{ ok: true; bytes: ArrayBuffer } | { ok: false; reason: string }> {
  if (source.path) {
    try {
      const { data } = await download(source.path)
      if (data) return { ok: true, bytes: await data.arrayBuffer() }
    } catch {
      // Fall through to the URL. A storage client that throws is not a reason
      // to give up on a photograph that also has a working public link.
    }
  }

  if (!source.url) {
    return { ok: false, reason: 'No file was stored for this photograph.' }
  }

  try {
    const res = await fetch(source.url, { cache: 'no-store' })
    if (!res.ok) return { ok: false, reason: `Storage returned HTTP ${res.status}.` }
    return { ok: true, bytes: await res.arrayBuffer() }
  } catch {
    return { ok: false, reason: 'The photograph could not be fetched from storage.' }
  }
}

/**
 * Fetch, shrink and cap a set of photographs for one document.
 *
 * Stops at whichever limit is reached first — the count or the byte budget —
 * and reports what it left behind either way.
 */
export async function prepareGallery(
  sources: PhotoSource[],
  download: (path: string) => Promise<{ data: Blob | null; error: unknown }>,
  limit = MAX_PHOTOS
): Promise<PreparedGallery> {
  const photos: PreparedPhoto[] = []
  const failed: { caption: string; reason: string }[] = []
  let bytes = 0
  let used = 0
  let stoppedBy: 'count' | 'bytes' | null = null

  for (const source of sources) {
    if (used >= limit) {
      stoppedBy = 'count'
      break
    }
    if (bytes >= MAX_TOTAL_BYTES) {
      stoppedBy = 'bytes'
      break
    }

    const got = await fetchBytes(source, download)
    if (!got.ok) {
      failed.push({ caption: source.caption, reason: got.reason })
      used += 1
      continue
    }

    try {
      const small = await shrink(got.bytes, source.contentType ?? 'image/jpeg')

      // One oversized photograph must not blow the budget for the rest.
      if (bytes + small.bytes.byteLength > MAX_TOTAL_BYTES) {
        stoppedBy = 'bytes'
        break
      }

      photos.push({
        bytes: small.bytes,
        contentType: small.contentType,
        caption: source.caption,
        note: source.note,
      })
      bytes += small.bytes.byteLength
      used += 1
    } catch {
      failed.push({ caption: source.caption, reason: 'The photograph was fetched but could not be read as an image.' })
      used += 1
    }
  }

  const omitted = Math.max(0, sources.length - used)
  return { photos, omitted, failed, bytes, stoppedBy: omitted > 0 ? stoppedBy : null }
}

// ── Turning stored photographs into document sources ─────────────────────
//
// The caption has to survive being printed 88 mm wide with no punch list
// beside it, so it names the item it belongs to and whether it is a defect or
// a fix. The note carries who and when, and what the AI made of it — marked as
// an AI reading, because an unattributed sentence under a photograph in a
// signed pack reads as the engineer's own finding.

export type PhotoRowLike = {
  kind: string
  file_path?: string | null
  file_url: string | null
  content_type: string | null
  caption: string | null
  file_name: string | null
  taken_at: string | null
  uploaded_by_name: string | null
  ai_confidence: string | null
  ai_problem: string | null
}

/** Defect photographs first, then fixes — the order somebody looks at them in. */
export function photoSources<T extends PhotoRowLike>(
  rows: T[],
  itemRef: (row: T, i: number) => string
): PhotoSource[] {
  return rows.map((row, i) => {
    const what = row.kind === 'fix' ? 'after the fix' : 'the defect'
    const said = row.caption?.trim() || row.file_name?.trim() || ''
    const bits: string[] = []
    if (row.taken_at) bits.push(`Taken ${row.taken_at.slice(0, 10)}`)
    if (row.uploaded_by_name) bits.push(`uploaded by ${row.uploaded_by_name}`)
    if (row.ai_problem) {
      const hedge = row.ai_confidence === 'cannot_tell' ? 'AI could not tell' : 'AI reading'
      bits.push(`${hedge}: ${row.ai_problem.replace(/\s+/g, ' ').slice(0, 150)}`)
    }
    return {
      path: row.file_path ?? null,
      url: row.file_url,
      contentType: row.content_type,
      caption: `${itemRef(row, i)} — ${what}${said ? `: ${said}` : ''}`,
      note: bits.join(' · '),
    }
  })
}

/** The sentence a document prints when it could not carry everything. */
export function omissionNote(gallery: PreparedGallery, where: string): string | null {
  const parts: string[] = []
  if (gallery.omitted > 0) {
    const why =
      gallery.stoppedBy === 'bytes'
        ? `the photographs already carried fill the ${Math.round(MAX_TOTAL_BYTES / (1024 * 1024))} MB this document allows for them`
        : `a document carries at most ${MAX_PHOTOS}`
    parts.push(
      `${gallery.omitted} further photograph${gallery.omitted === 1 ? '' : 's'} ${
        gallery.omitted === 1 ? 'is' : 'are'
      } not shown — ${why}, so that it stays small enough to send. See ${where} for all of them.`
    )
  }
  if (gallery.failed.length > 0) {
    parts.push(
      `${gallery.failed.length} photograph${gallery.failed.length === 1 ? '' : 's'} could not be fetched from storage and ${
        gallery.failed.length === 1 ? 'is' : 'are'
      } listed by name rather than shown, because a blank space in a pack looks identical to an item that never had a photograph.`
    )
  }
  return parts.length > 0 ? parts.join(' ') : null
}
