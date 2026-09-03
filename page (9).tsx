import Link from 'next/link'
import { importItp, setPointParty, addConvention, removeConvention } from './actions'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { loadItp } from '@/data/itp'
import { refKey, subjectLabel, subjectBadgeClass, type Subject, type SubjectType } from '@/lib/subjects'
import { INSPECTION_TYPES, inspectionCode, inspectionLabel, inspectionBadgeClass, releaseLabel, releaseBadgeClass, carriesRelease } from '@/lib/inspection'
import { LEVELS } from '@/lib/checklist'
import { levelRuleStyle } from '@/lib/levels'
import { LevelBadge, LevelLegend } from '@/components/LevelBadge'
import {
  findingsIn,
  summarise,
  verdict,
  matrixColumns,
  matrixCell,
  unassignedCell,
  unassignedIsSerious,
  hasUnassigned,
  UNASSIGNED_COLUMN,
  toneBadgeClass,
  severityBadgeClass,
  severityWord,
  PARTIES,
  partyShort,
  partyLabel,
  PARTY_SOURCE_LABELS,
  MATRIX_KEY,
} from '@/lib/itp'

export const dynamic = 'force-dynamic'

export default async function ItpPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string
    id?: string
    view?: string
    import?: string
    changed?: string
    unchanged?: string
    count?: string
    first?: string
    headings?: string
    at?: string
    set?: string
    conv?: string
  }>
}) {
  const sp = await searchParams
  const project = await getCurrentProject()
  const index = await loadSubjectIndex(project?.id ?? null)

  const ref = sp.type && sp.id ? { type: sp.type as SubjectType, id: sp.id } : null
  const plan = await loadItp(project?.id ?? null, index, ref)

  if (!project || !plan) {
    return (
      <>
        <h1 className="page-title">Inspection &amp; Test Plan</h1>
        <div className="card">
          <p className="text-secondary" style={{ marginBottom: 0, fontSize: 14 }}>
            No project selected. Choose one on the{' '}
            <Link href="/projects" className="link">
              Projects
            </Link>{' '}
            page.
          </p>
        </div>
      </>
    )
  }

  const rows = plan.activities
  const findings = findingsIn(rows)
  const summary = summarise(rows)
  const reading = verdict(rows, findings, summary)
  const columns = matrixColumns(rows)
  const matrixView = sp.view === 'matrix'
  const anyUnassigned = hasUnassigned(rows)

  // The scopes worth offering. A plan is written for a system or an area, not
  // for one breaker.
  const scopes: Subject[] = [...index.byKey.values()]
    .filter((s) => s.type === 'site' || s.type === 'area' || s.type === 'system' || s.type === 'subsystem')
    .sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name))

  const qs = ref ? `?type=${ref.type}&id=${ref.id}` : ''
  // The querystring without its '?', so an action can send the user back to
  // the scope they were looking at rather than to the whole project.
  const scope = ref ? `type=${ref.type}&id=${ref.id}` : ''

  return (
    <>
      <h1 className="page-title">Inspection &amp; Test Plan</h1>
      <p className="page-subtitle">
        {plan.title} — every activity that has to be inspected or tested, what kind of point it is, and{' '}
        <strong>which party holds it</strong>.
      </p>

      {!plan.schemaReady && (
        <div className="card" style={{ borderLeft: '4px solid var(--color-warning-solid, #d97706)' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>The database does not yet know who holds a point.</p>
          <p className="text-secondary" style={{ margin: '8px 0 0', fontSize: 13 }}>
            Run <span className="mono">week5-part20-itp.sql</span> in Supabase → SQL Editor. Until then this page shows
            the plan with nobody holding anything, which is the truth about the database rather than the truth about the
            job.
          </p>
        </div>
      )}

      <div className="card" style={{ marginTop: plan.schemaReady ? 0 : 14 }}>
        <p style={{ margin: 0, fontSize: 14 }}>
          The ITP is the document a client approves <em>before</em> work starts. The handover pack is what proves it was
          followed <em>afterwards</em>. Both are generated from the same rows — this page is the plan side of the same
          record.
        </p>
        <p className="text-secondary" style={{ margin: '10px 0 0', fontSize: 12.5 }}>
          <strong>A point with no party is worse than no point at all.</strong> A Hold Point nobody owns will never be
          released, because there is nobody whose job it is. Those are listed below as findings in their own right
          rather than quietly filled in with a guess.
        </p>
      </div>

      {/* ── The reading ─────────────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <span className={toneBadgeClass(reading.tone)} style={{ fontSize: 12 }}>
            {reading.label}
          </span>
          <span className="text-secondary mono" style={{ fontSize: 11.5 }}>
            {summary.total} activities · {summary.points} inspection points
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 13.5 }}>{reading.detail}</p>
      </div>

      <div className="stat-grid" style={{ marginTop: 18 }}>
        {INSPECTION_TYPES.map((t) => (
          <div className="stat" key={t.value}>
            <div className="stat-label">
              {t.code} — {t.label}
            </div>
            <div className="stat-value">{summary.byType.find((b) => b.value === t.value)?.count ?? 0}</div>
            <div className="stat-note">{t.note}</div>
          </div>
        ))}
      </div>

      <div className="stat-grid" style={{ marginTop: 14 }}>
        <div className="stat">
          <div className="stat-label">Points with no party</div>
          <div className="stat-value" style={{ color: summary.unowned > 0 ? 'var(--color-danger)' : undefined }}>
            {summary.unowned}
          </div>
          <div className="stat-note">Nobody to release or attend them</div>
        </div>
        <div className="stat">
          <div className="stat-label">Named on the activity</div>
          <div className="stat-value">{summary.explicit}</div>
          <div className="stat-note">Written against the point itself</div>
        </div>
        <div className="stat">
          <div className="stat-label">From the project default</div>
          <div className="stat-value">{summary.byConvention}</div>
          <div className="stat-note">A default, not an agreement</div>
        </div>
        <div className="stat">
          <div className="stat-label">Awaiting a signature</div>
          <div className="stat-value" style={{ color: summary.awaiting > 0 ? 'var(--color-warning)' : undefined }}>
            {summary.awaiting}
          </div>
          <div className="stat-note">{summary.released} released or witnessed</div>
        </div>
      </div>

      {/* ── Scope and downloads ─────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="text-secondary" style={{ fontSize: 12.5, marginRight: 4 }}>
          Scope
        </span>
        <Link href="/itp" className={`btn btn-sm ${ref ? 'btn-secondary' : 'btn-primary'}`}>
          Whole project
        </Link>
        {scopes.map((s) => (
          <Link
            key={refKey(s)}
            href={`/itp?type=${s.type}&id=${s.id}`}
            className={`btn btn-sm ${ref && ref.id === s.id ? 'btn-primary' : 'btn-secondary'}`}
          >
            <span className={subjectBadgeClass(s.type)} style={{ fontSize: 9, marginRight: 5 }}>
              {subjectLabel(s.type)}
            </span>
            {s.code ?? s.name}
          </Link>
        ))}
      </div>

      {/* ── Marking up the plan and sending it back ─────────────────────── */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2 className="section-title">Mark up the plan and upload it back</h2>
        <p className="text-secondary" style={{ fontSize: 13, margin: '0 0 10px' }}>
          Download the Excel, send it to the client or the CxA, and let them put an <strong>H</strong>,{' '}
          <strong>W</strong>, <strong>S</strong> or <strong>R</strong> in the column of the party who holds each point.
          Upload the same file back and CxSentinel changes only the rows that differ.
        </p>
        <ul className="text-secondary" style={{ fontSize: 12.5, margin: '0 0 12px', paddingLeft: 18 }}>
          <li>
            <strong>The column says who, the letter says what.</strong> One letter per row — an activity held by two
            parties is an argument the plan has to settle before the work does, so the file is refused.
          </li>
          <li>
            <strong>A letter still in brackets stays a project default.</strong> Remove the brackets to write that party
            against the activity. Leaving them means the software&rsquo;s assumption never becomes the
            client&rsquo;s agreement by accident.
          </li>
          <li>
            <strong>It never creates an activity.</strong> A row that matches no check or test is an error — add it on
            the Checklists or Test Records page first. A plan cannot conjure work nobody did.
          </li>
          <li>
            <strong>All or nothing.</strong> One unreadable row and the whole file is refused, with every problem
            listed by sheet and row number in the audit trail.
          </li>
        </ul>

        {sp.import === 'ok' && (
          <p className="badge badge-success" style={{ display: 'inline-block', marginBottom: 10 }}>
            Imported — {sp.changed} activit{sp.changed === '1' ? 'y' : 'ies'} changed, {sp.unchanged} already agreed.
          </p>
        )}
        {sp.import === 'nochange' && (
          <p className="badge badge-neutral" style={{ display: 'inline-block', marginBottom: 10 }}>
            Nothing to change — all {sp.unchanged} rows already said what the file says.
          </p>
        )}
        {sp.import === 'errors' && (
          <div className="card" style={{ borderLeft: '4px solid var(--color-danger-solid)', marginBottom: 10 }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>
              {sp.count} problem{sp.count === '1' ? '' : 's'} — nothing was saved.
            </p>
            <p className="text-secondary" style={{ margin: '6px 0 0', fontSize: 12.5 }}>
              First one: {sp.first}
            </p>
            <p className="text-secondary" style={{ margin: '6px 0 0', fontSize: 12.5 }}>
              Every one is listed by sheet and row number in the{' '}
              <Link href="/audit" className="link">
                audit trail
              </Link>
              .
            </p>
          </div>
        )}
        {sp.import === 'empty' && (
          <p className="badge badge-warning" style={{ display: 'inline-block', marginBottom: 10 }}>
            No plan found in that file{sp.headings ? `. Headings seen: ${sp.headings}` : '.'}
          </p>
        )}
        {sp.import === 'nofile' && (
          <p className="badge badge-warning" style={{ display: 'inline-block', marginBottom: 10 }}>
            Choose a file first.
          </p>
        )}
        {sp.import === 'denied' && (
          <p className="badge badge-danger" style={{ display: 'inline-block', marginBottom: 10 }}>
            Your role cannot change the plan.
          </p>
        )}
        {sp.import === 'failed' && (
          <p className="badge badge-danger" style={{ display: 'inline-block', marginBottom: 10 }}>
            Stopped part way, at {sp.at}. Earlier rows were saved — check the audit trail before retrying.
          </p>
        )}

        <form action={importItp} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="file" name="file" accept=".xlsx,.xlsm,.csv" required className="input" style={{ maxWidth: 380 }} />
          <button type="submit" className="btn btn-primary btn-sm">
            Import marked-up ITP
          </button>
          <a href={`/itp/export${qs}`} className="btn btn-secondary btn-sm">
            Download the plan to mark up
          </a>
        </form>
        <p className="text-secondary" style={{ fontSize: 12, margin: '10px 0 0' }}>
          There is deliberately no blank template. The plan is a view of checks and tests that already exist, so an
          empty sheet would have nothing to mark up — the export <em>is</em> the template.
        </p>
      </div>

      <div className="card" style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href={`/itp${qs}${qs ? '&' : '?'}view=${matrixView ? 'list' : 'matrix'}`} className="btn btn-secondary btn-sm">
          {matrixView ? 'Show as a list' : 'Show as the ITP matrix'}
        </Link>
        <a href={`/itp/pdf${qs}`} className="btn btn-primary btn-sm">
          ITP (PDF)
        </a>
        <a href={`/itp/word${qs}`} className="btn btn-secondary btn-sm">
          Word
        </a>
        <a href={`/itp/export${qs}`} className="btn btn-secondary btn-sm">
          Excel
        </a>
      </div>

      {/* ── Who holds what ──────────────────────────────────────────────── */}
      {summary.parties.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <h2 className="section-title">Who holds the points</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Party</th>
                <th style={{ textAlign: 'right' }}>Points held</th>
                <th style={{ textAlign: 'right' }}>Waiting on them</th>
              </tr>
            </thead>
            <tbody>
              {summary.parties.map((p) => (
                <tr key={p.party}>
                  <td>{partyLabel(p.party)}</td>
                  <td style={{ textAlign: 'right' }} className="mono">
                    {p.holds}
                  </td>
                  <td
                    style={{ textAlign: 'right', color: p.outstanding > 0 ? 'var(--color-danger)' : undefined }}
                    className="mono"
                  >
                    {p.outstanding}
                  </td>
                </tr>
              ))}
              {summary.unowned > 0 && (
                <tr>
                  <td style={{ color: 'var(--color-danger)' }}>Nobody</td>
                  <td style={{ textAlign: 'right' }} className="mono">
                    {summary.unowned}
                  </td>
                  <td style={{ textAlign: 'right' }} className="mono">
                    —
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Findings ────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2 className="section-title">What the records show against the plan</h2>
        {findings.length === 0 ? (
          <p className="text-secondary" style={{ fontSize: 13.5, marginBottom: 0 }}>
            Every inspection point in this plan has a party, and none is waiting on a signature that has not been asked
            for. That says the plan was followed. It does not say the plant is ready — that reading is on the{' '}
            <Link href="/dossier" className="link">
              handover pack
            </Link>
            .
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 110 }}></th>
                <th>What</th>
                <th style={{ width: 130 }}>Owed by</th>
                <th>Why it matters</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f, i) => (
                <tr key={`${f.activity.id}-${i}`}>
                  <td>
                    <span className={severityBadgeClass(f.severity)} style={{ fontSize: 10 }}>
                      {severityWord(f.severity)}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{f.title}</div>
                    <div className="text-secondary mono" style={{ fontSize: 11 }}>
                      {f.activity.tag} · {inspectionLabel(f.activity.inspectionType)}
                    </div>
                  </td>
                  <td style={{ fontSize: 12.5, fontWeight: f.owes === 'Nobody named' ? 600 : 400 }}>{f.owes}</td>
                  <td className="text-secondary" style={{ fontSize: 12.5 }}>
                    {f.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── The plan itself ─────────────────────────────────────────────── */}
      {matrixView ? (
        <div className="card" style={{ marginTop: 18 }}>
          <h2 className="section-title">The plan, as a matrix</h2>
          <LevelLegend style={{ marginBottom: 10 }} />
          <p className="text-secondary" style={{ fontSize: 12, margin: '0 0 12px' }}>
            {MATRIX_KEY}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Activity</th>
                  <th style={{ width: 60 }}>Level</th>
                  {columns.map((c) => (
                    <th key={c.party} style={{ textAlign: 'center', width: 70 }}>
                      {c.label}
                    </th>
                  ))}
                  {anyUnassigned && (
                    <th style={{ textAlign: 'center', width: 90 }}>{UNASSIGNED_COLUMN}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.entity}-${r.id}`}>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {r.tag}
                    </td>
                    <td style={{ fontSize: 12.5 }}>{r.activity}</td>
                    <td>
                      <LevelBadge level={r.level} dot={false} />
                    </td>
                    {columns.map((c) => (
                      <td key={c.party} style={{ textAlign: 'center', fontWeight: 600, fontSize: 12.5 }}>
                        {matrixCell(r, c.party)}
                      </td>
                    ))}
                    {anyUnassigned && (
                      <td
                        style={{
                          textAlign: 'center',
                          fontWeight: 600,
                          fontSize: 12.5,
                          // Only a Hold or Witness Point nobody can release is
                          // alarming. A surveillance check with no party named
                          // is untidy, not urgent.
                          color: unassignedIsSerious(r) ? 'var(--color-danger)' : undefined,
                        }}
                      >
                        {unassignedCell(r)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        LEVELS.map((level) => {
          const atLevel = rows.filter((r) => r.level === level.value)
          if (atLevel.length === 0) return null
          return (
            <div className="card" style={{ marginTop: 18, ...levelRuleStyle(level.value) }} key={level.value}>
              <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <LevelBadge level={level.value} format="full" />
                <span className="text-secondary" style={{ fontWeight: 400, fontSize: 12.5 }}>
                  {atLevel.length} activit{atLevel.length === 1 ? 'y' : 'ies'}
                </span>
              </h2>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Tag</th>
                      <th>Activity</th>
                      <th style={{ width: 120 }}>Point</th>
                      <th style={{ width: 170 }}>Held by</th>
                      <th style={{ width: 150 }}>State</th>
                      <th style={{ width: 250 }}>Set who holds it</th>
                    </tr>
                  </thead>
                  <tbody>
                    {atLevel.map((r) => (
                      <tr key={`${r.entity}-${r.id}`}>
                        <td className="mono" style={{ fontSize: 12 }}>
                          {r.tag}
                        </td>
                        <td style={{ fontSize: 13 }}>
                          {r.activity}
                          {r.criteria && (
                            <div className="text-secondary mono" style={{ fontSize: 11 }}>
                              {r.criteria}
                              {r.reference ? ` · ${r.reference}` : ''}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={inspectionBadgeClass(r.inspectionType)} style={{ fontSize: 10 }}>
                            {inspectionCode(r.inspectionType)} — {inspectionLabel(r.inspectionType)}
                          </span>
                        </td>
                        <td style={{ fontSize: 12.5 }}>
                          {r.holder.party ? (
                            <>
                              {partyShort(r.holder.party)}
                              <div className="text-secondary" style={{ fontSize: 10.5 }}>
                                {PARTY_SOURCE_LABELS[r.holder.source]}
                              </div>
                            </>
                          ) : carriesRelease(r.inspectionType) ? (
                            <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>Nobody</span>
                          ) : (
                            <span className="text-secondary">—</span>
                          )}
                        </td>
                        <td>
                          {carriesRelease(r.inspectionType) ? (
                            <>
                              <span className={releaseBadgeClass(r.release)} style={{ fontSize: 10 }}>
                                {releaseLabel(r.release)}
                              </span>
                              {r.signedBy && (
                                <div className="text-secondary" style={{ fontSize: 10.5 }}>
                                  {r.signedBy}
                                  {r.signedCompany ? ` · ${r.signedCompany}` : ''}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="text-secondary" style={{ fontSize: 12 }}>
                              Recorded, not released
                            </span>
                          )}
                        </td>
                        {/* Say who holds it, here, without a round trip through
                            Excel. Both fields are decisions, so both are
                            audited by name with the old value beside the new. */}
                        <td>
                          <form
                            action={setPointParty}
                            style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}
                          >
                            <input type="hidden" name="entity" value={r.entity} />
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="tag" value={r.tag} />
                            <input type="hidden" name="activity" value={r.activity} />
                            <input type="hidden" name="scope" value={scope} />
                            <input type="hidden" name="was_party" value={r.holder.source === 'explicit' ? r.holder.party ?? '' : ''} />
                            <input type="hidden" name="was_type" value={r.inspectionType} />
                            <select
                              name="inspection_type"
                              defaultValue={r.inspectionType}
                              className="input"
                              style={{ fontSize: 11.5, padding: '3px 5px', width: 124 }}
                              aria-label="Point type"
                            >
                              {INSPECTION_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.code} — {t.label.replace(' Point', '')}
                                </option>
                              ))}
                            </select>
                            <select
                              name="party"
                              defaultValue={r.holder.source === 'explicit' ? r.holder.party ?? '' : ''}
                              className="input"
                              style={{ fontSize: 11.5, padding: '3px 5px', width: 150 }}
                              aria-label="Held by"
                            >
                              {/* Nobody is a real answer, not a missing one.
                                  On a row whose party came from the project
                                  default, the selector reads "Nobody" while the
                                  column beside it reads "CxA", which looks like
                                  a bug and is not: the default is a fallback,
                                  nothing is written against the activity, and
                                  choosing that same party here is what turns
                                  the assumption into an agreement. So the
                                  option says so. */}
                              <option value="">
                                {r.holder.source === 'convention'
                                  ? `Nobody — default gives ${partyShort(r.holder.party)}`
                                  : 'Nobody'}
                              </option>
                              {PARTIES.map((p) => (
                                <option key={p.value} value={p.value}>
                                  {partyShort(p.value)}
                                </option>
                              ))}
                            </select>
                            <button type="submit" className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}>
                              Set
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}

      {rows.length === 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <p className="text-secondary" style={{ fontSize: 14, marginBottom: 0 }}>
            Nothing to plan yet. Load checklists on the{' '}
            <Link href="/checklists" className="link">
              Checklists
            </Link>{' '}
            page and test records on the{' '}
            <Link href="/tests" className="link">
              Tests
            </Link>{' '}
            page, and every one of them appears here with its point type.
          </p>
        </div>
      )}

      {/* ── The project's standing defaults ─────────────────────────────── */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2 className="section-title">The project&rsquo;s defaults</h2>
        <p className="text-secondary" style={{ fontSize: 12.5, margin: '0 0 4px' }}>
          &ldquo;At L4, Hold Points are the Client&rsquo;s, unless the activity says otherwise.&rdquo; Defaults exist so
          a thousand imported rows are not all unowned. A point assigned this way prints in brackets on the ITP,
          because it is what this project usually does and not what anybody agreed for that activity.
        </p>
        <p className="text-secondary" style={{ fontSize: 12.5, margin: '0 0 12px' }}>
          <strong>Setting one writes nothing onto any record.</strong> It is a fallback applied while the plan is read,
          so removing it later puts every point that leant on it straight back to unowned — visibly, on this page. If a
          default stamped a party onto two thousand rows, deleting it afterwards would leave them all claiming an
          agreement nobody made.
        </p>

        {sp.conv === 'ok' && <p className="badge badge-success" style={{ display: 'inline-block' }}>Default set. No record was changed.</p>}
        {sp.conv === 'removed' && (
          <p className="badge badge-neutral" style={{ display: 'inline-block' }}>
            Removed. Any point that was relying on it now has no party.
          </p>
        )}
        {sp.conv === 'norelease' && (
          <p className="badge badge-warning" style={{ display: 'inline-block' }}>
            Surveillance and Review points carry no release, so nobody needs to hold them.
          </p>
        )}
        {sp.conv === 'denied' && (
          <p className="badge badge-danger" style={{ display: 'inline-block' }}>Your role cannot set project defaults.</p>
        )}

        <table className="table" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Level</th>
              <th>Point type</th>
              <th>Falls to</th>
              <th style={{ width: 200 }}>Why</th>
              <th style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {plan.conventions.length === 0 && (
              <tr>
                <td colSpan={5} className="text-secondary" style={{ fontSize: 12.5 }}>
                  No defaults. Every party on this plan was written against its own activity — which is the stronger
                  position to be in, as long as the points are not sitting unowned.
                </td>
              </tr>
            )}
            {plan.conventions.map((c, i) => (
              <tr key={i} style={levelRuleStyle(c.level)}>
                <td>
                  <LevelBadge level={c.level} format="full" />
                </td>
                <td style={{ fontSize: 12.5 }}>{inspectionLabel(c.inspection_type)}</td>
                <td style={{ fontSize: 12.5 }}>{partyLabel(c.party)}</td>
                <td className="text-secondary" style={{ fontSize: 12 }}>
                  {c.note ?? '—'}
                </td>
                <td>
                  <form action={removeConvention}>
                    <input type="hidden" name="level" value={c.level} />
                    <input type="hidden" name="inspection_type" value={c.inspection_type} />
                    <button type="submit" className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}>
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <form
          action={addConvention}
          style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}
        >
          <select name="level" required className="input" style={{ fontSize: 12.5, maxWidth: 250 }} defaultValue="">
            <option value="" disabled>
              At which level…
            </option>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          <select name="inspection_type" required className="input" style={{ fontSize: 12.5, maxWidth: 170 }} defaultValue="">
            <option value="" disabled>
              …which kind of point…
            </option>
            {/* Only the two that carry a release. A default for a surveillance
                check would put a party on four hundred rows that will never be
                waiting on anybody. */}
            {INSPECTION_TYPES.filter((t) => t.value === 'hold' || t.value === 'witness').map((t) => (
              <option key={t.value} value={t.value}>
                {t.code} — {t.label}
              </option>
            ))}
          </select>
          <select name="party" required className="input" style={{ fontSize: 12.5, maxWidth: 220 }} defaultValue="">
            <option value="" disabled>
              …falls to whom
            </option>
            {PARTIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <input name="note" placeholder="Why, in a few words (optional)" className="input" style={{ fontSize: 12.5, maxWidth: 280 }} />
          <button type="submit" className="btn btn-primary btn-sm">
            Set default
          </button>
        </form>
      </div>

      <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 18 }}>
        This plan is derived from the checklist and test registers every time the page loads. Nothing on it is stored,
        so it can never disagree with the records it describes.
      </p>
    </>
  )
}
