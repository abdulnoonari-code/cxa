'use client'

import { useCallback, useEffect, useState } from 'react'
import PhotoInput from '@/components/PhotoInput'
import QueueBanner from '@/components/QueueBanner'
import { makeRef, cacheWording, type QueuedDefect } from '@/lib/offline-queue'
import { readCache, putQueued, roomLeft, type SiteCache } from '@/lib/offline-db'
import { CATEGORIES, SEVERITIES } from '@/lib/punchlist'
import { LEVELS } from '@/lib/checklist'
import { categoryBadgeClass } from '@/lib/issues'
import { useQueue } from '@/lib/use-queue'

/**
 * CxNivora with no signal at all.
 *
 * ── Why this screen exists separately from /site ───────────────────────
 *
 * /site is rendered by the server. With no signal there is no server, so
 * there is no screen — not a degraded screen, no screen. This one is a
 * static page that the service worker keeps on the phone, and everything on
 * it is drawn from what the phone already has.
 *
 * It is also what the app icon lands on when the network is unreachable:
 * the service worker answers the navigation with this page instead of a
 * browser error. So the icon works in a basement, which is the entire point.
 *
 * ── What it deliberately does NOT pretend ──────────────────────────────
 *
 * It does not pretend the list of outstanding defects is live. It says how
 * old it is, in words, at the top. A four-day-old list looks exactly like a
 * live one, and somebody reading it would walk past a panel a colleague
 * raised a defect on this morning.
 *
 * It does not pretend a queued defect has a punch number. It has a draft
 * number until the server gives it a real one.
 */
