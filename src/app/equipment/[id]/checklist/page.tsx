import { supabase } from '@/lib/supabase'
import {
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  uploadAttachment,
  deleteAttachment,
  importChecklist,
} from './actions'
import { createIssue } from '@/app/issues/actions'
import { createMilestone } from '@/app/milestones/actions'
import { LEVELS, STATUSES, statusBadgeClass } from './styles'
import { SEVERITIES, CATEGORIES, severityBadgeClass, categoryBadgeClass, issueStatusBadgeClass } from '@/lib/issues'
import { MILESTONE_STATUSES, milestoneBadgeClass } from '@/lib/milestones'

export const dynamic = 'force-dynamic'

export default async function ChecklistPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const { data: equipment } = await supabase
    .from('equipment')
    .select('id, tag_id, description, project_id')
    .eq('id', id)
    .single()

  if (!equipment) {
    return (
      <div style={{ maxWidth: 800 }}>
        <p style={{ marginBottom: 8 }}>Equipment not found.</p>
        <a href="/equipment" className="link">
          Back to Equipment &amp; Tags
        </a>
      </div>
    )
  }

  const { data: items } = await supabase
    .from('checklist_items')
    .select('id, level, item, status, notes, ai_comment')
    .eq('equipment_id', id)
    .order('level', { ascending: true })
    .order('created_at', { ascending: true })

  const itemIds = (items ?? []).map((it) => it.id)
  const { data: attachments } =
    itemIds.length > 0
      ? await supabase
          .from('attachments')
          .select('id, checklist_item_id, file_name, file_url, file_path, review_status, review_note, created_at')
          .in('checklist_item_id', itemIds)
          .order('created_at', { ascending: true })
      : {
          data: [] as {
            id: string
            checklist_item_id: string
            file_name: string
            file_url: string
            file_path: string
            review_status: string | null
            review_note: string | null
          }[],
        }

  const attachmentsFor = (itemId: string) => (attachments ?? []).filter((a) => a.checklist_item_id === itemId)

  const { data: linkedIssues } =
    itemIds.length > 0
      ? await supabase
          .from('issues')
          .select('id, checklist_item_id, title, severity, category, status')
          .in('checklist_item_id', itemIds)
          .order('created_at', { ascending: true })
      : {
          data: [] as {
            id: string
            checklist_item_id: string
            title: string
            severity: string
            category: string | null
            status: string
          }[],
        }

  const { data: linkedMilestones } =
    itemIds.length > 0
      ? await supabase
          .from('milestones')
          .select('id, checklist_item_id, name, target_date, status')
          .in('checklist_item_id', itemIds)
          .order('target_date', { ascending: true, nullsFirst: false })
      : {
          data: [] as {
            id: string
            checklist_item_id: string
            name: string
            target_date: string | null
            status: string
          }[],
        }

  const issuesFor = (itemId: string) => (linkedIssues ?? []).filter((i) => i.checklist_item_id === itemId)
  const milestonesFor = (itemId: string) => (linkedMilestones ?? []).filter((m) => m.checklist_item_id === itemId)

  const levelLabel = (value: string) => LEVELS.find((l) => l.value === value)?.label ?? value

  return (
    <div style={{ maxWidth: 800 }}>
      <p style={{ marginBottom: 8 }}>
        <a href="/equipment" className="link">
          &larr; Back to Equipment &amp; Tags
        </a>
      </p>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1 className="page-title">Checklist — {equipment.tag_id}</h1>
          {equipment.description && <p className="page-subtitle" style={{ marginBottom: 0 }}>{equipment.description}</p>}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
          <a href={`/equipment/${equipment.id}/checklist/export`} className="btn btn-secondary btn-sm">
            Download checklist (Excel)
          </a>
          <form action={importChecklist} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="hidden" name="equipment_id" value={equipment.id} />
            <input type="file" name="file" accept=".xlsx" required style={{ fontSize: 12, maxWidth: 180 }} />
            <button type="submit" className="btn btn-secondary btn-sm">
              Import
            </button>
          </form>
        </div>
      </div>
      <p className="text-secondary" style={{ fontSize: 12, marginTop: 6, marginBottom: 22 }}>
        Import expects the same Level / Item columns the Excel download uses — edit the downloaded file and
        re-upload it to bulk-add items.
      </p>

      <div className="card">
        <h2 className="section-title">Add checklist item</h2>
        <form action={addChecklistItem} style={{ display: 'grid', gap: 12 }}>
          <input type="hidden" name="equipment_id" value={equipment.id} />
          <label className="field">
            Level
            <select name="level" required className="input" defaultValue="">
              <option value="" disabled>
                — choose —
              </option>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Item to check *
            <input name="item" required placeholder="e.g. Verify fuel level above 75%" className="input" />
          </label>
          <div>
            <button type="submit" className="btn btn-primary">
              Add item
            </button>
          </div>
        </form>
      </div>

      {items && items.length > 0 ? (
        <div style={{ display: 'grid', gap: 16, marginTop: 24 }}>
          {items.map((it) => (
            <div key={it.id} className="card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 14,
                  gap: 12,
                }}
              >
                <div>
                  <div className="text-secondary" style={{ fontSize: 12, marginBottom: 3 }}>
                    {levelLabel(it.level)}
                  </div>
                  <div style={{ fontWeight: 600 }}>{it.item}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className={attachmentsFor(it.id).length > 0 ? 'badge badge-info' : 'badge badge-neutral'}>
                    {attachmentsFor(it.id).length > 0
                      ? `Evidence: ${attachmentsFor(it.id).length}`
                      : 'No evidence'}
                  </span>
                  <span className={statusBadgeClass(it.status)}>{it.status}</span>
                </div>
              </div>

              <form style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 2fr' }}>
                <input type="hidden" name="id" value={it.id} />
                <input type="hidden" name="equipment_id" value={equipment.id} />
                <label className="field">
                  Status
                  <select
                    key={`status-${it.id}-${it.status}`}
                    name="status"
                    defaultValue={it.status}
                    className="input"
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Notes
                  <input
                    key={`notes-${it.id}-${it.notes ?? ''}`}
                    name="notes"
                    defaultValue={it.notes ?? ''}
                    placeholder="What was verified, or why it failed"
                    className="input"
                  />
                </label>
                <div style={{ display: 'flex', gap: 10, gridColumn: '1 / -1' }}>
                  <button formAction={updateChecklistItem} type="submit" className="btn btn-primary btn-sm">
                    Save
                  </button>
                  <button formAction={deleteChecklistItem} type="submit" className="btn btn-danger-outline btn-sm">
                    Delete
                  </button>
                </div>
              </form>

              {it.ai_comment && (
                <p
                  className="alert alert-info"
                  style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}
                >
                  <strong>Automatic check:</strong> {it.ai_comment}
                </p>
              )}

              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
                <div
                  className="text-secondary"
                  style={{ fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 600 }}
                >
                  Attachments
                </div>

                {attachmentsFor(it.id).length > 0 ? (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px 0', display: 'grid', gap: 10 }}>
                    {attachmentsFor(it.id).map((a) => (
                      <li key={a.id} style={{ fontSize: 13 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <a href={a.file_url} target="_blank" rel="noopener noreferrer" className="link">
                            {a.file_name}
                          </a>
                          <a href={a.file_url} download={a.file_name} className="link" style={{ fontSize: 12 }}>
                            Download
                          </a>
                          {a.review_status && (
                            <span className={a.review_status === 'ok' ? 'badge badge-success' : 'badge badge-warning'}>
                              {a.review_status === 'ok' ? 'Passed intake check' : 'Needs a look'}
                            </span>
                          )}
                          <form action={deleteAttachment}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="file_path" value={a.file_path} />
                            <input type="hidden" name="equipment_id" value={equipment.id} />
                            <button type="submit" className="btn-link" style={{ fontSize: 12 }}>
                              Delete
                            </button>
                          </form>
                        </div>
                        {a.review_note && (
                          <div className="text-secondary" style={{ fontSize: 12, marginTop: 3 }}>
                            {a.review_note}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12 }}>
                    No files attached yet.
                  </p>
                )}

                <form action={uploadAttachment} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="hidden" name="checklist_item_id" value={it.id} />
                  <input type="hidden" name="equipment_id" value={equipment.id} />
                  <input type="file" name="file" required style={{ fontSize: 13 }} />
                  <button type="submit" className="btn btn-secondary btn-sm">
                    Upload
                  </button>
                </form>
              </div>

              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
                <div
                  className="text-secondary"
                  style={{ fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 600 }}
                >
                  Issues &amp; milestones linked to this item
                </div>

                {(issuesFor(it.id).length > 0 || milestonesFor(it.id).length > 0) ? (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px 0', display: 'grid', gap: 8 }}>
                    {issuesFor(it.id).map((iss) => (
                      <li key={iss.id} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <a href={`/issues/${iss.id}/edit`} className="link">
                          {iss.title}
                        </a>
                        <span className={severityBadgeClass(iss.severity)}>{iss.severity}</span>
                        {iss.category && (
                          <span className={categoryBadgeClass(iss.category)}>Category {iss.category}</span>
                        )}
                        <span className={issueStatusBadgeClass(iss.status)}>{iss.status.replace(/_/g, ' ')}</span>
                      </li>
                    ))}
                    {milestonesFor(it.id).map((m) => (
                      <li key={m.id} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <a href="/milestones" className="link">
                          {m.name}
                        </a>
                        <span className={milestoneBadgeClass(m.status)}>
                          {MILESTONE_STATUSES.find((s) => s.value === m.status)?.label ?? m.status}
                        </span>
                        {m.target_date && (
                          <span className="text-secondary" style={{ fontSize: 12 }}>
                            Target: {m.target_date}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12 }}>
                    Nothing linked yet — raise an issue or add a milestone straight from this item.
                  </p>
                )}

                <details>
                  <summary className="link" style={{ fontSize: 13, cursor: 'pointer' }}>
                    Raise an issue from this item
                  </summary>
                  <form
                    action={createIssue}
                    style={{ display: 'grid', gap: 10, gridTemplateColumns: '2fr 1fr 1fr auto', marginTop: 10, alignItems: 'end' }}
                  >
                    <input type="hidden" name="equipment_id" value={equipment.id} />
                    <input type="hidden" name="checklist_item_id" value={it.id} />
                    <label className="field">
                      Title
                      <input name="title" required placeholder="What's wrong" className="input" />
                    </label>
                    <label className="field">
                      Severity
                      <select name="severity" className="input" defaultValue="minor">
                        {SEVERITIES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Category
                      <select name="category" className="input" defaultValue="">
                        <option value="">— none —</option>
                        {CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.value}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" className="btn btn-secondary btn-sm">
                      Raise
                    </button>
                  </form>
                </details>

                <details style={{ marginTop: 10 }}>
                  <summary className="link" style={{ fontSize: 13, cursor: 'pointer' }}>
                    Add a milestone from this item
                  </summary>
                  <form
                    action={createMilestone}
                    style={{ display: 'grid', gap: 10, gridTemplateColumns: '2fr 1fr auto', marginTop: 10, alignItems: 'end' }}
                  >
                    <input type="hidden" name="project_id" value={equipment.project_id ?? ''} />
                    <input type="hidden" name="equipment_id" value={equipment.id} />
                    <input type="hidden" name="checklist_item_id" value={it.id} />
                    <label className="field">
                      Milestone
                      <input name="name" required placeholder="e.g. Retest after corrective action" className="input" />
                    </label>
                    <label className="field">
                      Target date
                      <input type="date" name="target_date" className="input" />
                    </label>
                    <button type="submit" className="btn btn-secondary btn-sm" disabled={!equipment.project_id}>
                      Add
                    </button>
                  </form>
                </details>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-secondary" style={{ marginTop: 24 }}>
          No checklist items yet — add your first one above.
        </p>
      )}
    </div>
  )
}
