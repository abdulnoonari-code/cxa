import { supabase } from '@/lib/supabase'
import { updateEquipment } from '../../actions'
import { CATEGORIES, INSTALL_STATUSES } from '../../styles'

export default async function EditEquipmentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { data: item } = await supabase.from('equipment').select('*').eq('id', id).single()

  if (!item) {
    return (
      <div style={{ maxWidth: 600 }}>
        <p style={{ marginBottom: 8 }}>Equipment not found.</p>
        <a href="/equipment" className="link">
          Back to Equipment &amp; Tags
        </a>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 className="page-title" style={{ marginBottom: 20 }}>
        Edit {item.tag_id}
      </h1>
      <div className="card">
        <form action={updateEquipment} style={{ display: 'grid', gap: 14 }}>
          <input type="hidden" name="id" value={item.id} />
          <label className="field">
            Tag ID *
            <input name="tag_id" required defaultValue={item.tag_id} className="input" />
          </label>
          <label className="field">
            Description
            <input name="description" defaultValue={item.description ?? ''} className="input" />
          </label>
          <label className="field">
            Category
            <select name="category" defaultValue={item.category ?? ''} className="input">
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
            <select name="install_status" defaultValue={item.install_status} className="input">
              {INSTALL_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Manufacturer
            <input name="manufacturer" defaultValue={item.manufacturer ?? ''} className="input" />
          </label>
          <label className="field">
            Model
            <input name="model" defaultValue={item.model ?? ''} className="input" />
          </label>
          <label className="field">
            Location
            <input name="location" defaultValue={item.location ?? ''} className="input" />
          </label>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, alignItems: 'center' }}>
            <button type="submit" className="btn btn-primary">
              Save changes
            </button>
            <a href="/equipment" className="link">
              Cancel
            </a>
          </div>
        </form>
      </div>
    </div>
  )
}
