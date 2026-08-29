import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { LEVELS, REVIEW_STATES, REVIEW_COLORS, STATUSES, statusBadgeClass } from '@/lib/checklist'
import { CATEGORIES, severityBadgeClass } from '@/lib/issues'
import { isOverdue } from '@/lib/milestones'

export const dynamic = 'force-dynamic'

// The progress report a commissioning agent hands over: where the project
// stands, what is blocking it, and what is coming — on one page, printable,
// and exportable to Excel from the button at the top.
export default async function ReportsPage() {
  const project = await getCurrentProject()

  const { data: equipmentRows } = project
    ? await supabase.from('equipment').select('id, tag_id, description, install_status').eq('project_id', project.id).order('tag_id')
    : { data: [] }

  const equipment = equipmentRows ?? []
  const equipmentIds = equipment.map((e) => e.id)
  const tagById = new Map(equipment.map((e) => [e.id, e.tag_id]))

  const { data: itemsRaw } =
    equipmentIds.length > 0
      ? await supabase
          .from('checklist_items')
          .select('id, level, item, status, review_state, equipment_id')
          .in('equipment_id', equipmentIds)
      : { data: [] as { id: string; level: string; item: string; status: string; review_state: string | null; equipment_id: string }[] }

  const items = itemsRaw ?? []
  const itemIds = items.map((it) => it.id)

  const { data: attachmentsRaw } =
    itemIds.length > 0
      ? await supabase.from('attachments').select('checklist_item_id').in('checklist_item_id', itemIds)
      : { data: [] as { checklist_item_id: string }[] }

  const { data: issuesRaw } =
    equipmentIds.length > 0
      ? await supabase
          .from('issues')
          .select('id, title, severity, category, status, equipment_id')
          .in('equipment_id', equipmentIds)
      : { data: [] as { id: string; title: string; severity: string; category: string | null; status: string; equipment_id: string }[] }

  const issues = issuesRaw ?? []

  const { data: milestonesRaw } = project
    ? await supabase
        .from('milestones')
        .select('id, name, target_date, status')
        .eq('project_id', project.id)
        .order('target_date', { ascending: true, nullsFirst: false })
    : { data: [] as { id: string; name: string; target_date: string | null; status: string }[] }

  const milestones = milestonesRaw ?? []

  const totalChecks = items.length
  const resolved = items.filter((it) => it.status === 'pass' || it.status === 'na').length
  const failed = items.filter((it) => it.status === 'fail').length
  const completion = totalChecks > 0 ? Math.round((resolved / totalChecks) * 100) : 0

  const approved = items.filter((it) => (it.review_state ?? 'draft') === 'approved').length
  const approvedPercent = totalChecks > 0 ? Math.round((approved / totalChecks) * 100) : 0

  const withEvidence = new Set((attachmentsRaw ?? []).map((a) => a.checklist_item_id)).size
  const evidencePercent = totalChecks > 0 ? Math.round((withEvidence / totalChecks) * 100) : 0

  const openIssues = issues.filter((i) => i.status !== 'closed' && i.status !== 'verified')
  const blockingIssues = openIssues.filter((i) => i.category === 'A')
  const overdueMilestones = milestones.filter((m) => isOverdue(m.target_date, m.status))
  const nextMilestones = milestones.filter((m) => m.status !== 'complete').slice(0, 4)

  const levelRows = LEVELS.map((l) => {
    const at = items.filter((it) => it.level === l.value)
    const done = at.filter((it) => it.status === 'pass' || it.status === 'na').length
    const app = at.filter((it) => (it.review_state ?? 'draft') === 'approved').length
    return {
      ...l,
      total: at.length,
      done,
      approved: app,
      donePercent: at.length > 0 ? Math.round((done / at.length) * 100) : 0,
      approvedPercent: at.length > 0 ? Math.round((app / at.length) * 100) : 0,
    }
  })

  const equipmentRowsSummary = equipment.map((e) => {
    const own = items.filter((it) => it.equipment_id === e.id)
    const done = own.filter((it) => it.status === 'pass' || it.status === 'na').length
    const app = own.filter((it) => (it.review_state ?? 'draft') === 'approved').length
    const openForTag = openIssues.filter((i) => i.equipment_id === e.id).length
    return {
      ...e,
      checks: own.length,
      percent: own.length > 0 ? Math.round((done / own.length) * 100) : 0,
      approvedPercent: own.length > 0 ? Math.round((app / own.length) * 100) : 0,
      openIssues: openForTag,
    }
  })

  // A plain-language read on where the project actually is, built from the
  // same numbers shown below rather than written by hand.
  const headline = (() => {
    if (totalChecks === 0) return 'No checks have been created yet, so there is nothing to report on.'
    if (blockingIssues.length > 0)
      return `${completion}% of checks are resolved, but ${blockingIssues.length} Category A item${blockingIssues.length === 1 ? '' : 's'} must be closed before the affected systems can advance.`
    if (failed > 0)
      return `${completion}% of checks are resolved. ${failed} check${failed === 1 ? '' : 's'} currently failing and awaiting retest.`
    if (approvedPercent === 100) return 'Every check is resolved and approved. The project is ready for turnover.'
    return `${completion}% of checks are resolved and ${approvedPercent}% have been approved. No blocking items open.`
  })()

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 className="page-title">Progress Report</h1>
          <p className="page-subtitle" style={{ marginBottom: 18 }}>
            {project ? project.name : 'No project selected'}
            {project?.client ? ` · ${project.client}` : ''}
            {project?.location ? ` · ${project.location}` : ''} — generated{' '}
            <span className="mono">{new Date().toISOString().slice(0, 10)}</span>
          </p>
        </div>
        <a href="/reports/export" className="btn btn-primary">
          Download report (Excel)
        </a>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title">Where the project stands</h2>
        <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 0 }}>{headline}</p>
      </div>

      <div className="stat-grid">
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-primary)' }}>
          <div className="stat-label">Checks resolved</div>
          <div className="stat-value">{completion}%</div>
          <div className="stat-note">
            {resolved} of {totalChecks}
          </div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-success-solid)' }}>
          <div className="stat-label">Approved</div>
          <div className="stat-value">{approvedPercent}%</div>
          <div className="stat-note">{approved} signed off</div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-warning-solid)' }}>
          <div className="stat-label">Evidence on file</div>
          <div className="stat-value">{evidencePercent}%</div>
          <div className="stat-note">{withEvidence} checks documented</div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-danger-solid)' }}>
          <div className="stat-label">Blocking items</div>
          <div className="stat-value">{blockingIssues.length}</div>
          <div className="stat-note">{openIssues.length} open in total</div>
        </div>
      </div>

      <div className="chart-card" style={{ marginBottom: 16 }}>
        <div className="chart-head">
          <span className="chart-title">Progress by commissioning level</span>
          <span className="chart-hint">Resolved vs approved</span>
        </div>
        <div className="table-wrap" style={{ border: 'none', boxShadow: 'none', background: 'transparent' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Level</th>
                <th>Checks</th>
                <th>Resolved</th>
                <th>Approved</th>
                <th style={{ minWidth: 200 }}>Progress</th>
              </tr>
            </thead>
            <tbody>
              {levelRows.map((l) => (
                <tr key={l.value}>
                  <td>{l.label}</td>
                  <td className="mono">{l.total}</td>
                  <td className="mono">{l.total > 0 ? `${l.donePercent}%` : '—'}</td>
                  <td className="mono">{l.total > 0 ? `${l.approvedPercent}%` : '—'}</td>
                  <td>
                    <div className="bar-track">
                      <span
                        className="bar-seg"
                        style={{ width: `${l.approvedPercent}%`, background: REVIEW_COLORS.approved }}
                      />
                      <span
                        className="bar-seg"
                        style={{
                          width: `${Math.max(l.donePercent - l.approvedPercent, 0)}%`,
                          background: 'var(--color-primary)',
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
            <span className="legend-dot" style={{ background: REVIEW_COLORS.approved }} /> Approved
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
            <span className="legend-dot" style={{ background: 'var(--color-primary)' }} /> Resolved, awaiting approval
          </span>
        </div>
      </div>

      <div className="chart-card" style={{ marginBottom: 16 }}>
        <div className="chart-head">
          <span className="chart-title">Status by equipment</span>
          <span className="chart-hint">
            {equipment.length} tag{equipment.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="table-wrap" style={{ border: 'none', boxShadow: 'none', background: 'transparent' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Description</th>
                <th>Checks</th>
                <th>Resolved</th>
                <th>Approved</th>
                <th>Open issues</th>
              </tr>
            </thead>
            <tbody>
              {equipmentRowsSummary.length > 0 ? (
                equipmentRowsSummary.map((e) => (
                  <tr key={e.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {e.tag_id}
                    </td>
                    <td>{e.description ?? '—'}</td>
                    <td className="mono">{e.checks}</td>
                    <td className="mono">{e.checks > 0 ? `${e.percent}%` : '—'}</td>
                    <td className="mono">{e.checks > 0 ? `${e.approvedPercent}%` : '—'}</td>
                    <td>
                      {e.openIssues > 0 ? (
                        <span className="badge badge-warning">{e.openIssues}</span>
                      ) : (
                        <span className="text-secondary">—</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty-row">
                    No equipment on this project yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2">
        <div className="chart-card">
          <div className="chart-head">
            <span className="chart-title">What is blocking handover</span>
            <span className="chart-hint">{blockingIssues.length} Category A</span>
          </div>
          {blockingIssues.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 10 }}>
              {blockingIssues.map((i) => (
                <li key={i.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>
                    {tagById.get(i.equipment_id) ?? '—'}
                  </span>
                  <span style={{ fontSize: 13.5 }}>{i.title}</span>
                  <span className={severityBadgeClass(i.severity)}>{i.severity}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-secondary" style={{ fontSize: 14 }}>
              Nothing in Category A is open. {openIssues.length > 0 ? `${openIssues.length} lower-priority item${openIssues.length === 1 ? '' : 's'} remain.` : 'The punch list is clear.'}
            </p>
          )}

          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--color-border-soft)' }}>
            <div className="stat-label" style={{ marginBottom: 10 }}>
              Open punch list by category
            </div>
            {CATEGORIES.map((c) => {
              const n = openIssues.filter((i) => i.category === c.value).length
              return (
                <div key={c.value} className="bar-row">
                  <div className="bar-head">
                    <span className="bar-name">Category {c.value}</span>
                    <span className="bar-figure">{n}</span>
                  </div>
                  <div className="bar-track">
                    <span
                      className="bar-seg"
                      style={{
                        width: openIssues.length > 0 ? `${(n / openIssues.length) * 100}%` : '0%',
                        background:
                          c.value === 'A'
                            ? 'var(--color-danger-solid)'
                            : c.value === 'B'
                              ? 'var(--color-warning-solid)'
                              : 'var(--color-neutral-solid)',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-head">
            <span className="chart-title">Schedule</span>
            <span className="chart-hint">
              {overdueMilestones.length > 0 ? `${overdueMilestones.length} overdue` : 'On track'}
            </span>
          </div>
          {nextMilestones.length > 0 ? (
            <div className="timeline">
              {nextMilestones.map((m) => (
                <div key={m.id} className="timeline-row">
                  <span
                    className="timeline-dot"
                    style={{ color: isOverdue(m.target_date, m.status) ? 'var(--color-danger-solid)' : 'var(--color-primary)' }}
                  />
                  <div className="timeline-name">{m.name}</div>
                  <span className="timeline-date">{m.target_date ?? 'no date'}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-secondary" style={{ fontSize: 14 }}>
              No milestones set for this project.
            </p>
          )}

          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--color-border-soft)' }}>
            <div className="stat-label" style={{ marginBottom: 10 }}>
              Approval chain
            </div>
            {REVIEW_STATES.map((r) => {
              const n = items.filter((it) => (it.review_state ?? 'draft') === r.value).length
              return (
                <div key={r.value} className="bar-row">
                  <div className="bar-head">
                    <span className="bar-name">{r.label}</span>
                    <span className="bar-figure">{n}</span>
                  </div>
                  <div className="bar-track">
                    <span
                      className="bar-seg"
                      style={{
                        width: totalChecks > 0 ? `${(n / totalChecks) * 100}%` : '0%',
                        background: REVIEW_COLORS[r.value],
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {failed > 0 && (
        <div className="chart-card" style={{ marginTop: 16 }}>
          <div className="chart-head">
            <span className="chart-title">Failed checks awaiting retest</span>
            <span className="chart-hint">{failed}</span>
          </div>
          <div className="table-wrap" style={{ border: 'none', boxShadow: 'none', background: 'transparent' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Level</th>
                  <th>Check</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {items
                  .filter((it) => it.status === 'fail')
                  .map((it) => (
                    <tr key={it.id}>
                      <td className="mono" style={{ fontWeight: 600 }}>
                        {tagById.get(it.equipment_id) ?? '—'}
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {(LEVELS.find((l) => l.value === it.level)?.label ?? it.level).split(' — ')[0]}
                      </td>
                      <td>{it.item}</td>
                      <td>
                        <span className={statusBadgeClass(it.status)}>
                          {STATUSES.find((s) => s.value === it.status)?.label ?? it.status}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
