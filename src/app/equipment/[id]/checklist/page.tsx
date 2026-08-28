import { supabase } from '@/lib/supabase'
import { addChecklistItem, updateChecklistItem, deleteChecklistItem, checkItem } from './actions'
import { inputStyle, buttonStyle, labelStyle, LEVELS, STATUSES } from './styles'

export const dynamic = 'force-dynamic'

export default async function ChecklistPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const { data: equipment } = await supabase
    .from('equipment')
    .select('id, tag_id, description')
    .eq('id', id)
    .single()

  if (!equipment) {
    return (
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
        <p>Equipment not found.</p>
        <a href="/equipment">Back to Equipment &amp; Tags</a>
      </main>
    )
  }

  const { data: items } = await supabase
    .from('checklist_items')
    .select('id, level, item, status, notes, ai_comment')
    .eq('equipment_id', id)
    .order('level', { ascending: true })
    .order('created_at', { ascending: true })

  const levelLabel = (value: string) => LEVELS.find((l) => l.value === value)?.label ?? value
  const statusColor = (status: string) =>
    status === 'pass' ? '#1a7a3c' : status === 'fail' ? '#b23a3a' : status === 'na' ? '#888' : '#a67c00'

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ marginBottom: 8 }}>
        <a href="/equipment">&larr; Back to Equipment &amp; Tags</a>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>Checklist — {equipment.tag_id}</h1>
      {equipment.description && <p style={{ color: '#555', marginBottom: 24 }}>{equipment.description}</p>}

      <section style={{ marginBottom: 32, padding: 20, border: '1px solid #ddd', borderRadius: 8 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Add checklist item</h2>
        <form action={addChecklistItem} style={{ display: 'grid', gap: 12 }}>
          <input type="hidden" name="equipment_id" value={equipment.id} />
          <label style={labelStyle}>
            Level
            <select name="level" required style={inputStyle} defaultValue="">
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
          <label style={labelStyle}>
            Item to check *
            <input name="item" required placeholder="e.g. Verify fuel level above 75%" style={inputStyle} />
          </label>
          <div>
            <button type="submit" style={buttonStyle}>
              Add item
            </button>
          </div>
        </form>
      </section>

      {items && items.length > 0 ? (
        <div style={{ display: 'grid', gap: 16 }}>
          {items.map((it) => (
            <div key={it.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 8,
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>{levelLabel(it.level)}</div>
                  <div style={{ fontWeight: 600 }}>{it.item}</div>
                </div>
                <span
                  style={{
                    color: statusColor(it.status),
                    fontWeight: 600,
                    fontSize: 13,
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {it.status}
                </span>
              </div>

              <form style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 2fr' }}>
                <input type="hidden" name="id" value={it.id} />
                <input type="hidden" name="equipment_id" value={equipment.id} />
                <label style={labelStyle}>
                  Status
                  <select
                    key={`status-${it.id}-${it.status}`}
                    name="status"
                    defaultValue={it.status}
                    style={inputStyle}
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={labelStyle}>
                  Notes
                  <input
                    key={`notes-${it.id}-${it.notes ?? ''}`}
                    name="notes"
                    defaultValue={it.notes ?? ''}
                    placeholder="What was verified, or why it failed"
                    style={inputStyle}
                  />
                </label>
                <div style={{ display: 'flex', gap: 10, gridColumn: '1 / -1' }}>
                  <button formAction={updateChecklistItem} type="submit" style={buttonStyle}>
                    Save
                  </button>
                  <button formAction={checkItem} type="submit" style={{ ...buttonStyle, background: '#1a4d8f' }}>
                    Check
                  </button>
                  <button formAction={deleteChecklistItem} type="submit" style={{ ...buttonStyle, background: '#b23a3a' }}>
                    Delete
                  </button>
                </div>
              </form>

              {it.ai_comment && (
                <p style={{ marginTop: 10, padding: 10, background: '#f3f6fb', borderRadius: 6, fontSize: 13, color: '#333' }}>
                  <strong>Check note:</strong> {it.ai_comment}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: '#888' }}>No checklist items yet — add your first one above.</p>
      )}
    </main>
  )
}
