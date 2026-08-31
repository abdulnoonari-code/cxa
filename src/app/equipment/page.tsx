import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { getActor } from '@/lib/audit'
import { loadRoles } from '@/data/project-roles'
import { canIn } from '@/lib/project-roles'
import { createEquipment, deleteEquipment, importEquipment } from './actions'
import { CATEGORIES, INSTALL_STATUSES, installBadgeClass } from './styles'

export const dynamic = 'force-dynamic'

// A page size that keeps the query bounded whatever the project. A real
// substation tag list runs to thousands; loading all of them into one page was
// the single worst-scaling thing in the application.
const PAGE_SIZE = 100

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>
}) {
  const { q, category, page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam ?? '1') || 1)
  const from = (page - 1) * PAGE_SIZE

  const project = await getCurrentProject()
  const actor = await getActor(project?.id ?? null)
  const roles = await loadRoles(project?.id ?? null)
  const mayRecord = canIn(roles, actor.role, 'record')
  const mayManage = canIn(roles, actor.role, 'manage')

  // Ask the database for the page, and for the total, rather than pulling
  // every row and slicing in memory.
  let query = supabase
    .from('equipment')
    .select('id, tag_id, description, category, manufacturer, model, location, install_status', { count: 'exact' })
    .order('tag_id', { ascending: true })
    .range(from, from + PAGE_SIZE - 1)

  if (project) query = query.eq('project_id', project.id)
  if (q) query = query.or(`tag_id.ilike.%${q}%,description.ilike.%${q}%`)
  if (category) query = query.eq('category', category)

  const { data: equipment, error, count } = project ? await query : { data: [], error: null, count: 0 }

  const total = count ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const shown = equipment ?? []

  const categoryLabel = (value: string) => CATEGORIES.find((c) => c.value === value)?.label ?? value
  const installLabel = (value: string) => INSTALL_STATUSES.find((s) => s.value === value)?.label ?? value

  const pageHref = (n: number) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (category) params.set('category', category)
    if (n > 1) params.set('page', String(n))
    const s = params.toString()
    return s ? `/equipment?${s}` : '/equipment'
  }

  return (
    <>
      <h1 className="page-title">Equipment &amp; Tags</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} —{' '}
        {total > 0 ? `${total} tag${total === 1 ? '' : 's'} on this project.` : 'No tags yet.'}
      </p>

      {error && <p className="alert alert-danger">Couldn&apos;t load equipment: {error.message}</p>}

      {/* ── Excel round trip ─────────────────────────────────────── */}
      <div className="card">
        <h2 className="section-title" style={{ marginTop: 0 }}>
          Bring in your tag list
        </h2>
        <p className="text-secondary" style={{ fontSize: 13.5 }}>
          Import the list the EPC or contractor sent you, in their format. If the sheet has an Area, System or Bay
          column, <strong>the asset tree is built from it</strong> — you do not key the hierarchy in twice.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <a href="/equipment/export" className="btn btn-secondary btn-sm">
            Download current tags (.xlsx)
          </a>
          <a href="/equipment/template" className="btn btn-secondary btn-sm">
            Download a blank template
          </a>
        </div>

        {mayManage ? (
          <form
            action={importEquipment}
            style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}
          >
            <label className="field" style={{ flex: '1 1 320px' }}>
              Import an equipment list
              <input type="file" name="file" accept=".xlsx,.xls,.csv" required className="input" />
            </label>
            <button type="submit" className="btn btn-primary" disabled={!project}>
              Import
            </button>
          </form>
        ) : (
          <p className="text-secondary" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
            Your role cannot import equipment.
          </p>
        )}

        <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 14, marginBottom: 0 }}>
          Your own headings are fine — <em>Tag No</em>, <em>KKS</em>, <em>Asset ID</em>, <em>Service</em>,{' '}
          <em>Discipline</em>, <em>Vendor</em> are all understood, and the table can start anywhere on the sheet,
          under a title block. A tag that already exists is updated rather than duplicated. If any row is wrong,{' '}
          <strong>nothing is imported at all</strong> and every bad row is listed in the{' '}
          <Link href="/audit" className="link">
            audit trail
          </Link>{' '}
          by row number.
        </p>
      </div>

      {/* ── Add one by hand ──────────────────────────────────────── */}
      {mayRecord && (
        <details className="card" style={{ marginTop: 20 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 15 }}>Add a single tag</summary>
          <form action={createEquipment} style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr', marginTop: 16 }}>
            <input type="hidden" name="project_id" value={project?.id ?? ''} />
            <label className="field">
              Tag *
              <input name="tag_id" required placeholder="e.g. GEN-01" className="input" />
            </label>
            <label className="field">
              Description
              <input name="description" placeholder="e.g. Standby Diesel Generator" className="input" />
            </label>
            <label className="field">
              Category
              <select name="category" className="input" defaultValue="">
                <option value="">Not set</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Status
              <select name="install_status" className="input" defaultValue="not_delivered">
                {INSTALL_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Manufacturer
              <input name="manufacturer" className="input" />
            </label>
            <label className="field">
              Model
              <input name="model" className="input" />
            </label>
            <label className="field">
              Location
              <input name="location" className="input" />
            </label>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={!project}>
                Add equipment
              </button>
            </div>
          </form>
        </details>
      )}

      {/* ── Filters ──────────────────────────────────────────────── */}
      <form method="get" style={{ display: 'flex', gap: 10, alignItems: 'flex-end', margin: '22px 0 8px' }}>
        <label className="field" style={{ flex: '1 1 260px' }}>
          Search
          <input name="q" defaultValue={q ?? ''} placeholder="Tag or description" className="input" />
        </label>
        <label className="field" style={{ minWidth: 200 }}>
          Category
          <select name="category" defaultValue={category ?? ''} className="input">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-secondary">
          Filter
        </button>
        {(q || category) && (
          <Link href="/equipment" className="btn-link">
            Clear
          </Link>
        )}
      </form>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Description</th>
              <th>Category</th>
              <th>Location</th>
              <th>Status</th>
              <th style={{ minWidth: 200 }}></th>
            </tr>
          </thead>
          <tbody>
            {shown.length > 0 ? (
              shown.map((item) => (
                <tr key={item.id}>
                  <td className="mono tag-id">{item.tag_id}</td>
                  <td style={{ fontSize: 13.5 }}>{item.description ?? '—'}</td>
                  <td style={{ fontSize: 13 }}>{item.category ? categoryLabel(item.category) : '—'}</td>
                  <td style={{ fontSize: 13 }}>{item.location ?? '—'}</td>
                  <td>
                    <span className={installBadgeClass(item.install_status ?? '')}>
                      {installLabel(item.install_status ?? '')}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Link href={`/assets/equipment/${item.id}`} className="link" style={{ fontSize: 13 }}>
                        Open
                      </Link>
                      <Link href={`/equipment/${item.id}/checklist`} className="link" style={{ fontSize: 13 }}>
                        Checklist
                      </Link>
                      {mayRecord && (
                        <Link href={`/equipment/${item.id}/edit`} className="link" style={{ fontSize: 13 }}>
                          Edit
                        </Link>
                      )}
                      {mayManage && (
                        <form action={deleteEquipment}>
                          <input type="hidden" name="id" value={item.id} />
                          <input type="hidden" name="label" value={item.tag_id} />
                          <button type="submit" className="btn-link" style={{ fontSize: 13 }}>
                            Delete
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="empty-row">
                  {total === 0 ? 'No equipment yet — import your tag list above.' : 'Nothing matches that filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Paging ───────────────────────────────────────────────── */}
      {pages > 1 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="btn btn-secondary btn-sm">
              ← Previous
            </Link>
          )}
          <span className="text-secondary mono" style={{ fontSize: 12.5 }}>
            {from + 1}–{Math.min(from + PAGE_SIZE, total)} of {total} · page {page} of {pages}
          </span>
          {page < pages && (
            <Link href={pageHref(page + 1)} className="btn btn-secondary btn-sm">
              Next →
            </Link>
          )}
        </div>
      )}
    </>
  )
}
