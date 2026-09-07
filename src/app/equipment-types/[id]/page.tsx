import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { CATEGORIES, INSTALL_STATUSES, installBadgeClass } from '@/app/equipment/styles'
import { updateType } from '../actions'

export const dynamic = 'force-dynamic'

// One catalogue entry, and every tag that is one of them.
//
// This is what a QR code on a type label opens: scan the label on a spares
// shelf or a crate and see the model's spec and every unit installed on the
// job, rather than a piece of text saying "SIE-8DN9".
export default async function TypeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await getCurrentProject()

  const { data, error } = await supabase
    .from('equipment_types')
    .select('id, project_id, type_code, name, category, manufacturer, model, rating, description')
    .eq('id', id)
    .single()

  if (error || !data) notFound()

  const type = data as {
    id: string
    project_id: string
    type_code: string
    name: string | null
    category: string | null
    manufacturer: string | null
    model: string | null
    rating: string | null
    description: string | null
  }

  const { data: tagRows } = await supabase
    .from('equipment')
    .select('id, tag_id, description, location, install_status, serial_number')
    .eq('type_id', id)
    .order('tag_id')

  const tags = (tagRows ?? []) as {
    id: string
    tag_id: string
    description: string | null
    location: string | null
    install_status: string | null
    serial_number: string | null
  }[]

  const label = (v: string | null) => CATEGORIES.find((c) => c.value === v)?.label ?? v ?? '—'
  const status = (v: string | null) => INSTALL_STATUSES.find((s) => s.value === v)?.label ?? v ?? '—'

  return (
    <>
      <p className="text-secondary" style={{ fontSize: 12.5, marginBottom: 6 }}>
        <Link href="/equipment-types" className="link">
          Equipment Types
        </Link>
      </p>
      <h1 className="page-title mono">{type.type_code}</h1>
      <p className="page-subtitle">{type.name ?? type.type_code}</p>

      <div className="stat-grid">
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-primary)' }}>
          <div className="stat-label">Tags of this type</div>
          <div className="stat-value">{tags.length}</div>
          <div className="stat-note">on {project?.name ?? 'this project'}</div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-neutral-solid)' }}>
          <div className="stat-label">Discipline</div>
          <div className="stat-value" style={{ fontSize: 18 }}>{label(type.category)}</div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-neutral-solid)' }}>
          <div className="stat-label">Manufacturer</div>
          <div className="stat-value" style={{ fontSize: 18 }}>{type.manufacturer ?? '—'}</div>
          <div className="stat-note">{type.model ?? ''}</div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-neutral-solid)' }}>
          <div className="stat-label">Rating</div>
          <div className="stat-value" style={{ fontSize: 18 }}>{type.rating ?? '—'}</div>
        </div>
      </div>

      {type.description && (
        <div className="card" style={{ marginTop: 16 }}>
          <p style={{ margin: 0, fontSize: 13.5 }}>{type.description}</p>
        </div>
      )}

      <details className="card" style={{ marginTop: 16 }}>
        <summary className="section-title" style={{ cursor: 'pointer', marginBottom: 0 }}>
          Edit this type
        </summary>
        <form action={updateType} style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr 1fr', marginTop: 16 }}>
          <input type="hidden" name="id" value={type.id} />
          <label className="field" style={{ gridColumn: '1 / 3' }}>
            Name
            <input name="name" defaultValue={type.name ?? ''} className="input" />
          </label>
          <label className="field">
            Discipline
            <select name="category" className="input" defaultValue={type.category ?? ''}>
              <option value="">Not set</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Manufacturer
            <input name="manufacturer" defaultValue={type.manufacturer ?? ''} className="input" />
          </label>
          <label className="field">
            Model
            <input name="model" defaultValue={type.model ?? ''} className="input" />
          </label>
          <label className="field">
            Rating
            <input name="rating" defaultValue={type.rating ?? ''} className="input" />
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            Notes
            <input name="description" defaultValue={type.description ?? ''} className="input" />
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          </div>
        </form>
      </details>

      <h2 className="section-title" style={{ marginTop: 30 }}>
        Every tag of this type
      </h2>
      <p className="text-secondary" style={{ fontSize: 12.5, marginTop: -8, marginBottom: 12 }}>
        The serial number lives here, on the unit, not on the type — it identifies the one, not the model.
      </p>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Description</th>
              <th>Location</th>
              <th>Serial number</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {tags.length > 0 ? (
              tags.map((t) => (
                <tr key={t.id}>
                  <td className="mono tag-id">
                    <Link href={`/assets/equipment/${t.id}`} className="link">
                      {t.tag_id}
                    </Link>
                  </td>
                  <td style={{ fontSize: 13.5 }}>{t.description ?? '—'}</td>
                  <td style={{ fontSize: 13 }}>{t.location ?? '—'}</td>
                  <td className="mono" style={{ fontSize: 12.5 }}>{t.serial_number ?? '—'}</td>
                  <td>
                    <span className={installBadgeClass(t.install_status ?? '')}>{status(t.install_status)}</span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="empty-row">
                  No tags are filed under this type yet. Put its code in the <strong>Type</strong> column of your
                  equipment spreadsheet and import — the tags attach themselves.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
