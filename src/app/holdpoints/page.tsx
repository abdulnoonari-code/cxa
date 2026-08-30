import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { getActor } from '@/lib/audit'
import { can } from '@/lib/roles'
import { LEVELS, statusBadgeClass } from '@/lib/checklist'
import { resultBadgeClass } from '@/lib/tests'
import {
  INSPECTION_TYPES,
  DECISIONS,
  carriesRelease,
  inspectionLabel,
  inspectionCode,
  inspectionBadgeClass,
  latestSignature,
  releaseState,
  releaseLabel,
  releaseBadgeClass,
  releaseBlocks,
  decisionLabel,
  decisionBadgeClass,
  type ReleaseState,
  type SignatureLike,
} from '@/lib/inspection'
import { defaultRecipients, canBeNotified, type Contact } from '@/lib/contacts'
import { mailtoLink, mailtoIsSafe } from '@/lib/notify'
import { setInspectionType, giveNotice, signHoldPoint, markNoticeSent } from './actions'

type NoticeRow = {
  id: string
  entity: string
  entity_id: string
  subject: string | null
  body: string | null
  recipients: string | null
  recipient_names: string | null
  scheduled_for: string | null
  status: string | null
  sent_at: string | null
  created_at: string | null
}

export const dynamic = 'force-dynamic'

type Point = {
  kind: 'check' | 'test'
  id: string
  label: string
  tag: string
  detail: string
  level: string | null
  inspection_type: string
  notified_at: string | null
  workComplete: boolean
  statusLabel: string
  statusClass: string
  release: ReleaseState
  signature: SignatureRow | null
  notice: NoticeRow | null
  location: string | null
  procedureRef: string | null
  acceptance: string | null
}

type SignatureRow = SignatureLike & {
  id: string
  entity_label: string | null
  signer_name: string | null
  signer_role: string | null
  signer_company: string | null
  signed_name: string | null
  statement: string | null
  comment: string | null
}

