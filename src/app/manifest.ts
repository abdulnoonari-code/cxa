import type { MetadataRoute } from 'next'
import { CXNIVORA } from '@/lib/brand'

/**
 * What makes CxNivora installable on a phone.
 *
 * ── What this is, and what it deliberately is not ───────────────────────
 *
 * With this file, a phone browser offers "Add to Home Screen". Doing so gives
 * CxNivora an icon beside the other apps, and opening it starts full screen
 * with no address bar and no browser furniture — it looks and behaves like an
 * app because, to the phone, it is one.
 *
 * It is NOT a native app. It is not in an app store, it has no push
 * notifications, and — the one that matters on a real site — IT NEEDS A
 * SIGNAL. There is no offline cache and no queue of work waiting to be sent,
 * on purpose:
 *
 *     A queue that holds a defect and a photograph on a phone until the
 *     signal comes back is a queue that loses them when the phone is wiped,
 *     replaced, or the browser clears its storage to reclaim space — and
 *     nobody finds out for weeks. The person who raised it saw a tick.
 *
 * So a form that cannot reach the server fails at the moment the button is
 * pressed, in front of the person who can still remember what they saw and
 * can walk twenty metres for a bar of signal. That is the honest failure.
 *
 * `start_url` is /site rather than / on purpose: somebody who installed this
 * on their phone installed it to raise defects at the panel, not to read the
 * dashboard. The full application is one tap away from there.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CxNivora — Commissioning',
    short_name: 'CxNivora',
    description:
      'Raise a defect at the panel with a photograph and what must be done about it, and see what is still outstanding.',
    start_url: '/site',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    /* Read from the brand rather than typed here. These two were #f2f6fd
       and #0369a1 — a palette two rebrands old, still tinting the status
       bar of every installed phone, because a colour written into a file
       nobody opens does not get rebranded with the rest. */
    background_color: CXNIVORA.colors.ground,
    theme_color: CXNIVORA.colors.anchor,
    categories: ['productivity', 'utilities'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // A maskable icon is re-cropped by Android to whatever shape the launcher
      // uses. The same square is fine here because the mark sits well inside
      // the safe area rather than running to the edges.
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
