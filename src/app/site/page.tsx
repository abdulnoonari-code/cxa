import Link from 'next/link'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { loadIssuePhotos } from '@/data/photos'
import { loadAllPunchWithNotes, partiesIn, ACTION_SQL, type PunchRow } from '@/data/punchlist'
import { refKey, subjectLabel, type Subject, type SubjectIndex } from '@/lib/subjects'
import { categoryBadgeClass } from '@/lib/issues'
import { LEVELS } from '@/lib/checklist'
import { CATEGORIES, SEVERITIES, isOpen, daysOverdue, statusLabel } from '@/lib/punchlist'
import { workOrder, remedyFor } from '@/lib/remedy'
import { dueWording } from '@/lib/defect-sheet'
import { viewUrl } from '@/lib/file-url'
import PhotoInput from '@/components/PhotoInput'
import QueueBanner from '@/components/QueueBanner'
import { createIssue, updateIssue } from '../issues/actions'
import { uploadIssuePhoto } from '../issues/photo-actions'

export const dynamic = 'force-dynamic'

/**
 * On Site — CxSentinel on a phone, at the panel.
 *
 * ── Why this is a different screen and not the punch list made narrower ──
 *
 * The punch list screen is a register: filters, a fifty-row table, an import
 * panel, an export panel, eleven columns. It is the right screen for somebody
 * at a desk deciding what matters this week, and it is unusable one-handed on
 * a phone in a plant room with a torch under your arm.
 *
 * Standing in front of an open panel there are exactly three things anybody
 * wants to do:
 *
 *     photograph a defect and say what it is
 *     look at what is still open on the thing in front of them
 *     say a defect is done and photograph the fix
 *
 * So this screen does those three and nothing else. No filters, no import, no
 * export, no table. Everything is one column, every target is thumb-sized, and
 * the camera opens straight from the form rather than through a file picker —
 * `capture="environment"` on the input, which is the whole difference between
 * "take a photo" and "go and find a photo".
 *
 * ── It is the same records, not a copy ─────────────────────────────────
 *
 * Every form here posts to the SAME server actions the desktop screens use,
 * with a hidden field saying to come back here afterwards. There is no second
 * data path, no offline queue, no sync. A defect raised at the panel is on the
 * punch list before the phone is back in a pocket, and there is no state in
 * which the two disagree.
 *
 * It does mean this needs a signal. On a site with none, the honest answer is
 * that the form will not submit — and the person finds that out when they
 * press the button, not three hours later when the queue turns out to be
 * empty. An offline queue that loses a defect is worse than no offline queue.
 */

const PAGE = 12

function subjectOf(index: SubjectIndex, row: PunchRow): Subject | null {
  if (row.subject_type && row.subject_id) {
    return index.byKey.get(refKey({ type: row.subject_type, id: row.subject_id })) ?? null
  }
  if (row.equipment_id) return index.byKey.get(refKey({ type: 'equipment', id: row.equipment_id })) ?? null
  return null
}

