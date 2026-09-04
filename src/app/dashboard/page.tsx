import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { getActor } from '@/lib/audit'
import { loadSubjectIndex } from '@/data/subjects'
import { loadProjectRollup, rollupFor } from '@/data/rollup'
import { loadGates } from '@/data/gates'
import { loadDocuments } from '@/data/requirements'
import { effectiveRevision } from '@/lib/requirements'
import { isDerived } from '@/lib/gates'
import { HeroScene } from '@/components/HeroScene'
import { SubjectMeter, VerdictBadge } from '@/components/SubjectMeter'
import { childrenOf, subjectTitle, subjectLabel } from '@/lib/subjects'
import {
  computeNextActions,
  computeHealth,
  overallHealth,
  urgencyBadgeClass,
  URGENCY_LABELS,
  type Urgency,
} from '@/lib/next-actions'
import DashboardCharts from '@/components/DashboardCharts'

export const dynamic = 'force-dynamic'

// A dimension's bar. Untracked dimensions get a hatched, colourless track so
// they read as "we do not know" rather than as "zero".
function HealthRow({
  label,
  percent,
  detail,
  href,
}: {
  label: string
  percent: number | null
  detail: string
  href: string
}) {
  const tracked = percent !== null
  const colour =
    !tracked
      ? 'var(--color-neutral-solid)'
      : percent >= 90
        ? 'var(--color-success-solid)'
        : percent >= 50
          ? 'var(--color-warning-solid, #d97706)'
          : 'var(--color-danger-solid)'

  return (
    <Link
      href={href}
      style={{
        display: 'grid',
        gridTemplateColumns: '150px 1fr 54px',
        gap: 14,
        alignItems: 'center',
        padding: '9px 0',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, opacity: tracked ? 1 : 0.55 }}>{label}</div>
        <div className="text-secondary" style={{ fontSize: 11.5, lineHeight: 1.35 }}>
          {detail}
        </div>
      </div>
      <div
        aria-hidden="true"
        style={{
          height: 7,
          borderRadius: 4,
          background: tracked
            ? 'var(--color-neutral-bg, rgba(0,0,0,.08))'
            : 'repeating-linear-gradient(135deg, rgba(128,128,128,.16) 0 5px, transparent 5px 10px)',
          overflow: 'hidden',
        }}
      >
        {tracked && (
          <div style={{ width: `${Math.max(percent, 2)}%`, height: '100%', background: colour }} />
        )}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 13,
          textAlign: 'right',
          fontWeight: tracked ? 600 : 400,
          color: tracked ? undefined : 'var(--color-text-secondary)',
        }}
      >
        {tracked ? `${percent}%` : '—'}
      </div>
    </Link>
  )
}

