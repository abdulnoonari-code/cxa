import UploadResult from '@/components/UploadResult'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { FILE_CATEGORIES, fileCategoryLabel } from '@/lib/tasks'
import { uploadProjectFile, deleteProjectFile } from './actions'

export const dynamic = 'force-dynamic'

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const category = typeof sp.category === 'string' ? sp.category : undefined
  const project = await getCurrentProject()

  let query = supabase
    .from('project_files')
    .select('id, file_name, file_url, file_path, category, description, created_at')
    .order('created_at', { ascending: false })

  if (project) query = query.eq('project_id', project.id)
  if (category) query = query.eq('category', category)

  const { data: filesRaw } = project ? await query : { data: [] }
  const files = filesRaw ?? []

  const { data: allRaw } = project
    ? await supabase.from('project_files').select('category').eq('project_id', project.id)
    : { data: [] as { category: string | null }[] }
  const all = allRaw ?? []

  return (
    <>
      <UploadResult searchParams={sp} />
      <h1 className="page-title">Files</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — drawings, specifications, submittals and manuals for
        the project as a whole. Evidence against a specific check lives under Document Review instead.
      </p>

      <div className="card">
        <h2 className="section-title">Upload a file</h2>
        <form action={uploadProjectFile} style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
          <input type="hidden" name="project_id" value={project?.id ?? ''} />
          <label className="field">
            File *
            <input type="file" name="file" required className="input" />
          </label>
          <label className="field">
            Category
            <select name="category" className="input" defaultValue="">
              <option value="">— choose —</option>
              {FILE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            Description
            <input name="description" placeholder="e.g. Single line diagram, rev C" className="input" />
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="btn btn-primary" disabled={!project}>
              Upload
            </button>
          </div>
        </form>
      </div>

      <div style={{ margin: '24px 0 16px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <a href="/files" className={category ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}>
          All ({all.length})
        </a>
        {FILE_CATEGORIES.map((c) => {
          const n = all.filter((f) => f.category === c.value).length
          if (n === 0) return null
          return (
            <a
              key={c.value}
              href={`/files?category=${c.value}`}
              className={category === c.value ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            >
              {c.label} ({n})
            </a>
          )
        })}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>File</th>
              <th>Category</th>
              <th>Description</th>
              <th>Added</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {files.length > 0 ? (
              files.map((f) => (
                <tr key={f.id}>
                  <td>
                    <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="link">
                      {f.file_name}
                    </a>
                  </td>
                  <td>
                    <span className="badge badge-neutral">{fileCategoryLabel(f.category)}</span>
                  </td>
                  <td>{f.description ?? <span className="text-secondary">—</span>}</td>
                  <td className="mono" style={{ fontSize: 12.5 }}>
                    {f.created_at?.slice(0, 10) ?? '—'}
                  </td>
                  <td>
                    <form action={deleteProjectFile}>
                      <input type="hidden" name="id" value={f.id} />
                      <input type="hidden" name="file_path" value={f.file_path} />
                      <button type="submit" className="btn-link">
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="empty-row">
                  No files yet — upload the project drawings and specifications above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
