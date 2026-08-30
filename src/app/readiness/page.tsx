import { getCurrentProject } from '@/lib/project'
import { loadProjectReadiness } from '@/lib/system-data'
import { stageLabel, readinessBadgeClass, readinessVerdict } from '@/lib/readiness'

export const dynamic = 'force-dynamic'

export default async function ReadinessPage() {
  const project = await getCurrentProject()
  const { systems, unassigned, unassignedReadiness, overall, equipmentReadiness } = await loadProjectReadiness(
    project?.id ?? null
  )

  const blocked = systems.filter((s) => s.readiness.blockers.length > 0)
  const ready = systems.filter((s) => s.readiness.ready)
  const allBlockers = systems.flatMap((s) => s.readiness.blockers.map((b) => ({ system: s.name, text: b.text })))

  return (
    <>
      <h1 className="page-title">Readiness</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — worked out live from the checks, tests and punch items
        themselves, so it can never disagree with the records underneath it.
      </p>

      <div className="callout-safety alert alert-info" style={{ fontSize: 13 }}>
        <strong>This is an assessment, not an authorisation.</strong> CXA reports what the records show. Deciding
        that a system may be energized remains with the authorised commissioning and safety personnel.
      </div>

      <div className="stat-grid">
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-primary)' }}>
          <div className="stat-label">Project readiness</div>
          <div className="stat-value">{overall.percent}%</div>
          <div className="stat-note">
            {overall.requirementsMet} of {overall.requirementsTotal} requirements met
          </div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-success-solid)' }}>
          <div className="stat-label">Systems ready</div>
          <div className="stat-value">
            {ready.length}/{systems.length}
          </div>
          <div className="stat-note">All requirements met, nothing blocking</div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-danger-solid)' }}>
          <div className="stat-label">Systems blocked</div>
          <div className="stat-value">{blocked.length}</div>
          <div className="stat-note">{allBlockers.length} blocker{allBlockers.length === 1 ? '' : 's'} in total</div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-warning-solid)' }}>
          <div className="stat-label">Warnings</div>
          <div className="stat-value">{systems.reduce((n, s) => n + s.readiness.warnings.length, 0)}</div>
          <div className="stat-note">Worth seeing, not blocking</div>
        </div>
      </div>

      {systems.length === 0 && unassigned.length === 0 && (
        <div className="card">
          <p className="text-secondary" style={{ fontSize: 14, marginBottom: 0 }}>
            Nothing to assess yet. Add equipment and group it into systems, then readiness appears here.
          </p>
        </div>
      )}

      {systems.map((s) => (
        <div key={s.id} className="card" style={{ marginTop: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 16,
              flexWrap: 'wrap',
              marginBottom: 16,
            }}
          >
            <div>
              <div className="text-secondary mono" style={{ fontSize: 11.5, marginBottom: 3 }}>
                {s.system_id}
                {s.responsible ? ` · ${s.responsible}` : ''}
              </div>
              <div style={{ fontWeight: 600, fontSize: 17 }}>{s.name}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="badge badge-neutral">{stageLabel(s.stage)}</span>
              <span className={readinessBadgeClass(s.readiness)} style={{ fontSize: 12.5, padding: '5px 14px' }}>
                {readinessVerdict(s.readiness)}
              </span>
              <span className="mono" style={{ fontSize: 24, fontWeight: 600 }}>
                {s.readiness.percent}%
              </span>
            </div>
          </div>

          <div className="bar-track" style={{ height: 10, marginBottom: 18 }}>
            <span
              className="bar-seg"
              style={{
                width: `${s.readiness.percent}%`,
                background:
                  s.readiness.blockers.length > 0
                    ? 'var(--color-danger-solid)'
                    : s.readiness.ready
                      ? 'var(--color-success-solid)'
                      : 'var(--color-primary)',
              }}
            />
          </div>

          <div className="grid-2" style={{ marginBottom: 0 }}>
            <div>
              <div className="stat-label" style={{ marginBottom: 10 }}>
                Blockers — must be cleared
              </div>
              {s.readiness.blockers.length > 0 ? (
                <ol style={{ paddingLeft: 20, margin: 0, display: 'grid', gap: 7 }}>
                  {s.readiness.blockers.map((b, n) => (
                    <li key={n} style={{ fontSize: 13.5, color: 'var(--color-danger)' }}>
                      {b.text}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-secondary" style={{ fontSize: 13.5, margin: 0 }}>
                  Nothing blocking this system.
                </p>
              )}
            </div>

            <div>
              <div className="stat-label" style={{ marginBottom: 10 }}>
                Warnings — worth a look
              </div>
              {s.readiness.warnings.length > 0 ? (
                <ul style={{ paddingLeft: 20, margin: 0, display: 'grid', gap: 7 }}>
                  {s.readiness.warnings.map((w, n) => (
                    <li key={n} style={{ fontSize: 13.5, color: 'var(--color-warning)' }}>
                      {w.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-secondary" style={{ fontSize: 13.5, margin: 0 }}>
                  No warnings.
                </p>
              )}
            </div>
          </div>

          {s.equipment.length > 0 && (
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--color-border-soft)' }}>
              <div className="stat-label" style={{ marginBottom: 10 }}>
                By equipment
              </div>
              <div className="table-wrap" style={{ border: 'none', boxShadow: 'none', background: 'transparent' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Tag</th>
                      <th>Description</th>
                      <th>Requirements</th>
                      <th>Readiness</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.equipment.map((e) => {
                      const r = equipmentReadiness.get(e.id)
                      if (!r) return null
                      return (
                        <tr key={e.id}>
                          <td className="mono" style={{ fontWeight: 600 }}>
                            {e.tag_id}
                          </td>
                          <td>{e.description ?? '—'}</td>
                          <td className="mono">
                            {r.requirementsMet}/{r.requirementsTotal}
                          </td>
                          <td style={{ minWidth: 140 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                              <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                                {r.percent}%
                              </span>
                              <span className="bar-track" style={{ width: 70 }}>
                                <span
                                  className="bar-seg"
                                  style={{
                                    width: `${r.percent}%`,
                                    background:
                                      r.blockers.length > 0
                                        ? 'var(--color-danger-solid)'
                                        : r.ready
                                          ? 'var(--color-success-solid)'
                                          : 'var(--color-primary)',
                                  }}
                                />
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={readinessBadgeClass(r)}>{readinessVerdict(r)}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ))}

      {unassigned.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 14,
              flexWrap: 'wrap',
              marginBottom: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 15.5 }}>Not yet in a system</div>
              <div className="text-secondary" style={{ fontSize: 13 }}>
                {unassigned.length} tag{unassigned.length === 1 ? '' : 's'} — assign them on the{' '}
                <a href="/systems" className="link">
                  Systems
                </a>{' '}
                screen so they count towards a system.
              </div>
            </div>
            <span className="mono" style={{ fontSize: 20, fontWeight: 600 }}>
              {unassignedReadiness.percent}%
            </span>
          </div>
          {unassignedReadiness.blockers.length > 0 && (
            <ol style={{ paddingLeft: 20, margin: 0, display: 'grid', gap: 6 }}>
              {unassignedReadiness.blockers.map((b, n) => (
                <li key={n} style={{ fontSize: 13, color: 'var(--color-danger)' }}>
                  {b.text}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </>
  )
}
