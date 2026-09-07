import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { CATEGORIES } from '@/app/equipment/styles'
import { createType, deleteType, importTypes } from './actions'

export const dynamic = 'force-dynamic'

export default async function EquipmentTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ import?: string; added?: string; updated?: string; warn?: string; why?: string; q?: string }>
}) {
  const { import: imp, added = '0', updated: changed = '0', warn = '0', why, q } = await searchParams
  const project = await getCurrentProject()

  // The catalogue arrives with SQL part 35. Asking for a table the database
  // does not have is an error, and an error read as "no types" would look
  // exactly like an empty catalogue — so the two are told apart here.
  const res = project
    ? await supabase
        .from('equipment_types')
        .select('id, type_code, name, category, manufacturer, model, rating, description')
        .eq('project_id', project.id)
        .order('type_code')
    : { data: [], error: null }

  const notInstalled = Boolean(res.error)
  const all = (res.data ?? []) as {
    id: string
    type_code: string
    name: string | null
    category: string | null
    manufacturer: string | null
    model: string | null
    rating: string | null
    description: string | null
  }[]

  const needle = (q ?? '').trim().toLowerCase()
  const types = needle
    ? all.filter((t) =>
        `${t.type_code} ${t.name ?? ''} ${t.manufacturer ?? ''} ${t.model ?? ''}`.toLowerCase().includes(needle)
      )
    : all

  // How many tags each type has. One query for the page, not one per type.
  const counts = new Map<string, number>()
  if (project && !notInstalled && all.length > 0) {
    const { data: tags } = await supabase
      .from('equipment')
      .select('id, type_id')
      .eq('project_id', project.id)
      .not('type_id', 'is', null)
    for (const t of (tags ?? []) as { type_id: string | null }[]) {
      if (t.type_id) counts.set(t.type_id, (counts.get(t.type_id) ?? 0) + 1)
    }
  }

  const label = (v: string | null) => CATEGORIES.find((c) => c.value === v)?.label ?? v ?? '—'

  return (
    <>
      <h1 className="page-title">Equipment Types</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — the catalogue behind the tags. A type is a make and
        model; a tag is one of them installed somewhere. Forty identical breakers are forty tags and one type.
      </p>

      {notInstalled && (
        <div className="alert alert-danger">
          <strong>The catalogue is not installed on this database.</strong> Run{' '}
          <code className="mono">week5-part35-equipment-types.sql</code> in Supabase. Nothing else on this project is
          affected — an equipment register with no types is a normal register.
        </div>
      )}

      {imp === 'ok' && (
        <div className="alert alert-info">
          <strong>Imported.</strong> {added} type{added === '1' ? '' : 's'} added, {changed} updated.
          {Number(warn) > 0 && ` ${warn} warning${warn === '1' ? '' : 's'} — see the audit trail.`}
        </div>
      )}
      {imp === 'refused' && (
        <div className="alert alert-danger">
          <strong>Nothing was imported.</strong> {why}
        </div>
      )}
      {imp === 'notable' && (
        <div className="alert alert-danger">
          <strong>Nothing was imported.</strong> This database has no catalogue table yet. Run SQL part 35 and
          upload the same file again.
        </div>
      )}
      {imp === 'unreadable' && (
        <div className="alert alert-danger">
          <strong>That file could not be opened.</strong> It needs to be an .xlsx workbook.
        </div>
      )}
      {imp === 'nofile' && (
        <div className="alert alert-warning">
          <strong>No file was chosen.</strong>
        </div>
      )}

      <div className="card">
        <h2 className="section-title" style={{ marginTop: 0 }}>
          Bring in your catalogue
        </h2>
        <p className="text-secondary" style={{ fontSize: 13.5, marginBottom: 12 }}>
          One row per make and model. A code that already exists is updated, not duplicated — so this is safe to run
          after an equipment import, and it fills in the manufacturer, rating and discipline of types that were
          created from a tag list.
        </p>
        <div className="io-bar">
          {/* Plain anchors, not <Link>. These are file downloads, not
              navigations — a client-side route change would leave the browser
              on this page with nothing downloaded. The linter flags them only
              because the [id] page next door makes /equipment-types/anything
              look like a page route; Next resolves the static segment first,
              so the route handler is what answers. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/equipment-types/export" className="btn btn-secondary">
            Download current types (.xlsx)
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/equipment-types/template" className="btn btn-secondary">
            Download a blank template
          </a>
          <form action={importTypes} encType="multipart/form-data">
            <input type="file" name="file" accept=".xlsx,.xls" required className="io-file" />
            <button type="submit" className="btn btn-primary" disabled={!project}>
              Import
            </button>
          </form>
          <a href="/qr?scope=type" className="btn btn-secondary">
            QR labels
          </a>
        </div>
        <p className="io-note">
          If any row cannot be read, nothing is imported at all. A blank cell means &ldquo;I did not say&rdquo;, not
          &ldquo;clear this&rdquo;.
        </p>
      </div>

      <details className="card" style={{ marginTop: 16 }}>
        <summary className="section-title" style={{ cursor: 'pointer', marginBottom: 0 }}>
          Add one by hand
        </summary>
        <form action={createType} style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 2fr 1fr', marginTop: 16 }}>
          <label className="field">
            Type code *
            <input name="type_code" required placeholder="e.g. SIE-8DN9" className="input" />
          </label>
          <label className="field">
            Name
            <input name="name" placeholder="e.g. Siemens 8DN9 115 kV SF6 circuit breaker" className="input" />
          </label>
          <label className="field">
            Discipline
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
            Manufacturer
            <input name="manufacturer" placeholder="e.g. Siemens Energy" className="input" />
          </label>
          <label className="field">
            Model
            <input name="model" placeholder="e.g. 8DN9" className="input" />
          </label>
          <label className="field">
            Rating
            <input name="rating" placeholder="e.g. 115 kV, 40 kA, 3150 A" className="input" />
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            Notes
            <input name="description" className="input" />
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="btn btn-primary" disabled={!project || notInstalled}>
              Add type
            </button>
          </div>
        </form>
      </details>

      {all.length > 0 && (
        <form method="get" action="/equipment-types" className="io-bar" style={{ marginTop: 16 }}>
          <input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search code, name, manufacturer or model…"
            className="input"
            style={{ width: 'auto', flex: '1 1 260px', height: 38 }}
          />
          <button type="submit" className="btn btn-secondary">
            Search
          </button>
          {q && (
            <Link href="/equipment-types" className="btn btn-secondary">
              Clear
            </Link>
          )}
        </form>
      )}

      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Type code</th>
              <th>Name</th>
              <th>Discipline</th>
              <th>Manufacturer</th>
              <th>Model</th>
              <th>Rating</th>
              <th style={{ textAlign: 'right' }}>Tags</th>
              <th style={{ minWidth: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {types.length > 0 ? (
              types.map((t) => (
                <tr key={t.id}>
                  <td className="mono tag-id">
                    <Link href={`/equipment-types/${t.id}`} className="link">
                      {t.type_code}
                    </Link>
                  </td>
                  <td style={{ fontSize: 13.5 }}>{t.name ?? '—'}</td>
                  <td style={{ fontSize: 13 }}>{label(t.category)}</td>
                  <td style={{ fontSize: 13 }}>{t.manufacturer ?? '—'}</td>
                  <td className="mono" style={{ fontSize: 12.5 }}>{t.model ?? '—'}</td>
                  <td style={{ fontSize: 12.5 }}>{t.rating ?? '—'}</td>
                  <td className="mono" style={{ textAlign: 'right', fontSize: 12.5 }}>
                    {counts.get(t.id) ? (
                      <Link href={`/equipment-types/${t.id}`} className="link">
                        {counts.get(t.id)}
                      </Link>
                    ) : (
                      <span className="text-secondary">0</span>
                    )}
                  </td>
                  <td>
                    <form action={deleteType}>
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit" className="btn-link" style={{ fontSize: 13 }}>
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="empty-row">
                  {notInstalled
                    ? 'Run SQL part 35 and this fills in.'
                    : all.length === 0
                      ? 'No types yet. Import your catalogue above, or put a Type column in your equipment spreadsheet and they will be created as the tags arrive.'
                      : 'Nothing matches that search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 14 }}>
        Deleting a type does <strong>not</strong> delete the tags that referenced it. They simply stop pointing at a
        catalogue entry, which is what a tag with no type looks like — the normal state of most registers.
      </p>
    </>
  )
}
