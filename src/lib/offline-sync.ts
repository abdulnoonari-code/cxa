// Sending what the phone has been carrying.
//
// The decisions are all in lib/offline-queue.ts, where they are asserted
// against every answer a server can give. What is here is the plumbing: one
// fetch, and the careful business of turning an HTTP response — or the
// absence of one — into the right kind of answer.
//
// ── Getting this mapping wrong is the whole risk ───────────────────────
//
//   A REFUSAL treated as unreachable    retries a broken thing for ever,
//                                       flattening the battery and never
//                                       showing the person the reason.
//
//   UNREACHABLE treated as a refusal    strands a perfectly good defect
//                                       behind an error nobody can clear.
//
//   UNREACHABLE treated as SENT         loses the defect. This is the one
//                                       that must never happen, and it is
//                                       why `unreachable` is the default
//                                       for anything unrecognised.

import { afterAttempt, mayDrop, nextToSend, stranded, type SendOutcome, type QueuedDefect } from '@/lib/offline-queue'
import { listQueue, putQueued, dropQueued, type StoredDefect } from '@/lib/offline-db'

export const QUEUE_ENDPOINT = '/api/site/queue'

/** How long one attempt may take before it is treated as unreachable. */
const TIMEOUT_MS = 30_000

function body(item: StoredDefect): FormData {
  const form = new FormData()
  form.set('client_ref', item.clientRef)
  form.set('created_at', item.createdAt)
  form.set('subject', item.subject)
  form.set('title', item.title)
  if (item.description) form.set('description', item.description)
  if (item.requiredAction) form.set('required_action', item.requiredAction)
  if (item.category) form.set('category', item.category)
  form.set('severity', item.severity)
  if (item.level) form.set('level', item.level)
  if (item.responsibleParty) form.set('responsible_party', item.responsibleParty)
  if (item.dueDate) form.set('due_date', item.dueDate)
  if (item.location) form.set('location', item.location)
  // Several photographs, each with its own id so a retry cannot attach the
  // same picture twice. `append`, not `set` — `set` would leave one.
  const blobs = item.photoBlobs ?? (item.photo ? [item.photo] : [])
  const meta = item.photos ?? []
  blobs.forEach((blob, i) => {
    const info = meta[i]
    form.append('photo_ref', info?.ref ?? `${item.clientRef}-p${i}`)
    form.append('photo', new File([blob], info?.name ?? `photo-${i + 1}.jpg`, { type: info?.type ?? 'image/jpeg' }))
  })
  return form
}

/**
 * One attempt. Never throws — every failure is an outcome.
 *
 * A thrown error here would escape into whatever called it and leave the
 * item in 'sending' for ever, which looks on screen exactly like a phone
 * that is working on it and is in fact a phone that has forgotten.
 */
