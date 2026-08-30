import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { getActor } from '@/lib/audit'
import { can } from '@/lib/roles'
import {
  PARTIES,
  DISCIPLINES,
  partyLabel,
  partyBadgeClass,
  disciplineLabel,
  canBeNotified,
  defaultRecipients,
  type Contact,
} from '@/lib/contacts'
import { addContact, toggleWitness, removeContact } from './actions'

export const dynamic = 'force-dynamic'

export default async function ContactsPage() {
  const project = await getCurrentProject()
  const actor = await getActor(project?.id ?? null)
  const mayManage = can(actor.role, 'manage')

  const { data: rows } = project
    ? await supabase
        .from('project_contacts')
        .select('id, full_name, company, email, phone, party, job_title, discipline, is_witness')
        .eq('project_id', project.id)
        .order('company', { ascending: true })
    : { data: [] as Contact[] }

  const contacts = (rows ?? []) as Contact[]
  const withEmail = contacts.filter(canBeNotified)
  const witnesses = defaultRecipients(contacts)

  return (
    <>
      <h1 className="page-title">Contacts</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — the client, consultant, vendors and anyone else who has
        to be told when an inspection is ready. This is who an inspection notice gets addressed to.
      </p>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Contacts</div>
          <div className="stat-value">{contacts.length}</div>
          <div className="stat-note">On this project</div>
        </div>
        <div className="stat">
          <div className="stat-label">Reachable by email</div>
          <div className="stat-value">{withEmail.length}</div>
          <div className="stat-note">Have an email address on file</div>
        </div>
        <div className="stat">
          <div className="stat-label">Inspection witnesses</div>
          <div className="stat-value" style={{ color: witnesses.length > 0 ? 'var(--color-success)' : undefined }}>
            {witnesses.length}
          </div>
          <div className="stat-note">Notified by default</div>
        </div>
      </div>

      {contacts.length === 0 && (
        <div className="alert alert-info" style={{ marginTop: 20 }}>
          <strong>Nobody here yet.</strong> Add the client&rsquo;s representative first — until somebody has an email
          address on file, the <Link href="/holdpoints" className="link">Hold &amp; Witness Points</Link> page has
          nowhere to send an inspection notice.
        </div>
      )}

      {contacts.length > 0 && witnesses.length === 0 && (
        <div className="alert" style={{ marginTop: 20, background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
          <strong>No witnesses marked.</strong> Tick &ldquo;witness&rdquo; against whoever attends inspections, so a
          hold point notice is addressed to them automatically instead of you choosing every time.
        </div>
      )}

      {mayManage ? (
        <div className="card" style={{ marginTop: 20 }}>
          <h2 className="section-title">Add a contact</h2>
          <form action={addContact} style={{ display: 'grid', gap: 14, gridTemplateColumns: '1.3fr 1.2fr 1.4fr' }}>
            <label className="field">
              Name *
              <input name="full_name" required className="input" placeholder="e.g. Somchai Wattana" />
            </label>
            <label className="field">
              Company
              <input name="company" className="input" placeholder="e.g. EGAT" />
            </label>
            <label className="field">
              Email
              <input name="email" type="email" className="input" placeholder="name@company.com" />
            </label>
            <label className="field">
              Job title
              <input name="job_title" className="input" placeholder="e.g. Resident Engineer" />
            </label>
            <label className="field">
              Phone
              <input name="phone" className="input" placeholder="+66 ..." />
            </label>
            <label className="field">
              Party
              <select name="party" className="input" defaultValue="client">
                {PARTIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Discipline
              <select name="discipline" className="input" defaultValue="">
                {DISCIPLINES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ justifyContent: 'flex-end' }}>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 500 }}>
                <input type="checkbox" name="is_witness" defaultChecked />
                Attends inspections
              </span>
            </label>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={!project}>
                Add contact
              </button>
            </div>
          </form>
          <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
            A contact is not a login. These people do not get access to CxSentinel — this is only so notices can be
            addressed to them. To give somebody an account, use{' '}
            <Link href="/team" className="link">
              Project Team
            </Link>{' '}
            instead.
          </p>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 20 }}>
          <p className="text-secondary" style={{ fontSize: 14, marginBottom: 0 }}>
            Your role cannot change the contact list. Ask a Project Admin or Commissioning Manager.
          </p>
        </div>
      )}

      <div className="table-wrap" style={{ marginTop: 24 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Company</th>
              <th>Party</th>
              <th>Discipline</th>
              <th>Email</th>
              <th>Phone</th>
              <th style={{ textAlign: 'center' }}>Witness</th>
              {mayManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {contacts.length > 0 ? (
              contacts.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{c.full_name}</div>
                    {c.job_title && (
                      <div className="text-secondary" style={{ fontSize: 12 }}>
                        {c.job_title}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 13.5 }}>{c.company ?? '—'}</td>
                  <td>
                    <span className={partyBadgeClass(c.party)}>{partyLabel(c.party)}</span>
                  </td>
                  <td style={{ fontSize: 13 }}>{disciplineLabel(c.discipline)}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="link">
                        {c.email}
                      </a>
                    ) : (
                      <span className="text-secondary">no email — cannot be notified</span>
                    )}
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {c.phone ?? '—'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {mayManage ? (
                      <form action={toggleWitness}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="label" value={c.full_name} />
                        <input type="hidden" name="next" value={c.is_witness ? 'false' : 'true'} />
                        <button type="submit" className="btn-link" style={{ fontSize: 13 }}>
                          {c.is_witness ? '✓ yes' : 'no'}
                        </button>
                      </form>
                    ) : c.is_witness ? (
                      <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>&#10003;</span>
                    ) : (
                      <span className="text-secondary">&ndash;</span>
                    )}
                  </td>
                  {mayManage && (
                    <td>
                      <form action={removeContact}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="label" value={c.full_name} />
                        <button type="submit" className="btn-link">
                          Remove
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={mayManage ? 8 : 7} className="empty-row">
                  No contacts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
