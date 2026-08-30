import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { loadProjectRollup, rollupFor } from '@/data/rollup'
import { loadGates } from '@/data/gates'
import { isDerived } from '@/lib/gates'
import {
  buildDailyReport,
  today,
  shiftDay,
  longDate,
  timeOf,
  emptyDayNote,
  type AuditEvent,
} from '@/lib/daily-report'
import { computeNextActions, urgencyBadgeClass, URGENCY_LABELS } from '@/lib/next-actions'

export const dynamic = 'force-dynamic'

export default async function DailyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>
}) {
  const { day: dayParam } = await searchParams
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : today()

  const project = await getCurrentProject()

  // A generous window either side, so a timezone offset never clips the day.
  const { data: auditRows } = project
    ? await supabase
        .from('audit_log')
        .select('id, actor_name, actor_email, actor_role, action, entity, entity_id, entity_label, old_value, new_value, comment, created_at')
        .eq('project_id', project.id)
        .gte('created_at', `${shiftDay(day, -1)}T00:00:00`)
        .lte('created_at', `${shiftDay(day, 1)}T23:59:59`)
        .order('created_at', { ascending: true })
    : { data: [] as AuditEvent[] }

  const report = buildDailyReport((auditRows ?? []) as AuditEvent[], day)

  // Constraints and tomorrow's plan come from the state as it stands now, not
  // from that day — they are what is still in the way.
  const index = await loadSubjectIndex(project?.id ?? null)
  const rollup = await loadProjectRollup(project?.id ?? null, index)
  const gates = await loadGates(project?.id ?? null, rollup)
  const overall = rollupFor(rollup, index.root ? { type: 'project', id: index.root.id } : null)

  const { data: instrumentRows } = project
    ? await supabase.from('instruments').select('instrument_id, calibration_expiry').eq('project_id', project.id)
    : { data: [] as { instrument_id: string; calibration_expiry: string | null }[] }

  const { data: noticeRows } = project
    ? await supabase.from('notifications').select('entity_label, status').eq('project_id', project.id).eq('kind', 'inspection_notice')
    : { data: [] as { entity_label: string | null; status: string | null }[] }

  const actions = computeNextActions({
    checks: overall.checks,
    tests: overall.tests,
    issues: overall.issues,
    requirements: overall.requirements,
    instruments: instrumentRows ?? [],
    gates: gates.map((g) => ({
      id: g.id,
      name: g.name,
      blockers: g.result.blockers,
      unansweredManual: g.result.outcomes
        .filter((o) => !isDerived(o.rule.rule_kind) && o.outcome === 'unanswered' && o.rule.mandatory !== false)
        .map((o) => o.rule.label),
      passed: g.result.passed,
    })),
    unsentNotices: (noticeRows ?? []).filter((n) => n.status !== 'sent').map((n) => ({ label: n.entity_label })),
    staleRequirements: 0,
    contactsWithEmail: 1,
    hasRequirements: overall.requirements.length > 0,
    hasGates: gates.length > 0,
  })

  const figures = [
    { label: 'Test entries', value: report.figures.testsRecorded },
    { label: 'Check entries', value: report.figures.checksRecorded },
    { label: 'Failures', value: report.figures.failures, danger: report.figures.failures > 0 },
    { label: 'Notices', value: report.figures.noticesIssued },
    { label: 'Signatures', value: report.figures.signatures },
    { label: 'Gate answers', value: report.figures.prerequisitesAnswered },
  ]

  return (
    <>
      <h1 className="page-title">Daily Report</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — {longDate(day)}. Built from the audit log, which nobody
        can edit or delete, so this is the record of the day rather than a summary written afterwards.
      </p>

      {/* ── Day picker ───────────────────────────────────────────── */}
      <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Link href={`/reports/daily?day=${shiftDay(day, -1)}`} className="btn btn-secondary btn-sm">
          ← Previous day
        </Link>
        <form method="get" style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <label className="field">
            Date
            <input type="date" name="day" defaultValue={day} className="input" />
          </label>
          <button type="submit" className="btn btn-secondary btn-sm">
            Go
          </button>
        </form>
        {day < today() && (
          <Link href={`/reports/daily?day=${shiftDay(day, 1)}`} className="btn btn-secondary btn-sm">
            Next day →
          </Link>
        )}
        {day !== today() && (
          <Link href="/reports/daily" className="btn-link">
            Today
          </Link>
        )}
        <div style={{ flex: 1 }} />
        <a href={`/reports/daily/export?day=${day}`} className="btn btn-primary btn-sm">
          Download as Excel
        </a>
      </div>

      {/* ── Figures ──────────────────────────────────────────────── */}
      <div className="stat-grid" style={{ marginTop: 20 }}>
        {figures.map((f) => (
          <div className="stat" key={f.label}>
            <div className="stat-label">{f.label}</div>
            <div className="stat-value" style={{ color: f.danger ? 'var(--color-danger)' : undefined }}>
              {f.value}
            </div>
          </div>
        ))}
      </div>

      {report.total === 0 ? (
        <div className="alert alert-info" style={{ marginTop: 20 }}>
          {emptyDayNote(day)}
        </div>
      ) : (
        <>
          {/* ── Who was recording ────────────────────────────────── */}
          <h2 className="section-title" style={{ marginTop: 28 }}>
            Who entered work
          </h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role at the time</th>
                  <th style={{ textAlign: 'right' }}>Entries</th>
                </tr>
              </thead>
              <tbody>
                {report.people.map((p) => (
                  <tr key={p.name}>
                    <td style={{ fontWeight: 500 }}>{p.name}</td>
                    <td className="text-secondary" style={{ fontSize: 13 }}>
                      {p.role ?? '—'}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {p.entries}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 8 }}>
            This is who <em>entered</em> work into CxSentinel, which is not the same as who was on site. It is not a
            manpower return.
          </p>

          {/* ── The day, section by section ──────────────────────── */}
          {report.sections.map((s) => (
            <div key={s.key} style={{ marginTop: 26 }}>
              <h2 className="section-title" style={{ marginBottom: 2 }}>
                {s.label}
              </h2>
              <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 0 }}>
                {s.note}
              </p>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 64 }}>Time</th>
                      <th>What</th>
                      <th>Record</th>
                      <th>Change</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.events.map((e) => (
                      <tr key={e.id}>
                        <td className="mono" style={{ fontSize: 12 }}>
                          {timeOf(e.created_at)}
                        </td>
                        <td style={{ fontSize: 13.5 }}>{e.action}</td>
                        <td style={{ fontSize: 13 }}>{e.entity_label ?? e.entity}</td>
                        <td className="text-secondary" style={{ fontSize: 12.5 }}>
                          {e.old_value && e.new_value
                            ? `${e.old_value} → ${e.new_value}`
                            : e.new_value ?? e.old_value ?? '—'}
                          {e.comment && <div style={{ marginTop: 3 }}>{e.comment}</div>}
                        </td>
                        <td style={{ fontSize: 12.5 }}>{e.actor_name || e.actor_email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── Constraints ──────────────────────────────────────────── */}
      <h2 className="section-title" style={{ marginTop: 32 }}>
        Constraints as they stand now
      </h2>
      <p className="text-secondary" style={{ fontSize: 13, marginTop: -6 }}>
        What is currently in the way across the whole project. Not a snapshot of {longDate(day)} — this is today.
      </p>

      {overall.readiness.blockers.length === 0 ? (
        <div className="card">
          <p className="text-secondary" style={{ marginBottom: 0, fontSize: 14 }}>
            Nothing is blocking the project at present.
          </p>
        </div>
      ) : (
        <div className="card" style={{ borderLeft: '4px solid var(--color-danger-solid)' }}>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {overall.readiness.blockers.map((b, i) => (
              <li key={i} style={{ color: 'var(--color-danger)', marginBottom: 5, fontSize: 14 }}>
                {b.text}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── Plan ─────────────────────────────────────────────────── */}
      <h2 className="section-title" style={{ marginTop: 30 }}>
        Next
      </h2>
      {actions.length === 0 ? (
        <div className="card">
          <p className="text-secondary" style={{ marginBottom: 0, fontSize: 14 }}>
            Nothing outstanding.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 130 }}>Priority</th>
                <th>Action</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {actions.slice(0, 8).map((a, i) => (
                <tr key={i}>
                  <td>
                    <span className={urgencyBadgeClass(a.urgency)}>{URGENCY_LABELS[a.urgency]}</span>
                  </td>
                  <td style={{ fontSize: 13.5, fontWeight: 500 }}>
                    <Link href={a.href} className="link">
                      {a.title}
                    </Link>
                  </td>
                  <td className="text-secondary" style={{ fontSize: 12.5 }}>
                    {a.why}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 20 }}>
        Every line above is drawn from a record. The report cannot be edited — to change what it says, change the
        record it came from, and the correction appears in the audit trail alongside the original.
      </p>
    </>
  )
}
