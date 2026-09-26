'use client'

import { useRef, useState } from 'react'
import { MAX_BYTES, ACCEPTED_TYPES } from '@/lib/photo'

/**
 * A photograph chosen on a phone, made small enough to actually send.
 *
 * ── The bug this exists to fix ──────────────────────────────────────────
 *
 * Next.js caps a Server Action request at ONE MEGABYTE by default. Every
 * form in this application that carries a photograph is a Server Action, and
 * every photograph off a modern phone camera is three to ten megabytes. So
 * the request was thrown away by the framework before a single line of this
 * application's code ran — no audit entry, no message, no punch item. Just an
 * error page with nothing on it.
 *
 * Raising the cap in next.config.ts is half the answer and only half: the
 * platform this runs on refuses any request body over about 4.5 MB whatever
 * Next is configured to allow, so a 9 MB photograph can never be sent whole.
 * And sending 9 MB from a switchroom on mobile data takes the best part of a
 * minute, which is a minute somebody is standing still holding a phone.
 *
 * So the photograph is shrunk HERE, in the browser, before it is sent:
 *
 *     8.4 MB, 4032 × 3024   →   ~320 KB, 1600 × 1200
 *
 * 1600 px on the long edge is more detail than the document ever prints (a
 * photograph goes into a PDF about 900 px wide) and far more than anybody
 * reads on a screen. Nothing legible is lost. A loose gland is still a
 * visibly loose gland.
 *
 * ── What happens when it cannot ─────────────────────────────────────────
 *
 * A HEIC off an iPhone cannot be decoded by a browser canvas at all, and
 * some browsers refuse to let a script replace the chosen file. Both are
 * handled the same way: the ORIGINAL file is left exactly as the person
 * chose it, and if it is too big to cross the wire the input is marked
 * invalid with `setCustomValidity` — so the browser itself refuses to submit
 * and says why, in its own bubble, before anything is sent.
 *
 * That is the important part. The failure this replaces was silent.
 */

/** The long edge after shrinking. A document prints about 900 px. */
const LONG_EDGE = 1600

/** Below this, leave it alone — re-encoding costs quality and gains nothing. */
const LEAVE_ALONE = 700 * 1024

/** JPEG quality. 0.82 is past the point where a defect photograph changes. */
const QUALITY = 0.82

/**
 * The most that can cross the wire, with room for multipart overhead.
 *
 * Kept a little under `MAX_BYTES` on purpose: this is about the REQUEST, and
 * the request carries boundaries, part headers and the rest of the form as
 * well as the photograph.
 */
const WIRE_LIMIT = MAX_BYTES - 200 * 1024

/** "3 photographs, 780 KB" — the count first, because that is what changed. */
function count(n: number, bytes: number): string {
  return `${n} photograph${n === 1 ? '' : 's'}, ${mb(bytes)}`
}

function mb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

/** Decode a file to something canvas can draw, right way up. */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  // createImageBitmap with imageOrientation honours the EXIF rotation tag, so
  // a photograph taken with the phone on its side is not saved sideways —
  // which is exactly what happens if the canvas is fed the raw pixels.
  try {
    if (typeof createImageBitmap === 'function') {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    }
  } catch {
    // HEIC, a corrupt file, or a browser that cannot decode this format.
    return null
  }

  try {
    const url = URL.createObjectURL(file)
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => resolve(null)
      el.src = url
    })
    URL.revokeObjectURL(url)
    return img
  } catch {
    return null
  }
}

async function shrink(file: File): Promise<File | null> {
  const source = await decode(file)
  if (!source) return null

  const w0 = 'width' in source ? source.width : 0
  const h0 = 'height' in source ? source.height : 0
  if (!w0 || !h0) return null

  const scale = Math.min(1, LONG_EDGE / Math.max(w0, h0))
  const w = Math.max(1, Math.round(w0 * scale))
  const h = Math.max(1, Math.round(h0 * scale))

  try {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(source as CanvasImageSource, 0, 0, w, h)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
    if (!blob) return null

    // A small PNG screenshot can come out of the JPEG encoder LARGER than it
    // went in. Keep whichever is smaller; there is no reason to ship the
    // worse of the two.
    if (blob.size >= file.size) return null

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return null
  } finally {
    if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) source.close()
  }
}