export default function OfflineSite() {
  const [cache, setCache] = useState<SiteCache | null>(null)
  const [room, setRoom] = useState<{ usedMb: number; quotaMb: number } | null>(null)
  const [raising, setRaising] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const { online, refresh, usable } = useQueue()

  // Bumped after a defect is saved, so the screen redraws from the store
  // rather than from a copy held in memory — the store is the truth, and a
  // screen drawn from anything else can disagree with it.
  const [reloadKey, setReloadKey] = useState(0)
  const load = useCallback(() => setReloadKey((n) => n + 1), [])

  useEffect(() => {
    let alive = true
    readCache().then(
      (value) => {
        if (alive) setCache(value)
      },
      () => {}
    )
    roomLeft().then(
      (value) => {
        if (alive) setRoom(value)
      },
      () => {}
    )
    return () => {
      alive = false
    }
  }, [reloadKey])

  async function raise(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProblem(null)
    const form = event.currentTarget
    const data = new FormData(form)

    const subject = String(data.get('subject') ?? '')
    const title = String(data.get('title') ?? '').trim()
    if (!subject || !title) {
      setProblem('Choose what it is against, and say what is wrong.')
      return
    }

    const chosen = data.getAll('photo').filter((f): f is File => f instanceof File && f.size > 0)

    const item: QueuedDefect & { photoBlobs?: Blob[] } = {
      clientRef: makeRef(),
      createdAt: new Date().toISOString(),
      projectId: cache?.project?.id ?? '',
      subject,
      title,
      description: (String(data.get('description') ?? '').trim() || null) as string | null,
      requiredAction: (String(data.get('required_action') ?? '').trim() || null) as string | null,
      category: (String(data.get('category') ?? '').trim() || null) as string | null,
      severity: String(data.get('severity') ?? 'minor'),
      level: (String(data.get('level') ?? '').trim() || null) as string | null,
      responsibleParty: (String(data.get('responsible_party') ?? '').trim() || null) as string | null,
      dueDate: (String(data.get('due_date') ?? '').trim() || null) as string | null,
      location: null,
      // Each photograph gets its own id here, on the phone, before there is
      // any signal — so a retry that reaches the server twice attaches each
      // picture once. Same mechanism as the defect's own id.
      photos: chosen.map((file) => ({ ref: makeRef(), name: file.name, type: file.type, size: file.size })),
      photoBlobs: chosen,
      state: 'waiting',
      attempts: 0,
      lastTriedAt: null,
      lastError: null,
      ref: null,
    }

    try {
      await putQueued(item)
    } catch {
      // The one failure that must never be quiet: the defect was NOT kept.
      // Saying so while the person is still standing in front of the panel
      // is the difference between retyping it and losing it.
      setProblem(
        'This phone would not save it — it may be out of room, or site data may be blocked for this site. ' +
          'Do not walk away: write it down, or try again with a signal.'
      )
      return
    }

    form.reset()
    setRaising(false)
    setSaved(title)
    await refresh()
    load()
  }

  if (!usable) {
    return (
      <div className="phone-page">
        <h1 className="phone-title">On Site</h1>
        <div className="alert alert-danger">
          <strong>This browser will not let CxNivora keep anything on the phone.</strong> Without that, a defect
          raised here cannot be held until the signal comes back. Private browsing is the usual cause.
        </div>
      </div>
    )
  }

  const subjects = cache?.subjects ?? []
  const openItems = cache?.open ?? []

  return (
    <div className="phone-page">
      <div className="phone-head">
        <div>
          <h1 className="phone-title">On Site</h1>
          <p className="phone-sub">
            {cache?.project?.name ?? 'No project on this phone yet'}
            {!online && ' · no signal'}
          </p>
        </div>
        <a href="/site" className="phone-escape">
          {online ? 'Full screen' : 'Needs signal'}
        </a>
      </div>

      <QueueBanner prime />

      {saved && (
        <div className="alert alert-success">
          <strong>Saved on this phone.</strong> “{saved}” is being carried until there is a signal. It is in the list
          above and will not go anywhere.
        </div>
      )}
      {problem && (
        <div className="alert alert-danger">
          <strong>{problem}</strong>
        </div>
      )}

      {room && room.quotaMb > 0 && room.usedMb / room.quotaMb > 0.85 && (
        <div className="alert alert-warning">
          <strong>This phone is nearly out of room for CxNivora.</strong> Send what is queued as soon as you have a
          signal — a browser short of space can start throwing things away.
        </div>
      )}

      {subjects.length === 0 ? (
        <div className="alert alert-warning">
          <strong>This phone has no tag list yet.</strong> Open CxNivora once where there is a signal and it will
          bring down the tags and systems for this project. Until then there is nothing here to raise a defect
          against.
        </div>
      ) : !raising ? (
        <button type="button" className="btn btn-primary phone-btn phone-raise" onClick={() => setRaising(true)}>
          Raise a defect
        </button>
      ) : (
        <form onSubmit={raise} className="card phone-form">
          <h2 className="phone-h2">Raise a defect</h2>
          <p className="phone-hint" style={{ marginTop: -4 }}>
            This is saved on the phone and sent the moment there is a signal. It gets its punch number then, not now.
          </p>

          <label className="phone-field">
            <span className="phone-label">Photograph</span>
            <PhotoInput
              name="photo"
              multiple
              hint="Take as many as you need — the defect, and enough around it to find the panel again. They are kept on the phone with the defect."
            />
          </label>

          <label className="phone-field">
            <span className="phone-label">Against *</span>
            <select name="subject" required className="input phone-input" defaultValue="">
              <option value="" disabled>
                — choose a tag or a system —
              </option>
              {subjects.map((s) => (
                <option key={s.ref} value={s.ref}>
                  {s.code ? `${s.code} — ` : ''}
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="phone-field">
            <span className="phone-label">What is wrong *</span>
            <input name="title" required placeholder="e.g. Gland not made off on CB-04" className="input phone-input" />
          </label>

          <label className="phone-field">
            <span className="phone-label">More detail</span>
            <textarea name="description" rows={2} placeholder="What you can see, and where exactly" className="input phone-input" />
          </label>

          <label className="phone-field">
            <span className="phone-label">What must be done</span>
            <textarea
              name="required_action"
              rows={2}
              placeholder="e.g. Re-make the gland, clamp the armour, re-test continuity"
              className="input phone-input"
            />
            <span className="phone-hint">
              Signed with your name when it is sent. Leave it blank if it has not been decided.
            </span>
          </label>

          <fieldset className="phone-field phone-choice">
            <legend className="phone-label">Category</legend>
            <label className="phone-radio">
              <input type="radio" name="category" value="" defaultChecked />
              <span>Not decided yet</span>
            </label>
            {CATEGORIES.map((c) => (
              <label key={c.value} className="phone-radio">
                <input type="radio" name="category" value={c.value} />
                <span>{c.label}</span>
              </label>
            ))}
          </fieldset>

          <label className="phone-field">
            <span className="phone-label">Found at level</span>
            <select name="level" className="input phone-input" defaultValue="">
              <option value="">— not tied to a level —</option>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>

          <label className="phone-field">
            <span className="phone-label">How bad</span>
            <select name="severity" className="input phone-input" defaultValue="minor">
              {SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label className="phone-field">
            <span className="phone-label">Responsible</span>
            <input name="responsible_party" placeholder="Who has to clear it" className="input phone-input" />
          </label>

          <label className="phone-field">
            <span className="phone-label">By when</span>
            <input type="date" name="due_date" className="input phone-input" />
          </label>

          <button type="submit" className="btn btn-primary phone-btn">
            Save on this phone
          </button>
          <button type="button" className="phone-cancel" onClick={() => setRaising(false)}>
            Cancel
          </button>
        </form>
      )}

      {/* ── What was outstanding last time this phone had a signal ─────── */}
      <div className="phone-count">{cacheWording(cache?.at ?? null, new Date())}</div>

      {openItems.map((row) => (
        <div key={row.id} className="phone-item">
          <div className="phone-item-ref">{row.ref ?? 'Unnumbered'}</div>
          <div className="phone-item-title">{row.title}</div>
          <div className="phone-badges">
            <span className={categoryBadgeClass(row.category)}>{row.category ?? 'No category'}</span>
            <span className="phone-state">{row.status.replace(/_/g, ' ')}</span>
            {row.due_date && <span className="phone-due">Due {row.due_date}</span>}
          </div>
          {row.required_action && (
            <div className="phone-remedy phone-remedy-ok">
              <span className="phone-remedy-label">What must be done</span>
              <span>{row.required_action}</span>
            </div>
          )}
        </div>
      ))}

      <div className="phone-foot">
        <p className="phone-hint">
          With no signal you can raise defects and they are kept here. Marking work done, attaching a photograph to an
          existing item, and the defect report all need the site, so they are on the full screen.
        </p>
      </div>
    </div>
  )
}
