// The queue, as a React hook — shared by the phone screen and the offline
// screen so there is one set of rules about when things are sent, not two.
//
// Everything it decides comes from lib/offline-queue.ts. What is here is
// when to ASK: on open, when the browser says the connection is back, when
// the service worker is woken by Android's background sync, and when
// somebody presses Send now.
//
// ── Why it sends on open as well as on the 'online' event ──────────────
//
// Because `online` is not reliable. A phone reports itself online the
// moment it associates with a network, which on a site can be a captive
// portal, a van's hotspot with no data, or one bar that drops again
// immediately. And a phone that was closed while offline and reopened in
// the office never fires the event at all. Sending on open costs one
// request and catches every case the event misses.

'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { summarise, type QueueSummary } from '@/lib/offline-queue'
import { listQueue, available, subscribe, type StoredDefect } from '@/lib/offline-db'
import { flush, reclaim, type FlushResult } from '@/lib/offline-sync'

export type QueueView = {
  queue: StoredDefect[]
  summary: QueueSummary
  online: boolean
  /** True while a flush is running. */
  sending: boolean
  /** What the last flush came back with. Null until one has run. */
  last: FlushResult | null
  /** Whether this browser can hold anything at all. */
  usable: boolean
  refresh: () => Promise<void>
  sendNow: (force?: boolean) => Promise<void>
}

/**
 * Whether the phone thinks it has a connection.
 *
 * `useSyncExternalStore` rather than state plus an effect, because that is
 * what this is: a value owned by the browser that changes underneath React.
 * Reading it into state in an effect gives a first render that says "online"
 * before correcting itself, and on this screen that first render is the one
 * that decides whether somebody is told their defect is safely on the phone.
 *
 * The third argument is the server snapshot. It says `true` because the
 * server is by definition reachable if it is rendering — and because the
 * alternative, a server-rendered "no signal" banner, would be a lie that
 * flashes on every page load.
 */
function subscribeOnline(callback: () => void): () => void {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

export function useQueue(): QueueView {
  const [queue, setQueue] = useState<StoredDefect[]>([])
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  )
  const [sending, setSending] = useState(false)
  const [last, setLast] = useState<FlushResult | null>(null)

  // Not `available()` called during render. There is no IndexedDB on the
  // server, so that rendered "this browser cannot hold anything" on the
  // server and the real screen on the phone — a hydration mismatch whose
  // first frame is the alarming half. The server snapshot says yes, because
  // the server is not the thing being asked about.
  const usable = useSyncExternalStore(
    () => () => {},
    available,
    () => true
  )

  // A flush already running must not be started again by the next event —
  // two flushes in parallel send the same item twice, which the server
  // survives but which fills the audit trail with noise and looks alarming.
  const busy = useRef(false)

  const refresh = useCallback(async () => {
    if (!usable) return
    try {
      setQueue(await listQueue())
    } catch {
      // Storage blocked. The screen still draws.
    }
  }, [usable])

  // `force` when somebody is waiting: the button, and the moment the
  // browser says the connection is back. Not on every visibility change,
  // which on a phone fires every time somebody glances at another app.
  const sendNow = useCallback(async (force = false) => {
    if (!usable || busy.current) return
    busy.current = true
    setSending(true)
    try {
      const result = await flush((next) => setQueue(next), fetch, () => new Date(), force)
      setLast(result)
    } catch {
      // flush() does not throw, but if it ever did, the queue is untouched
      // and the next attempt will pick it up. Never leave `sending` on.
    } finally {
      busy.current = false
      setSending(false)
      await refresh()
    }
  }, [usable, refresh])

  useEffect(() => {
    const goOnline = () => void sendNow(true)
    window.addEventListener('online', goOnline)

    // Android wakes the service worker when the connection is back; it posts
    // here because the queue and its rules live on this side.
    const woken = (event: MessageEvent) => {
      if (event.data?.type === 'cxa-flush') void sendNow(true)
    }
    navigator.serviceWorker?.addEventListener('message', woken)

    // Coming back to the app after it was in the background is the same
    // situation as opening it, and on a phone it is far more common.
    const returned = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void sendNow()
    }
    document.addEventListener('visibilitychange', returned)

    // Any write to the store, from anywhere — this hook, another copy of
    // this hook on the same screen, the form beside it — redraws all of
    // them. Without this the banner only caught up on a reload.
    const unsubscribe = subscribe(() => {
      listQueue().then(
        (rows) => {
          if (alive) setQueue(rows)
        },
        () => {}
      )
    })

    // Draw what is already on the phone, then try to send it. Both in
    // callbacks rather than awaited in the effect body: the queue is an
    // external store being read, which is exactly what an effect is for.
    // Draw first, send second — and the send starts INSIDE the callback
    // rather than beside it. Not a lint dance: `sendNow` sets "sending" the
    // moment it is called, so calling it in the effect body puts a spinner
    // on screen in the same tick as the first paint, before anything has
    // been read from the phone. Drawing what is actually on the phone and
    // then sending it is both the correct order and the honest one.
    // `reclaim` FIRST. Anything the last run of the app left mid-send is put
    // back to waiting before a single thing is drawn or sent — otherwise the
    // screen shows "Sending now" for a defect nothing is sending, and never
    // stops.
    let alive = true
    const first = reclaim()
      .catch(() => 0)
      .then(() => listQueue())
      .then(
        (rows) => {
          if (!alive) return
          setQueue(rows)
          if (navigator.onLine) void sendNow()
        },
        () => {}
      )

    void first

    return () => {
      alive = false
      unsubscribe()
      window.removeEventListener('online', goOnline)
      navigator.serviceWorker?.removeEventListener('message', woken)
      document.removeEventListener('visibilitychange', returned)
    }
  }, [sendNow])

  return { queue, summary: summarise(queue), online, sending, last, usable, refresh, sendNow }
}

/**
 * Register the service worker, and ask Android to wake us when the signal
 * returns.
 *
 * Both are best-effort by design. Every failure here costs the ability to
 * open with no signal; none of them costs a defect, because the queue is in
 * IndexedDB either way.
 */
export function useServiceWorker(): void {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let cancelled = false

    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
        if (cancelled) return

        // Android Chrome: wake us when there is a connection again, even
        // with the app closed. Absent on iPhone, where sending happens when
        // the app is next opened instead.
        const sync = (registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync
        if (sync) await sync.register('cxa-queue').catch(() => {})
      } catch {
        // Blocked, unsupported, or served without https. The app works; it
        // just will not open without a signal.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])
}
