import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { latestSignature, releaseState, type SignatureLike } from '@/lib/inspection'
import { computeAlerts, alertBadgeClass, mailtoLink, mailtoIsSafe, type Alert } from '@/lib/notify'
import { canBeNotified, type Contact } from '@/lib/contacts'

export const dynamic = 'force-dynamic'

type NoticeRow = {
  id: string
  entity: string | null
  entity_label: string | null
  subject: string | null
  body: string | null
  recipients: string | null
  recipient_names: string | null
  scheduled_for: string | null
  status: string | null
  sent_at: string | null
  created_at: string | null
  created_by_name: string | null
}

function when(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function NotificationsPage() {
  const project = await getCurrentProject()

  const { data: equipmentRows } = project
    ? await supabase.from('equipment').select('id, tag_id').eq('project_id', project.id)
    : { data: [] as { id: string; tag_id: string }[] }

  const equipment = equipmentRows ?? []
  const equipmentIds = equipment.map((e) => e.id)
  const tagOf = new Map(equipment.map((e) => [e.id, e.tag_id]))

  const { data: signatureRows } = project
    ? await supabase.from('signatures').select('entity, entity_id, decision, created_at').eq('project_id', project.id)
    : { data: [] as SignatureLike[] }
  const signatures = (signatureRows ?? []) as SignatureLike[]

  const { data: checkRows } =
    equipmentIds.length > 0
      ? await supabase
          .from('checklist_items')
          .select('id, item, status, review_state, inspection_type, notified_at, equipment_id')
          .in('equipment_id', equipmentIds)
      : {
          data: [] as {
            id: string
            item: string
            status: string
            review_state: string | null
            inspection_type: string | null
            notified_at: string | null
            equipment_id: string
          }[],
        }

  const { data: testRows } =
    equipmentIds.length > 0
      ? await supabase
          .from('test_records')
          .select('id, name, result, approval_state, inspection_type, notified_at, equipment_id')
          .in('equipment_id', equipmentIds)
      : {
          data: [] as {
            id: string
            name: string
            result: string
            approval_state: string | null
            inspection_type: string | null
            notified_at: string | null
            equipment_id: string
          }[],
        }

  const { data: issueRows } =
    equipmentIds.length > 0
      ? await supabase.from('issues').select('title, category, status, severity').in('equipment_id', equipmentIds)
      : { data: [] as { title: string; category: string | null; status: string; severity: string }[] }

  const { data: instrumentRows } = project
    ? await supabase
        .from('instruments')
        .select('instrument_id, name, calibration_expiry')
        .eq('project_id', project.id)
    : { data: [] as { instrument_id: string; name: string | null; calibration_expiry: string | null }[] }

  const { data: contactRows } = project
    ? await supabase
        .from('project_contacts')
        .select('id, full_name, company, email, phone, party, job_title, discipline, is_witness')
        .eq('project_id', project.id)
    : { data: [] as Contact[] }

  const { data: noticeRows } = project
    ? await supabase
        .from('notifications')
        .select(
          'id, entity, entity_label, subject, body, recipients, recipient_names, scheduled_for, status, sent_at, created_at, created_by_name'
        )
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
    : { data: [] as NoticeRow[] }

  const notices = (noticeRows ?? []) as NoticeRow[]

  const checks = (checkRows ?? []).map((c) => ({
    item: c.item,
    status: c.status,
    review_state: c.review_state,
    inspection_type: c.inspection_type,
    notified_at: c.notified_at,
    tag: tagOf.get(c.equipment_id) ?? '—',
    release: releaseState({
      inspectionType: c.inspection_type,
      workComplete: c.status !== 'pending',
      notifiedAt: c.notified_at,
      signature: latestSignature(signatures, 'checklist_item', c.id),
    }),
  }))

  const tests = (testRows ?? []).map((t) => ({
    name: t.name,
    result: t.result,
    approval_state: t.approval_state,
    inspection_type: t.inspection_type,
    tag: tagOf.get(t.equipment_id) ?? '—',
    release: releaseState({
      inspectionType: t.inspection_type,
      workComplete: t.result !== 'pending',
      notifiedAt: t.notified_at,
      signature: latestSignature(signatures, 'test_record', t.id),
    }),
  }))

  const contacts = (contactRows ?? []) as Contact[]

  const alerts: Alert[] = computeAlerts({
    instruments: instrumentRows ?? [],
    tests,
    checks,
    issues: issueRows ?? [],
    contactsWithEmail: contacts.filter(canBeNotified).length,
  })

  const critical = alerts.filter((a) => a.severity === 'critical')
  const warnings = alerts.filter((a) => a.severity === 'warning')
  const info = alerts.filter((a) => a.severity === 'info')
  const unsent = notices.filter((n) => n.status !== 'sent')

  return (
    <>
      <h1 className="page-title">Alerts &amp; Notices</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — what needs attention right now, worked out from the
        records themselves, and every inspection notice issued on this project.
      </p>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Critical</div>
          <div className="stat-value" style={{ color: critical.length > 0 ? 'var(--color-danger)' : undefined }}>
            {critical.length}
          </div>
          <div className="stat-note">Stopping work or invalidating records</div>
        </div>
        <div className="stat">
          <div className="stat-label">Warnings</div>
          <div className="stat-value">{warnings.length}</div>
          <div className="stat-note">Worth seeing, not blocking</div>
        </div>
        <div className="stat">
          <div className="stat-label">Notices issued</div>
          <div className="stat-value">{notices.length}</div>
          <div className="stat-note">Inspection invitations on record</div>
        </div>
        <div className="stat">
          <div className="stat-label">Not sent yet</div>
          <div className="stat-value" style={{ color: unsent.length > 0 ? 'var(--color-warning)' : undefined }}>
            {unsent.length}
          </div>
          <div className="stat-note">Written but still in your outbox</div>
        </div>
      </div>

      {alerts.length === 0 && (
        <div className="alert alert-info" style={{ marginTop: 20 }}>
          Nothing needs attention. Either the project is genuinely clean, or there is not enough recorded yet for
          anything to be wrong — check the <Link href="/dashboard" className="link">Dashboard</Link> to see which.
        </div>
      )}

      {alerts.length > 0 && (
        <>
          <h2 className="section-title" style={{ marginTop: 28 }}>
            What needs attention
          </h2>
          <p className="text-secondary" style={{ fontSize: 13, marginTop: -6 }}>
            These are worked out live from the checks, tests, instruments and punch items. Fix the cause and the
            alert disappears by itself — there is nothing to dismiss.
          </p>

          {([...critical, ...warnings, ...info] as Alert[]).map((a, i) => (
            <div
              key={`${a.category}-${i}`}
              className="card"
              style={{
                marginBottom: 12,
                borderLeft: `4px solid ${
                  a.severity === 'critical'
                    ? 'var(--color-danger-solid)'
                    : a.severity === 'warning'
                      ? 'var(--color-warning-solid, #d97706)'
                      : 'var(--color-primary)'
                }`,
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                <span className={alertBadgeClass(a.severity)}>{a.severity}</span>
                <span className="text-secondary mono" style={{ fontSize: 11.5, textTransform: 'uppercase' }}>
                  {a.category}
                </span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{a.title}</div>
              <p className="text-secondary" style={{ fontSize: 13.5, margin: '6px 0 10px' }}>
                {a.detail}
              </p>
              <Link href={a.href} className="link" style={{ fontSize: 13.5 }}>
                Go and deal with it →
              </Link>
            </div>
          ))}
        </>
      )}

      <h2 className="section-title" style={{ marginTop: 32 }}>
        Notice register
      </h2>
      <p className="text-secondary" style={{ fontSize: 13, marginTop: -6 }}>
        Every inspection notice issued on this project, newest first. The wording and the recipients of a notice
        cannot be changed once it is written — the database refuses it — because on a witness point this record is
        what proves the client was properly invited.
      </p>

      {notices.length === 0 ? (
        <div className="card">
          <p className="text-secondary" style={{ fontSize: 14, marginBottom: 0 }}>
            No notices issued yet. Mark an activity as a hold or witness point on the{' '}
            <Link href="/holdpoints" className="link">
              Hold &amp; Witness Points
            </Link>{' '}
            page, then give notice from there.
          </p>
        </div>
      ) : (
        notices.map((n) => {
          const to = (n.recipients ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
          const link = n.subject && n.body ? mailtoLink(to, n.subject, n.body) : null
          return (
            <div key={n.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                <span className={n.status === 'sent' ? 'badge badge-success' : 'badge badge-warning'}>
                  {n.status === 'sent' ? 'Sent' : 'Not sent yet'}
                </span>
                <span className="text-secondary" style={{ fontSize: 12.5 }}>
                  Issued {when(n.created_at)}
                  {n.created_by_name ? ` by ${n.created_by_name}` : ''}
                  {n.sent_at ? ` · sent ${when(n.sent_at)}` : ''}
                </span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>{n.subject}</div>
              <div className="text-secondary" style={{ fontSize: 12.5, marginTop: 4 }}>
                To {n.recipient_names || n.recipients || 'nobody'}
                {n.scheduled_for ? ` · inspection scheduled ${when(n.scheduled_for)}` : ''}
              </div>
              {n.status !== 'sent' && link && mailtoIsSafe(link) && (
                <a href={link} className="btn btn-secondary btn-sm" style={{ marginTop: 10 }}>
                  Open in my email
                </a>
              )}
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Read the notice</summary>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    marginTop: 8,
                    marginBottom: 0,
                    fontFamily: 'inherit',
                  }}
                >
                  {n.body}
                </pre>
              </details>
            </div>
          )
        })
      )}
    </>
  )
}
