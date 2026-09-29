import { requirePage } from '@/data/require-page'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { getCurrentProject } from '@/lib/project'
import { IMPORT_COOKIE, decodeOutcome, summaryLine, detailLines, alertClass } from '@/lib/import-result'
import { getActor } from '@/lib/audit'
import { loadRoles } from '@/data/project-roles'
import { canIn } from '@/lib/project-roles'
import { createEquipment, deleteEquipment, importEquipment } from './actions'
import { CATEGORIES, INSTALL_STATUSES, installBadgeClass } from './styles'
import ImportGroups from '@/components/ImportGroups'
import { loadRegisterGroups } from '@/data/register-groups'

export const dynamic = 'force-dynamic'

// A page size that keeps the query bounded whatever the project. A real
// substation tag list runs to thousands; loading all of them into one page was
// the single worst-scaling thing in the application.
const PAGE_SIZE = 100

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    category?: string
    page?: string
  }>
}) {
  // See src/data/require-page.tsx: the layout does not stop this page
  // running, nor its output being sent. This is the door.
  const refused = await requirePage()
  if (refused) return refused

  const {
    q,
    category,
    page: pageParam,
  } = await searchParams
  const page = Math.max(1, Number(pageParam ?? '1') || 1)
  const from = (page - 1) * PAGE_SIZE

  // Written by the import a second ago and gone thirty seconds later. Not in
  // the address bar, so it cannot be bookmarked, shared or arrive again from
  // somebody's history tomorrow announcing an import that happened today.
  const outcome = decodeOutcome((await cookies()).get(IMPORT_COOKIE)?.value)

  const project = await getCurrentProject()
  const tagImports = await loadRegisterGroups('equipment', project?.id ?? null)
  const actor = await getActor(project?.id ?? null)
  const roles = await loadRoles(project?.id ?? null)
  const mayRecord = canIn(roles, actor.role, 'record')
  const mayManage = canIn(roles, actor.role, 'manage')

  // Ask the database for the page, and for the total, rather than pulling
  // every row and slicing in memory.
  //
  // `floor` arrives with SQL part 31. Selecting a column that does not exist
  // fails the WHOLE query, so on a database without part 31 this page would
  // show an empty equipment register on a project full of equipment — which
  // is the worst way for a missing column to present itself. So it asks for
  // floor, and asks again without it if the database says no.
  const scope = <T extends { eq: (a: string, b: unknown) => T; or: (a: string) => T }>(qb: T): T => {
    let out = qb
    if (project) out = out.eq('project_id', project.id)
    if (q) out = out.or(`tag_id.ilike.%${q}%,description.ilike.%${q}%`)
    if (category) out = out.eq('category', category)
    return out
  }

  // Written out twice rather than built from a string: the client's types
  // read the column list literally, and a computed one is not checked at all.
  const withFloor = () =>
    scope(
      supabase
        .from('equipment')
        .select('id, tag_id, description, category, manufacturer, model, location, install_status, floor, building, critical', {
          count: 'exact',
        })
        .order('tag_id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
    )

  const withoutFloor = () =>
    scope(
      supabase
        .from('equipment')
        .select('id, tag_id, description, category, manufacturer, model, location, install_status', {
          count: 'exact',
        })
        .order('tag_id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
    )

  const first = project ? await withFloor() : { data: null, error: null, count: 0 }
  const fallback = first.error && project ? await withoutFloor() : null
  const rows = (fallback ?? first).data as
    | {
        id: string
        tag_id: string
        description: string | null
        category: string | null
        manufacturer: string | null
        model: string | null
        location: string | null
        install_status: string | null
        floor?: string | null
        building?: string | null
        critical?: boolean | null
      }[]
    | null
  const error = fallback ? fallback.error : first.error
  const count = (fallback ?? first).count

  // How many parts each tag on THIS page has. One query for the page, not
  // one per row — and asked only for the hundred tags being shown.
  //
  // Components arrive with SQL part 34. A database without it answers with an
  // error, which is read as "no parts anywhere" rather than being allowed to
  // empty the register.
  const shownIds = (rows ?? []).map((r) => r.id)

  // ── Where each tag sits, and what it is ─────────────────────────────
  //
  // The register used to show Tag, Description, Category, Building, Floor
  // and Location — and NOT the system, the subsystem or the equipment type.
  // So a tag brought in by the one-sheet import arrived here looking empty:
  // everything the sheet had set was in columns this table did not have,
  // and the import looked like it had done nothing.
  //
  // Asked for the hundred tags on this page only, in the same shape as the
  // part count below, rather than joined into the select above — those two
  // column lists are written out literally on purpose, because of the
  // floor-column fallback, and a join would have to be added to both.
  type Where = { asset: string; system: string; subsystem: string; type: string }
  const where = new Map<string, Where>()
  if (shownIds.length > 0 && project) {
    const { data: placed } = await supabase
      .from('equipment')
      .select('id, system_id, subsystem_id, type_id')
      .eq('project_id', project.id)
      .in('id', shownIds)
    const placedRows = (placed ?? []) as
      { id: string; system_id: string | null; subsystem_id: string | null; type_id: string | null }[]

    const systemIds = [...new Set(placedRows.map((r) => r.system_id).filter(Boolean) as string[])]
    const subsystemIds = [...new Set(placedRows.map((r) => r.subsystem_id).filter(Boolean) as string[])]
    const typeIds = [...new Set(placedRows.map((r) => r.type_id).filter(Boolean) as string[])]

    // Every one of these is scoped: by project where the table carries a
    // project_id, and by the ids we already hold where it does not.
    const [sysRes, subRes, typeRes, areaRes] = await Promise.all([
      systemIds.length
        ? supabase.from('systems').select('id, name, area_id').eq('project_id', project.id).in('id', systemIds)
        : Promise.resolve({ data: [] }),
      subsystemIds.length
        ? supabase.from('subsystems').select('id, name').in('id', subsystemIds)
        : Promise.resolve({ data: [] }),
      typeIds.length
        ? supabase.from('equipment_types').select('id, type_code').eq('project_id', project.id).in('id', typeIds)
        : Promise.resolve({ data: [] }),
      supabase.from('areas').select('id, name').eq('project_id', project.id),
    ])
    const areaName = new Map(((areaRes.data ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]))
    const sysRows = (sysRes.data ?? []) as { id: string; name: string; area_id: string | null }[]
    const sysName = new Map(sysRows.map((s) => [s.id, s.name]))
    const sysAsset = new Map(sysRows.map((s) => [s.id, (s.area_id && areaName.get(s.area_id)) || '']))
    const subName = new Map(((subRes.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]))
    const typeName = new Map(((typeRes.data ?? []) as { id: string; type_code: string }[]).map((t) => [t.id, t.type_code]))

    for (const r of placedRows) {
      where.set(r.id, {
        asset: (r.system_id && sysAsset.get(r.system_id)) || '',
        system: (r.system_id && sysName.get(r.system_id)) || '',
        subsystem: (r.subsystem_id && subName.get(r.subsystem_id)) || '',
        type: (r.type_id && typeName.get(r.type_id)) || '',
      })
    }
  }

  const partCount = new Map<string, number>()
  if (shownIds.length > 0) {
    const { data: parts } = await supabase
      .from('components')
      .select('id, equipment_id')
      .in('equipment_id', shownIds)
    for (const c of (parts ?? []) as { equipment_id: string }[]) {
      partCount.set(c.equipment_id, (partCount.get(c.equipment_id) ?? 0) + 1)
    }
  }

  const total = count ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const shown = rows ?? []

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
        {/* One row, one baseline. The same .io-bar as the Systems screen, so
            the two imports cannot drift into two different shapes. */}
        <div className="io-bar">
          <a href="/equipment/export" className="btn btn-secondary">
            Download current tags (.xlsx)
          </a>
          <Link href="/assets/report" className="btn btn-secondary">
            Report
          </Link>
          <a href="/equipment/template" className="btn btn-secondary">
            Download a blank template
          </a>
          {mayManage && (
            <form action={importEquipment} encType="multipart/form-data">
              <input type="file" name="file" accept=".xlsx,.xls,.csv" required className="io-file" />
              <button type="submit" className="btn btn-primary" disabled={!project}>
                Import
              </button>
            </form>
          )}
          <a href="/qr?scope=equipment" className="btn btn-secondary">
            QR labels
          </a>
        </div>

        {!mayManage && (
          <p className="io-note">Your role cannot import equipment.</p>
        )}

        <p className="io-note">
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

      {/* ── What the import did ─────────────────────────────────────────
          One banner for every outcome, including the successful one. There
          used to be three, each for a particular refusal, and none at all
          for "it worked" or "it could not be read" — so silence was the
          normal end of a successful import and carried no information. */}
      {outcome && (
        <div className={alertClass(outcome)} style={{ marginBottom: 16 }}>
          <strong>{summaryLine(outcome)}</strong>
          {detailLines(outcome).length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              {detailLines(outcome).map((line, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  {line}
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: 8, fontSize: 12.5 }}>
            Every import is recorded in full in the{' '}
            <Link href="/audit" className="link">
              audit trail
            </Link>
            , including anything not listed here.
          </div>
        </div>
      )}

      <ImportGroups kind="equipment" summary={tagImports} />

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 30 }}></th>
              <th>Tag</th>
              <th>Description</th>
              {/* Where it sits and what it is — the four things the
                  one-sheet import sets. Without these the import looked
                  like it had done nothing. */}
              <th>Where it sits</th>
              <th>Type</th>
              <th>Category</th>
              <th>Building</th>
              <th>Floor</th>
              <th>Location</th>
              <th>Parts</th>
              <th>Status</th>
              <th style={{ minWidth: 200 }}></th>
            </tr>
          </thead>
          <tbody>
            {shown.length > 0 ? (
              shown.map((item) => (
                <tr key={item.id}>
                  <td style={{ width: 30 }}>
                    <input
                      type="checkbox"
                      name="row_ids"
                      value={item.id}
                      form="pickrows"
                      aria-label={`Select ${item.tag_id} for deletion`}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                  </td>
                  <td className="mono tag-id">{item.tag_id}</td>
                  <td style={{ fontSize: 13.5 }}>{item.description ?? '—'}</td>
                  {(() => {
                    const w = where.get(item.id)
                    // Read top down: Asset, then System, then Subsystem.
                    // An unplaced tag says so rather than showing a dash
                    // that could be mistaken for a missing column.
                    const parts = [w?.asset, w?.system, w?.subsystem].filter((v): v is string => !!v)
                    return (
                      <>
                        <td style={{ fontSize: 12.5, lineHeight: 1.45, minWidth: 150 }}>
                          {parts.length === 0
                            ? <span className="text-secondary">Not placed</span>
                            : parts.map((p, i) => (
                                <span key={i}>
                                  {i > 0 && <span className="text-secondary"> › </span>}
                                  {p}
                                </span>
                              ))}
                        </td>
                        <td style={{ fontSize: 13 }}>{w?.type || '—'}</td>
                      </>
                    )
                  })()}
                  <td style={{ fontSize: 13 }}>{item.category ? categoryLabel(item.category) : '—'}</td>
                  <td style={{ fontSize: 13 }}>
                    {item.building || <span className="text-secondary">—</span>}
                  </td>
                  <td className="mono" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                    {item.floor || <span className="text-secondary">—</span>}
                    {item.critical === true && (
                      <span className="badge badge-danger" style={{ marginLeft: 6, fontSize: 10 }}>
                        Critical
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: 13 }}>{item.location ?? '—'}</td>
                  <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                    {partCount.get(item.id) ? (
                      <Link href={`/assets/equipment/${item.id}`} className="link">
                        {partCount.get(item.id)} part{partCount.get(item.id) === 1 ? '' : 's'}
                      </Link>
                    ) : (
                      <span className="text-secondary">—</span>
                    )}
                  </td>
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
                <td colSpan={9} className="empty-row">
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
