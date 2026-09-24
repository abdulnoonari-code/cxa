// CxSentinel — the bit that makes the phone screen open with no signal.
//
// ── What a service worker is, in one paragraph ─────────────────────────
//
// A small script the browser keeps even when the app is closed, and puts in
// front of every request the app makes. It can answer from a store on the
// phone instead of the network. That is the only way a web page can open
// with no signal at all, and it is why "offline mode" is not a small change.
//
// ── The rules, and why each one ────────────────────────────────────────
//
//   1. A PAGE is fetched from the network first, and from the phone only
//      if the network fails. Never the other way round. Cache-first for
//      pages means somebody on site sees yesterday's punch list and does
//      not know it — and on this application that is a person walking past
//      a panel believing it is clear.
//
//   2. A BUILD FILE (/_next/static/...) is served from the phone first.
//      Those paths contain a hash of their own contents, so a given path
//      can never mean two different things. This is what makes the app
//      open instantly, and what makes it open at all with no signal.
//
//   3. THE API IS NEVER CACHED. Not the queue endpoint, not anything. An
//      answer of "your defect was saved" served from a cache would be the
//      single worst lie this application could tell.
//
//   4. Anything not recognised goes to the network and is not stored. A
//      service worker that caches by default is a service worker that
//      serves stale project data forever.
//
// ── Why the version string matters ─────────────────────────────────────
//
// Old caches are deleted on activate by name. Without that, every
// deployment leaves another copy of the app on the phone until the browser
// runs out of room and evicts — including, possibly, the queue.

const VERSION = 'cxa-v1'
const SHELL = `${VERSION}-shell`
const BUILD = `${VERSION}-build`

/** The page served when a navigation cannot reach the network. */
const OFFLINE_PAGE = '/site/offline'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL)
      try {
        // `reload` so an install never picks the offline page out of the
        // browser's own HTTP cache — which is how a phone ends up holding a
        // copy of a page from three deployments ago.
        const response = await fetch(new Request(OFFLINE_PAGE, { cache: 'reload' }))
        const html = await response.clone().text()
        await cache.put(OFFLINE_PAGE, response)

        // ── And everything that page needs to actually RUN ──────────────
        //
        // Caching the page alone was not enough, and the way it failed is
        // worth remembering: with no signal the HTML loaded, the browser
        // then asked for the JavaScript that makes it a screen, got nothing,
        // and the person was left looking at a dead page that said "On Site"
        // and did nothing at all. Worse than an error, because it looks like
        // it is working.
        //
        // So the page is read for the files it references and those are
        // fetched too. They are hashed paths under /_next/static, so a path
        // can never mean two different things and caching them is safe.
        const assets = [...new Set([...html.matchAll(/["'](\/_next\/static\/[^"']+)["']/g)].map((m) => m[1]))]
        const build = await caches.open(BUILD)
        await Promise.allSettled(assets.map((path) => build.add(new Request(path, { cache: 'reload' }))))
      } catch {
        // No signal during install. Nothing to be done; the next visit with
        // a signal will fill it, and until then the app simply needs one.
      }
      // Take over straight away rather than waiting for every tab to close.
      // On a phone there is one tab and it is the app.
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, BUILD])
      for (const name of await caches.keys()) {
        if (name.startsWith('cxa-') && !keep.has(name)) await caches.delete(name)
      }
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Rule 3, first and loudest.
  if (url.pathname.startsWith('/api/')) return

  // Rule 1 — pages.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request)
        } catch {
          const cache = await caches.open(SHELL)
          const offline = await cache.match(OFFLINE_PAGE)
          if (offline) return offline
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>No signal</title>' +
              '<body style="font:16px system-ui;padding:24px;line-height:1.5">' +
              '<h1 style="font-size:20px">No signal, and nothing saved on this phone yet</h1>' +
              '<p>CxSentinel needs to be opened once with a signal before it can work without one. ' +
              'Open it again when you have a bar and it will be ready next time.</p>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          )
        }
      })()
    )
    return
  }

  // Rule 2 — build files, and the icons.
  const immutable = url.pathname.startsWith('/_next/static/') || /^\/(icon|apple-icon)-?.*\.png$/.test(url.pathname)
  if (immutable) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(BUILD)
        const hit = await cache.match(request)
        if (hit) return hit
        const response = await fetch(request)
        // Only a real 200 is worth keeping. An opaque or partial response
        // cached here would serve a broken app forever.
        if (response.ok && response.status === 200) cache.put(request, response.clone())
        return response
      })()
    )
    return
  }

  // Rule 4 — everything else, untouched.
})

// ── Background sync ────────────────────────────────────────────────────
//
// Android Chrome only. It wakes this script when the phone has a connection
// again, even with the app closed, and lets it finish what it started.
//
// It is best-effort and nothing depends on it: the app also sends on open
// and when the browser reports it is back online. This is the belt to those
// braces, and on a phone left in a van it is the one that actually fires.
self.addEventListener('sync', (event) => {
  if (event.tag !== 'cxa-queue') return
  event.waitUntil(
    (async () => {
      // The work is done by the page, not here, because the queue logic and
      // the local store live there. Waking any open window is enough; if
      // none is open, the next open does it.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) client.postMessage({ type: 'cxa-flush' })
    })()
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'cxa-skip-waiting') self.skipWaiting()
})
