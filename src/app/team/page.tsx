import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { getActor } from '@/lib/audit'
import { roleBadgeClass } from '@/lib/roles'
import { loadRoles } from '@/data/project-roles'
import { activeRoles, canIn, roleLabelIn, CAPABILITIES } from '@/lib/project-roles'
import { addMember, updateMemberRole, removeMember } from './actions'

export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const project = await getCurrentProject()
  const actor = await getActor(project?.id ?? null)

  // The role list THIS site works to, not the twelve compiled in.
  const roles = await loadRoles(project?.id ?? null)
  const offered = activeRoles(roles)

  const { data: rows } = project
    ? await supabase
        .from('project_members')
        .select('id, email, full_name, company, role, created_at')
        .eq('project_id', project.id)
        .order('created_at')
    : { data: [] as { id: string; email: string; full_name: string | null; company: string | null; role: string; created_at: string }[] }

  const members = rows ?? []
  const isFirst = members.length === 0
  const mayManage = canIn(roles, actor.role, 'manage')

  const approvers = members.filter((m) => canIn(roles, m.role, 'approve')).length

  return (
    <>
      <h1 className="page-title">Project Team</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — who is on this project and what each of them may do.
        Signed in as <strong>{actor.name || actor.email}</strong>{' '}
        <span className={roleBadgeClass(actor.role)}>{roleLabelIn(roles, actor.role)}</span>
      </p>

      {isFirst && (
        <div className="alert" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
          <strong>Nobody is listed yet, so everyone who can log in has full access.</strong> The moment you add
          the first person, roles start applying — so add yourself first, as Project Admin, or you will lose the
          ability to manage this project.
        </div>
      )}

      {!isFirst && approvers === 0 && (
        <div className="alert alert-danger">
          <strong>Nobody on this project can approve anything.</strong> Add a Commissioning Manager, QA/QC or
          Client, or no record can be closed out.
        </div>
      )}

      {mayManage ? (
        <div className="card">
          <h2 className="section-title">{isFirst ? 'Add yourself first' : 'Add someone to the project'}</h2>
          <form action={addMember} style={{ display: 'grid', gap: 14, gridTemplateColumns: '1.4fr 1fr 1fr' }}>
            <label className="field">
              Email *
              <input
                name="email"
                type="email"
                required
                defaultValue={isFirst ? actor.email : ''}
                placeholder="name@company.com"
                className="input"
              />
            </label>
            <label className="field">
              Name
              <input name="full_name" defaultValue={isFirst ? actor.name : ''} className="input" />
            </label>
            <label className="field">
              Company
              <input name="company" placeholder="e.g. EGAT, contractor" className="input" />
            </label>
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              Role
              <select name="role" className="input" defaultValue={isFirst ? 'project_admin' : 'engineer'}>
                {offered.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label} — {r.note}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ gridColumn: '1 / -1' }}>
              <button type="submit" className="btn btn-primary" disabled={!project}>
                {isFirst ? 'Add me as Project Admin' : 'Add to project'}
              </button>
            </div>
          </form>
          <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
            The email must match the one they log in with. Adding someone here does not create their account —
            they sign up themselves, and their role applies from the first time they log in.
          </p>
        </div>
      ) : (
        <div className="card">
          <p className="text-secondary" style={{ fontSize: 14, marginBottom: 0 }}>
            Your role is {roleLabelIn(roles, actor.role)}, which cannot change the project team. Ask a Project Admin or
            Commissioning Manager.
          </p>
        </div>
      )}

      <div className="table-wrap" style={{ marginTop: 24 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Company</th>
              <th>Role</th>
              <th>May</th>
              {mayManage && <th style={{ minWidth: 260 }}>Change</th>}
            </tr>
          </thead>
          <tbody>
            {members.length > 0 ? (
              members.map((m) => {
                const isMe = m.email.toLowerCase() === actor.email.toLowerCase()
                const caps = roles.find((r) => r.value === m.role)?.caps ?? ['view']
                return (
                  <tr key={m.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>
                        {m.full_name || m.email}
                        {isMe && (
                          <span className="badge badge-info" style={{ marginLeft: 8 }}>
                            you
                          </span>
                        )}
                      </div>
                      <div className="text-secondary mono" style={{ fontSize: 12 }}>
                        {m.email}
                      </div>
                    </td>
                    <td style={{ fontSize: 13.5 }}>{m.company ?? '—'}</td>
                    <td>
                      <span className={roleBadgeClass(m.role)}>{roleLabelIn(roles, m.role)}</span>
                    </td>
                    <td className="text-secondary mono" style={{ fontSize: 11.5 }}>
                      {caps.join(' · ')}
                    </td>
                    {mayManage && (
                      <td>
                        <form style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input type="hidden" name="id" value={m.id} />
                          <input type="hidden" name="email" value={m.email} />
                          <input type="hidden" name="previous_role" value={m.role} />
                          <select key={`r-${m.id}-${m.role}`} name="role" defaultValue={m.role} className="input">
                            {offered.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                          <button formAction={updateMemberRole} type="submit" className="btn btn-secondary btn-sm">
                            Save
                          </button>
                          <button formAction={removeMember} type="submit" className="btn-link">
                            Remove
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={mayManage ? 5 : 4} className="empty-row">
                  Nobody added yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h2 className="section-title">What each role may do</h2>
        <div className="table-wrap" style={{ border: 'none', boxShadow: 'none', background: 'transparent' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Role</th>
                <th>View</th>
                <th>Record</th>
                <th>Review</th>
                <th>Approve</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {offered.map((r) => (
                <tr key={r.value}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{r.label}</div>
                    <div className="text-secondary" style={{ fontSize: 12 }}>
                      {r.note}
                    </div>
                  </td>
                  {CAPABILITIES.map((cap) => (
                    <td key={cap.value} style={{ textAlign: 'center' }}>
                      {r.caps.includes(cap.value) ? (
                        <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>&#10003;</span>
                      ) : (
                        <span className="text-secondary">&ndash;</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
