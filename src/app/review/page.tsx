import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import {
  LEVELS,
  STATUSES,
  REVIEW_STATES,
  REVIEW_COLORS,
  reviewBadgeClass,
  reviewLabel,
  statusBadgeClass,
} from '@/lib/checklist'
import { setReviewState, bulkSetReviewState } from './actions'

export const dynamic = 'force-dynamic'

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; state?: string }>
}) {
  const { level: levelFilter, state: stateFilter } = await searchParams

  const project = await getCurrentProject()

  const { data: equipmentRows } = project
    ? await supabase.from('equipment').select('id, tag_id').eq('project_id', project.id).order('tag_id')
    : { data: [] }

  const equipment = equipmentRows ?? []
  const equipmentIds = equipment.map((e) => e.id)
  const tagById = new Map(equipment.map((e) => [e.id, e.tag_id]))

  const { data: itemsRaw } =
    equipmentIds.length > 0
      ? await supabase
          .from('checklist_items')
          .select('id, level, item, status, notes, review_state, review_comment, reviewed_at, equipment_id')
          .in('equipment_id', equipmentIds)
          .order('level', { ascending: true })
      : {
          data: [] as {
            id: string
            level: string
            item: string
            status: string
            notes: string | null
            review_state: string | null
            review_comment: string | null
            reviewed_at: string | null
            equipment_id: string
          }[],
        }

  const all = itemsRaw ?? []
  const stateOf = (it: { review_state: string | null }) => it.review_state ?? 'draft'

  // Level summary is always over everything, so the top of the page doesn't
  // change meaning when a filter is applied below.
  const levelRows = LEVELS.map((l) => {
    const atLevel = all.filter((it) => it.level === l.value)
    const counts = Object.fromEntries(
      REVIEW_STATES.map((r) => [r.value, atLevel.filter((it) => stateOf(it) === r.value).length])
    ) as Record<string, number>
    const approved = counts.approved ?? 0
    return {
      ...l,
      total: atLevel.length,
      counts,
      approvedPercent: atLevel.length > 0 ? Math.round((approved / atLevel.length) * 100) : 0,
    }
  })

  const totals = Object.fromEntries(
    REVIEW_STATES.map((r) => [r.value, all.filter((it) => stateOf(it) === r.value).length])
  ) as Record<string, number>

  let listed = all
  if (levelFilter) listed = listed.filter((it) => it.level === levelFilter)
  if (stateFilter) listed = listed.filter((it) => stateOf(it) === stateFilter)

  const levelLabel = (v: string) => LEVELS.find((l) => l.value === v)?.label ?? v

  return (
    <>
      <h1 className="page-title">Review &amp; Approvals</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — where every check sits in the approval chain, level by
        level. Passing a check and having it approved are tracked separately.
      </p>

      <div className="stat-grid">
        {REVIEW_STATES.map((r) => (
          <div key={r.value} className="stat" style={{ ['--stat-accent' as string]: REVIEW_COLORS[r.value] }}>
            <div className="stat-label">{r.label}</div>
            <div className="stat-value">{totals[r.value] ?? 0}</div>
            <div className="stat-note">{r.hint}</div>
          </div>
        ))}
      </div>

      <div className="chart-card" style={{ marginBottom: 16 }}>
        <div className="chart-head">
          <span className="chart-title">Approval status by commissioning level</span>
          <span className="chart-hint">
            {all.length} check{all.length === 1 ? '' : 's'} across {equipment.length} tag
            {equipment.length === 1 ? '' : 's'}
          </span>
        </div>

        {levelRows.map((l) => (
          <div key={l.value} className="bar-row">
            <div className="bar-head">
              <span className="bar-name">
                <a href={`/review?level=${l.value}`} className="link">
                  {l.label}
                </a>
              </span>
              <span className="bar-figure">
                {l.total > 0 ? `${l.approvedPercent}% approved · ${l.total}` : 'none'}
              </span>
            </div>
            <div className="bar-track">
              {l.total > 0
                ? REVIEW_STATES.map((r) =>
                    (l.counts[r.value] ?? 0) > 0 ? (
                      <span
                        key={r.value}
                        className="bar-seg"
                        title={`${r.label}: ${l.counts[r.value]}`}
                        style={{
                          width: `${((l.counts[r.value] ?? 0) / l.total) * 100}%`,
                          background: REVIEW_COLORS[r.value],
                        }}
                      />
                    ) : null
                  )
                : null}
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 18 }}>
          {REVIEW_STATES.map((r) => (
            <span key={r.value} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
              <span className="legend-dot" style={{ background: REVIEW_COLORS[r.value] }} />
              {r.label}
            </span>
          ))}
        </div>
      </div>

      <div style={{ margin: '24px 0 16px' }}>
        <form style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select name="level" defaultValue={levelFilter ?? ''} className="input" style={{ maxWidth: 300 }}>
            <option value="">All levels</option>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          <select name="state" defaultValue={stateFilter ?? ''} className="input" style={{ maxWidth: 220 }}>
            <option value="">All approval states</option>
            {REVIEW_STATES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary">
            Filter
          </button>
          {(levelFilter || stateFilter) && (
            <a href="/review" className="btn btn-secondary">
              Clear
            </a>
          )}
        </form>
      </div>

      {listed.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 className="section-title">Decide on all {listed.length} listed checks at once</h2>
          <form action={bulkSetReviewState} style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
            {listed.map((it) => (
              <input key={it.id} type="hidden" name="ids" value={it.id} />
            ))}
            <label className="field" style={{ minWidth: 220 }}>
              Set every listed check to
              <select name="review_state" className="input" defaultValue="approved">
                {REVIEW_STATES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn-primary">
              Apply to all listed
            </button>
          </form>
        </div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Level</th>
              <th>Check</th>
              <th>Result</th>
              <th>Approval</th>
              <th style={{ minWidth: 300 }}>Decision</th>
            </tr>
          </thead>
          <tbody>
            {listed.length > 0 ? (
              listed.map((it) => (
                <tr key={it.id}>
                  <td className="mono" style={{ fontWeight: 600 }}>
                    {tagById.get(it.equipment_id) ?? '—'}
                  </td>
                  <td style={{ fontSize: 12.5 }}>{levelLabel(it.level).split(' — ')[0]}</td>
                  <td>
                    {it.item}
                    {it.notes && (
                      <div className="text-secondary" style={{ fontSize: 12, marginTop: 2 }}>
                        {it.notes}
                      </div>
                    )}
                    {it.review_comment && (
                      <div style={{ fontSize: 12, marginTop: 4, color: 'var(--color-info)' }}>
                        Review note: {it.review_comment}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={statusBadgeClass(it.status)}>
                      {STATUSES.find((s) => s.value === it.status)?.label ?? it.status}
                    </span>
                  </td>
                  <td>
                    <span className={reviewBadgeClass(stateOf(it))}>{reviewLabel(stateOf(it))}</span>
                    {it.reviewed_at && (
                      <div className="text-secondary mono" style={{ fontSize: 11, marginTop: 3 }}>
                        {it.reviewed_at.slice(0, 10)}
                      </div>
                    )}
                  </td>
                  <td>
                    <form
                      action={setReviewState}
                      style={{ display: 'grid', gap: 8, gridTemplateColumns: '130px 1fr auto', alignItems: 'center' }}
                    >
                      <input type="hidden" name="id" value={it.id} />
                      <select
                        key={`r-${it.id}-${stateOf(it)}`}
                        name="review_state"
                        defaultValue={stateOf(it)}
                        className="input"
                      >
                        {REVIEW_STATES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <input
                        key={`c-${it.id}-${it.review_comment ?? ''}`}
                        name="review_comment"
                        defaultValue={it.review_comment ?? ''}
                        placeholder="Reason, if rejected"
                        className="input"
                      />
                      <button type="submit" className="btn btn-secondary btn-sm">
                        Set
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="empty-row">
                  {all.length === 0
                    ? 'No checks on this project yet — add or import a checklist first.'
                    : 'Nothing matches that filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
