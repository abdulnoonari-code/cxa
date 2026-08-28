import { supabase } from '@/lib/supabase'
import { createEquipment, deleteEquipment } from './actions'
import {
  inputStyle,
  buttonStyle,
  labelStyle,
  thStyle,
  tdStyle,
  CATEGORIES,
  INSTALL_STATUSES,
} from './styles'
import { TopNav } from '@/components/TopNav'

export const dynamic = 'force-dynamic'

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>
}) {
  const { q, category } = await searchParams

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .order('created_at', { ascending: true })
    .limit(1)

  const project = projects?.[0]

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

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <TopNav />
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Equipment &amp; Tags</h1>
      <p style={{ color: '#555', marginBottom: 24 }}>
        Project:{' '}
        {project ? project.name : 'No project found — run the Week 2 SQL step first.'}
      </p>

      {error && (
        <p style={{ color: '#b23a3a', marginBottom: 16 }}>
          Couldn&apos;t load equipment: {error.message}
        </p>
      )}

      <section style={{ marginBottom: 32, padding: 20, border: '1px solid #ddd', borderRadius: 8 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Add equipment</h2>
        <form
          action={createEquipment}
          style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}
        >
          <input type="hidden" name="project_id" value={project?.id ?? ''} />
          <label style={labelStyle}>
            Tag ID *
            <input name="tag_id" required placeholder="e.g. GEN-01" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Description
            <input name="description" placeholder="e.g. Standby Diesel Generator" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Category
            <select name="category" style={inputStyle} defaultValue="">
              <option value="">— choose —</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Install status
            <select name="install_status" style={inputStyle} defaultValue="not_delivered">
              {INSTALL_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Manufacturer
            <input name="manufacturer" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Model
            <input name="model" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Location
            <input name="location" style={inputStyle} />
          </label>
          <div style={{ alignSelf: 'end' }}>
            <button type="submit" style={buttonStyle} disabled={!project}>
              Add equipment
            </button>
          </div>
        </form>
      </section>

      <section style={{ marginBottom: 16 }}>
        <form style={{ display: 'flex', gap: 10 }}>
          <input
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search tag or description"
            style={{ ...inputStyle, flex: 1 }}
          />
          <select name="category" defaultValue={category ?? ''} style={inputStyle}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <button type="submit" style={buttonStyle}>
            Filter
          </button>
        </form>
      </section>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #333' }}>
            <th style={thStyle}>Tag ID</th>
            <th style={thStyle}>Description</th>
            <th style={thStyle}>Category</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Location</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {equipment && equipment.length > 0 ? (
            equipment.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={tdStyle}>{item.tag_id}</td>
                <td style={tdStyle}>{item.description}</td>
                <td style={tdStyle}>{item.category}</td>
                <td style={tdStyle}>{item.install_status}</td>
                <td style={tdStyle}>{item.location}</td>
                <td style={tdStyle}>
                  <a href={`/equipment/${item.id}/checklist`} style={{ marginRight: 12 }}>
                    Checklist
                  </a>
                  <a href={`/equipment/${item.id}/edit`} style={{ marginRight: 12 }}>
                    Edit
                  </a>
                  <form action={deleteEquipment} style={{ display: 'inline' }}>
                    <input type="hidden" name="id" value={item.id} />
                    <button
                      type="submit"
                      style={{ color: '#b23a3a', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#888' }}>
                No equipment yet — add your first one above.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  )
}
