// A defect raised with no signal, and what happens to it afterwards.
//
// ── The one rule everything here is built around ───────────────────────
//
//     A QUEUED DEFECT IS DROPPED FROM THE PHONE ONLY WHEN THE SERVER HAS
//     SAID, IN SO MANY WORDS, THAT IT HAS IT.
//
// Not when the request was sent. Not when the connection came back. Not
// when the app was reopened, or the queue looked tidy, or an error looked
// harmless. A person photographed a defect in a plant room and believes it
// is recorded; the only thing that makes that true is the server having the
// row, and the only thing that proves it is the server saying so.
//
// Everything below is a consequence of that rule:
//
//   · An unreachable server is NEVER a reason to drop anything. Offline, a
//     timeout, a 500, a dropped reply — all of them mean "try again", for
//     as long as it takes. There is no attempt limit and there is no
//     expiry, because a defect that quietly expired after five tries is the
//     failure this whole feature exists to prevent.
//
//   · A server that REFUSES — signed out, no access, data it will never
//     accept — is different, and must not be retried forever in silence.
//     It is set aside, kept, and shown with the reason, because it needs a
//     person rather than another attempt.
//
//   · A repeat that the server recognises ("I already have this one") is a
//     SUCCESS. That is what SQL part 43 is for: the phone cannot tell a
//     lost reply from a lost request, so it sends again, and the database
//     refuses the duplicate. The refusal is the confirmation.
//
// ── Why this file has no IndexedDB and no fetch in it ──────────────────
//
// Because the decisions are the part that can lose somebody's work, and
// decisions that can only be reached through a browser, a database and a
// dead mobile signal are decisions nobody ever exercises against the cases
// that matter. The storage is in lib/offline-db.ts and the sending is in
// lib/offline-sync.ts. What is here is pure, and every branch of it is
// asserted against every answer a server can give.

export type QueueState =
  /** On the phone, not yet accepted. The normal state with no signal. */
  | 'waiting'
  /** A request is in flight right now. */
  | 'sending'
  /** The server has it. Safe to drop — and the ONLY state that is. */
  | 'sent'
  /** The server said no in a way another attempt will not fix. */
  | 'refused'

export type QueuedDefect = {
  /**
   * Made on the phone before it ever had a signal, and never changed.
   *
   * This is the whole anti-duplicate mechanism. It goes to the server with
   * every attempt, and a unique index refuses the second one — see
   * week5-part43-raised-offline.sql.
   */
  clientRef: string
  /** When the person pressed Raise. Not when it was sent. */
  createdAt: string
  projectId: string

  /** "equipment:<id>" or "system:<id>", as the picker produces. */
  subject: string
  title: string
  description: string | null
  requiredAction: string | null
  category: string | null
  severity: string
  level: string | null
  responsibleParty: string | null
  dueDate: string | null
  location: string | null

  /**
   * The photographs, each with its own id for the same reason the defect has
   * one: a photograph upload can be lost on the way back exactly as a defect
   * can, and without an id the retry attaches the same picture twice.
   *
   * The single-photograph fields below are what this looked like before, and
   * they are READ but never written — see `migrate`. A phone that queued a
   * defect on the old shape and updated the app before it found a signal
   * must not lose its picture.
   */
  photos?: { ref: string; name: string; type: string; size: number }[]

  /** @deprecated Read for items queued before several were allowed. */
  photoRef?: string | null
  /** @deprecated */
  photoName?: string | null
  /** @deprecated */
  photoType?: string | null
  /** @deprecated */
  photoSize?: number | null

  state: QueueState
  attempts: number
  lastTriedAt: string | null
  lastError: string | null

  /** The punch number the server gave it. Null until it has actually landed. */
  ref: string | null
}

/** What one attempt to send came back with. */
export type SendOutcome =
  /** Written. `ref` is the punch number the server allocated. */
  | { kind: 'landed'; ref: string | null }
  /** The server already had this clientRef. Also a success — see above. */
  | { kind: 'already'; ref: string | null }
  /** Could not be reached, or broke on the way. Try again, forever. */
  | { kind: 'unreachable'; detail?: string }
  /** Answered, and said no. Needs a person, not another attempt. */
  | { kind: 'refused'; reason: string }

