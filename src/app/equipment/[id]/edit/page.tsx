import { supabase } from '@/lib/supabase'
import { updateEquipment } from '../../actions'
import { inputStyle, buttonStyle, labelStyle, CATEGORIES, INSTALL_STATUSES } from '../../styles'

export default async function EditEquipmentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { data: item } = await supabase.from('equipment').select('*').eq('id', id).single()

  if (!item) {
    return (
      <main style={{ maxWidth: 600, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
        <p>Equipment not found.</p>
        <a href="/equipment">Back to Equipment &amp; Tags</a>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 600, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Edit {item.tag_id}</h1>
      <form action={updateEquipment} style={{ display: 'grid', gap: 14 }}>
        <input type="hidden" name="id" value={item.id} />
        <label style={labelStyle}>
          Tag ID *
          <input name="tag_id" required defaultValue={item.tag_id} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Description
          <input name="description" defaultValue={item.description ?? ''} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Category
          <select name="category" defaultValue={item.category ?? ''} style={inputStyle}>
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
          <select name="install_status" defaultValue={item.install_status} style={inputStyle}>
            {INSTALL_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Manufacturer
          <input name="manufacturer" defaultValue={item.manufacturer ?? ''} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Model
          <input name="model" defaultValue={item.model ?? ''} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Location
          <input name="location" defaultValue={item.location ?? ''} style={inputStyle} />
        </label>
        <div style={{ display: 'flex', gap: 14, marginTop: 8, alignItems: 'center' }}>
          <button type="submit" style={buttonStyle}>
            Save changes
          </button>
          <a href="/equipment">Cancel</a>
        </div>
      </form>
    </main>
  )
}
