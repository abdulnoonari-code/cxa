import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { LEVELS } from '@/lib/checklist'
import { CATEGORIES } from '@/lib/issues'
import { MILESTONE_STATUSES, isOverdue } from '@/lib/milestones'
import { HeroScene } from '@/components/HeroScene'

export const dynamic = 'force-dynamic'

const STATUS_COLORS: Record<string, string> = {
  pass: 'var(--color-success-solid)',
  fail: 'var(--color-danger-solid)',
  pending: 'var(--color-warning-solid)',
  na: 'var(--color-neutral-solid)',
}

const STATUS_LABELS: Record<string, string> = {
  pass: 'Passed',
  fail: 'Failed',
  pending: 'Not started',
  na: 'Not applicable',
}

const MILESTONE_COLORS: Record<string, string> = {
  complete: 'var(--color-success-solid)',
  on_track: 'var(--color-primary)',
  at_risk: 'var(--color-danger-solid)',
  planned: 'var(--color-neutral-solid)',
}

function Donut({
  segments,
  total,
  centerValue,
  centerLabel,
}: {
  segments: { key: string; count: number; color: string }[]
  total: number
  centerValue: string
  centerLabel: string
}) {
  const size = 152
  const stroke = 20
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  let offset = 0

  return (
    <div className="donut-figure" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`${centerLabel}: ${centerValue}`}>
        <g transform={`translate(${size / 2} ${size / 2}) rotate(-90)`}>
          <circle r={r} fill="none" stroke="var(--color-neutral-bg)" strokeWidth={stroke} />
          {total > 0 &&
            segments
              .filter((s) => s.count > 0)
              .map((s) => {
                const len = (s.count / total) * c
                const dash = `${len} ${c - len}`
                const el = (
                  <circle
                    key={s.key}
                    r={r}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={stroke}
                    strokeDasharray={dash}
                    strokeDashoffset={-offset}
                  />
                )
                offset += len
                return el
              })}
        </g>
      </svg>
      <div className="donut-center">
        <div className="donut-center-value">{centerValue}</div>
        <div className="donut-center-label">{centerLabel}</div>
      </div>
    </div>
  )
}