// Written out in words so it can go straight into a notice email that a client
// reads on a phone, rather than as a code only this app understands.
function describeCriteria(t: {
  criteria_type: string | null
  expected_min: number | null
  expected_max: number | null
  unit: string | null
  criteria_text: string | null
}): string | null {
  const u = t.unit ? ` ${t.unit}` : ''
  switch (t.criteria_type) {
    case 'max':
      return t.expected_max != null ? `Not more than ${t.expected_max}${u}` : t.criteria_text
    case 'min':
      return t.expected_min != null ? `Not less than ${t.expected_min}${u}` : t.criteria_text
    case 'range':
      return t.expected_min != null && t.expected_max != null
        ? `Between ${t.expected_min} and ${t.expected_max}${u}`
        : t.criteria_text
    default:
      return t.criteria_text
  }
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

export default async function HoldPointsPage({
  searchParams,
}: {
  searchParams: Promise<{ equipment?: string; type?: string }>
}) {
  const { equipment: equipmentFilter, type: typeFilter } = await searchParams

  const project = await getCurrentProject()
  const actor = await getActor(project?.id ?? null)
  const maySign = can(actor.role, 'approve')
  const mayRecord = can(actor.role, 'record')
  const mayAssign = can(actor.role, 'review')

  const { data: equipmentRows } = project
    ? await supabase
        .from('equipment')
        .select('id, tag_id, description, location')
        .eq('project_id', project.id)
        .order('tag_id')
    : { data: [] as { id: string; tag_id: string; description: string | null; location: string | null }[] }

  const equipment = equipmentRows ?? []
  const equipmentIds = equipment.map((e) => e.id)
  const tagOf = new Map(equipment.map((e) => [e.id, e.tag_id]))
  const locationOf = new Map(equipment.map((e) => [e.id, e.location]))

  const { data: contactRows } = project
    ? await supabase
        .from('project_contacts')
        .select('id, full_name, company, email, phone, party, job_title, discipline, is_witness')
        .eq('project_id', project.id)
        .order('company', { ascending: true })
    : { data: [] as Contact[] }

  const contacts = (contactRows ?? []) as Contact[]
  const reachable = contacts.filter(canBeNotified)
  const preselected = new Set(defaultRecipients(contacts).map((c) => c.id))

  const { data: noticeRows } = project
    ? await supabase
        .from('notifications')
        .select(
          'id, entity, entity_id, subject, body, recipients, recipient_names, scheduled_for, status, sent_at, created_at'
        )
        .eq('project_id', project.id)
        .eq('kind', 'inspection_notice')
        .order('created_at', { ascending: false })
    : { data: [] as NoticeRow[] }

  const notices = (noticeRows ?? []) as NoticeRow[]
  const latestNotice = (entity: string, entityId: string): NoticeRow | null =>
    notices.find((n) => n.entity === entity && n.entity_id === entityId) ?? null

  const { data: checkRows } =
    equipmentIds.length > 0
      ? await supabase
          .from('checklist_items')
          .select('id, item, level, status, inspection_type, notified_at, equipment_id')
          .in('equipment_id', equipmentIds)
          .order('level', { ascending: true })
      : {
          data: [] as {
            id: string
            item: string
            level: string
            status: string
            inspection_type: string | null
            notified_at: string | null
            equipment_id: string
          }[],
        }

  const { data: testRows } =
    equipmentIds.length > 0
      ? await supabase
          .from('test_records')
          .select(
            'id, name, test_ref, result, inspection_type, notified_at, procedure_ref, criteria_type, expected_min, expected_max, unit, criteria_text, equipment_id'
          )
          .in('equipment_id', equipmentIds)
          .order('created_at', { ascending: true })
      : {
          data: [] as {
            id: string
            name: string
            test_ref: string | null
            result: string
            inspection_type: string | null
            notified_at: string | null
            procedure_ref: string | null
            criteria_type: string | null
            expected_min: number | null
            expected_max: number | null
            unit: string | null
            criteria_text: string | null
            equipment_id: string
          }[],
        }

  const { data: signatureRows } = project
    ? await supabase
        .from('signatures')
        .select(
          'id, entity, entity_id, entity_label, signer_name, signer_role, signer_company, signed_name, decision, statement, comment, created_at'
        )
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
    : { data: [] as SignatureRow[] }

  const signatures = (signatureRows ?? []) as SignatureRow[]

  const points: Point[] = [
    ...(checkRows ?? []).map((c) => {
      const type = c.inspection_type ?? 'surveillance'
      const signature = latestSignature(signatures, 'checklist_item', c.id)
      const workComplete = c.status !== 'pending'
      return {
        kind: 'check' as const,
        id: c.id,
        label: `${tagOf.get(c.equipment_id) ?? 'Equipment'} — ${c.item}`,
        tag: tagOf.get(c.equipment_id) ?? '—',
        detail: c.item,
        level: c.level,
        inspection_type: type,
        notified_at: c.notified_at,
        workComplete,
        statusLabel: c.status,
        statusClass: statusBadgeClass(c.status),
        release: releaseState({
          inspectionType: type,
          workComplete,
          notifiedAt: c.notified_at,
          signature,
        }),
        signature,
        notice: latestNotice('checklist_item', c.id),
        location: locationOf.get(c.equipment_id) ?? null,
        procedureRef: null,
        acceptance: null,
      }
    }),
    ...(testRows ?? []).map((t) => {
      const type = t.inspection_type ?? 'surveillance'
      const signature = latestSignature(signatures, 'test_record', t.id)
      const workComplete = t.result !== 'pending'
      return {
        kind: 'test' as const,
        id: t.id,
        label: `${tagOf.get(t.equipment_id) ?? 'Equipment'} — ${t.name}`,
        tag: tagOf.get(t.equipment_id) ?? '—',
        detail: t.test_ref ? `${t.test_ref} · ${t.name}` : t.name,
        level: null,
        inspection_type: type,
        notified_at: t.notified_at,
        workComplete,
        statusLabel: t.result,
        statusClass: resultBadgeClass(t.result),
        release: releaseState({
          inspectionType: type,
          workComplete,
          notifiedAt: t.notified_at,
          signature,
        }),
        signature,
        notice: latestNotice('test_record', t.id),
        location: locationOf.get(t.equipment_id) ?? null,
        procedureRef: t.procedure_ref,
        acceptance: describeCriteria(t),
      }
    }),
  ]

  const controlled = points.filter((p) => carriesRelease(p.inspection_type))
  const blocking = controlled.filter((p) => releaseBlocks(p.inspection_type, p.release))
  const released = controlled.filter((p) => p.release === 'released')
  const awaiting = controlled.filter((p) => p.release === 'awaiting_notice' || p.release === 'notified')
  const ahead = controlled.filter((p) => p.release === 'awaiting_work')

  // The queue is what somebody actually works from: reached first, then the
  // ones that will be reached, and refusals at the very top.
  const order: Record<ReleaseState, number> = {
    rejected: 0,
    notified: 1,
    awaiting_notice: 2,
    awaiting_work: 3,
    released: 4,
    not_required: 5,
  }
  const queue = [...controlled].sort((a, b) => order[a.release] - order[b.release])

  let assignable = points
  if (equipmentFilter) assignable = assignable.filter((p) => tagOf.get(equipmentFilter) === p.tag)
  if (typeFilter) assignable = assignable.filter((p) => p.inspection_type === typeFilter)

  return (
    <>
      <h1 className="page-title">Hold &amp; Witness Points</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — the points on the ITP where work stops or somebody has
        to attend, and the signatures that release them.
      </p>

      {!project && (
        <div className="alert alert-info">
          No project selected. Pick one from the sidebar, or <Link href="/projects" className="link">create one</Link>.
        </div>
      )}

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Blocking now</div>
          <div className="stat-value" style={{ color: blocking.length > 0 ? 'var(--color-danger)' : undefined }}>
            {blocking.length}
          </div>
          <div className="stat-note">Work may not proceed past these</div>
        </div>
        <div className="stat">
          <div className="stat-label">Awaiting signature</div>
          <div className="stat-value">{awaiting.length}</div>
          <div className="stat-note">Reached, not yet signed</div>
        </div>
        <div className="stat">
          <div className="stat-label">Released</div>
          <div className="stat-value" style={{ color: 'var(--color-success)' }}>
            {released.length}
          </div>
          <div className="stat-note">Signed and cleared to proceed</div>
        </div>
        <div className="stat">
          <div className="stat-label">Still ahead</div>
          <div className="stat-value">{ahead.length}</div>
          <div className="stat-note">Work not yet carried out</div>
        </div>
      </div>

      {blocking.length > 0 && (
        <div className="alert alert-danger" style={{ marginTop: 20 }}>
          <strong>
            {blocking.length} inspection point{blocking.length === 1 ? '' : 's'} {blocking.length === 1 ? 'is' : 'are'}{' '}
            holding this project.
          </strong>{' '}
          These also appear as blockers on the Readiness page, so a system cannot show as ready while one is open.
        </div>
      )}

      {!maySign && controlled.length > 0 && (
        <div className="alert alert-info" style={{ marginTop: 20 }}>
          Your role cannot release a hold point. You can give notice and set activity types; releasing needs a
          Commissioning Manager, QA/QC, Client or Project Admin.
        </div>
      )}

      {/* ── The queue ─────────────────────────────────────────────────── */}
      <h2 className="section-title" style={{ marginTop: 28 }}>
        Inspection point register
      </h2>

      {queue.length === 0 ? (
        <div className="card">
          <p className="text-secondary" style={{ marginBottom: 0, fontSize: 14 }}>
            Nothing on this project is marked as a hold or witness point yet. Every check and test currently runs as
            Surveillance — work proceeds and the record is reviewed afterwards. Use the table below to mark the
            activities that need somebody to attend or to sign before work continues.
          </p>
        </div>
      ) : (
        queue.map((p) => {
          const blocked = releaseBlocks(p.inspection_type, p.release)
          return (
            <div
              key={`${p.kind}-${p.id}`}
              className="card"
              style={{
                marginBottom: 16,
                borderLeft: `4px solid ${
                  blocked
                    ? 'var(--color-danger-solid)'
                    : p.release === 'released'
                      ? 'var(--color-success-solid)'
                      : 'var(--color-neutral-solid)'
                }`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 260, flex: '1 1 340px' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                    <span className={inspectionBadgeClass(p.inspection_type)}>
                      {inspectionCode(p.inspection_type)} · {inspectionLabel(p.inspection_type)}
                    </span>
                    <span className={releaseBadgeClass(p.release)}>{releaseLabel(p.release)}</span>
                    <span className={p.statusClass}>{p.statusLabel}</span>
                    {p.level && (
                      <span className="text-secondary" style={{ fontSize: 12 }}>
                        {LEVELS.find((l) => l.value === p.level)?.label ?? p.level}
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{p.detail}</div>
                  <div className="text-secondary mono" style={{ fontSize: 12, marginTop: 3 }}>
                    {p.tag} · {p.kind === 'check' ? 'checklist item' : 'test record'}
                  </div>
                  <div className="text-secondary" style={{ fontSize: 12.5, marginTop: 8 }}>
                    Notice given: {when(p.notified_at)}
                  </div>
                </div>

              </div>

              {/* ── Giving notice ─────────────────────────────────────── */}
              {carriesRelease(p.inspection_type) && mayRecord && (!p.notice || p.release === 'rejected') && (
                <details style={{ marginTop: 14 }} open={p.release === 'awaiting_notice'}>
                  <summary style={{ cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}>
                    {p.notice
                      ? 'Give notice again — re-present after rework'
                      : 'Give notice — invite the client to inspect'}
                  </summary>

                  {reachable.length === 0 ? (
                    <p className="text-secondary" style={{ fontSize: 13, marginTop: 10, marginBottom: 0 }}>
                      Nobody has an email address on file yet. Add the client&rsquo;s representative on the{' '}
                      <Link href="/contacts" className="link">
                        Contacts
                      </Link>{' '}
                      page first.
                    </p>
                  ) : (
                    <form action={giveNotice} style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                      <input type="hidden" name="kind" value={p.kind} />
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="label" value={p.label} />
                      <input type="hidden" name="tag" value={p.tag} />
                      <input type="hidden" name="activity" value={p.detail} />
                      <input type="hidden" name="inspection_type" value={p.inspection_type} />
                      <input type="hidden" name="location" value={p.location ?? ''} />
                      <input type="hidden" name="procedure_ref" value={p.procedureRef ?? ''} />
                      <input type="hidden" name="acceptance" value={p.acceptance ?? ''} />

                      <div className="field">
                        Who to notify
                        <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
                          {reachable.map((c) => (
                            <label
                              key={c.id}
                              style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, fontWeight: 400 }}
                            >
                              <input
                                type="checkbox"
                                name="recipient"
                                value={`${c.email}|${c.full_name}`}
                                defaultChecked={preselected.has(c.id)}
                              />
                              {c.full_name}
                              <span className="text-secondary" style={{ fontSize: 12 }}>
                                {c.company ? `${c.company} · ` : ''}
                                {c.email}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
                        <label className="field">
                          Inspection date &amp; time
                          <input name="scheduled_for" type="datetime-local" className="input" />
                        </label>
                        <label className="field">
                          Your company
                          <input name="from_company" className="input" placeholder="e.g. CxA" />
                        </label>
                      </div>

                      <label className="field">
                        Anything to add
                        <input
                          name="note"
                          className="input"
                          placeholder="e.g. Please report to the site office for a permit before entering the switchyard."
                        />
                      </label>

                      <p className="text-secondary" style={{ fontSize: 12, margin: 0 }}>
                        This writes the notice and records it permanently — the wording and the recipients cannot be
                        changed afterwards. You then send it from your own email in one click, so it goes out from
                        your real work address.
                      </p>
                      <div>
                        <button type="submit" className="btn btn-primary btn-sm">
                          Write the notice
                        </button>
                      </div>
                    </form>
                  )}
                </details>
              )}

              {p.notice && (
                <div
                  style={{
                    marginTop: 14,
                    padding: '14px 16px',
                    borderRadius: 8,
                    border: '1px solid var(--color-success-solid)',
                    background: 'var(--color-success-bg, rgba(16,185,129,0.07))',
                  }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={p.notice.status === 'sent' ? 'badge badge-success' : 'badge badge-warning'}>
                      {p.notice.status === 'sent' ? 'Notice sent' : 'Notice written — not sent yet'}
                    </span>
                    <span className="text-secondary" style={{ fontSize: 12.5 }}>
                      To {p.notice.recipient_names || p.notice.recipients || 'nobody'} · issued{' '}
                      {when(p.notice.created_at)}
                      {p.notice.sent_at ? ` · sent ${when(p.notice.sent_at)}` : ''}
                    </span>
                  </div>

                  {p.notice.status !== 'sent' && (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                      {p.notice.recipients &&
                        p.notice.subject &&
                        p.notice.body &&
                        mailtoIsSafe(
                          mailtoLink(p.notice.recipients.split(',').map((s) => s.trim()), p.notice.subject, p.notice.body)
                        ) && (
                          <a
                            href={mailtoLink(
                              p.notice.recipients.split(',').map((s) => s.trim()),
                              p.notice.subject,
                              p.notice.body
                            )}
                            className="btn btn-primary btn-sm"
                          >
                            Open in my email
                          </a>
                        )}
                      <form action={markNoticeSent}>
                        <input type="hidden" name="notification_id" value={p.notice.id} />
                        <input type="hidden" name="label" value={p.label} />
                        <button type="submit" className="btn btn-secondary btn-sm">
                          I&rsquo;ve sent it
                        </button>
                      </form>
                    </div>
                  )}

                  <details style={{ marginTop: 12 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                      Read the notice / copy the text
                    </summary>
                    <div className="text-secondary" style={{ fontSize: 12.5, marginTop: 8 }}>
                      <strong>Subject:</strong> {p.notice.subject}
                    </div>
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
                      {p.notice.body}
                    </pre>
                  </details>
                </div>
              )}

              {p.signature && (
                <div
                  style={{
                    marginTop: 14,
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: 'var(--color-surface-alt, rgba(0,0,0,0.03))',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={decisionBadgeClass(p.signature.decision)}>
                      {decisionLabel(p.signature.decision)}
                    </span>
                    <strong style={{ fontSize: 13.5 }}>{p.signature.signed_name}</strong>
                    <span className="text-secondary" style={{ fontSize: 12.5 }}>
                      {p.signature.signer_role}
                      {p.signature.signer_company ? ` · ${p.signature.signer_company}` : ''} ·{' '}
                      {when(p.signature.created_at)}
                    </span>
                  </div>
                  {p.signature.statement && (
                    <p className="text-secondary" style={{ fontSize: 12.5, margin: '8px 0 0', fontStyle: 'italic' }}>
                      “{p.signature.statement}”
                    </p>
                  )}
                  {p.signature.comment && (
                    <p style={{ fontSize: 13, margin: '8px 0 0' }}>{p.signature.comment}</p>
                  )}
                </div>
              )}

              {maySign && p.workComplete && (
                <details style={{ marginTop: 14 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}>
                    {p.signature ? 'Sign again after rework' : 'Sign this point'}
                  </summary>
                  <form action={signHoldPoint} style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                    <input type="hidden" name="kind" value={p.kind} />
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="label" value={p.label} />
                    <label className="field">
                      Decision
                      <select name="decision" className="input" defaultValue="approved">
                        {DECISIONS.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
                      <label className="field">
                        Type your full name to sign *
                        <input name="signed_name" required defaultValue="" className="input" placeholder={actor.name} />
                      </label>
                      <label className="field">
                        Company
                        <input name="company" className="input" placeholder="e.g. client, contractor" />
                      </label>
                    </div>
                    <label className="field">
                      Comment
                      <input name="comment" className="input" placeholder="What you saw, or what needs reworking" />
                    </label>
                    <p className="text-secondary" style={{ fontSize: 12, margin: 0 }}>
                      Signing records your name, role, company, the exact wording of the declaration you chose, and
                      the time — permanently. Signatures cannot be edited or deleted afterwards, by anyone. To change
                      a decision you sign again, and both signatures stay on the record.
                    </p>
                    <div>
                      <button type="submit" className="btn btn-primary">
                        Sign
                      </button>
                    </div>
                  </form>
                </details>
              )}

              {maySign && !p.workComplete && (
                <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
                  Nothing to sign yet — this activity has not been carried out.
                </p>
              )}
            </div>
          )
        })
      )}

      {/* ── Assigning activity types ──────────────────────────────────── */}
      <h2 className="section-title" style={{ marginTop: 32 }}>
        Set the ITP activity type
      </h2>

      <div className="card">
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {INSPECTION_TYPES.map((t) => (
            <div key={t.value}>
              <span className={inspectionBadgeClass(t.value)}>
                {t.code} · {t.label}
              </span>
              <p className="text-secondary" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
                {t.note}
              </p>
            </div>
          ))}
        </div>
      </div>

      <form method="get" style={{ display: 'flex', gap: 10, alignItems: 'flex-end', margin: '18px 0' }}>
        <label className="field" style={{ minWidth: 200 }}>
          Equipment
          <select name="equipment" defaultValue={equipmentFilter ?? ''} className="input">
            <option value="">All equipment</option>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.tag_id}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ minWidth: 180 }}>
          Activity type
          <select name="type" defaultValue={typeFilter ?? ''} className="input">
            <option value="">All types</option>
            {INSPECTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-secondary">
          Filter
        </button>
        {(equipmentFilter || typeFilter) && (
          <Link href="/holdpoints" className="btn-link">
            Clear
          </Link>
        )}
      </form>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Equipment</th>
              <th>Activity</th>
              <th>Result</th>
              <th>Type</th>
              <th>Release</th>
              {mayAssign && <th style={{ minWidth: 230 }}>Change type</th>}
            </tr>
          </thead>
          <tbody>
            {assignable.length > 0 ? (
              assignable.slice(0, 300).map((p) => (
                <tr key={`a-${p.kind}-${p.id}`}>
                  <td className="mono tag-id">{p.tag}</td>
                  <td style={{ fontSize: 13.5 }}>
                    {p.detail}
                    <div className="text-secondary" style={{ fontSize: 11.5 }}>
                      {p.kind === 'check' ? 'checklist item' : 'test record'}
                    </div>
                  </td>
                  <td>
                    <span className={p.statusClass}>{p.statusLabel}</span>
                  </td>
                  <td>
                    <span className={inspectionBadgeClass(p.inspection_type)}>{inspectionCode(p.inspection_type)}</span>
                  </td>
                  <td>
                    {carriesRelease(p.inspection_type) ? (
                      <span className={releaseBadgeClass(p.release)}>{releaseLabel(p.release)}</span>
                    ) : (
                      <span className="text-secondary">—</span>
                    )}
                  </td>
                  {mayAssign && (
                    <td>
                      <form action={setInspectionType} style={{ display: 'flex', gap: 8 }}>
                        <input type="hidden" name="kind" value={p.kind} />
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="label" value={p.label} />
                        <input type="hidden" name="previous" value={p.inspection_type} />
                        <select
                          key={`t-${p.id}-${p.inspection_type}`}
                          name="inspection_type"
                          defaultValue={p.inspection_type}
                          className="input"
                        >
                          {INSPECTION_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="btn btn-secondary btn-sm">
                          Save
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={mayAssign ? 6 : 5} className="empty-row">
                  Nothing to show. Add equipment, checklist items and tests first.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {assignable.length > 300 && (
        <p className="text-secondary" style={{ fontSize: 12.5 }}>
          Showing the first 300 of {assignable.length}. Filter by equipment to narrow it down.
        </p>
      )}

      {/* ── Signature register ────────────────────────────────────────── */}
      <h2 className="section-title" style={{ marginTop: 32 }}>
        Signature register
      </h2>
      <p className="text-secondary" style={{ fontSize: 13, marginTop: -6 }}>
        Every signature ever given on this project, newest first. The database refuses updates and deletes on this
        table, so this list can only ever grow.
      </p>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Signed by</th>
              <th>Decision</th>
              <th>Applies to</th>
              <th>Declaration</th>
            </tr>
          </thead>
          <tbody>
            {signatures.length > 0 ? (
              signatures.slice(0, 200).map((s) => (
                <tr key={s.id}>
                  <td className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {when(s.created_at)}
                  </td>
                  <td style={{ fontSize: 13.5 }}>
                    <div style={{ fontWeight: 500 }}>{s.signed_name || s.signer_name}</div>
                    <div className="text-secondary" style={{ fontSize: 11.5 }}>
                      {s.signer_role}
                      {s.signer_company ? ` · ${s.signer_company}` : ''}
                    </div>
                  </td>
                  <td>
                    <span className={decisionBadgeClass(s.decision)}>{decisionLabel(s.decision)}</span>
                  </td>
                  <td style={{ fontSize: 13 }}>{s.entity_label ?? s.entity}</td>
                  <td className="text-secondary" style={{ fontSize: 12 }}>
                    {s.statement}
                    {s.comment && (
                      <div style={{ marginTop: 4, color: 'var(--color-text)' }}>{s.comment}</div>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="empty-row">
                  Nothing signed yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
