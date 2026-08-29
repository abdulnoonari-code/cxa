import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { updateProject } from './actions'

export const dynamic = 'force-dynamic'

export default async function ProjectPage() {
  const project = await getCurrentProject()

  if (!project) {
    return (
      <>
        <h1 className="page-title">Project</h1>
        <p className="page-subtitle">
          No project found — run the Week 2 SQL step first, then come back here to name it.
        </p>
      </>
    )
  }

  const { data: equipmentRows } = await supabase
    .from('equipment')
    .select('id')
    .eq('project_id', project.id)

  const equipmentCount = (equipmentRows ?? []).length

  return (
    <>
      <h1 className="page-title">Project</h1>
      <p className="page-subtitle">
        The name, client and dates used across every screen and every export. Change them here and the whole
        site updates.
      </p>

      <div className="card">
        <h2 className="section-title">Project details</h2>
        <form action={updateProject} style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
          <input type="hidden" name="id" value={project.id} />

          <label className="field" style={{ gridColumn: '1 / -1' }}>
            Project name *
            <input
              name="name"
              required
              defaultValue={project.name ?? ''}
              placeholder="e.g. Riverbend Data Center — Phase 1"
              className="input"
            />
          </label>

          <label className="field">
            Client
            <input
              name="client"
              defaultValue={project.client ?? ''}
              placeholder="e.g. PEA / owner name"
              className="input"
            />
          </label>

          <label className="field">
            Location
            <input
              name="location"
              defaultValue={project.location ?? ''}
              placeholder="e.g. Bangkok, Thailand"
              className="input"
            />
          </label>

          <label className="field">
            Start date
            <input type="date" name="start_date" defaultValue={project.start_date ?? ''} className="input" />
          </label>

          <label className="field">
            Target completion
            <input type="date" name="target_date" defaultValue={project.target_date ?? ''} className="input" />
          </label>

          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="btn btn-primary">
              Save project
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title">What&apos;s in this project</h2>
        <p className="text-secondary" style={{ fontSize: 14, marginBottom: 0 }}>
          {equipmentCount} equipment tag{equipmentCount === 1 ? '' : 's'}. Everything in CxSentinel — checks,
          documents, punch list items and milestones — belongs to this project.
        </p>
      </div>
    </>
  )
}