export default async function DashboardPage() {
  const project = await getCurrentProject()

  const { data: equipmentRows } = project
    ? await supabase.from('equipment').select('id, tag_id, install_status').eq('project_id', project.id).order('tag_id')
    : { data: [] }

  const equipment = equipmentRows ?? []
  const equipmentIds = equipment.map((e) => e.id)

  const { data: itemsRaw } =
    equipmentIds.length > 0
      ? await supabase
          .from('checklist_items')
          .select('id, level, status, equipment_id')
          .in('equipment_id', equipmentIds)
      : { data: [] as { id: string; level: string; status: string; equipment_id: string }[] }

  const items = itemsRaw ?? []
  const itemIds = items.map((it) => it.id)

  const { data: attachmentsRaw } =
    itemIds.length > 0
      ? await supabase.from('attachments').select('checklist_item_id, review_status').in('checklist_item_id', itemIds)
      : { data: [] as { checklist_item_id: string; review_status: string | null }[] }

  const attachments = attachmentsRaw ?? []

  const { data: issuesRaw } =
    equipmentIds.length > 0
      ? await supabase.from('issues').select('id, severity, category, status').in('equipment_id', equipmentIds)
      : { data: [] as { id: string; severity: string; category: string | null; status: string }[] }

  const issues = issuesRaw ?? []

  const { data: milestonesRaw } = project
    ? await supabase
        .from('milestones')
        .select('id, name, target_date, status')
        .eq('project_id', project.id)
        .order('target_date', { ascending: true, nullsFirst: false })
    : { data: [] as { id: string; name: string; target_date: string | null; status: string }[] }

  const milestones = milestonesRaw ?? []

  // ---- Derived figures -----------------------------------------------------
  const totalChecks = items.length
  const countBy = (status: string) => items.filter((it) => it.status === status).length
  const passed = countBy('pass')
  const failed = countBy('fail')
  const pending = countBy('pending')
  const na = countBy('na')

  // "Resolved" means the check has reached a decision — passed or ruled out.
  const resolved = passed + na
  const completion = totalChecks > 0 ? Math.round((resolved / totalChecks) * 100) : 0

  const itemsWithEvidence = new Set(attachments.map((a) => a.checklist_item_id)).size
  const evidencePercent = totalChecks > 0 ? Math.round((itemsWithEvidence / totalChecks) * 100) : 0
  const docsNeedingLook = attachments.filter((a) => a.review_status === 'warning').length

  const openIssues = issues.filter((i) => i.status !== 'closed' && i.status !== 'verified')
  const openCategoryA = openIssues.filter((i) => i.category === 'A').length

  const milestonesComplete = milestones.filter((m) => m.status === 'complete').length
  const milestonePercent = milestones.length > 0 ? Math.round((milestonesComplete / milestones.length) * 100) : 0
  const overdueMilestones = milestones.filter((m) => isOverdue(m.target_date, m.status)).length

  const statusSegments = [
    { key: 'pass', count: passed, color: STATUS_COLORS.pass },
    { key: 'fail', count: failed, color: STATUS_COLORS.fail },
    { key: 'pending', count: pending, color: STATUS_COLORS.pending },
    { key: 'na', count: na, color: STATUS_COLORS.na },
  ]

  const levelRows = LEVELS.map((l) => {
    const atLevel = items.filter((it) => it.level === l.value)
    const p = atLevel.filter((it) => it.status === 'pass').length
    const f = atLevel.filter((it) => it.status === 'fail').length
    const pend = atLevel.filter((it) => it.status === 'pending').length
    const n = atLevel.filter((it) => it.status === 'na').length
    const done = atLevel.length > 0 ? Math.round(((p + n) / atLevel.length) * 100) : 0
    return { ...l, total: atLevel.length, pass: p, fail: f, pending: pend, na: n, done }
  })

  const categoryRows = CATEGORIES.map((cat) => ({
    ...cat,
    count: openIssues.filter((i) => i.category === cat.value).length,
  }))
  const uncategorized = openIssues.filter((i) => !i.category).length

  const cellFor = (equipmentId: string, level: string) => {
    const cellItems = items.filter((it) => it.equipment_id === equipmentId && it.level === level)
    if (cellItems.length === 0) return { label: '–', color: null }
    const p = cellItems.filter((it) => it.status === 'pass').length
    const f = cellItems.filter((it) => it.status === 'fail').length
    const n = cellItems.filter((it) => it.status === 'na').length
    const pct = Math.round(((p + n) / cellItems.length) * 100)
    if (f > 0) return { label: `${pct}%`, color: 'var(--color-danger-solid)' }
    if (pct === 100) return { label: '100%', color: 'var(--color-success-solid)' }
    if (pct === 0) return { label: '0%', color: '#a9bad2' }
    return { label: `${pct}%`, color: 'var(--color-warning-solid)' }
  }

  const upcoming = milestones.filter((m) => m.status !== 'complete').slice(0, 5)

  return (
    <>
      <section className="hero rise rise-1">
        <HeroScene />
        <div className="hero-scrim" />
        <div className="hero-inner">
          <p className="hero-eyebrow">Commissioning readiness</p>
          <h1>{project ? project.name : 'No project yet'}</h1>
          <p>
            {project
              ? 'Live status across every tag, every commissioning level, and every open item on the project.'
              : 'Run the Week 2 SQL step to create your project, then add equipment to begin.'}
          </p>

          <div className="hero-figure">
            <span className="hero-figure-value">{completion}%</span>
            <span className="hero-figure-label">
              of {totalChecks} check{totalChecks === 1 ? '' : 's'} resolved
              {failed > 0 ? ` · ${failed} failing` : ''}
            </span>
          </div>
          <div className="hero-meter">
            <div className="hero-meter-fill" style={{ width: `${completion}%` }} />
          </div>

          {project && (project.client || project.location || project.start_date || project.target_date) && (
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
              {project.start_date && (
                <div className="hero-meta-item">
                  <span className="hero-meta-label">Start</span>
                  <span className="hero-meta-value mono">{project.start_date}</span>
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

      <div className="stat-grid rise rise-2">
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-primary)' }}>
          <div className="stat-label">Equipment tags</div>
          <div className="stat-value">{equipment.length}</div>
          <div className="stat-note">{items.length} checks defined</div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-success-solid)' }}>
          <div className="stat-label">Evidence on file</div>
          <div className="stat-value">{evidencePercent}%</div>
          <div className="stat-note">
            {itemsWithEvidence} of {totalChecks} checks
            {docsNeedingLook > 0 ? ` · ${docsNeedingLook} flagged` : ''}
          </div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-danger-solid)' }}>
          <div className="stat-label">Open punch list</div>
          <div className="stat-value">{openIssues.length}</div>
          <div className="stat-note">
            {openCategoryA > 0 ? `${openCategoryA} Category A must-fix` : 'No Category A blocking'}
          </div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-warning-solid)' }}>
          <div className="stat-label">Milestones met</div>
          <div className="stat-value">{milestonePercent}%</div>
          <div className="stat-note">
            {milestonesComplete} of {milestones.length}
            {overdueMilestones > 0 ? ` · ${overdueMilestones} overdue` : ''}
          </div>
        </div>
      </div>

      <div className="grid-2 rise rise-3">
        <div className="chart-card">
          <div className="chart-head">
            <span className="chart-title">Check status</span>
            <span className="chart-hint">All levels</span>
          </div>
          <div className="donut-wrap">
            <Donut
              segments={statusSegments}
              total={totalChecks}
              centerValue={`${completion}%`}
              centerLabel="resolved"
            />
            <div className="legend">
              {statusSegments.map((s) => (
                <div key={s.key} className="legend-row">
                  <span className="legend-dot" style={{ background: s.color }} />
                  {STATUS_LABELS[s.key]}
                  <span className="legend-count">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-head">
            <span className="chart-title">Progress by commissioning level</span>
            <span className="chart-hint">L1 → L5</span>
          </div>
          {levelRows.map((l) => (
            <div key={l.value} className="bar-row">
              <div className="bar-head">
                <span className="bar-name">{l.label}</span>
                <span className="bar-figure">
                  {l.total > 0 ? `${l.done}% · ${l.total}` : 'none'}
                </span>
              </div>
              <div className="bar-track">
                {l.total > 0 ? (
                  <>
                    <span className="bar-seg" style={{ width: `${(l.pass / l.total) * 100}%`, background: STATUS_COLORS.pass }} />
                    <span className="bar-seg" style={{ width: `${(l.na / l.total) * 100}%`, background: STATUS_COLORS.na }} />
                    <span className="bar-seg" style={{ width: `${(l.fail / l.total) * 100}%`, background: STATUS_COLORS.fail }} />
                    <span className="bar-seg" style={{ width: `${(l.pending / l.total) * 100}%`, background: STATUS_COLORS.pending }} />
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="chart-card rise rise-4" style={{ marginBottom: 16 }}>
        <div className="chart-head">
          <span className="chart-title">Readiness matrix</span>
          <span className="chart-hint">Every tag against every level — green is closed out</span>
        </div>
        {equipment.length > 0 ? (
          <div className="table-wrap" style={{ border: 'none', boxShadow: 'none', background: 'transparent' }}>
            <table className="matrix">
              <thead>
                <tr>
                  <th className="matrix-corner">Tag</th>
                  {LEVELS.map((l) => (
                    <th key={l.value}>{l.label.split(' — ')[0]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {equipment.map((e) => (
                  <tr key={e.id}>
                    <td className="matrix-tag">{e.tag_id}</td>
                    {LEVELS.map((l) => {
                      const cell = cellFor(e.id, l.value)
                      return (
                        <td key={l.value} style={{ padding: 0 }}>
                          <div
                            className={cell.color ? 'matrix-cell' : 'matrix-cell is-empty'}
                            style={cell.color ? { background: cell.color, lineHeight: '30px' } : { lineHeight: '30px' }}
                          >
                            {cell.label}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-secondary" style={{ fontSize: 14 }}>
            No equipment yet — add your first tag in Equipment &amp; Tags and it will appear here.
          </p>
        )}
      </div>

      <div className="grid-2">
        <div className="chart-card">
          <div className="chart-head">
            <span className="chart-title">Open punch list by category</span>
            <span className="chart-hint">{openIssues.length} open</span>
          </div>
          {openIssues.length > 0 ? (
            <>
              {categoryRows.map((cat) => (
                <div key={cat.value} className="bar-row">
                  <div className="bar-head">
                    <span className="bar-name">Category {cat.value}</span>
                    <span className="bar-figure">{cat.count}</span>
                  </div>
                  <div className="bar-track">
                    <span
                      className="bar-seg"
                      style={{
                        width: `${(cat.count / openIssues.length) * 100}%`,
                        background:
                          cat.value === 'A'
                            ? 'var(--color-danger-solid)'
                            : cat.value === 'B'
                              ? 'var(--color-warning-solid)'
                              : 'var(--color-neutral-solid)',
                      }}
                    />
                  </div>
                </div>
              ))}
              {uncategorized > 0 && (
                <p className="text-secondary" style={{ fontSize: 12, marginTop: 12 }}>
                  {uncategorized} open item{uncategorized === 1 ? '' : 's'} not categorised yet.
                </p>
              )}
            </>
          ) : (
            <p className="text-secondary" style={{ fontSize: 14 }}>
              Nothing open. Items raised against a check will show here, split by how blocking they are.
            </p>
          )}
        </div>

        <div className="chart-card">
          <div className="chart-head">
            <span className="chart-title">Upcoming milestones</span>
            <span className="chart-hint">{milestonePercent}% met</span>
          </div>
          {upcoming.length > 0 ? (
            <div className="timeline">
              {upcoming.map((m) => {
                const overdue = isOverdue(m.target_date, m.status)
                return (
                  <div key={m.id} className="timeline-row">
                    <span
                      className="timeline-dot"
                      style={{ color: MILESTONE_COLORS[m.status] ?? 'var(--color-neutral-solid)' }}
                    />
                    <div>
                      <div className="timeline-name">{m.name}</div>
                      <div className="text-secondary" style={{ fontSize: 12 }}>
                        {MILESTONE_STATUSES.find((s) => s.value === m.status)?.label ?? m.status}
                        {overdue ? ' · overdue' : ''}
                      </div>
                    </div>
                    <span className="timeline-date">{m.target_date ?? 'no date'}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-secondary" style={{ fontSize: 14 }}>
              No milestones set. Add dates like energization or handover and they&apos;ll track here.
            </p>
          )}
        </div>
      </div>
    </>
  )
}
