import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { createEquipment, deleteEquipment } from './actions'
import { CATEGORIES, INSTALL_STATUSES, installBadgeClass } from './styles'

export const dynamic = 'force-dynamic'

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>
}) {
  const { q, category } = await searchParams

  const project = await getCurrentProject()

  let query = supabase
    .from('equipment')
    .select('id, tag_id, description, category, manufacturer, model, location, install_status')
    .order('tag_id', { ascending: true })

  if (project) query = query.eq('project_id', project.id)
  if (q) query = query.or(`tag_id.ilike.%${q}%,description.ilike.%${q}%`)
  if (category) query = query.eq('category', category)

  const { data: equipment, error } = project
    ? await query
    : { data: [], error: null }

  const categoryLabel = (value: string) => CATEGORIES.find((c) => c.value === value)?.label ?? value
  const installLabel = (value: string) => INSTALL_STATUSES.find((s) => s.value === value)?.label ?? value

  return (
    <>
      <h1 className="page-title">Equipment &amp; Tags</h1>
        <p className="page-subtitle">
          Project: {project ? project.name : 'No project found — run the Week 2 SQL step first.'}
        </p>

        {error && <p className="alert alert-danger">Couldn&apos;t load equipment: {error.message}</p>}

        <div className="card">
          <h2 className="section-title">Add equipment</h2>
          <form action={createEquipment} style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
            <input type="hidden" name="project_id" value={project?.id ?? ''} />
            <label className="field">
              Tag ID *
              <input name="tag_id" required placeholder="e.g. GEN-01" className="input" />
            </label>
            <label className="field">
              Description
              <input name="description" placeholder="e.g. Standby Diesel Generator" className="input" />
            </label>
            <label className="field">
              Category
              <select name="category" className="input" defaultValue="">
                <option value="">— choose —</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Install status
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
            <div style={{ alignSelf: 'end' }}>
              <button type="submit" className="btn btn-primary" disabled={!project}>
                Add equipment
              </button>
            </div>
          </form>
        </div>

        <div style={{ margin: '24px 0 16px' }}>
          <form style={{ display: 'flex', gap: 10 }}>
            <input
              name="q"
              defaultValue={q ?? ''}
              placeholder="Search tag or description"
              className="input"
              style={{ flex: 1 }}
            />
            <select name="category" defaultValue={category ?? ''} className="input" style={{ maxWidth: 220 }}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
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
                <th>Tag ID</th>
                <th>Description</th>
                <th>Category</th>
                <th>Status</th>
                <th>Location</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {equipment && equipment.length > 0 ? (
                equipment.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600 }}>{item.tag_id}</td>
                    <td>{item.description}</td>
                    <td>{item.category ? categoryLabel(item.category) : '—'}</td>
                    <td>
                      <span className={installBadgeClass(item.install_status)}>
                        {installLabel(item.install_status)}
                      </span>
                    </td>
                    <td>{item.location}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                        <Link href={`/equipment/${item.id}/checklist`} className="link">
                          Checklist
                        </Link>
                        <Link href={`/equipment/${item.id}/edit`} className="link">
                          Edit
                        </Link>
                        <form action={deleteEquipment}>
                          <input type="hidden" name="id" value={item.id} />
                          <button type="submit" className="btn-link">
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty-row">
                    No equipment yet — add your first one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
      </div>
    </>
  )
}