export async function sendOne(item: StoredDefect, fetcher: typeof fetch = fetch): Promise<SendOutcome> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null

  try {
    const response = await fetcher(QUEUE_ENDPOINT, {
      method: 'POST',
      body: body(item),
      signal: controller?.signal,
      // Never a cached answer. "It worked" from a cache is the worst
      // possible lie for this particular request.
      cache: 'no-store',
    })

    // The server answered and said no. It will say no again.
    if (response.status >= 400 && response.status < 500) {
      const reason = await readReason(response)
      return { kind: 'refused', reason }
    }

    // The server is having a bad time. Keep it and come back.
    if (!response.ok) {
      return { kind: 'unreachable', detail: `The site answered with an error (${response.status}). It is still on this phone.` }
    }

    const data = (await response.json()) as { ok?: boolean; already?: boolean; ref?: string | null; reason?: string }

    // A 200 that says ok:false is a server being polite about a problem.
    // Treat it as unreachable — keep the defect — because "200 but not
    // really" is exactly the shape that loses work when trusted.
    if (data.ok !== true) {
      return { kind: 'unreachable', detail: data.reason ?? 'The site did not confirm it.' }
    }

    return data.already ? { kind: 'already', ref: data.ref ?? null } : { kind: 'landed', ref: data.ref ?? null }
  } catch (error) {
    // Offline, DNS, a dropped connection, the timeout above, a browser
    // killing the request as the app went to the background. All of them
    // mean try again.
    const name = (error as { name?: string } | null)?.name
    return {
      kind: 'unreachable',
      detail: name === 'AbortError' ? 'The site took too long to answer. It is still on this phone.' : 'No signal. It is still on this phone.',
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function readReason(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { reason?: string }
    if (data.reason) return data.reason
  } catch {
    // Not JSON — a proxy page, a captive portal, an HTML error.
  }
  if (response.status === 401 || response.status === 403) {
    return 'You are not signed in on this phone. Sign in and send again.'
  }
  return `The site would not accept it (${response.status}).`
}

/**
 * Put back anything the last run of the app left mid-send.
 *
 * Called once when the app starts, BEFORE anything is sent. Nothing can
 * genuinely be in flight at that moment — the page that would have been
 * flying it is gone — so an item still marked 'sending' is one that was
 * interrupted, and leaving it that way strands it for ever.
 */
export async function reclaim(): Promise<number> {
  const queue = await listQueue()
  const stuck = stranded(queue)
  for (const item of stuck) {
    await putQueued({
      ...item,
      state: 'waiting',
      lastError: item.lastError ?? 'Sending was interrupted. It is still on this phone.',
    })
  }
  return stuck.length
}

export type FlushResult = {
  sent: number
  stillHere: number
  refused: number
  /** Set when nothing could be sent at all. */
  note: string | null
}

/**
 * Send everything that is due, oldest first, one at a time.
 *
 * ONE AT A TIME on purpose. Punch numbers are handed out in the order the
 * requests arrive, and six requests in flight at once arrive in whatever
 * order the network feels like — so a walk down a switchroom would come
 * back numbered at random. It is also kinder to one bar of signal.
 *
 * Stops at the first unreachable answer rather than grinding through
 * twenty: if the first one could not be sent, the rest cannot either, and
 * twenty failed requests is twenty timeouts and a flat battery.
 */
export async function flush(
  onChange?: (queue: StoredDefect[]) => void,
  fetcher: typeof fetch = fetch,
  now: () => Date = () => new Date(),
  /** True when somebody is waiting for it — see `dueForRetry`. */
  force = false
): Promise<FlushResult> {
  let sent = 0
  let stopped: string | null = null

  for (;;) {
    const queue = await listQueue()
    const next = nextToSend(queue, now(), force) as StoredDefect | null
    if (!next) break

    await putQueued({ ...next, state: 'sending' })
    onChange?.(await listQueue())

    const outcome = await sendOne(next, fetcher)
    const updated = afterAttempt(next, outcome, now()) as QueuedDefect

    if (mayDrop(updated)) {
      await dropQueued(updated.clientRef)
      sent++
    } else {
      // Keep the photograph. `afterAttempt` only knows about the fields it
      // was given, and spreading the original back in is what stops a
      // retry losing the picture.
      await putQueued({ ...next, ...updated })
    }
    onChange?.(await listQueue())

    if (outcome.kind === 'unreachable') {
      stopped = outcome.detail ?? 'No signal.'
      break
    }
  }

  const left = await listQueue()
  return {
    sent,
    stillHere: left.filter((i) => !mayDrop(i)).length,
    refused: left.filter((i) => i.state === 'refused').length,
    note: stopped,
  }
}

/**
 * Bring down the tag list and what is outstanding.
 *
 * Returns null rather than throwing when there is no signal — this runs on
 * every visit to the phone screen, and a failed refresh must never stop the
 * screen drawing from what it already has.
 */
export async function pull(fetcher: typeof fetch = fetch): Promise<{
  project: { id: string; name: string }
  subjects: { ref: string; code: string | null; name: string; type: string }[]
  open: { id: string; ref: string | null; title: string; category: string | null; status: string; due_date: string | null }[]
  at: string
} | null> {
  try {
    const response = await fetcher(QUEUE_ENDPOINT, { cache: 'no-store' })
    if (!response.ok) return null
    const data = await response.json()
    return data?.ok ? data : null
  } catch {
    return null
  }
}
