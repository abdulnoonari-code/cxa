import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { LEVELS } from '@/lib/checklist'
import { uploadDocument, deleteDocument } from './actions'

export const dynamic = 'force-dynamic'

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ review?: string }>
}) {
  const { review } = await searchParams

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
          .select('id, level, item, equipment_id')
          .in('equipment_id', equipmentIds)
      : { data: [] as { id: string; level: string; item: string; equipment_id: string }[] }

  const items = itemsRaw ?? []
  const itemIds = items.map((it) => it.id)
  const itemById = new Map(items.map((it) => [it.id, it]))

  let attachmentsQuery = supabase
    .from('attachments')
    .select('id, checklist_item_id, file_name, file_url, file_path, review_status, review_note, created_at')
    .order('created_at', { ascending: false })

  if (itemIds.length > 0) {
    attachmentsQuery = attachmentsQuery.in('checklist_item_id', itemIds)
  }
  if (review) {
    attachmentsQuery = attachmentsQuery.eq('review_status', review)
  }

  const { data: attachmentsRaw } = itemIds.length > 0 ? await attachmentsQuery : { data: [] }
  const attachments = attachmentsRaw ?? []

  const needsLookCount = attachments.filter((a) => a.review_status === 'warning').length
  const levelLabel = (value: string) => LEVELS.find((l) => l.value === value)?.label ?? value

  // Group checklist items by equipment so the picker below reads as
  // "GEN-01 → which check is this evidence for".
  const itemsByEquipment = equipment
    .map((e) => ({ tag: e.tag_id, items: items.filter((it) => it.equipment_id === e.id) }))
    .filter((g) => g.items.length > 0)

  return (
    <>
      <h1 className="page-title">Document Review</h1>
      <p className="page-subtitle" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>
          Project: {project ? project.name : 'No project found — run the Week 2 SQL step first.'} — every
          document uploaded to any checklist item, in one place.
        </span>
        {needsLookCount > 0 && (
          <span className="badge badge-warning">
            {needsLookCount} document{needsLookCount > 1 ? 's' : ''} need a look
          </span>
        )}
      </p>

      <div className="card">
        <h2 className="section-title">Attach a document</h2>
        {itemsByEquipment.length > 0 ? (
          <form action={uploadDocument} style={{ display: 'grid', gap: 12 }}>
            <label className="field">
              What is this evidence for? *
              <select name="checklist_item_id" required className="input" defaultValue="">
                <option value="" disabled>
                  — choose a checklist item —
                </option>
                {itemsByEquipment.map((group) => (
                  <optgroup key={group.tag} label={group.tag}>
                    {group.items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {levelLabel(it.level)} — {it.item}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="field">
              File *
              <input type="file" name="file" required className="input" />
            </label>
            <div>
              <button type="submit" className="btn btn-primary">
                Upload document
              </button>
            </div>
          </form>
        ) : (
          <p className="text-secondary" style={{ fontSize: 14, marginBottom: 0 }}>
            Documents attach to a checklist item, and there aren&apos;t any yet. Open{' '}
            <a href="/checklists" className="link">
              Checklists
            </a>{' '}
            to add your first one, then come back here to upload evidence against it.
          </p>
        )}
      </div>

      <div style={{ margin: '24px 0 16px' }}>
        <form style={{ display: 'flex', gap: 10 }}>
          <select name="review" defaultValue={review ?? ''} className="input" style={{ maxWidth: 260 }}>
            <option value="">All documents</option>
            <option value="ok">Passed intake check</option>
            <option value="warning">Needs a look</option>
          </select>
          <button type="submit" className="btn btn-secondary">
            Filter
          </button>
        </form>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Equipment</th>
              <th>Checklist item</th>
              <th>Document</th>
              <th>Intake check</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {attachments.length > 0 ? (
              attachments.map((a) => {
                const item = itemById.get(a.checklist_item_id)
                return (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>
                      {item ? tagById.get(item.equipment_id) ?? '—' : '—'}
                    </td>
                    <td>{item?.item ?? '—'}</td>
                    <td>
                      <a href={a.file_url} target="_blank" rel="noopener noreferrer" className="link">
                        {a.file_name}
                      </a>
                    </td>
                    <td>
                      <span className={a.review_status === 'ok' ? 'badge badge-success' : 'badge badge-warning'}>
                        {a.review_status === 'ok' ? 'Passed' : 'Needs a look'}
                      </span>
                      {a.review_note && (
                        <div className="text-secondary" style={{ fontSize: 12, marginTop: 3, maxWidth: 320 }}>
                          {a.review_note}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                        {item && (
                          <a href={`/equipment/${item.equipment_id}/checklist`} className="link">
                            Open checklist
                          </a>
                        )}
                        <form action={deleteDocument}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="file_path" value={a.file_path} />
                          <button type="submit" className="btn-link">
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={5} className="empty-row">
                  No documents yet — upload your first one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-secondary" style={{ fontSize: 12, marginTop: 14 }}>
        &quot;Intake check&quot; confirms the file type and name look right at the moment it&apos;s uploaded — it&apos;s a fast,
        automatic first pass, not a reading of what&apos;s actually inside the document. That deeper AI content review
        is a planned next step.
      </p>
    </>
  )
}