export default async function CommandCenter() {
  const project = await getCurrentProject()
  const actor = await getActor(project?.id ?? null)

  const index = await loadSubjectIndex(project?.id ?? null)
  const rollup = await loadProjectRollup(project?.id ?? null, index)
  const gates = await loadGates(project?.id ?? null, rollup)
  const { documents, revisionsByDocument } = await loadDocuments(project?.id ?? null)

  const overall = rollupFor(rollup, index.root ? { type: 'project', id: index.root.id } : null)

  const { data: instrumentRows } = project
    ? await supabase.from('instruments').select('instrument_id, calibration_expiry').eq('project_id', project.id)
    : { data: [] as { instrument_id: string; calibration_expiry: string | null }[] }

  const { data: contactRows } = project
    ? await supabase.from('project_contacts').select('email').eq('project_id', project.id)
    : { data: [] as { email: string | null }[] }

  const { data: noticeRows } = project
    ? await supabase
        .from('notifications')
        .select('entity_label, status')
        .eq('project_id', project.id)
        .eq('kind', 'inspection_notice')
    : { data: [] as { entity_label: string | null; status: string | null }[] }

  const { data: staleRows } = project
    ? await supabase.from('requirements').select('document_id, source_revision').eq('project_id', project.id)
    : { data: [] as { document_id: string | null; source_revision: string | null }[] }

  const effectiveByDocument = new Map<string, string>()
  let documentsWithEffective = 0
  for (const d of documents) {
    const eff = effectiveRevision(revisionsByDocument.get(d.id) ?? [])
    if (eff) {
      effectiveByDocument.set(d.id, eff.rev)
      documentsWithEffective += 1
    }
  }

  const staleRequirements = (staleRows ?? []).filter((r) => {
    if (!r.document_id || !r.source_revision) return false
    const eff = effectiveByDocument.get(r.document_id)
    return Boolean(eff && eff !== r.source_revision)
  }).length

  const unsentNotices = (noticeRows ?? []).filter((n) => n.status !== 'sent')
  const contactsWithEmail = (contactRows ?? []).filter((c) => c.email && c.email.includes('@')).length

  const gateSummaries = gates.map((g) => ({
    id: g.id,
    name: g.name,
    blockers: g.result.blockers,
    unansweredManual: g.result.outcomes
      .filter((o) => !isDerived(o.rule.rule_kind) && o.outcome === 'unanswered' && o.rule.mandatory !== false)
      .map((o) => o.rule.label),
    passed: g.result.passed,
  }))

  const actions = computeNextActions({
    checks: overall.checks,
    tests: overall.tests,
    issues: overall.issues,
    requirements: overall.requirements,
    instruments: instrumentRows ?? [],
    gates: gateSummaries,
    unsentNotices: unsentNotices.map((n) => ({ label: n.entity_label })),
    staleRequirements,
    contactsWithEmail,
    hasRequirements: overall.requirements.length > 0,
    hasGates: gates.length > 0,
  })

  const dimensions = computeHealth({
    checks: overall.checks,
    tests: overall.tests,
    issues: overall.issues,
    requirements: overall.requirements,
    documentCount: documents.length,
    documentsWithEffectiveRevision: documentsWithEffective,
    gates: gates.map((g) => ({ passed: g.result.passed })),
  })

  const health = overallHealth(dimensions)

  const topLevel = index.root ? childrenOf(index, { type: 'project', id: index.root.id }) : []

  const grouped = new Map<Urgency, typeof actions>()
  for (const a of actions) {
    const list = grouped.get(a.urgency)
    if (list) list.push(a)
    else grouped.set(a.urgency, [a])
  }

  const firstName = (actor.name || actor.email).split(/[\s@]/)[0]

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="hero rise rise-1">
        <HeroScene />
        <div className="hero-scrim" />
        <div className="hero-inner">
          <p className="hero-eyebrow">Project command centre</p>
          <h1>{project ? project.name : 'No project selected'}</h1>
          <p>
            {actions.length === 0
              ? 'Nothing is waiting on anybody. Either the project is genuinely clear, or there is not enough recorded yet for anything to be wrong.'
              : `${actions.length} thing${actions.length === 1 ? '' : 's'} need attention, worked out from the records as they stand right now.`}
          </p>

          <div className="hero-figure">
            <span className="hero-figure-value">{health.percent === null ? '—' : `${health.percent}%`}</span>
            <span className="hero-figure-label">
              project health
              <br />
              across {health.tracked} tracked area{health.tracked === 1 ? '' : 's'}
            </span>
          </div>
          <div className="hero-meter">
            <div className="hero-meter-fill" style={{ width: `${health.percent ?? 0}%` }} />
          </div>

          {project && (
            <div className="hero-meta">
              {project.client && (
                <div className="hero-meta-item">
                  <span className="hero-meta-label">Client</span>
                  <span className="hero-meta-value">{project.client}</span>
                </div>
              )}
              {project.location && (
                <div className="hero-meta-item">
                  <span className="hero-meta-label">Location</span>
                  <span className="hero-meta-value">{project.location}</span>
                </div>
              )}
              {project.target_date && (
                <div className="hero-meta-item">
                  <span className="hero-meta-label">Target</span>
                  <span className="hero-meta-value mono">{project.target_date}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <DashboardCharts projectId={project?.id ?? null} project={project ?? null} />

      {/* ── What to do today ─────────────────────────────────────── */}
      <h2 className="section-title" style={{ marginTop: 30 }}>
        {firstName ? `What needs you, ${firstName}` : 'What needs attention'}
      </h2>
      <p className="text-secondary" style={{ fontSize: 13, marginTop: -6 }}>
        Ordered by what it costs to leave it alone. Every line comes from a record — fix the record and the line
        disappears by itself. There is nothing here to tick off.
      </p>

      {actions.length === 0 ? (
        <div className="alert alert-info">
          Nothing outstanding. If that seems wrong, it usually means the work has not been recorded yet — start
          from <Link href="/assets" className="link">Assets</Link> and see what has nothing against it.
        </div>
      ) : (
        (['safety', 'blocking', 'due', 'setup'] as Urgency[]).map((urgency) => {
          const list = grouped.get(urgency)
          if (!list || list.length === 0) return null
          return (
            <div key={urgency} style={{ marginBottom: 18 }}>
              <div
                className="text-secondary mono"
                style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', margin: '14px 0 8px' }}
              >
                {URGENCY_LABELS[urgency]}
              </div>
              {list.map((a, i) => (
                <div
                  key={`${urgency}-${i}`}
                  className="card"
                  style={{
                    marginBottom: 10,
                    borderLeft: `4px solid ${
                      urgency === 'safety'
                        ? 'var(--color-danger-solid)'
                        : urgency === 'blocking'
                          ? 'var(--color-warning-solid, #d97706)'
                          : urgency === 'due'
                            ? 'var(--color-primary)'
                            : 'var(--color-neutral-solid)'
                    }`,
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ flex: '1 1 340px' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5 }}>
                        <span className={urgencyBadgeClass(a.urgency)}>{URGENCY_LABELS[a.urgency]}</span>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 15.5 }}>{a.title}</div>
                      <p className="text-secondary" style={{ fontSize: 13.5, margin: '6px 0 0' }}>
                        {a.why}
                      </p>
                    </div>
                    <Link href={a.href} className="btn btn-secondary btn-sm">
                      {a.cta}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )
        })
      )}

      {/* ── Health across the lifecycle ──────────────────────────── */}
      <h2 className="section-title" style={{ marginTop: 30 }}>
        Where the project stands
      </h2>

      <div className="card">
        {dimensions.map((d) => (
          <HealthRow key={d.key} label={d.label} percent={d.percent} detail={d.detail} href={d.href} />
        ))}
        <p className="text-secondary" style={{ fontSize: 12, marginTop: 14, marginBottom: 0 }}>
          Areas shown with a hatched bar are <strong>not tracked yet</strong> — there is no module behind them.
          They are deliberately blank rather than 0%, because a zero would read as a problem with the work rather
          than a gap in the software. Only the tracked areas count towards the project figure.
        </p>
      </div>

      {/* ── Systems ──────────────────────────────────────────────── */}
      {topLevel.length > 0 && (
        <>
          <h2 className="section-title" style={{ marginTop: 30 }}>
            Top level
          </h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>State</th>
                  <th style={{ minWidth: 170 }}>Readiness</th>
                  <th style={{ textAlign: 'right' }}>Open issues</th>
                  <th style={{ textAlign: 'right' }}>Held</th>
                </tr>
              </thead>
              <tbody>
                {topLevel.map((s) => {
                  const r = rollupFor(rollup, { type: s.type, id: s.id })
                  return (
                    <tr key={`${s.type}:${s.id}`}>
                      <td>
                        <Link href={`/assets/${s.type}/${s.id}`} className="link" style={{ fontWeight: 500 }}>
                          {subjectTitle(s)}
                        </Link>
                        <div className="text-secondary" style={{ fontSize: 11.5 }}>
                          {subjectLabel(s.type)}
                        </div>
                      </td>
                      <td>
                        <VerdictBadge readiness={r.readiness} />
                      </td>
                      <td>
                        <SubjectMeter readiness={r.readiness} width={110} />
                      </td>
                      <td className="mono" style={{ textAlign: 'right', fontSize: 12.5 }}>
                        {r.openIssues || '—'}
                      </td>
                      <td
                        className="mono"
                        style={{
                          textAlign: 'right',
                          fontSize: 12.5,
                          color: r.heldPoints > 0 ? 'var(--color-danger)' : undefined,
                        }}
                      >
                        {r.heldPoints || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Gates ────────────────────────────────────────────────── */}
      {gates.length > 0 && (
        <>
          <h2 className="section-title" style={{ marginTop: 30 }}>
            Gates
          </h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Gate</th>
                  <th>State</th>
                  <th style={{ textAlign: 'right' }}>Rules met</th>
                  <th>Holding it</th>
                </tr>
              </thead>
              <tbody>
                {gates.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <Link href={`/gates/${g.id}`} className="link" style={{ fontWeight: 500 }}>
                        {g.name}
                      </Link>
                    </td>
                    <td>
                      <span
                        className={
                          g.result.notMet > 0
                            ? 'badge badge-danger'
                            : g.result.passed
                              ? 'badge badge-success'
                              : 'badge badge-warning'
                        }
                      >
                        {g.result.notMet > 0 ? 'Not met' : g.result.passed ? 'Supported' : 'Incomplete'}
                      </span>
                    </td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 12.5 }}>
                      {g.result.mandatoryMet}/{g.result.mandatoryTotal}
                    </td>
                    <td className="text-secondary" style={{ fontSize: 12.5 }}>
                      {g.result.blockers[0] ?? '—'}
                      {g.result.blockers.length > 1 && ` (+${g.result.blockers.length - 1})`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 20 }}>
        Everything on this page is worked out from the records at the moment you loaded it. Nothing is stored, so
        no number here can disagree with the records underneath it.
      </p>
    </>
  )
}
