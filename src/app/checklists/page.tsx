import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { LEVELS, STATUSES, statusBadgeClass, reviewBadgeClass, reviewLabel } from '@/lib/checklist'
import { addChecklistItem } from '@/app/equipment/[id]/checklist/actions'
import { importProjectChecklist, saveCheck, deleteCheck, attachEvidence } from './actions'

export const dynamic = 'force-dynamic'

// One screenful of tags. Their checks are fetched for these tags only.
const TAGS_PER_PAGE = 25

// Group rows by their equipment in one pass. The obvious nested filter is
// equipment × rows, which is nothing on a demo project and twelve million
// comparisons on a real substation.
function bucketBy<T>(rows: T[], key: (row: T) => string | null): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row)
    if (!k) continue
    const list = map.get(k)
    if (list) list.push(row)
    else map.set(k, [row])
  }
  return map
}


export default async function ChecklistsPage({
  searchParams,
}: {
  searchParams: Promise<{
    level?: string
    equipment?: string
    page?: string
    import?: string
    checks?: string
    tags?: string
    total?: string
    skipped?: string
    headings?: string
  }>
}) {
  const {
    level,
    equipment: equipmentFilter,
    import: importResult,
    checks,
    tags,
    total,
    skipped,
    headings,
    page: pageParam,
  } = await searchParams

  const project = await getCurrentProject()

  // Page over equipment, then fetch only that page's checks. A real project
  // has thousands of tags and tens of thousands of checks; loading them all to
  // render one screen is what made this page stall.
  const page = Math.max(1, Number(pageParam ?? '1') || 1)
  const from = (page - 1) * TAGS_PER_PAGE

  let equipmentQuery = supabase
    .from('equipment')
    .select('id, tag_id, description', { count: 'exact' })
    .order('tag_id')
    .range(from, from + TAGS_PER_PAGE - 1)

  if (project) equipmentQuery = equipmentQuery.eq('project_id', project.id)
  if (equipmentFilter) equipmentQuery = equipmentQuery.eq('id', equipmentFilter)

  const { data: equipmentRows, count: tagCount } = project
    ? await equipmentQuery
    : { data: [], count: 0 }

  const equipment = equipmentRows ?? []
  const totalTags = tagCount ?? 0
  const pages = Math.max(1, Math.ceil(totalTags / TAGS_PER_PAGE))

  // Bounded by the page: at most TAGS_PER_PAGE ids, never the whole project.
  const pageIds = equipment.map((e) => e.id)

  let query = supabase
    .from('checklist_items')
    .select('id, level, item, status, notes, ai_comment, review_state, equipment_id')
    .order('level', { ascending: true })
    .in('equipment_id', pageIds)

  if (level) query = query.eq('level', level)

  const { data: itemsRaw } = project && pageIds.length > 0 ? await query : { data: [] }
  const items = itemsRaw ?? []
  const itemIds = items.map((it) => it.id)

  const { data: attachmentsRaw } =
    itemIds.length > 0
      ? await supabase
          .from('attachments')
          .select('id, checklist_item_id, file_name, file_url, review_status')
          .in('checklist_item_id', itemIds)
          .order('created_at', { ascending: true })
      : { data: [] as { id: string; checklist_item_id: string; file_name: string; file_url: string; review_status: string | null }[] }

  const attachments = attachmentsRaw ?? []
  const filesFor = (itemId: string) => attachments.filter((a) => a.checklist_item_id === itemId)

  const levelLabel = (v: string) => LEVELS.find((l) => l.value === v)?.label ?? v

  // The figures at the top describe the WHOLE project, not this page — so they
  // come from counts rather than from the rows in front of you. Four small
  // queries instead of one enormous one.
  const countOf = async (statuses: string[] | null) => {
    if (!project) return 0
    let c = supabase.from('checklist_items').select('id', { count: 'exact', head: true }).eq('project_id', project.id)
    if (level) c = c.eq('level', level)
    if (statuses) c = c.in('status', statuses)
    const { count: n } = await c
    return n ?? 0
  }

  const [totalChecks, failed, pending, resolved] = await Promise.all([
    countOf(null),
    countOf(['fail']),
    countOf(['pending']),
    countOf(['pass', 'na']),
  ])

  const percent = totalChecks > 0 ? Math.round((resolved / totalChecks) * 100) : 0

  const itemsByEquipment = bucketBy(items, (it) => it.equipment_id)
  const groups = equipment
    .map((e) => ({ ...e, items: itemsByEquipment.get(e.id) ?? [] }))
    .filter((g) => g.items.length > 0)

  return (
    <>
      <h1 className="page-title">Checklists</h1>
      <p className="page-subtitle" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>
          Project: {project ? project.name : 'No project found — run the Week 2 SQL step first.'} — every check,
          at every level, with its comment and its evidence.
        </span>
        <span className="badge badge-info">{percent}% resolved</span>
        {failed > 0 && <span className="badge badge-danger">{failed} failed</span>}
        {pending > 0 && <span className="badge badge-warning">{pending} not started</span>}
      </p>

      {importResult === 'ok' && (
        <div className="alert" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
          <strong>Imported.</strong> {checks} check{checks === '1' ? '' : 's'} read from your file and created
          against {tags} tag{tags === '1' ? '' : 's'} — {total} in total.
          {skipped && skipped !== '0' ? ` ${skipped} row${skipped === '1' ? '' : 's'} skipped (no level could be worked out).` : ''}
        </div>
      )}
      {importResult === 'empty' && (
        <div className="alert alert-danger">
          <strong>Nothing imported.</strong> No rows could be read from that file.
          {headings ? ` The column headings found were: ${headings}.` : ''} The file needs a column headed
          something like Item, Description, Check or Task. Pick a level below if the file doesn&apos;t have a
          Level column.
        </div>
      )}
      {importResult === 'nofile' && (
        <div className="alert alert-danger">
          <strong>Nothing imported.</strong> Choose a file and tick at least one equipment tag.
        </div>
      )}

      <div className="card">
        <h2 className="section-title">Upload a checklist</h2>
        <p className="text-secondary" style={{ fontSize: 13, marginBottom: 16 }}>
          Use your own Excel sheet or the template below — CxSentinel finds the header row wherever it sits and
          recognises columns named Item, Description, Check, Task, Level, Stage, Notes or Remarks. Tick every tag
          the checklist applies to and it gets created against each one.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
          <a href="/checklists/template" className="btn btn-secondary btn-sm">
            Download blank template
          </a>
          <a href="/checklists/export" className="btn btn-secondary btn-sm">
            Export whole project (Excel)
          </a>
        </div>

        <form action={importProjectChecklist} style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1.4fr 1fr' }}>
            <label className="field">
              Checklist file (.xlsx or .csv) *
              <input type="file" name="file" accept=".xlsx,.csv" required className="input" />
            </label>
            <label className="field">
              Level to use if the file doesn&apos;t say
              <select name="default_level" className="input" defaultValue="">
                <option value="">— file must specify —</option>
                {LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="field">
            Apply to these tags *
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                gap: 8,
                marginTop: 2,
              }}
            >
              {equipment.map((e) => (
                <label
                  key={e.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    fontWeight: 400,
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    padding: '8px 10px',
                  }}
                >
                  <input type="checkbox" name="equipment_ids" value={e.id} />
                  <span className="mono">{e.tag_id}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <button type="submit" className="btn btn-primary" disabled={equipment.length === 0}>
              Import checklist
            </button>
          </div>
        </form>

        {equipment.length === 0 && (
          <p className="text-secondary" style={{ fontSize: 13, marginTop: 10 }}>
            Add equipment first — checks belong to a tag.
          </p>
        )}
      </div>

      <details className="card" style={{ marginTop: 16 }}>
        <summary className="section-title" style={{ cursor: 'pointer', marginBottom: 0 }}>
          Add a single check by hand
        </summary>
        <form action={addChecklistItem} style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr', marginTop: 16 }}>
          <label className="field">
            Equipment *
            <select name="equipment_id" required className="input" defaultValue="">
              <option value="" disabled>
                — choose —
              </option>
              {equipment.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.tag_id}
                  {e.description ? ` — ${e.description}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Level *
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
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            Item to check *
            <input name="item" required placeholder="e.g. Verify fuel level above 75%" className="input" />
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="btn btn-primary" disabled={equipment.length === 0}>
              Add check
            </button>
          </div>
        </form>
      </details>

      <div style={{ margin: '26px 0 16px' }}>
        <form style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select name="equipment" defaultValue={equipmentFilter ?? ''} className="input" style={{ maxWidth: 240 }}>
            <option value="">All equipment</option>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.tag_id}
              </option>
            ))}
          </select>
          <select name="level" defaultValue={level ?? ''} className="input" style={{ maxWidth: 300 }}>
            <option value="">All levels</option>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary">
            Filter
          </button>
        </form>
      </div>

      {groups.length > 0 ? (
        groups.map((g) => (
          <div key={g.id} className="card" style={{ marginTop: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 16,
              }}
            >
              <div>
                <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>
                  {g.tag_id}
                </span>
                {g.description && (
                  <span className="text-secondary" style={{ fontSize: 13, marginLeft: 10 }}>
                    {g.description}
                  </span>
                )}
              </div>
              <span className="text-secondary" style={{ fontSize: 12 }}>
                {g.items.length} check{g.items.length === 1 ? '' : 's'}
              </span>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {g.items.map((it) => (
                <div
                  key={it.id}
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: 10,
                    padding: 14,
                    background: '#fcfdff',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 12,
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <div className="text-secondary mono" style={{ fontSize: 11, marginBottom: 3 }}>
                        {levelLabel(it.level)}
                      </div>
                      <div style={{ fontWeight: 500, fontSize: 14.5 }}>{it.item}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className={reviewBadgeClass(it.review_state)}>{reviewLabel(it.review_state)}</span>
                      <span className={statusBadgeClass(it.status)}>
                        {STATUSES.find((s) => s.value === it.status)?.label ?? it.status}
                      </span>
                    </div>
                  </div>

                  <form style={{ display: 'grid', gap: 10, gridTemplateColumns: '150px 1fr auto', alignItems: 'end' }}>
                    <input type="hidden" name="id" value={it.id} />
                    <input type="hidden" name="equipment_id" value={g.id} />
                    <label className="field">
                      Check
                      <select
                        key={`s-${it.id}-${it.status}`}
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
                      Comment
                      <input
                        key={`n-${it.id}-${it.notes ?? ''}`}
                        name="notes"
                        defaultValue={it.notes ?? ''}
                        placeholder="What was verified, or why it failed"
                        className="input"
                      />
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button formAction={saveCheck} type="submit" className="btn btn-primary btn-sm">
                        Save
                      </button>
                      <button formAction={deleteCheck} type="submit" className="btn btn-danger-outline btn-sm">
                        Delete
                      </button>
                    </div>
                  </form>

                  {it.ai_comment && (
                    <p className="alert alert-info" style={{ marginTop: 12, marginBottom: 0, fontSize: 12.5 }}>
                      <strong>Automatic check:</strong> {it.ai_comment}
                    </p>
                  )}

                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border-soft)' }}>
                    <div className="text-secondary mono" style={{ fontSize: 10.5, letterSpacing: '0.09em', marginBottom: 8 }}>
                      DOCUMENTS
                    </div>

                    {filesFor(it.id).length > 0 ? (
                      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 10px 0', display: 'grid', gap: 6 }}>
                        {filesFor(it.id).map((a) => (
                          <li key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                            <a href={a.file_url} target="_blank" rel="noopener noreferrer" className="link">
                              {a.file_name}
                            </a>
                            {a.review_status && (
                              <span className={a.review_status === 'ok' ? 'badge badge-success' : 'badge badge-warning'}>
                                {a.review_status === 'ok' ? 'Passed intake check' : 'Needs a look'}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-secondary" style={{ fontSize: 12.5, marginBottom: 10 }}>
                        No document attached yet.
                      </p>
                    )}

                    <form action={attachEvidence} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input type="hidden" name="checklist_item_id" value={it.id} />
                      <input type="hidden" name="equipment_id" value={g.id} />
                      <input type="hidden" name="tag_id" value={g.tag_id} />
                      <input type="file" name="file" required style={{ fontSize: 12.5 }} />
                      <button type="submit" className="btn btn-secondary btn-sm">
                        Attach
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="text-secondary" style={{ fontSize: 14 }}>
            No checks yet. Download the template above, fill it in, and upload it against your tags — or add one by
            hand.
          </p>
        </div>
      )}
    {pages > 1 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
          {page > 1 && (
            <a href={`/checklists?page=${page - 1}${level ? `&level=${level}` : ''}`} className="btn btn-secondary btn-sm">
              ← Previous tags
            </a>
          )}
          <span className="text-secondary mono" style={{ fontSize: 12.5 }}>
            tags {from + 1}–{Math.min(from + TAGS_PER_PAGE, totalTags)} of {totalTags} · page {page} of {pages}
          </span>
          {page < pages && (
            <a href={`/checklists?page=${page + 1}${level ? `&level=${level}` : ''}`} className="btn btn-secondary btn-sm">
              Next tags →
            </a>
          )}
        </div>
      )}

      <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 12 }}>
        The figures above cover the whole project. The checks listed are for the tags on this page.
      </p>
    </>
  )
}