export default async function SitePage({
  searchParams,
}: {
  searchParams: Promise<{
    new?: string
    subject?: string
    against?: string
    page?: string
    raised?: string
    kept?: string
    raise?: string
    detail?: string
    photo?: string
    reason?: string
    hint?: string
    done?: string
  }>
}) {
  const sp = await searchParams
  const project = await getCurrentProject()

  if (!project) {
    return (
      <div className="phone-page">
        <h1 className="phone-title">On Site</h1>
        <div className="card">
          <p style={{ margin: 0, fontSize: 14 }}>No project is open.</p>
          <Link href="/projects" className="btn btn-primary phone-btn" style={{ marginTop: 12 }}>
            Choose a project
          </Link>
        </div>
      </div>
    )
  }

  const [index, punch, photos] = await Promise.all([
    loadSubjectIndex(project.id),
    loadAllPunchWithNotes(project.id),
    loadIssuePhotos(project.id),
  ])

  // The whole register is read and sorted before it is cut into pages. Sorting
  // one page of an arbitrary slice would put the Category A item that stops
  // the job on page three, which is the one place nobody looks.
  const open = workOrder(punch.rows.filter((r) => isOpen(r.status)))
  const page = Math.max(1, Number(sp.page ?? '1') || 1)
  const pages = Math.max(1, Math.ceil(open.length / PAGE))
  const shown = open.slice((page - 1) * PAGE, page * PAGE)

  const parties = partiesIn(punch.rows)

  const pickable = [...index.byKey.values()]
    .filter((s) => s.type !== 'project')
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'equipment' ? 1 : -1
      return (a.code ?? a.name).localeCompare(b.code ?? b.name)
    })

  // Arriving from a QR label on the plant, or from the tag's own screen, the
  // thing in front of you is already chosen.
  const preselected = (sp.subject ?? sp.against ?? '').trim()
  const preselectedSubject = preselected ? index.byKey.get(preselected) ?? null : null
  const raising = sp.new === '1' || preselected !== ''

  const remedyMissing = punch.missing.length > 0

  return (
    <div className="phone-page">
      <div className="phone-head">
        <div>
          <h1 className="phone-title">On Site</h1>
          <p className="phone-sub">{project.name}</p>
        </div>
        <Link href="/issues" className="phone-escape">
          Full punch list
        </Link>
      </div>

      {/* Anything still on this phone, plus the two jobs that have to happen
          on a screen somebody actually visits: registering the service worker
          so the app can open with no signal next time, and bringing the tag
          list down so there is something to raise a defect against when it
          does. `prime` is what makes this the screen that does the second. */}
      <QueueBanner prime />

      {/* ── What just happened ─────────────────────────────────────────── */}
      {sp.raised && (
        <div className={`alert ${sp.photo === 'failed' || sp.kept === 'partial' ? 'alert-warning' : 'alert-success'}`}>
          <strong>{sp.raised} raised.</strong>{' '}
          {sp.photo === 'failed'
            ? `The photograph did not attach — ${sp.reason ?? 'the upload was refused'}. The defect itself is saved; open it and try the photograph again.`
            : sp.kept === 'partial'
              ? `What must be done was not kept — this database does not have that column yet. Run ${ACTION_SQL}.`
              : 'It is on the punch list now.'}
        </div>
      )}
      {sp.raise === 'error' && (
        <div className="alert alert-danger">
          <strong>Nothing was saved.</strong> The database refused it: {sp.detail ?? 'no reason given'}
        </div>
      )}
      {sp.photo === 'ok' && <div className="alert alert-success">Photograph attached.</div>}
      {sp.photo && sp.photo !== 'ok' && sp.photo !== 'failed' && (
        <div className="alert alert-warning">
          <strong>The photograph was not attached.</strong> {sp.reason ?? ''} {sp.hint ?? ''}
        </div>
      )}
      {sp.done && <div className="alert alert-success">{sp.done} marked ready for retest.</div>}

      {!photos.schemaReady && (
        <div className="alert alert-warning">
          <strong>This database cannot store photographs yet.</strong> Run week5-part21-photos.sql. A defect raised
          here is saved; the photograph is not.
        </div>
      )}
      {remedyMissing && (
        <div className="alert alert-warning">
          <strong>There is nowhere to write what must be done yet.</strong> Run <code>{ACTION_SQL}</code> on the Setup
          page. Until then that box is not saved, and everything else is.
        </div>
      )}

      {/* ── Raise ──────────────────────────────────────────────────────── */}
      {!raising ? (
        <Link href="/site?new=1" className="btn btn-primary phone-btn phone-raise">
          Raise a defect
        </Link>
      ) : (
        <form action={createIssue} className="card phone-form">
          <input type="hidden" name="back" value="/site" />
          <h2 className="phone-h2">Raise a defect</h2>

          <label className="phone-field">
            <span className="phone-label">Photograph</span>
            {/* PhotoInput, not a bare file input, for two reasons and the
                second one is why raising a defect from a phone did not work
                at all: it opens the back camera rather than a file picker,
                and it SHRINKS the photograph in the browser before sending.
                A form submission over 4 MB never reaches the server, and
                every photograph off a phone camera is bigger than that. */}
            <PhotoInput name="photo" hint="Take it now. You can add the after-photo when it is fixed." />
          </label>

          <label className="phone-field">
            <span className="phone-label">Against *</span>
            <select name="subject" required className="input phone-input" defaultValue={preselected}>
              <option value="" disabled>
                — choose a tag or a system —
              </option>
              {pickable.map((s) => (
                <option key={refKey(s)} value={`${s.type}:${s.id}`}>
                  {s.code ? `${s.code} — ` : ''}
                  {s.name} ({subjectLabel(s.type)})
                </option>
              ))}
            </select>
            {preselectedSubject && (
              <span className="phone-hint">
                Chosen for you: {preselectedSubject.code ?? preselectedSubject.name}. Change it if the defect is
                somewhere else.
              </span>
            )}
          </label>

          <label className="phone-field">
            <span className="phone-label">What is wrong *</span>
            <input
              name="title"
              required
              placeholder="e.g. Gland not made off on CB-04"
              className="input phone-input"
            />
          </label>

          <label className="phone-field">
            <span className="phone-label">More detail</span>
            <textarea
              name="description"
              rows={2}
              placeholder="What you can see, and where exactly"
              className="input phone-input"
            />
          </label>

          {/* The box this whole update exists for. It is above category and
              responsible party on purpose: the remedy is what the contractor
              needs, and it is the thing the person standing in front of the
              defect knows and nobody else does. */}
          <label className="phone-field">
            <span className="phone-label">What must be done</span>
            <textarea
              name="required_action"
              rows={2}
              placeholder="e.g. Re-make the gland, clamp the armour, re-test continuity"
              className="input phone-input"
            />
            <span className="phone-hint">
              Signed with your name and today&apos;s date, and printed on the defect report as an agreed action. Leave
              it blank if it has not been decided — an empty box is honest, a guess is not.
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

          {/* Two dropdowns rather than two more radio lists, because neither
              is a decision anybody agonises over at the panel — and both
              matter afterwards. A defect raised with no level lands in "No
              level recorded" on the Level Summary, where it is invisible to
              the person closing out that level. A Category A defect left at
              the default severity reads as "must fix before proceeding, and
              minor", which is a contradiction somebody has to resolve later
              from memory. */}
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
            <input
              name="responsible_party"
              list="site-parties"
              placeholder="Who has to clear it"
              className="input phone-input"
            />
            <datalist id="site-parties">
              {parties.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>

          <label className="phone-field">
            <span className="phone-label">By when</span>
            <input type="date" name="due_date" className="input phone-input" />
          </label>

          <button type="submit" className="btn btn-primary phone-btn" disabled={pickable.length === 0}>
            Raise defect
          </button>
          <Link href="/site" className="phone-cancel">
            Cancel
          </Link>
          {pickable.length === 0 && (
            <p className="phone-hint" style={{ marginTop: 10 }}>
              There is nothing to raise a defect against yet — this project has no systems or tags. Add them on the
              full site first.
            </p>
          )}
        </form>
      )}

      {/* ── What is open ───────────────────────────────────────────────── */}
      <div className="phone-count">
        {open.length === 0
          ? 'Nothing outstanding on this project.'
          : `${open.length} outstanding${pages > 1 ? ` · showing ${shown.length}, most urgent first` : ' · most urgent first'}`}
      </div>

      {shown.map((row) => {
        const subject = subjectOf(index, row)
        const mine = photos.byIssue.get(row.id) ?? []
        const defect = mine.find((p) => p.kind === 'defect') ?? mine[0]
        const thumb = viewUrl(defect)
        const late = daysOverdue(row)
        const remedy = remedyFor(row)

        return (
          <div key={row.id} className="phone-item">
            <div className="phone-item-head">
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt={defect?.caption ?? 'Defect photograph'} className="phone-thumb" />
              ) : (
                <div className="phone-thumb phone-thumb-empty">no photo</div>
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="phone-item-ref">
                  {row.ref ?? 'Unnumbered'} · {subject?.code ?? subject?.name ?? 'No tag'}
                </div>
                <div className="phone-item-title">{row.title}</div>
                <div className="phone-badges">
                  <span className={categoryBadgeClass(row.category)}>{row.category ?? 'No category'}</span>
                  <span className="phone-state">{statusLabel(row.status)}</span>
                  <span className={late !== null ? 'phone-late' : 'phone-due'}>{dueWording(row)}</span>
                </div>
              </div>
            </div>

            {/* The remedy, with where it came from — the same rule as the
                document. An AI suggestion on a phone screen looks exactly
                like an instruction unless it is labelled every time. */}
            <div className={`phone-remedy phone-remedy-${remedy.tone}`}>
              <span className="phone-remedy-label">What must be done</span>
              {remedy.state === 'none' ? (
                <span className="phone-remedy-none">Nobody has said yet.</span>
              ) : (
                <>
                  <span>{remedy.text}</span>
                  <span className="phone-remedy-from">{remedy.provenance}</span>
                </>
              )}
            </div>

            <details className="phone-details">
              <summary className="phone-summary">Add a photograph</summary>
              <form action={uploadIssuePhoto} className="phone-inline">
                <input type="hidden" name="issue_id" value={row.id} />
                <input type="hidden" name="back" value="/site" />
                <label className="phone-radio">
                  <input type="radio" name="kind" value="defect" defaultChecked />
                  <span>The defect</span>
                </label>
                <label className="phone-radio">
                  <input type="radio" name="kind" value="fix" />
                  <span>After the fix</span>
                </label>
                <PhotoInput name="file" required />
                <input name="caption" placeholder="What it shows" className="input phone-input" />
                <button type="submit" className="btn btn-secondary phone-btn">
                  Attach
                </button>
              </form>
            </details>

            <div className="phone-actions">
              {/* Ready for retest, not closed. Somebody on a phone can say the
                  work is done; only the commissioning agent accepts it, and
                  that decision belongs on the item's own screen where the
                  evidence is. */}
              <form action={updateIssue}>
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="back" value={`/site?done=${encodeURIComponent(row.ref ?? 'Item')}`} />
                <input type="hidden" name="status" value="ready_for_retest" />
                <input type="hidden" name="severity" value={row.severity} />
                <input type="hidden" name="category" value={row.category ?? ''} />
                <input type="hidden" name="description" value={row.description ?? ''} />
                <input type="hidden" name="level" value={row.level ?? ''} />
                <input type="hidden" name="responsible_party" value={row.responsible_party ?? ''} />
                <input type="hidden" name="discipline" value={row.discipline ?? ''} />
                <input type="hidden" name="location" value={row.location ?? ''} />
                <input type="hidden" name="due_date" value={row.due_date ?? ''} />
                <input type="hidden" name="required_action" value={row.required_action ?? ''} />
                <button type="submit" className="btn btn-secondary phone-btn-sm">
                  Work done
                </button>
              </form>
              <Link href={`/issues/${row.id}/edit`} className="btn btn-secondary phone-btn-sm">
                Open in full
              </Link>
            </div>
          </div>
        )
      })}

      {pages > 1 && (
        <div className="phone-pager">
          {page > 1 ? (
            <Link href={`/site?page=${page - 1}`} className="btn btn-secondary phone-btn-sm">
              Back
            </Link>
          ) : (
            <span />
          )}
          <span className="phone-hint">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={`/site?page=${page + 1}`} className="btn btn-secondary phone-btn-sm">
              More
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}

      <div className="phone-foot">
        <a href="/issues/defects/pdf" className="btn btn-secondary phone-btn">
          Defect report (PDF)
        </a>
        <p className="phone-hint" style={{ marginTop: 10 }}>
          Every outstanding defect, grouped by tag, each with its photograph and what must be done. The same document
          the punch list screen issues.
        </p>
        {/* Said once, at the bottom, where somebody who has just used the
            screen and liked it will read it. A banner at the top telling
            people to install an app before they have seen what it does is an
            advertisement. */}
        <p className="phone-hint" style={{ marginTop: 14 }}>
          <strong>Keep this on your phone.</strong> In Safari press Share and then &ldquo;Add to Home Screen&rdquo;;
          in Chrome it is the menu and then &ldquo;Install&rdquo;. It gets its own icon and opens straight here with
          no address bar. It is the same records as the desktop — nothing is stored on the phone, so it needs a
          signal, and a form that cannot reach the site says so when you press the button rather than losing what you
          typed.
        </p>
      </div>
    </div>
  )
}