export default function PhotoInput({
  name,
  required = false,
  className = 'phone-file',
  hint,
  multiple = false,
}: {
  name: string
  required?: boolean
  className?: string
  /** A line under the field, shown until a photograph is chosen. */
  hint?: string
  /**
   * Several photographs of the same defect.
   *
   * A loose gland wants three: the gland, the panel it is in so somebody can
   * find it, and the termination once it is re-made. One photograph of a
   * gland is a photograph of a gland; it does not say which of forty.
   */
  multiple?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)

  async function chosen() {
    const input = ref.current
    if (!input) return

    input.setCustomValidity('')
    setRefused(false)

    const chosenFiles = [...(input.files ?? [])]
    if (chosenFiles.length === 0) {
      setSaid(null)
      return
    }

    const before = chosenFiles.reduce((sum, f) => sum + f.size, 0)
    const heavy = chosenFiles.filter((f) => f.size > LEAVE_ALONE)

    if (heavy.length === 0) {
      setSaid(count(chosenFiles.length, before) + ' — sent as they are.')
      return
    }

    setSaid(`${count(chosenFiles.length, before)} — making ${chosenFiles.length === 1 ? 'it' : 'them'} smaller…`)
    // Pressing Raise while this is still running would send the originals and
    // fail exactly as before. It takes a fraction of a second, but a fraction
    // of a second is enough for somebody whose thumb is already moving — so
    // the browser is told the field is not valid yet, and refuses to submit.
    input.setCustomValidity('The photographs are still being prepared. Try again in a moment.')

    // One at a time rather than all at once. A phone asked to decode five
    // twelve-megapixel photographs in parallel runs out of memory and the tab
    // is killed — which looks exactly like the app crashing, and takes the
    // typed-out defect with it.
    const out: File[] = []
    for (const file of chosenFiles) {
      if (file.size <= LEAVE_ALONE) {
        out.push(file)
        continue
      }
      const small = await shrink(file)
      out.push(small ?? file)
    }

    input.setCustomValidity('')
    const after = out.reduce((sum, f) => sum + f.size, 0)

    let replaced = false
    try {
      const box = new DataTransfer()
      for (const file of out) box.items.add(file)
      input.files = box.files
      replaced = true
    } catch {
      // A browser that will not let a script replace the chosen files. What
      // is going to be sent is the originals, whatever we just made.
    }

    const sending = replaced ? after : before
    const files = replaced ? out : chosenFiles

    // ── Does it fit? ───────────────────────────────────────────────────
    //
    // The limit is on the WHOLE request, not on each photograph — five at
    // 900 KB is over it even though no single one is close. Checked here, in
    // front of the person, rather than by the framework silently discarding
    // the lot.
    if (sending > WIRE_LIMIT) {
      const spare = files.filter((f) => f.size <= LEAVE_ALONE).length
      const heicish = files.some((f) => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name))
      const message = heicish
        ? `These come to ${mb(sending)}, and at least one is a HEIC that a browser cannot shrink. On an iPhone: Settings → Camera → Formats → Most Compatible, then take them again.`
        : `These ${files.length} photographs come to ${mb(sending)}, and at most ${mb(WIRE_LIMIT)} can be sent at once. Choose fewer and add the rest from the item afterwards.`
      void spare
      input.setCustomValidity(message)
      setRefused(true)
      setSaid(message)
      return
    }

    if (replaced && after < before) {
      setSaid(
        `${count(files.length, after)} — reduced from ${mb(before)} before sending. Nothing you can see is lost.`
      )
      return
    }

    setSaid(count(files.length, sending) + ' — sent as ' + (files.length === 1 ? 'it is' : 'they are') + '.')
  }

  return (
    <>
      <input
        ref={ref}
        type="file"
        name={name}
        multiple={multiple}
        required={required}
        accept={ACCEPTED_TYPES.join(',')}
        // The whole point of the phone screen: the back camera, not a file
        // picker. A browser that does not support it falls back to the picker,
        // which is what the desktop does anyway, so nothing is lost anywhere.
        capture="environment"
        className={className}
        onChange={chosen}
      />
      {(said || hint) && (
        <span
          className="phone-hint"
          style={refused ? { color: 'var(--color-danger)', fontWeight: 600 } : undefined}
          aria-live="polite"
        >
          {said ?? hint}
        </span>
      )}
    </>
  )
}