// ── Identity ────────────────────────────────────────────────────────────

/**
 * An id for one queued defect.
 *
 * Taken from the platform's own random source where there is one, because
 * two engineers on two phones in the same substation must not produce the
 * same id — and `Date.now()` on two phones that both started a shift at
 * eight o'clock is not as unlikely as it sounds.
 *
 * The fallback is not decoration: `crypto.randomUUID` needs a secure
 * context, and a phone browsing over plain http on a site network does not
 * have one. It still has to be able to raise a defect.
 */
export function makeRef(random: () => number = Math.random, now: () => number = Date.now): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } }
  if (typeof g.crypto?.randomUUID === 'function') return g.crypto.randomUUID()
  return randomRef(random, now)
}

/**
 * The fallback, as its own function so it can be exercised directly.
 *
 * It was written inline inside `makeRef`, with the suite reaching it by
 * deleting `crypto.randomUUID` off the global — which silently did nothing,
 * so the suite tested the same path twice and reported both as passing.
 * A branch that can only be reached by sabotaging the platform is a branch
 * nobody tests, which on a phone browsing a site network over plain http is
 * the ONLY branch there is.
 */
export function randomRef(random: () => number = Math.random, now: () => number = Date.now): string {
  const bits = () => Math.floor(random() * 0xffffffff).toString(36)
  return `q-${now().toString(36)}-${bits()}-${bits()}`
}

// ── When to try again ───────────────────────────────────────────────────

/**
 * How long to wait after a failed attempt, in milliseconds.
 *
 * Quick at first, because the common case is a signal that came back
 * seconds ago. Then slower, because a phone that has been in a basement for
 * an hour must not spend that hour flattening its battery on a radio that
 * has nothing to talk to. Capped at ten minutes: there is no point waiting
 * longer, and every wake-up is a chance to catch a passing bar of signal.
 */
export function backoffMs(attempts: number): number {
  const ladder = [0, 5_000, 15_000, 60_000, 180_000, 600_000]
  if (attempts <= 0) return 0
  return ladder[Math.min(attempts, ladder.length - 1)]
}

/**
 * `force` is for the two moments somebody is WAITING for it.
 *
 * The backoff exists to stop a phone in a pocket hammering a radio that has
 * nothing to talk to. It was never meant to make a person who has just
 * walked into signal and pressed Send now stand there for three minutes
 * watching a count that does not move — which is exactly what it did, and
 * what the browser test caught.
 *
 * So an explicit Send now, and the moment the browser reports the connection
 * is back, both go now. Everything else waits its turn.
 */
export function dueForRetry(item: QueuedDefect, now: Date = new Date(), force = false): boolean {
  // Never in flight, never finished.
  if (item.state === 'sending' || item.state === 'sent') return false

  // A refusal needs a person, so it is never retried on a timer — and IS
  // retried the moment a person presses Send now. That button is the person
  // acting on it: they have signed in again, or fixed whatever it was. A
  // refused item that no button can shift is an item somebody has to be told
  // to delete, which is the one instruction this application must never give.
  if (item.state === 'refused') return force

  if (force) return true
  if (!item.lastTriedAt) return true

  const last = new Date(item.lastTriedAt).getTime()
  // An unreadable timestamp must mean "try now", never "wait forever".
  if (Number.isNaN(last)) return true

  return now.getTime() - last >= backoffMs(item.attempts)
}

/**
 * The next defect to send, or null.
 *
 * Oldest first, so punch numbers come out in the order the defects were
 * actually found — which is the order somebody walked the site in, and the
 * order they will look for them in afterwards.
 *
 * An item the server has REFUSED is stepped over rather than blocking the
 * queue behind it. That does mean the numbers can come out of order when
 * something is stuck, and that is the right trade: a queue that stalls
 * completely because item three has a problem is a queue that loses items
 * four to eleven for the rest of the day.
 */
export function nextToSend(queue: QueuedDefect[], now: Date = new Date(), force = false): QueuedDefect | null {
  const ready = queue.filter((item) => dueForRetry(item, now, force))
  if (ready.length === 0) return null
  return [...ready].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
}

