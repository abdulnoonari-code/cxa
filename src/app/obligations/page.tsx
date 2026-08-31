import Link from 'next/link'
import { getCurrentProject } from '@/lib/project'
import { loadObligationPage, loadObligationTotals, loadDocumentChoices } from '@/data/obligations'
import { LEVELS } from '@/lib/checklist'
import {
  PARTIES,
  OBLIGATION_TYPES,
  OBLIGATION_STATUSES,
  partyShort,
  partyBadgeClass,
  statusBadgeClass,
  statusLabel,
  typeLabel,
  summarise,
  verdict,
  verdictBadgeClass,
  daysOverdue,
} from '@/lib/obligations'
import { readDocument, addObligation, updateObligation, deleteObligation, discardRead, importObligations } from './actions'

export const dynamic = 'force-dynamic'

const PER_PAGE = 40

export default async function ObligationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    party?: string
    status?: string
    type?: string
    document?: string
    open?: string
    page?: string
    read?: string
    added?: string
    found?: string
    dupes?: string
    unassigned?: string
    paras?: string
    format?: string
    detail?: string
    import?: string
    updated?: string
    removed?: string
    rows?: string
    warnings?: string
    errors?: string
    headings?: string
  }>
}) {
  const sp = await searchParams
  const project = await getCurrentProject()
  const page = Math.max(1, Number(sp.page ?? '1') || 1)

  const filter = {
    party: sp.party || null,
    status: sp.status || null,
    type: sp.type || null,
    document: sp.document || null,
    outstandingOnly: sp.open === '1',
  }

  const [{ rows, total }, totals, documents] = await Promise.all([
    loadObligationPage(project?.id ?? null, filter, page, PER_PAGE),
    loadObligationTotals(project?.id ?? null),
    loadDocumentChoices(project?.id ?? null),
  ])

  const summary = summarise(totals)
  const reading = verdict(summary)
  const pages = Math.max(1, Math.ceil(total / PER_PAGE))

  const query = (extra: Record<string, string | null>) => {
    const params = new URLSearchParams()
    const merged: Record<string, string | null> = {
      party: sp.party ?? null,
      status: sp.status ?? null,
      type: sp.type ?? null,
      document: sp.document ?? null,
      open: sp.open ?? null,
      ...extra,
    }
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v)
    const s = params.toString()
    return s ? `/obligations?${s}` : '/obligations'
  }

  const exportQuery = new URLSearchParams()
  for (const [k, v] of Object.entries({ party: sp.party, status: sp.status, type: sp.type, document: sp.document, open: sp.open })) {
    if (v) exportQuery.set(k, v)
  }
  const exportSuffix = exportQuery.toString() ? `?${exportQuery.toString()}` : ''

  return (
    <>
      <h1 className="page-title">Obligations</h1>
      <p className="page-subtitle" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>
          {project ? project.name : 'No project selected'} — who owes what, taken out of the contract, the
          specification and the procedures that say so.
        </span>
        <span className={verdictBadgeClass(reading.tone)}>{reading.label}</span>
      </p>

      <div className="card" style={{ borderLeft: `4px solid ${
        reading.tone === 'danger'
          ? 'var(--color-danger-solid)'
          : reading.tone === 'warning'
            ? 'var(--color-warning-solid, #d97706)'
            : reading.tone === 'success'
              ? 'var(--color-success-solid)'
              : 'var(--color-neutral-solid)'
      }` }}>
        <p style={{ margin: 0, fontSize: 14 }}>{reading.detail}</p>
        <p className="text-secondary" style={{ margin: '8px 0 0', fontSize: 12.5 }}>
          An obligation is a duty owed by a named party — &ldquo;the Contractor shall submit the ITP fourteen days
          before work starts&rdquo;. It is not a{' '}
          <Link href="/requirements" className="link">
            requirement
          </Link>
          , which is a technical acceptance criterion proved by a test. They are kept apart because they are closed
          out differently.
        </p>
      </div>

      {/* ── Read a document ────────────────────────────────────────────── */}
      {sp.read === 'ok' && (
        <div className="alert" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)', marginTop: 18 }}>
          <strong>Read.</strong> {sp.paras} paragraphs of {String(sp.format ?? '').toUpperCase()} — {sp.found} clauses
          place a duty on somebody, {sp.added} added to the register
          {sp.dupes && sp.dupes !== '0' ? `, ${sp.dupes} already on it` : ''}.
          {sp.unassigned && sp.unassigned !== '0' ? (
            <div style={{ marginTop: 6, fontSize: 13 }}>
              <strong>{sp.unassigned} could not be attributed to a party.</strong> They are filed as unassigned and
              counted as such — filter by <em>Not assigned</em> below and give them an owner.
            </div>
          ) : null}
        </div>
      )}
      {sp.read === 'none' && (
        <div className="alert alert-info" style={{ marginTop: 18 }}>
          <strong>Nothing found.</strong> {sp.paras} paragraphs were read, and none of them placed a duty on
          anybody. A document of drawings, tables or definitions reads like this — so does one where the duties are
          written as &ldquo;the works include&rdquo; rather than &ldquo;the Contractor shall&rdquo;. Add those by
          hand below.
        </div>
      )}
      {sp.read === 'failed' && (
        <div className="alert alert-danger" style={{ marginTop: 18 }}>
          <strong>Could not read it.</strong> {sp.detail}
        </div>
      )}
      {sp.read === 'nofile' && (
        <div className="alert alert-danger" style={{ marginTop: 18 }}>
          <strong>Nothing read.</strong> Choose a file first.
        </div>
      )}
      {sp.read === 'denied' && (
        <div className="alert alert-danger" style={{ marginTop: 18 }}>
          <strong>Nothing read.</strong> Your role on this project cannot add obligations.
        </div>
      )}

      <div className="card" style={{ marginTop: 18 }}>
        <h2 className="section-title">Read a contract, specification or procedure</h2>
        <p className="text-secondary" style={{ fontSize: 13, marginBottom: 14 }}>
          Upload a <strong>Word (.docx)</strong> or <strong>PDF</strong> file. Every clause that places a duty on
          somebody — <em>shall</em>, <em>must</em>, <em>is responsible for</em> — becomes a row, keeping its clause
          number so an argument on site can be conducted in the document&apos;s own language. The party is read from
          the clause or from the heading above it; where it cannot be read, the row is filed as unassigned rather
          than guessed at.
        </p>
        <form action={readDocument} style={{ display: 'grid', gap: 12, gridTemplateColumns: '1.6fr 1fr 1fr auto', alignItems: 'flex-end' }}>
          <label className="field">
            Contract, specification or procedure
            <input type="file" name="file" accept=".docx,.pdf,.txt,.md" required className="input" />
          </label>
          <label className="field">
            File it under
            <select name="document_id" className="input" defaultValue="">
              <option value="">— not a controlled document —</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.doc_number}
                  {d.title ? ` — ${d.title}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            If no party is named
            <select name="default_party" className="input" defaultValue="">
              <option value="">— leave unassigned —</option>
              {PARTIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-primary">
            Read it
          </button>
        </form>
        <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
          A scanned PDF has no text in it — only a picture of one — and will be refused with that explanation rather
          than a blank register. Reading the same document twice does not duplicate anything.
        </p>
      </div>

      {/* ── Figures ────────────────────────────────────────────────────── */}
      <div className="stat-grid" style={{ marginTop: 18 }}>
        <div className="stat">
          <div className="stat-label">Outstanding</div>
          <div className="stat-value">{summary.outstanding}</div>
          <div className="stat-note">of {summary.total} recorded</div>
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
          <div className="stat-note">Submitted, nobody has agreed</div>
        </div>
        <div className="stat">
          <div className="stat-label">Not assigned</div>
          <div className="stat-value" style={{ color: summary.unassigned > 0 ? 'var(--color-warning)' : undefined }}>
            {summary.unassigned}
          </div>
          <div className="stat-note">Nobody owns them</div>
        </div>
      </div>

      {summary.byParty.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <h2 className="section-title">Who owes what</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Party</th>
                  <th style={{ textAlign: 'right' }}>Outstanding</th>
                  <th style={{ textAlign: 'right' }}>Overdue</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {summary.byParty.map((p) => (
                  <tr key={p.party}>
                    <td>
                      <span className={partyBadgeClass(p.party === 'unassigned' ? null : p.party)}>
                        {p.party === 'unassigned' ? 'Not assigned' : partyShort(p.party)}
                      </span>
                      <span className="text-secondary" style={{ fontSize: 12.5, marginLeft: 8 }}>
                        {p.label}
                      </span>
                    </td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 12.5 }}>
                      {p.outstanding || '—'}
                    </td>
                    <td
                      className="mono"
                      style={{ textAlign: 'right', fontSize: 12.5, color: p.overdue > 0 ? 'var(--color-danger)' : undefined, fontWeight: p.overdue > 0 ? 600 : 400 }}
                    >
                      {p.overdue || '—'}
                    </td>
                    <td className="mono text-secondary" style={{ textAlign: 'right', fontSize: 12.5 }}>
                      {p.total}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={query({ party: p.party === 'unassigned' ? 'none' : p.party, page: null })}
                        className="link"
                        style={{ fontSize: 13 }}
                      >
                        Show
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Out ────────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2 className="section-title">Send it out</h2>
        <p className="text-secondary" style={{ fontSize: 13, marginBottom: 14 }}>
          Whatever the filters below are set to is what goes into the file — so one party&apos;s obligations can be
          sent to that party and nothing else. <strong>Word and PDF</strong> are documents to issue and file;{' '}
          <strong>Excel</strong> is the one to edit and upload back.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href={`/obligations/pdf${exportSuffix}`} className="btn btn-secondary btn-sm">
            PDF
          </a>
          <a href={`/obligations/word${exportSuffix}`} className="btn btn-secondary btn-sm">
            Word
          </a>
          <a href={`/obligations/export${exportSuffix}`} className="btn btn-secondary btn-sm">
            Excel
          </a>
          <a href="/obligations/template" className="btn btn-secondary btn-sm">
            Blank template
          </a>
        </div>

        <p className="text-secondary" style={{ fontSize: 13, margin: '18px 0 12px' }}>
          <strong>And back again.</strong> Send the Excel out, let the other party fill in their state and their
          evidence, and upload it here. Each row keeps its <strong>Ref</strong>, so their edits land on the right
          obligations instead of creating a second register.
        </p>
        <form action={importObligations} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '1 1 320px' }}>
            Marked-up register (.xlsx or .csv)
            <input type="file" name="file" accept=".xlsx,.csv" required className="input" />
          </label>
          <button type="submit" className="btn btn-primary">
            Import
          </button>
        </form>
        <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 10, marginBottom: 0 }}>
          A party the file names that CxSentinel does not recognise <strong>stops the import</strong> rather than
          being filed as unassigned — an obligation quietly orphaned on a re-import is the one nobody chases. And
          &ldquo;Done&rdquo; is read as <em>Submitted</em>, never Accepted: accepting is your decision, not a cell in
          their spreadsheet.
        </p>
      </div>

      {sp.import === 'ok' && (
        <div className="alert" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)', marginTop: 18 }}>
          <strong>Imported.</strong> {sp.rows} row{sp.rows === '1' ? '' : 's'} read — {sp.added} added
          {sp.updated && sp.updated !== '0' ? `, ${sp.updated} updated` : ''}
          {sp.removed && sp.removed !== '0' ? `, ${sp.removed} removed` : ''}.
          {sp.warnings && sp.warnings !== '0'
            ? ` ${sp.warnings} row${sp.warnings === '1' ? '' : 's'} had something worth knowing — see the audit trail.`
            : ''}
        </div>
      )}
      {sp.import === 'rejected' && (
        <div className="alert alert-danger" style={{ marginTop: 18 }}>
          <strong>Nothing imported.</strong> {sp.errors} row{sp.errors === '1' ? '' : 's'} could not be read, so the
          whole file was refused.
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
          <strong>Nothing imported.</strong> No obligations could be read from that file.
          {sp.headings ? ` The column headings found were: ${sp.headings}.` : ''} The file needs a column headed
          something like Obligation, Statement, Duty or Description.
        </div>
      )}
      {sp.import === 'nofile' && (
        <div className="alert alert-danger" style={{ marginTop: 18 }}>
          <strong>Nothing imported.</strong> Choose a file first.
        </div>
      )}
      {sp.import === 'denied' && (
        <div className="alert alert-danger" style={{ marginTop: 18 }}>
          <strong>Nothing imported.</strong> Your role on this project cannot change obligations.
        </div>
      )}

      {/* ── Add one ────────────────────────────────────────────────────── */}
      <details className="card" style={{ marginTop: 16 }}>
        <summary className="section-title" style={{ cursor: 'pointer', marginBottom: 0 }}>
          Add an obligation by hand
        </summary>
        <form action={addObligation} style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr', marginTop: 16 }}>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            What is owed *
            <input
              name="statement"
              required
              placeholder="e.g. The Contractor shall submit the ITP not less than 14 days before work starts"
              className="input"
            />
          </label>
          <label className="field">
            Party
            <select name="party" className="input" defaultValue="">
              <option value="">— not assigned —</option>
              {PARTIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Kind of duty
            <select name="obligation_type" className="input" defaultValue="provide">
              {OBLIGATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Bites at level
            <select name="level" className="input" defaultValue="">
              <option value="">— not tied to a level —</option>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Source document
            <select name="document_id" className="input" defaultValue="">
              <option value="">— none —</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.doc_number}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Clause
            <input name="clause" placeholder="7.1" className="input" />
          </label>
          <label className="field">
            Due date
            <input type="date" name="due_date" className="input" />
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="btn btn-primary">
              Add obligation
            </button>
          </div>
        </form>
      </details>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div style={{ margin: '24px 0 14px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <form style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select name="party" defaultValue={sp.party ?? ''} className="input" style={{ maxWidth: 230 }}>
            <option value="">All parties</option>
            {PARTIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
            <option value="none">Not assigned</option>
          </select>
          <select name="status" defaultValue={sp.status ?? ''} className="input" style={{ maxWidth: 190 }}>
            <option value="">All statuses</option>
            {OBLIGATION_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select name="type" defaultValue={sp.type ?? ''} className="input" style={{ maxWidth: 190 }}>
            <option value="">All kinds</option>
            {OBLIGATION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {documents.length > 0 && (
            <select name="document" defaultValue={sp.document ?? ''} className="input" style={{ maxWidth: 210 }}>
              <option value="">All documents</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.doc_number}
                </option>
              ))}
            </select>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" name="open" value="1" defaultChecked={sp.open === '1'} />
            Outstanding only
          </label>
          <button type="submit" className="btn btn-secondary">
            Filter
          </button>
        </form>
        {(sp.party || sp.status || sp.type || sp.document || sp.open) && (
          <Link href="/obligations" className="link" style={{ fontSize: 13 }}>
            Clear
          </Link>
        )}
      </div>

      <p className="text-secondary" style={{ fontSize: 12.5, marginTop: -4 }}>
        The figures above count <strong>the whole project</strong>. The table below shows{' '}
        {total === 0 ? 'nothing' : `${(page - 1) * PER_PAGE + 1}–${Math.min(page * PER_PAGE, total)} of ${total}`}{' '}
        matching this filter.
      </p>

      {/* ── The register ───────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <div className="card" style={{ marginTop: 12 }}>
          <p className="text-secondary" style={{ fontSize: 14, marginBottom: 0 }}>
            {summary.total === 0
              ? 'Nothing on the register yet. Upload a contract or a specification above and CxSentinel will read the duties out of it.'
              : 'Nothing matches this filter.'}
          </p>
        </div>
      ) : (
        rows.map((row) => {
          const late = daysOverdue(row)
          return (
            <div key={row.id} className="card" style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                <span className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>
                  {row.ref}
                </span>
                <span className={partyBadgeClass(row.party)}>{partyShort(row.party)}</span>
                <span className={statusBadgeClass(row.status)}>{statusLabel(row.status)}</span>
                <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                  {typeLabel(row.obligation_type)}
                </span>
                {late !== null && <span className="badge badge-danger">{late} days late</span>}
                {row.clause && (
                  <span className="text-secondary mono" style={{ fontSize: 11.5 }}>
                    clause {row.clause}
                  </span>
                )}
                {row.source_name && (
                  <span className="text-secondary" style={{ fontSize: 11.5 }}>
                    {row.source_name}
                  </span>
                )}
                {row.origin === 'rule' && (
                  <span className="text-secondary" style={{ fontSize: 11 }}>
                    read from the document
                  </span>
                )}
              </div>

              <p style={{ fontSize: 13.5, margin: '0 0 10px', lineHeight: 1.55 }}>{row.statement}</p>
              {row.notes && (
                <p className="text-secondary" style={{ fontSize: 12, margin: '0 0 10px' }}>
                  {row.notes}
                </p>
              )}

              <details>
                <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Set the party and the state</summary>
                <form
                  action={updateObligation}
                  style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginTop: 12 }}
                >
                  <input type="hidden" name="id" value={row.id} />
                  <label className="field">
                    Party
                    <select name="party" defaultValue={row.party ?? ''} className="input">
                      <option value="">— not assigned —</option>
                      {PARTIES.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Kind
                    <select name="obligation_type" defaultValue={row.obligation_type ?? 'other'} className="input">
                      {OBLIGATION_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    State
                    <select name="status" defaultValue={row.status} className="input">
                      {OBLIGATION_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Bites at level
                    <select name="level" defaultValue={row.level ?? ''} className="input">
                      <option value="">— none —</option>
                      {LEVELS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Owner
                    <input name="owner" defaultValue={row.owner ?? ''} placeholder="Named person" className="input" />
                  </label>
                  <label className="field">
                    Due date
                    <input type="date" name="due_date" defaultValue={row.due_date ?? ''} className="input" />
                  </label>
                  <label className="field" style={{ gridColumn: '1 / -1' }}>
                    Evidence it was discharged
                    <input
                      name="evidence"
                      defaultValue={row.evidence ?? ''}
                      placeholder="Transmittal number, email date, document reference"
                      className="input"
                    />
                  </label>
                  <label className="field" style={{ gridColumn: '1 / -1' }}>
                    Notes
                    <input name="notes" defaultValue={row.notes ?? ''} className="input" />
                  </label>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 14, alignItems: 'center' }}>
                    <button type="submit" className="btn btn-primary btn-sm">
                      Save
                    </button>
                  </div>
                </form>
                <form action={deleteObligation} style={{ marginTop: 10 }}>
                  <input type="hidden" name="id" value={row.id} />
                  <button type="submit" className="btn-link">
                    Delete this obligation
                  </button>
                </form>
              </details>

              {(row.closed_at || row.accepted_at) && (
                <p className="text-secondary" style={{ fontSize: 11.5, margin: '10px 0 0' }}>
                  {row.closed_at ? `Submitted ${row.closed_at.slice(0, 10)}${row.closed_by ? ` by ${row.closed_by}` : ''}` : ''}
                  {row.closed_at && row.accepted_at ? ' · ' : ''}
                  {row.accepted_at ? `Accepted ${row.accepted_at.slice(0, 10)}${row.accepted_by ? ` by ${row.accepted_by}` : ''}` : ''}
                </p>
              )}
            </div>
          )
        })
      )}

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

      {sp.read === 'ok' && rows.length > 0 && rows[0].source_name && (
        <form action={discardRead} style={{ marginTop: 16 }}>
          <input type="hidden" name="source_name" value={rows[0].source_name} />
          <button type="submit" className="btn-link">
            That was the wrong document — undo this read
          </button>
          <p className="text-secondary" style={{ fontSize: 12, marginTop: 4 }}>
            Removes only the rows the reader created and nobody has touched. Anything you have assigned or edited is
            kept.
          </p>
        </form>
      )}

      <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 18 }}>
        This register records what the documents read into CxSentinel say is owed. It is not a legal opinion, it does
        not discharge anything, and a clause absent from it has not stopped applying — it means nobody has read that
        document in here yet.
      </p>
    </>
  )
}
