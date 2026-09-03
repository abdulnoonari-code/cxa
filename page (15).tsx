import UploadResult from '@/components/UploadResult'
import Link from 'next/link'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { loadIssuePhotos } from '@/data/photos'
import { loadPunchPage, loadPunchTotals, partiesIn, type PunchRow } from '@/data/punchlist'
import { refKey, subjectLabel, type Subject, type SubjectIndex } from '@/lib/subjects'
import { LEVELS } from '@/lib/checklist'
import { severityBadgeClass, categoryBadgeClass, issueStatusBadgeClass } from '@/lib/issues'
import {
  CATEGORIES,
  CATEGORY_BLOCKS,
  ISSUE_STATUSES,
  SEVERITIES,
  summarise,
  verdict,
  verdictBadgeClass,
  daysOverdue,
  ageInDays,
  statusLabel,
} from '@/lib/punchlist'
import { ACCEPTED_TYPES, MAX_BYTES } from '@/lib/photo'
import { createIssue, deleteIssue, importPunchList } from './actions'

export const dynamic = 'force-dynamic'

const PER_PAGE = 50

function levelLabel(value: string | null): string {
  return LEVELS.find((l) => l.value === value)?.label ?? '—'
}

function subjectOf(index: SubjectIndex, row: PunchRow): Subject | null {
  if (row.subject_type && row.subject_id) {
    return index.byKey.get(refKey({ type: row.subject_type, id: row.subject_id })) ?? null
  }
  if (row.equipment_id) return index.byKey.get(refKey({ type: 'equipment', id: row.equipment_id })) ?? null
  return null
}

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    severity?: string
    category?: string
    level?: string
    party?: string
    open?: string
    page?: string
    import?: string
    added?: string
    updated?: string
    removed?: string
    rows?: string
    warnings?: string
    errors?: string
    detail?: string
    headings?: string
    photo?: string
    raised?: string
    reason?: string
  }>
}) {
  const sp = await searchParams
  const project = await getCurrentProject()
  const page = Math.max(1, Number(sp.page ?? '1') || 1)

  const filter = {
    status: sp.status || null,
    severity: sp.severity || null,
    category: sp.category || null,
    level: sp.level || null,
    party: sp.party || null,
    openOnly: sp.open === '1',
  }

  const [index, { rows, total }, totals, photoStore] = await Promise.all([
    loadSubjectIndex(project?.id ?? null),
    loadPunchPage(project?.id ?? null, filter, page, PER_PAGE),
    loadPunchTotals(project?.id ?? null),
    loadIssuePhotos(project?.id ?? null),
  ])

  // How many photographs each item carries, shown in the list itself.
  //
  // Added because there was no way to tell. You could upload a photograph,
  // and then the only place it appeared was inside that one item's page — so
  // an upload that silently failed looked exactly like an upload that worked.
  // The count belongs on the register.
  const photoCount = (id: string): number => photoStore.byIssue.get(id)?.length ?? 0

  const summary = summarise(totals)
  const reading = verdict(summary)
  const pages = Math.max(1, Math.ceil(total / PER_PAGE))
  const parties = partiesIn(rows)

  // Everything on the asset tree that a punch item can be raised against.
  // A defect belongs to what it is a defect in — sometimes a tag, sometimes
  // the whole system.
  const pickable = [...index.byKey.values()]
    .filter((s) => s.type !== 'project')
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'equipment' ? 1 : -1
      return (a.code ?? a.name).localeCompare(b.code ?? b.name)
    })

  // The export routes read the same filters off the URL that this page does,
  // so the file always matches what is on screen.
  const exportParams = new URLSearchParams()
  for (const [k, v] of Object.entries({
    status: sp.status,
    category: sp.category,
    severity: sp.severity,
    level: sp.level,
    party: sp.party,
    open: sp.open,
  })) {
    if (v) exportParams.set(k, v)
  }
  const exportSuffix = exportParams.toString() ? `?${exportParams.toString()}` : ''

  const query = (extra: Record<string, string | null>) => {
    const params = new URLSearchParams()
    const merged: Record<string, string | null> = {
      status: sp.status ?? null,
      severity: sp.severity ?? null,
      category: sp.category ?? null,
      level: sp.level ?? null,
      party: sp.party ?? null,
      open: sp.open ?? null,
      ...extra,
    }
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v)
    const s = params.toString()
    return s ? `/issues?${s}` : '/issues'
  }

  return (
    <>
      <UploadResult searchParams={sp} />
      <h1 className="page-title">Punch List</h1>
      <p className="page-subtitle" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>
          {project ? project.name : 'No project selected'} — every defect raised on this project, what it blocks,
          who has to clear it and by when.
        </span>
        <span className={verdictBadgeClass(reading.tone)}>{reading.label}</span>
      </p>

      {/* ── What the list says ─────────────────────────────────────────── */}
      <div
        className="card"
        style={{
          borderLeft: `4px solid ${
            reading.tone === 'danger'
              ? 'var(--color-danger-solid)'
              : reading.tone === 'warning'
                ? 'var(--color-warning-solid, #d97706)'
                : reading.tone === 'success'
                  ? 'var(--color-success-solid)'
                  : 'var(--color-neutral-solid)'
          }`,
        }}
      >
        <p style={{ margin: 0, fontSize: 14 }}>{reading.detail}</p>
        <p className="text-secondary" style={{ margin: '8px 0 0', fontSize: 12.5 }}>
          A punch list does not authorise anything. It reports what is outstanding — the{' '}
          <Link href="/gates" className="link">
            readiness gates
          </Link>{' '}
          are what decide whether a system may proceed, and they read these categories as rules.
        </p>
      </div>

      <div className="stat-grid" style={{ marginTop: 18 }}>
        <div className="stat">
          <div className="stat-label">Open</div>
          <div className="stat-value">{summary.open}</div>
          <div className="stat-note">of {summary.total} raised</div>
        </div>
        <div className="stat">
          <div className="stat-label">Category A open</div>
          <div className="stat-value" style={{ color: summary.openA > 0 ? 'var(--color-danger)' : undefined }}>
            {summary.openA}
          </div>
          <div className="stat-note">Stops the system advancing</div>
        </div>
        <div className="stat">
          <div className="stat-label">Overdue</div>
          <div className="stat-value" style={{ color: summary.overdue > 0 ? 'var(--color-danger)' : undefined }}>
            {summary.overdue}
          </div>
          <div className="stat-note">Past an agreed date</div>
        </div>
        <div className="stat">
          <div className="stat-label">Awaiting acceptance</div>
          <div className="stat-value">{summary.awaitingAcceptance}</div>
          <div className="stat-note">Cleared, not yet accepted</div>
        </div>
        <div className="stat">
          <div className="stat-label">Uncategorised</div>
          <div className="stat-value" style={{ color: summary.openUncategorised > 0 ? 'var(--color-warning)' : undefined }}>
            {summary.openUncategorised}
          </div>
          <div className="stat-note">Treated as blocking until assessed</div>
        </div>
        <div className="stat">
          <div className="stat-label">Oldest open</div>
          <div className="stat-value">{summary.oldest === null ? '—' : summary.oldest}</div>
          <div className="stat-note">{summary.oldest === null ? 'Nothing open' : 'days'}</div>
        </div>
      </div>

      {/* ── Import results ─────────────────────────────────────────────── */}
      {sp.import === 'ok' && (
        <div className="alert" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)', marginTop: 18 }}>
          <strong>Imported.</strong> {sp.rows} row{sp.rows === '1' ? '' : 's'} read — {sp.added} raised
          {sp.updated && sp.updated !== '0' ? `, ${sp.updated} updated` : ''}
          {sp.removed && sp.removed !== '0' ? `, ${sp.removed} removed` : ''}.
          {sp.warnings && sp.warnings !== '0'
            ? ` ${sp.warnings} item${sp.warnings === '1' ? '' : 's'} came in with no category — they count as blocking until somebody assesses them.`
            : ''}
        </div>
      )}
      {sp.import === 'rejected' && (
        <div className="alert alert-danger" style={{ marginTop: 18 }}>
          <strong>Nothing imported.</strong> {sp.errors} row{sp.errors === '1' ? '' : 's'} could not be read, so the
          whole file was refused — a half-loaded punch list is worse than none.
          {sp.detail ? <div style={{ marginTop: 6, fontSize: 13 }}>{sp.detail}</div> : null}
          <div style={{ marginTop: 6, fontSize: 13 }}>
            Every bad row is listed in the{' '}
            <Link href="/audit" className="link">
              audit trail
            </Link>
            .
          </div>
        </div>
      )}
      {sp.import === 'empty' && (
        <div className="alert alert-danger" style={{ marginTop: 18 }}>
          <strong>Nothing imported.</strong> No punch items could be read from that file.
          {sp.headings ? ` The column headings found were: ${sp.headings}.` : ''} The file needs a column headed
          something like Punch Item, Description, Defect, Observation or Finding.
        </div>
      )}
      {sp.import === 'nofile' && (
        <div className="alert alert-danger" style={{ marginTop: 18 }}>
          <strong>Nothing imported.</strong> Choose a file first.
        </div>
      )}

      {/* ── Exchange with the client ───────────────────────────────────── */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2 className="section-title">Send it out, get it back</h2>
        <p className="text-secondary" style={{ fontSize: 13, marginBottom: 14 }}>
          Export the list, send it to the client or the contractor, and import whatever comes back. Each item keeps
          its <strong>punch number</strong>, so their edits land on the right rows instead of creating a second copy
          of the list. A row with no number is a new item and gets the next free one. Put <strong>Y</strong> in the
          Remove column to delete one. If any row cannot be read, <strong>nothing is imported at all</strong>.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <a href={`/issues/pdf${exportSuffix}`} className="btn btn-secondary btn-sm">
            PDF
          </a>
          <a href={`/issues/word${exportSuffix}`} className="btn btn-secondary btn-sm">
            Word
          </a>
          <a href={`/issues/export${exportSuffix}`} className="btn btn-secondary btn-sm">
            Excel
          </a>
          <a
            href={`/issues/pdf${exportSuffix ? `${exportSuffix}&photos=1` : '?photos=1'}`}
            className="btn btn-secondary btn-sm"
          >
            PDF with photographs
          </a>
          <a href="/issues/template" className="btn btn-secondary btn-sm">
            Blank template
          </a>
        </div>
        <p className="text-secondary" style={{ fontSize: 12.5, marginTop: -8, marginBottom: 14 }}>
          The photograph version carries the pictures uploaded against the items in this list, each with who took it
          and what an AI made of it. It is a separate button because photographs make the file large and slow to
          produce, and nobody walking the site with a printed list wants them.
        </p>
        <p className="text-secondary" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14 }}>
          Whatever the filters below are set to is what goes into the file, so one contractor&apos;s items can be
          issued to that contractor and nothing else. <strong>PDF and Word</strong> are documents to issue and file;{' '}
          <strong>Excel</strong> is the one that comes back edited.
        </p>
        <form action={importPunchList} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '1 1 320px' }}>
            Marked-up punch list (.xlsx or .csv)
            <input type="file" name="file" accept=".xlsx,.csv" required className="input" />
          </label>
          <button type="submit" className="btn btn-primary">
            Import
          </button>
        </form>
      </div>

      {/* ── Raise one ──────────────────────────────────────────────────── */}
      <details className="card" style={{ marginTop: 16 }}>
        <summary className="section-title" style={{ cursor: 'pointer', marginBottom: 0 }}>
          Raise a punch item
        </summary>
        <form
          action={createIssue}
          encType="multipart/form-data"
          style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr', marginTop: 16 }}
        >
          <label className="field">
            Against *
            <select name="subject" required className="input" defaultValue="">
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
          </label>
          <label className="field">
            Raised at level
            <select name="level" className="input" defaultValue="">
              <option value="">— not tied to a level —</option>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            What is wrong *
            <input name="title" required placeholder="e.g. Loose terminal on breaker CB-04" className="input" />
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            Detail
            <input name="description" placeholder="What needs to happen before this can be closed" className="input" />
          </label>
          <label className="field">
            Category
            <select name="category" className="input" defaultValue="">
              <option value="">— not assessed yet —</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Severity
            <select name="severity" className="input" defaultValue="minor">
              {SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Responsible party
            <input name="responsible_party" placeholder="Who has to clear it" className="input" />
          </label>
          <label className="field">
            Due date
            <input type="date" name="due_date" className="input" />
          </label>
          <label className="field">
            Discipline
            <input name="discipline" placeholder="Electrical, Mechanical, Civil…" className="input" />
          </label>
          <label className="field">
            Location
            <input name="location" placeholder="Where on site" className="input" />
          </label>
          {/* Somebody raising a punch item is standing in front of the defect
              with the photograph already on their phone. Asking them to save
              the item, find it in the list, open it and scroll down is three
              steps too many. */}
          <label className="field">
            Photo of the defect
            <input type="file" name="photo" accept={ACCEPTED_TYPES.join(',')} className="input" />
            <span className="text-secondary" style={{ fontSize: 11.5, marginTop: 3 }}>
              Optional. JPEG, PNG or WebP, up to {MAX_BYTES / 1024 / 1024} MB. More can be added afterwards, including
              the after-photo.
            </span>
          </label>
          <label className="field">
            What the photo shows
            <input name="photo_caption" placeholder="e.g. Seep at the filter housing joint" className="input" />
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="btn btn-primary" disabled={pickable.length === 0}>
              Raise punch item
            </button>
          </div>
        </form>

        {sp.photo === 'failed' && (
          <div className="card" style={{ borderLeft: '4px solid var(--color-warning-solid, #d97706)', marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>
              {sp.raised} was raised, but the photograph was not attached.
            </p>
            <p className="text-secondary" style={{ margin: '5px 0 0', fontSize: 12.5 }}>
              {sp.reason}
            </p>
            <p className="text-secondary" style={{ margin: '5px 0 0', fontSize: 12.5 }}>
              The punch item itself is fine — open it and attach the photo there once this is sorted.
            </p>
          </div>
        )}
        {/* Persistent, unlike the banner above it. The "photograph was not
            attached" notice appears once on the redirect and is gone the
            moment you navigate — which is exactly when somebody concludes the
            upload worked. If the table is not there, say so every time. */}
        {!photoStore.schemaReady && (
          <div className="card" style={{ borderLeft: '4px solid var(--color-warning-solid, #d97706)', marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>
              This database cannot store photographs yet, so no upload will save.
            </p>
            <p className="text-secondary" style={{ margin: '5px 0 0', fontSize: 12.5 }}>
              Run <span className="mono">week5-part21-photos.sql</span> in Supabase → SQL Editor. Everything else on
              this screen works normally in the meantime.
            </p>
          </div>
        )}
        {pickable.length === 0 && (
          <p className="text-secondary" style={{ fontSize: 13, marginTop: 10 }}>
            Add equipment or systems first — a punch item has to be against something.
          </p>
        )}
        <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
          {CATEGORIES.map((c) => (
            <span key={c.value} style={{ display: 'block' }}>
              <strong>Category {c.value}</strong> — {CATEGORY_BLOCKS[c.value]}
            </span>
          ))}
        </p>
      </details>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div style={{ margin: '24px 0 14px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <form style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select name="status" defaultValue={sp.status ?? ''} className="input" style={{ maxWidth: 190 }}>
            <option value="">All statuses</option>
            {ISSUE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select name="category" defaultValue={sp.category ?? ''} className="input" style={{ maxWidth: 210 }}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                Category {c.value}
              </option>
            ))}
            <option value="none">Uncategorised</option>
          </select>
          <select name="level" defaultValue={sp.level ?? ''} className="input" style={{ maxWidth: 240 }}>
            <option value="">All levels</option>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          <select name="severity" defaultValue={sp.severity ?? ''} className="input" style={{ maxWidth: 170 }}>
            <option value="">All severities</option>
            {SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {parties.length > 0 && (
            <select name="party" defaultValue={sp.party ?? ''} className="input" style={{ maxWidth: 210 }}>
              <option value="">All parties</option>
              {parties.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" name="open" value="1" defaultChecked={sp.open === '1'} />
            Open only
          </label>
          <button type="submit" className="btn btn-secondary">
            Filter
          </button>
        </form>
        {(sp.status || sp.category || sp.level || sp.severity || sp.party || sp.open) && (
          <Link href="/issues" className="link" style={{ fontSize: 13 }}>
            Clear
          </Link>
        )}
      </div>

      <p className="text-secondary" style={{ fontSize: 12.5, marginTop: -4 }}>
        The figures above count <strong>the whole project</strong>. The table below shows{' '}
        {total === 0 ? 'nothing' : `${(page - 1) * PER_PAGE + 1}–${Math.min(page * PER_PAGE, total)} of ${total}`}{' '}
        matching this filter.
      </p>

      {/* ── The list ───────────────────────────────────────────────────── */}
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 76 }}>Punch no</th>
              <th style={{ minWidth: 150 }}>Against</th>
              <th style={{ minWidth: 260 }}>What is wrong</th>
              <th>Level</th>
              <th>Cat</th>
              <th>Status</th>
              <th style={{ minWidth: 130 }}>Responsible</th>
              <th>Due</th>
              <th style={{ textAlign: 'right' }}>Age</th>
              <th style={{ textAlign: 'center', width: 54 }} title="Photographs attached to this item">
                Photos
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="empty-row">
                  {summary.total === 0
                    ? 'No punch items on this project yet.'
                    : 'No punch items match this filter.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const subject = subjectOf(index, row)
                const late = daysOverdue(row)
                const age = ageInDays(row)
                return (
                  <tr key={row.id}>
                    <td className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {row.ref ?? '—'}
                    </td>
                    <td>
                      {subject ? (
                        <Link href={`/assets/${subject.type}/${subject.id}`} className="link" style={{ fontSize: 13 }}>
                          <span className="mono">{subject.code ?? subject.name}</span>
                        </Link>
                      ) : (
                        <span className="text-secondary" style={{ fontSize: 12.5 }}>
                          Unassigned
                        </span>
                      )}
                      {subject && (
                        <div className="text-secondary" style={{ fontSize: 11 }}>
                          {subjectLabel(subject.type)}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 13.5 }}>
                      {row.title}
                      {row.description && (
                        <div className="text-secondary" style={{ fontSize: 12, marginTop: 2 }}>
                          {row.description}
                        </div>
                      )}
                      {row.checklist_item_id && (
                        <div className="text-secondary" style={{ fontSize: 11, marginTop: 2 }}>
                          Raised from a checklist item
                        </div>
                      )}
                    </td>
                    <td className="text-secondary" style={{ fontSize: 11.5 }}>
                      {row.level ? levelLabel(row.level).split('—')[0].trim() : '—'}
                    </td>
                    <td>
                      {row.category ? (
                        <span className={categoryBadgeClass(row.category)}>{row.category}</span>
                      ) : (
                        <span className="badge badge-warning" title="Not assessed — treated as blocking">
                          ?
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={issueStatusBadgeClass(row.status)}>{statusLabel(row.status)}</span>
                      <div>
                        <span className={severityBadgeClass(row.severity)} style={{ fontSize: 10, marginTop: 3 }}>
                          {row.severity}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {row.responsible_party ?? <span className="text-secondary">—</span>}
                      {row.discipline && (
                        <div className="text-secondary" style={{ fontSize: 11 }}>
                          {row.discipline}
                        </div>
                      )}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {row.due_date ?? '—'}
                      {late !== null && (
                        <div style={{ color: 'var(--color-danger)', fontSize: 11, fontWeight: 600 }}>
                          {late}d late
                        </div>
                      )}
                    </td>
                    <td className="mono text-secondary" style={{ textAlign: 'right', fontSize: 12 }}>
                      {age === null ? '—' : `${age}d`}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {photoCount(row.id) > 0 ? (
                        <Link
                          href={`/issues/${row.id}/edit#photos`}
                          className="link mono"
                          style={{ fontSize: 12, fontWeight: 600 }}
                          title={`${photoCount(row.id)} photograph${photoCount(row.id) === 1 ? '' : 's'} attached`}
                        >
                          {photoCount(row.id)}
                        </Link>
                      ) : (
                        <span className="text-secondary" style={{ fontSize: 12 }} title="No photograph attached">
                          —
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <Link href={`/issues/${row.id}/edit`} className="link">
                          Edit
                        </Link>
                        <form action={deleteIssue}>
                          <input type="hidden" name="id" value={row.id} />
                          <button type="submit" className="btn-link">
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
          {page > 1 && (
            <Link href={query({ page: String(page - 1) })} className="btn btn-secondary btn-sm">
              ← Previous
            </Link>
          )}
          <span className="text-secondary" style={{ fontSize: 13 }}>
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link href={query({ page: String(page + 1) })} className="btn btn-secondary btn-sm">
              Next →
            </Link>
          )}
        </div>
      )}

      <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 16 }}>
        Age and overdue are worked out at the moment you loaded this page and are never stored. A closed item is
        never shown as overdue, however long it sat there — this list is a record of what is outstanding now.
      </p>
    </>
  )
}