// ── What an attempt did to it ───────────────────────────────────────────

/**
 * The state machine, as one function.
 *
 * Returns a NEW item rather than mutating: the caller writes it back to
 * storage, and a half-applied mutation on a phone that was closed mid-write
 * is a corrupt queue.
 */
export function afterAttempt(item: QueuedDefect, outcome: SendOutcome, now: Date = new Date()): QueuedDefect {
  const stamp = now.toISOString()

  switch (outcome.kind) {
    case 'landed':
    case 'already':
      // The one and only route to 'sent'.
      return { ...item, state: 'sent', ref: outcome.ref ?? item.ref, lastTriedAt: stamp, lastError: null }

    case 'refused':
      // Kept, not dropped. Shown, not swallowed.
      return { ...item, state: 'refused', lastTriedAt: stamp, attempts: item.attempts + 1, lastError: outcome.reason }

    case 'unreachable':
      return {
        ...item,
        state: 'waiting',
        lastTriedAt: stamp,
        attempts: item.attempts + 1,
        lastError: outcome.detail ?? 'Could not reach the site.',
      }
  }
}

/**
 * Put back anything that was left mid-send.
 *
 * ── The bug this fixes, found by killing the page mid-flush ────────────
 *
 * `flush` marks an item 'sending' before the request goes out, and
 * 'sending' is deliberately skipped by `nextToSend` so that two flushes
 * cannot send the same thing twice. That is right while the app is running.
 *
 * It is wrong the moment the app is not. A phone locks, the person switches
 * to the camera, Android reclaims the tab, the page navigates — and the code
 * that would have finished that request no longer exists. The item stays
 * 'sending' for ever. Nothing retries it, because 'sending' means "somebody
 * is on it", and nobody is. The banner says "Sending now" and the defect
 * never moves again.
 *
 * So: when the app starts, nothing can be in flight, because the thing that
 * would have been flying died with the last page. Anything found 'sending'
 * is put back to 'waiting'.
 *
 * It is safe to send it again even if the earlier request did land — that is
 * exactly what `client_ref` and the unique index are for.
 */
export function reclaimStranded(queue: QueuedDefect[]): QueuedDefect[] {
  return queue.map((item) =>
    item.state === 'sending'
      ? { ...item, state: 'waiting', lastError: item.lastError ?? 'Sending was interrupted. It is still on this phone.' }
      : item
  )
}

/**
 * An item queued before one defect could carry several photographs.
 *
 * ── Why this exists at all ─────────────────────────────────────────────
 *
 * Somebody raises a defect in a basement on a Tuesday, with a photograph.
 * On Wednesday the app updates. On Thursday they find signal. If the new
 * code only looks at `photos` and the old item only has `photo`, that
 * picture is silently dropped — the defect goes up, the evidence does not,
 * and nothing anywhere says so.
 *
 * A shape change to something stored on somebody's device is a migration,
 * not a refactor, and it is owed the same care as a database one.
 */
export function migrate(item: QueuedDefect): QueuedDefect {
  if (item.photos || !item.photoRef) return item
  return {
    ...item,
    photos: [
      {
        ref: item.photoRef,
        name: item.photoName ?? 'photo.jpg',
        type: item.photoType ?? 'image/jpeg',
        size: item.photoSize ?? 0,
      },
    ],
  }
}

/** How many photographs are being carried with this defect. */
export function photoCount(item: QueuedDefect): number {
  return migrate(item).photos?.length ?? 0
}

/** Which of them were stranded — so the caller knows what to write back. */
export function stranded(queue: QueuedDefect[]): QueuedDefect[] {
  return queue.filter((item) => item.state === 'sending')
}

/**
 * May this be deleted from the phone?
 *
 * The single most important line in this file. It is a function rather than
 * an inline `=== 'sent'` so that there is exactly one place that decides,
 * and so that an assertion can hand it every state there is.
 */
export function mayDrop(item: QueuedDefect): boolean {
  return item.state === 'sent'
}

// ── What the screen says ────────────────────────────────────────────────

export type QueueSummary = {
  total: number
  waiting: number
  sending: number
  refused: number
  /** The oldest thing still on the phone, in ISO. Null when nothing is. */
  oldest: string | null
}

