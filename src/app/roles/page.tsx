import Link from 'next/link'
import { getCurrentProject } from '@/lib/project'
import { getActor } from '@/lib/audit'
import { loadRoles } from '@/data/project-roles'
import { supabase } from '@/lib/supabase'
import {
  CAPABILITIES,
  roleSetWarnings,
  PROTECTED_KEYS,
  canIn,
  roleLabelIn,
} from '@/lib/project-roles'
import { saveRole, resetRole, importRoles } from './actions'

export const dynamic = 'force-dynamic'

export default async function RolesPage() {
  const project = await getCurrentProject()
  const actor = await getActor(project?.id ?? null)
  const roles = await loadRoles(project?.id ?? null)
  const mayManage = canIn(roles, actor.role, 'manage')

  const warnings = roleSetWarnings(roles)
  const custom = roles.filter((r) => r.custom).length
  const changed = roles.filter((r) => r.overridden).length
  const inactive = roles.filter((r) => !r.active).length

  // How many people are actually on each role, so switching one off is an
  // informed decision rather than a surprise.
  const { data: memberRows } = project
    ? await supabase.from('project_members').select('role').eq('project_id', project.id)
    : { data: [] as { role: string }[] }

  const memberCount = new Map<string, number>()
  for (const m of memberRows ?? []) memberCount.set(m.role, (memberCount.get(m.role) ?? 0) + 1)

  return (
    <>
      <h1 className="page-title">Roles</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — what the people on this site are called and what each of
        them may do. The twelve defaults are a starting point, not a rule: rename them, change what they may do,
        switch off the ones you do not use, or add your own.
      </p>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Roles in use</div>
          <div className="stat-value">{roles.filter((r) => r.active).length}</div>
          <div className="stat-note">Offered when adding somebody</div>
        </div>
        <div className="stat">
          <div className="stat-label">Your own</div>
          <div className="stat-value" style={{ color: custom > 0 ? 'var(--color-success)' : undefined }}>
            {custom}
          </div>
          <div className="stat-note">Added for this site</div>
        </div>
        <div className="stat">
          <div className="stat-label">Changed</div>
          <div className="stat-value">{changed}</div>
          <div className="stat-note">Built-in roles you have altered</div>
        </div>
        <div className="stat">
          <div className="stat-label">Switched off</div>
          <div className="stat-value">{inactive}</div>
          <div className="stat-note">Hidden, not deleted</div>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="alert alert-danger" style={{ marginTop: 20 }}>
          <strong>This role list has a gap.</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="alert alert-info" style={{ marginTop: 20 }}>
        <strong>Project Admin and Super Admin always keep every capability</strong> and cannot be switched off. That
        is deliberate: without it, one edit or one bad import could leave nobody able to undo it.
      </div>

      {/* ── Export / import ──────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 20 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>
          Excel round trip
        </h2>
        <p className="text-secondary" style={{ fontSize: 13.5 }}>
          Download the list, edit it in Excel the way your site describes its people, and bring it back. A row whose
          key already exists is updated; a new key is added. Nothing is removed by an import.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <a href="/roles/export" className="btn btn-secondary btn-sm">
            Download current roles (.xlsx)
          </a>
          <a href="/roles/template" className="btn btn-secondary btn-sm">
            Download a blank template
          </a>
        </div>

        {mayManage ? (
          <form action={importRoles} style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: '1 1 320px' }}>
              Import a role list
              <input type="file" name="file" accept=".xlsx,.xls,.csv" required className="input" />
            </label>
            <button type="submit" className="btn btn-primary" disabled={!project}>
              Import
            </button>
          </form>
        ) : (
          <p className="text-secondary" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
            Your role ({roleLabelIn(roles, actor.role)}) cannot change the role list.
          </p>
        )}

        <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 14, marginBottom: 0 }}>
          The importer reads your headings, not ours — <em>Role</em>, <em>Position</em>, <em>Designation</em> and{' '}
          <em>Job title</em> all work, and capabilities can be one column listing them or one column each with a Y.
          If a row cannot be read, <strong>nothing is imported at all</strong> and the reason for every bad row is
          written to the{' '}
          <Link href="/audit" className="link">
            audit trail
          </Link>{' '}
          with its row number — a half-applied role list is worse than none.
        </p>
      </div>

      {/* ── The matrix ───────────────────────────────────────────── */}
      <h2 className="section-title" style={{ marginTop: 30 }}>
        What each role may do
      </h2>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ minWidth: 240 }}>Role</th>
              {CAPABILITIES.map((c) => (
                <th key={c.value} style={{ textAlign: 'center' }} title={c.note}>
                  {c.label}
                </th>
              ))}
              <th style={{ textAlign: 'right' }}>People</th>
              <th>Source</th>
              {mayManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => {
              const protectedRole = PROTECTED_KEYS.has(r.value)
              return (
                <tr key={r.value} style={{ opacity: r.active ? 1 : 0.5 }}>
                  <td>
                    <div style={{ fontWeight: 500 }}>
                      {r.label}
                      {!r.active && (
                        <span className="badge badge-neutral" style={{ marginLeft: 8 }}>
                          off
                        </span>
                      )}
                    </div>
                    <div className="text-secondary" style={{ fontSize: 12 }}>
                      {r.note}
                    </div>
                    <div className="text-secondary mono" style={{ fontSize: 10.5, marginTop: 2 }}>
                      {r.value}
                    </div>
                  </td>
                  {CAPABILITIES.map((c) => (
                    <td key={c.value} style={{ textAlign: 'center' }}>
                      {r.caps.includes(c.value) ? (
                        <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>&#10003;</span>
                      ) : (
                        <span className="text-secondary">&ndash;</span>
                      )}
                    </td>
                  ))}
                  <td className="mono" style={{ textAlign: 'right', fontSize: 12.5 }}>
                    {memberCount.get(r.value) ?? '—'}
                  </td>
                  <td>
                    {r.custom ? (
                      <span className="badge badge-success">Yours</span>
                    ) : r.overridden ? (
                      <span className="badge badge-warning">Changed</span>
                    ) : (
                      <span className="badge badge-neutral">Built-in</span>
                    )}
                  </td>
                  {mayManage && (
                    <td>
                      {(r.custom || r.overridden) && !protectedRole && (
                        <form action={resetRole}>
                          <input type="hidden" name="role_key" value={r.value} />
                          <input type="hidden" name="label" value={r.label} />
                          <button type="submit" className="btn-link" style={{ fontSize: 12 }}>
                            {r.custom ? 'remove' : 'restore default'}
                          </button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Edit one role ────────────────────────────────────────── */}
      {mayManage && (
        <>
          <h2 className="section-title" style={{ marginTop: 30 }}>
            Change a role, or add one
          </h2>
          <div className="card">
            <form action={saveRole} style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
                <label className="field">
                  Role name *
                  <input name="label" required className="input" placeholder="e.g. Authorised Person" />
                </label>
                <label className="field">
                  Key
                  <input name="role_key" className="input" placeholder="Leave blank to make one from the name" />
                </label>
              </div>
              <label className="field">
                Note
                <input name="note" className="input" placeholder="What this person does on your site" />
              </label>
              <div className="field">
                May
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
                  {CAPABILITIES.map((c) => (
                    <label
                      key={c.value}
                      style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400, fontSize: 13.5 }}
                      title={c.note}
                    >
                      <input type="checkbox" name="caps" value={c.value} defaultChecked={c.value === 'view'} />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
                <input type="checkbox" name="active" defaultChecked />
                In use on this site
              </label>
              <p className="text-secondary" style={{ fontSize: 12.5, margin: 0 }}>
                Using the key of a built-in role changes that role for this project. Using a new name adds a role of
                your own. Either way the change is recorded in the audit trail, and it takes effect everywhere
                immediately — anyone holding that role gains or loses those rights on their next page load.
              </p>
              <div>
                <button type="submit" className="btn btn-primary" disabled={!project}>
                  Save role
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  )
}
