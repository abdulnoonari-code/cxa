import Link from 'next/link'
import { getCurrentProject } from '@/lib/project'
import { getActor } from '@/lib/audit'
import { can, ROLES } from '@/lib/roles'
import { loadSubjectIndex } from '@/data/subjects'
import { loadProjectRollup } from '@/data/rollup'
import { loadGate, loadGateSignatures } from '@/data/gates'
import { getSubject, subjectTitle, subjectLabel, breadcrumb } from '@/lib/subjects'
import {
  gateVerdict,
  gateBadgeClass,
  outcomeBadgeClass,
  outcomeLabel,
  ruleKindLabel,
  isDerived,
  CONFIRMATION_STATUSES,
} from '@/lib/gates'
import { DECISIONS, decisionLabel, decisionBadgeClass } from '@/lib/inspection'
import { confirmRule, signGate } from '../actions'

export const dynamic = 'force-dynamic'

function when(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function GatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const project = await getCurrentProject()
  const actor = await getActor(project?.id ?? null)
  const mayConfirm = can(actor.role, 'record')
  const maySign = can(actor.role, 'approve')

  const index = await loadSubjectIndex(project?.id ?? null)
  const rollup = await loadProjectRollup(project?.id ?? null, index)
  const gate = await loadGate(project?.id ?? null, id, rollup)

  if (!gate) {
    return (
      <>
        <h1 className="page-title">Gate not found</h1>
        <p className="page-subtitle">
          It may belong to a different project, or it may have been removed.{' '}
          <Link href="/gates" className="link">
            Back to Readiness Gates
          </Link>
          .
        </p>
      </>
    )
  }

  const signatures = await loadGateSignatures(project?.id ?? null, gate.id)

  const subject =
    gate.subject_type && gate.subject_id
      ? getSubject(index, { type: gate.subject_type as never, id: gate.subject_id })
      : null
  const trail = subject ? breadcrumb(index, { type: subject.type, id: subject.id }) : []

  // Grouped by category so a sixteen-item safety gate reads as a form, not a
  // wall. Order is preserved within each group.
  const groups = new Map<string, typeof gate.result.outcomes>()
  for (const o of gate.result.outcomes) {
    const key = o.rule.category ?? 'Other'
    const list = groups.get(key)
    if (list) list.push(o)
    else groups.set(key, [o])
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10, fontSize: 13 }}>
        <Link href="/gates" className="link">
          Readiness Gates
        </Link>
        {trail.map((s) => (
          <span key={`${s.type}:${s.id}`} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ opacity: 0.4 }}>›</span>
            <Link href={`/assets/${s.type}/${s.id}`} className="link">
              {subjectTitle(s)}
            </Link>
          </span>
        ))}
      </div>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title" style={{ margin: 0, fontSize: 26 }}>
              {gate.name}
            </h1>
            <div className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>
              {subject ? `${subjectLabel(subject.type)} · ${subjectTitle(subject)}` : 'Whole project'}
              {gate.planned_for ? ` · planned for ${when(gate.planned_for)}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className={gateBadgeClass(gate.result)}>{gateVerdict(gate.result)}</span>
            <div className="mono" style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>
              {gate.result.percent}%
            </div>
            <div className="text-secondary" style={{ fontSize: 11.5 }}>
              {gate.result.mandatoryMet} of {gate.result.mandatoryTotal} mandatory rules
            </div>
          </div>
        </div>
      </div>

      {gate.result.blockers.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--color-danger-solid)', marginBottom: 20 }}>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            Why this gate is not met
          </h2>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {gate.result.blockers.map((b, i) => (
              <li key={i} style={{ color: 'var(--color-danger)', marginBottom: 5, fontSize: 14 }}>
                {b}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── The rules ──────────────────────────────────────────────── */}
      {[...groups.entries()].map(([category, outcomes]) => (
        <div key={category} style={{ marginBottom: 22 }}>
          <h2 className="section-title">{category}</h2>
          {outcomes.map((o) => {
            const manual = !isDerived(o.rule.rule_kind)
            return (
              <div
                key={o.rule.id}
                className="card"
                style={{
                  marginBottom: 10,
                  borderLeft: `3px solid ${
                    o.outcome === 'met'
                      ? 'var(--color-success-solid)'
                      : o.outcome === 'not_met'
                        ? 'var(--color-danger-solid)'
                        : o.outcome === 'not_applicable'
                          ? 'var(--color-neutral-solid)'
                          : 'var(--color-warning-solid, #d97706)'
                  }`,
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className={outcomeBadgeClass(o.outcome)}>{outcomeLabel(o.outcome)}</span>
                  <span style={{ fontWeight: 600, fontSize: 14.5, flex: '1 1 300px' }}>{o.rule.label}</span>
                  {o.rule.mandatory === false && <span className="badge badge-neutral">not mandatory</span>}
                  <span className="text-secondary mono" style={{ fontSize: 10.5 }}>
                    {manual ? 'CONFIRMED BY A PERSON' : 'FROM THE RECORDS'}
                  </span>
                </div>

                <div className="text-secondary" style={{ fontSize: 13, marginTop: 6 }}>
                  {o.reason}
                </div>

                {o.detail.length > 0 && (
                  <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                    {o.detail.map((d, i) => (
                      <li key={i} style={{ fontSize: 13, color: 'var(--color-danger)', marginBottom: 3 }}>
                        {d}
                      </li>
                    ))}
                  </ul>
                )}

                {o.rule.confirmed_by && (
                  <div className="text-secondary" style={{ fontSize: 12, marginTop: 8 }}>
                    Answered by {o.rule.confirmed_by} · {when(o.rule.confirmed_at)}
                  </div>
                )}

                {manual && mayConfirm && (
                  <form action={confirmRule} style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <input type="hidden" name="rule_id" value={o.rule.id} />
                    <input type="hidden" name="gate_id" value={gate.id} />
                    <label className="field" style={{ minWidth: 150 }}>
                      Answer
                      <select
                        key={`s-${o.rule.id}-${o.rule.status}`}
                        name="status"
                        className="input"
                        defaultValue={o.rule.status ?? 'pending'}
                      >
                        {CONFIRMATION_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field" style={{ flex: '1 1 260px' }}>
                      How you know
                      <input
                        name="evidence"
                        className="input"
                        defaultValue={o.rule.evidence ?? ''}
                        placeholder="Permit no. 4471, held by S. Prasert"
                      />
                    </label>
                    <button type="submit" className="btn btn-secondary btn-sm">
                      Save
                    </button>
                  </form>
                )}

                {!manual && (
                  <p className="text-secondary" style={{ fontSize: 11.5, marginTop: 8, marginBottom: 0 }}>
                    {ruleKindLabel(o.rule.rule_kind)} — worked out from the records. It cannot be answered by hand;
                    change the records and this changes with them.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      ))}

      {/* ── Authorisation ──────────────────────────────────────────── */}
      <h2 className="section-title" style={{ marginTop: 30 }}>
        Authorisation
      </h2>
      <p className="text-secondary" style={{ fontSize: 13, marginTop: -6 }}>
        The gate above reports what the records show. Whether work proceeds is decided here, by people, and their
        signatures cannot afterwards be edited or deleted by anyone.
      </p>

      {signatures.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Signed by</th>
                <th>As</th>
                <th>Decision</th>
                <th>Comment</th>
              </tr>
            </thead>
            <tbody>
              {signatures.map((s) => (
                <tr key={s.id}>
                  <td className="mono" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                    {when(s.created_at)}
                  </td>
                  <td style={{ fontSize: 13.5, fontWeight: 500 }}>{s.signed_name || s.signer_name}</td>
                  <td style={{ fontSize: 12.5 }}>
                    {s.signer_role}
                    {s.signer_company ? ` · ${s.signer_company}` : ''}
                  </td>
                  <td>
                    <span className={decisionBadgeClass(s.decision)}>{decisionLabel(s.decision)}</span>
                  </td>
                  <td className="text-secondary" style={{ fontSize: 12.5 }}>
                    {s.comment ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {maySign ? (
        <div className="card">
          {gate.result.notMet > 0 && (
            <div className="alert alert-danger" style={{ marginTop: 0 }}>
              <strong>{gate.result.notMet} mandatory rule{gate.result.notMet === 1 ? '' : 's'} not met.</strong> You
              can still sign — the decision is yours and the app does not prevent it — but the unmet rules are
              listed above and your signature is recorded against this state of the records.
            </div>
          )}
          <form action={signGate} style={{ display: 'grid', gap: 12 }}>
            <input type="hidden" name="gate_id" value={gate.id} />
            <input type="hidden" name="label" value={gate.name} />
            <label className="field">
              Decision
              <select name="decision" className="input" defaultValue="approved">
                {DECISIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr' }}>
              <label className="field">
                Type your full name to sign *
                <input name="signed_name" required className="input" placeholder={actor.name} />
              </label>
              <label className="field">
                Signing as
                <select name="as_role" className="input" defaultValue="">
                  <option value="">My project role</option>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.label}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Company
                <input name="company" className="input" />
              </label>
            </div>
            <label className="field">
              Comment
              <input name="comment" className="input" placeholder="What you are relying on, or what must still be done" />
            </label>
            <p className="text-secondary" style={{ fontSize: 12, margin: 0 }}>
              A gate rule asking for signatures from named roles is met by signing here as that role. Signing
              records your name, role, company, the wording of the declaration, your device and the time —
              permanently.
            </p>
            <div>
              <button type="submit" className="btn btn-primary">
                Sign
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="card">
          <p className="text-secondary" style={{ fontSize: 14, marginBottom: 0 }}>
            Your role cannot authorise a gate. That needs a Commissioning Manager, QA/QC, Client or Project Admin.
          </p>
        </div>
      )}
    </>
  )
}