export function summarise(queue: QueuedDefect[]): QueueSummary {
  const held = queue.filter((item) => !mayDrop(item))
  const times = held.map((item) => item.createdAt).filter(Boolean).sort()
  return {
    total: held.length,
    waiting: held.filter((i) => i.state === 'waiting').length,
    sending: held.filter((i) => i.state === 'sending').length,
    refused: held.filter((i) => i.state === 'refused').length,
    oldest: times[0] ?? null,
  }
}

export function ageWording(iso: string | null, now: Date = new Date()): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.floor((now.getTime() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 minute ago'
  if (mins < 60) return `${mins} minutes ago`
  const hours = Math.floor(mins / 60)
  if (hours === 1) return '1 hour ago'
  if (hours < 24) return `${hours} hours ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

/**
 * The banner, in words.
 *
 * Present whenever ANYTHING is still on the phone, and gone the moment
 * nothing is. It says the count first because the count is the thing
 * somebody needs to carry in their head when they walk out of the building.
 *
 * It never says "syncing" and leaves it at that. "Syncing" is what an
 * application says while it is losing your work.
 */
export function bannerFor(summary: QueueSummary, online: boolean, now: Date = new Date()): string | null {
  if (summary.total === 0) return null

  const n = summary.total
  const items = `${n} defect${n === 1 ? '' : 's'}`
  const age = ageWording(summary.oldest, now)
  const since = age ? ` The oldest was raised ${age}.` : ''

  if (summary.refused > 0 && summary.refused === n) {
    return `${items} on this phone could not be sent.${since} Open the list below — each one says why.`
  }

  const stuck =
    summary.refused > 0
      ? ` ${summary.refused} of them could not be sent and need you to look.`
      : ''

  if (!online) {
    return `${items} on this phone, not yet sent. There is no signal here — they will go up by themselves when there is.${since}${stuck}`
  }

  if (summary.sending > 0) {
    return `${items} on this phone. Sending now — do not close this until the count reaches nought.${stuck}`
  }

  return `${items} on this phone, not yet sent. Press Send now, or leave it and it will go by itself.${since}${stuck}`
}

/**
 * What one queued defect is called before it has a punch number.
 *
 * NEVER a punch number. The P-series is handed out by the server so that
 * two people cannot be given the same one, and a phone with no signal
 * cannot ask. Showing "P-014" on a phone and a different number on the
 * punch list afterwards would be worse than showing no number at all —
 * somebody writes it on a tag, and it is wrong.
 */
export function draftLabel(item: QueuedDefect, position: number): string {
  if (item.ref) return item.ref
  return `Draft ${position} — number given when sent`
}

/** The plain-words version of what state an item is in. */
export function stateWording(item: QueuedDefect): { label: string; tone: 'ok' | 'warning' | 'danger' | 'neutral' } {
  switch (item.state) {
    case 'sent':
      return { label: item.ref ? `Sent — ${item.ref}` : 'Sent', tone: 'ok' }
    case 'sending':
      return { label: 'Sending…', tone: 'neutral' }
    case 'refused':
      return { label: item.lastError ?? 'The site refused it', tone: 'danger' }
    case 'waiting':
      return {
        label: item.attempts === 0 ? 'On this phone, not sent yet' : `On this phone — ${item.attempts} attempt${item.attempts === 1 ? '' : 's'} so far`,
        tone: 'warning',
      }
  }
}

/**
 * How old the cached punch list is.
 *
 * Shown on the offline screen for one reason: a list of open defects that
 * is four days old looks exactly like one that is live. Somebody would
 * raise a defect that a colleague already raised on Tuesday, or walk past a
 * panel believing it is clear. Saying the age out loud costs one line.
 */
export function cacheWording(lastSyncedAt: string | null, now: Date = new Date()): string {
  if (!lastSyncedAt) {
    return 'This phone has not yet been online with this project open, so it has no list of what is outstanding.'
  }
  const age = ageWording(lastSyncedAt, now)
  return `What is shown below was last brought down from the site ${age}. Anything raised by somebody else since then is not here.`
}
