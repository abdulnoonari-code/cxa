import { getCurrentProject } from '@/lib/project'
import { loadProjectReadiness } from '@/lib/system-data'
import { STAGES, stageLabel, readinessBadgeClass, readinessVerdict } from '@/lib/readiness'
import { createSystem, updateSystem, deleteSystem, assignEquipment } from './actions'

export const dynamic = 'force-dynamic'

export default async function SystemsPage() {
  const project = await getCurrentProject()
  const { systems, unassigned, overall } = await loadProjectReadiness(project?.id ?? null)

  const readyCount = systems.filter((s) => s.readiness.ready).length
  const blockedCount = systems.filter((s) => s.readiness.blockers.length > 0).length

  return (
    <>
      <h1 className="page-title">Systems</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — the project divided into commissionable systems. A
        system is what actually gets energized and handed over, so this is where readiness is measured.
      </p>

      <div className="stat-grid">
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-primary)' }}>
          <div className="stat-label">Systems</div>
          <div className="stat-value">{systems.length}</div>
          <div className="stat-note">{unassigned.length} tag{unassigned.length === 1 ? '' : 's'} unassigned</div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-success-solid)' }}>
          <div className="stat-label">Ready</div>
          <div className="stat-value">{readyCount}</div>
          <div className="stat-note">All requirements met</div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-danger-solid)' }}>
          <div className="stat-label">Blocked</div>
          <div className="stat-value">{blockedCount}</div>
          <div className="stat-note">
            {blockedCount > 0 ? (
              <a href="/readiness" className="link">
                See what is blocking
              </a>
            ) : (
              'Nothing blocking'
            )}
          </div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-warning-solid)' }}>
          <div className="stat-label">Project readiness</div>
          <div className="stat-value">{overall.percent}%</div>
          <div className="stat-note">
            {overall.requirementsMet} of {overall.requirementsTotal} requirements
          </div>
        </div>
      </div>

      <details className="card">
        <summary className="section-title" style={{ cursor: 'pointer', marginBottom: 0 }}>
          Add a system
        </summary>
        <form action={createSystem} style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 2fr 1fr', marginTop: 16 }}>
          <input type="hidden" name="project_id" value={project?.id ?? ''} />
          <label className="field">
            System ID *
            <input name="system_id" required placeholder="e.g. SYS-115-GIS" className="input" />
          </label>
          <label className="field">
            System name *
            <input name="name" required placeholder="e.g. 115 kV GIS" className="input" />
          </label>
          <label className="field">
            Discipline
            <input name="discipline" placeholder="e.g. Electrical" className="input" />
          </label>
          <label className="field">
            Responsible engineer
            <input name="responsible" className="input" />
          </label>
          <label className="field">
            Description
            <input name="description" className="input" />
          </label>
          <label className="field">
            Stage
            <select name="stage" className="input" defaultValue="construction">
              {STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            System boundary
            <input
              name="boundary"
              placeholder="e.g. Incoming cable, GIS, CT, VT, CB, DS, ES, busbar, protection interface, DC supply, earthing"
              className="input"
            />
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="btn btn-primary" disabled={!project}>
              Add system
            </button>
          </div>
        </form>
      </details>

      {systems.length > 0 ? (
        <div style={{ display: 'grid', gap: 16, marginTop: 22 }}>
          {systems.map((s) => (
            <div key={s.id} className="card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 16,
                  flexWrap: 'wrap',
                  marginBottom: 14,
                }}
              >
                <div>
                  <div className="text-secondary mono" style={{ fontSize: 11.5, marginBottom: 3 }}>
                    {s.system_id}
                    {s.discipline ? ` · ${s.discipline}` : ''}
                    {s.responsible ? ` · ${s.responsible}` : ''}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{s.name}</div>
                  {s.description && (
                    <div className="text-secondary" style={{ fontSize: 13, marginTop: 3 }}>
                      {s.description}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="badge badge-neutral">{stageLabel(s.stage)}</span>
                  <span className={readinessBadgeClass(s.readiness)}>{readinessVerdict(s.readiness)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ minWidth: 200, flex: 1 }}>
                  <div className="bar-head">
                    <span className="bar-name">Readiness</span>
                    <span className="bar-figure">
                      {s.readiness.percent}% · {s.readiness.requirementsMet}/{s.readiness.requirementsTotal}
                    </span>
                  </div>
                  <div className="bar-track">
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
                </div>
                <div className="text-secondary mono" style={{ fontSize: 12.5 }}>
                  {s.equipment.length} tags · {s.checkCount} checks · {s.testCount} tests
                  {s.openIssueCount > 0 ? ` · ${s.openIssueCount} open` : ''}
                </div>
              </div>

              {s.readiness.blockers.length > 0 && (
                <div className="alert alert-danger" style={{ fontSize: 13 }}>
                  <strong>Blocked:</strong>{' '}
                  {s.readiness.blockers.map((b) => b.text).join(' · ')}
                </div>
              )}

              {s.boundary && (
                <p className="text-secondary" style={{ fontSize: 12.5, marginBottom: 12 }}>
                  <strong>Boundary:</strong> {s.boundary}
                </p>
              )}

              <div style={{ marginTop: 6, paddingTop: 12, borderTop: '1px solid var(--color-border-soft)' }}>
                <div className="stat-label" style={{ marginBottom: 8 }}>
                  Equipment in this system
                </div>
                {s.equipment.length > 0 ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    {s.equipment.map((e) => (
                      <form key={e.id} action={assignEquipment} style={{ display: 'inline-flex' }}>
                        <input type="hidden" name="equipment_id" value={e.id} />
                        <input type="hidden" name="system_id" value="" />
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            border: '1px solid var(--color-border)',
                            borderRadius: 8,
                            padding: '5px 10px',
                            fontSize: 12.5,
                          }}
                        >
                          <span className="mono">{e.tag_id}</span>
                          <button type="submit" className="btn-link" style={{ fontSize: 11 }}>
                            remove
                          </button>
                        </span>
                      </form>
                    ))}
                  </div>
                ) : (
                  <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12 }}>
                    No equipment assigned yet.
                  </p>
                )}

                {unassigned.length > 0 && (
                  <form action={assignEquipment} style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
                    <input type="hidden" name="system_id" value={s.id} />
                    <label className="field" style={{ minWidth: 240 }}>
                      Add a tag to this system
                      <select name="equipment_id" className="input" defaultValue="">
                        <option value="" disabled>
                          — choose —
                        </option>
                        {unassigned.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.tag_id}
                            {e.description ? ` — ${e.description}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" className="btn btn-secondary btn-sm">
                      Assign
                    </button>
                  </form>
                )}
              </div>

              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: '1px solid var(--color-border-soft)',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'end',
                  flexWrap: 'wrap',
                }}
              >
                <form action={updateSystem} style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
                  <input type="hidden" name="id" value={s.id} />
                  <label className="field" style={{ minWidth: 190 }}>
                    Stage
                    <select key={`st-${s.id}-${s.stage}`} name="stage" defaultValue={s.stage ?? 'construction'} className="input">
                      {STAGES.map((x) => (
                        <option key={x.value} value={x.value}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field" style={{ minWidth: 170 }}>
                    Responsible
                    <input
                      key={`r-${s.id}-${s.responsible ?? ''}`}
                      name="responsible"
                      defaultValue={s.responsible ?? ''}
                      className="input"
                    />
                  </label>
                  <input type="hidden" name="boundary" value={s.boundary ?? ''} />
                  <button type="submit" className="btn btn-secondary btn-sm">
                    Save
                  </button>
                </form>
                <form action={deleteSystem} style={{ marginLeft: 'auto' }}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="btn-link">
                    Delete system
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ marginTop: 22 }}>
          <p className="text-secondary" style={{ fontSize: 14, marginBottom: 0 }}>
            No systems yet. Add one above — for a substation that might be 115 kV GIS, Transformer, MV Switchgear,
            Protection, DC Supply and Earthing — then assign your tags to them.
          </p>
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="section-title">Not yet in a system</h2>
          <p className="text-secondary" style={{ fontSize: 13 }}>
            These tags still work exactly as before — they just do not roll up into a system readiness figure until
            they are assigned.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {unassigned.map((e) => (
              <span
                key={e.id}
                className="mono"
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: '5px 10px',
                  fontSize: 12.5,
                }}
              >
                {e.tag_id}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
