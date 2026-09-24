'use client'

import { useEffect } from 'react'
import { bannerFor, draftLabel, stateWording } from '@/lib/offline-queue'
import { writeCache } from '@/lib/offline-db'
import { pull } from '@/lib/offline-sync'
import { useQueue, useServiceWorker } from '@/lib/use-queue'

/**
 * What is still on this phone — shown wherever somebody might walk away.
 *
 * ── The rule this component exists to enforce ──────────────────────────
 *
 * A defect sitting on a phone must never be mistakable for a defect on the
 * punch list. So this banner is present whenever anything is being carried,
 * says the count first, and DOES NOT GO AWAY until the server has confirmed
 * each one individually. There is no tidying, no fading, no "probably fine".
 *
 * It also does the two jobs that have to happen on a screen somebody
 * actually visits: registering the service worker (so the app can open with
 * no signal next time) and bringing down the tag list (so there is something
 * to raise a defect against when it does).
 */
export default function QueueBanner({ prime = false }: { prime?: boolean }) {
  useServiceWorker()
  const { queue, summary, online, sending, last, usable, sendNow } = useQueue()

  // Bring the tag list and the open items down for next time. Only from the
  // ONLINE screen, and only ever as a background job — a failed refresh must
  // never stop this screen drawing.
  useEffect(() => {
    if (!prime || !usable) return
    void (async () => {
      const data = await pull()
      if (!data) return
      await writeCache({ project: data.project, subjects: data.subjects, open: data.open, at: data.at })
    })()
  }, [prime, usable])

  if (!usable) {
    return (
      <div className="alert alert-warning">
        <strong>This browser cannot hold anything on the phone.</strong> Raising a defect here needs a signal. Private
        browsing and blocked site data are the usual reasons.
      </div>
    )
  }

  const held = queue.filter((item) => item.state !== 'sent')
  const banner = bannerFor(summary, online, new Date())

  if (!banner) {
    // Nothing waiting. Say something only when something just went, so that
    // pressing Send now is not answered by silence.
    if (last && last.sent > 0) {
      return (
        <div className="alert alert-success">
          <strong>
            {last.sent} defect{last.sent === 1 ? '' : 's'} sent.
          </strong>{' '}
          {last.sent === 1 ? 'It is' : 'They are'} on the punch list now, with {last.sent === 1 ? 'its' : 'their'}{' '}
          punch number.
        </div>
      )
    }
    return null
  }

  return (
    <div className={`alert ${summary.refused > 0 ? 'alert-danger' : 'alert-warning'}`}>
      <strong>{banner}</strong>

      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        {held.map((item, i) => {
          const state = stateWording(item)
          return (
            <div
              key={item.clientRef}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'baseline',
                flexWrap: 'wrap',
                borderTop: i === 0 ? 'none' : '1px solid var(--color-border-soft)',
                paddingTop: i === 0 ? 0 : 8,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{draftLabel(item, i + 1)}</span>
              <span style={{ fontSize: 13, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{item.title}</span>
              <span
                style={{
                  fontSize: 11.5,
                  color: state.tone === 'danger' ? 'var(--color-danger)' : 'var(--color-text-secondary)',
                  fontWeight: state.tone === 'danger' ? 600 : 400,
                }}
              >
                {state.label}
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void sendNow(true)} disabled={sending || !online}>
          {sending ? 'Sending…' : 'Send now'}
        </button>
        {!online && (
          <span style={{ fontSize: 12 }}>No signal here. Nothing is lost — they go up by themselves when there is one.</span>
        )}
        {last?.note && online && <span style={{ fontSize: 12 }}>{last.note}</span>}
      </div>
    </div>
  )
}
