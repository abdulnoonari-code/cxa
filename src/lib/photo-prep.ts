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
 * Shrink one image, if the platform can.
 *
 * `sharp` is not a declared dependency of this project — it arrives with
 * Next.js, which uses it for image optimisation, and Vercel ships it. That is
 * reliable in practice and not guaranteed forever, so it is loaded through a
 * guarded dynamic import and the caller gets the original bytes back if it is
 * not there. The document is then larger rather than broken, and the cap on
 * total bytes still holds the line.
 *
 * If this ever stops working, the fix is to add "sharp" to package.json — not
 * to remove the photographs.
 */
export async function shrink(bytes: ArrayBuffer, contentType: string): Promise<{ bytes: Buffer; contentType: string }> {
  const original = Buffer.from(bytes)

  // Small enough already: re-encoding would cost time and gain nothing.
  if (original.byteLength < 180_000) return { bytes: original, contentType }

  try {
    const mod = (await import('sharp').catch(() => null)) as
      | { default: (input: Buffer) => { resize: (o: object) => { jpeg: (o: object) => { toBuffer: () => Promise<Buffer> } } } }
      | null
    if (!mod?.default) return { bytes: original, contentType }

    const out = await mod
      .default(original)
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
  url: string | null
  contentType: string | null
  caption: string
  note: string
}

/**
 * Fetch, shrink and cap a set of photographs for one document.
 *
 * Stops at whichever limit is reached first — the count or the byte budget —
 * and reports what it left behind either way.
 */
export async function prepareGallery(sources: PhotoSource[], limit = MAX_PHOTOS): Promise<PreparedGallery> {
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

    if (!source.url) {
      failed.push({ caption: source.caption, reason: 'No file was stored for this photograph.' })
      used += 1
      continue
    }

    try {
      const res = await fetch(source.url, { cache: 'no-store' })
      if (!res.ok) {
        failed.push({ caption: source.caption, reason: `Storage returned HTTP ${res.status}.` })
        used += 1
        continue
      }
      const raw = await res.arrayBuffer()
      const small = await shrink(raw, source.contentType ?? 'image/jpeg')

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
      failed.push({ caption: source.caption, reason: 'The photograph could not be fetched from storage.' })
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
