import { requirePage } from '@/data/require-page'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { updateProject, importHierarchy } from './actions'
import { cookies } from 'next/headers'
import { IMPORT_COOKIE, decodeOutcome, summaryLine, alertClass, detailLines } from '@/lib/import-result'
import DatabaseAccess from '@/components/DatabaseAccess'
import TimelineChart from '@/components/TimelineChart'
import { loadTimeline } from '@/data/timeline'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function ProjectPage() {
  // See src/data/require-page.tsx: the layout does not stop this page
  // running, nor its output being sent. This is the door.
  const refused = await requirePage()
  if (refused) return refused

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

  const timeline = await loadTimeline(project.id, new Date().toISOString().slice(0, 10))

  const jar = await cookies()
  const outcome = decodeOutcome(jar.get(IMPORT_COOKIE)?.value)

  return (
    <>
      <h1 className="page-title">Project Details</h1>
      <p className="page-subtitle">
        The name, client and dates used across every screen and every export — and the plan they are measured
        against. Change anything here and the whole site updates.
      </p>

      {outcome && (
        <div className={alertClass(outcome)} style={{ marginBottom: 16 }}>
          <strong>{summaryLine(outcome)}</strong>
          {detailLines(outcome).length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              {detailLines(outcome).map((line, i) => (
                <li key={i} style={{ fontSize: 13, marginBottom: 2 }}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Set up the job from one sheet ────────────────────────────────
          Here, on the project, and not on a screen of its own. Somebody
          looking for their project's data looks at the project.

          THIS CARD WAS REDESIGNED AFTER "i dont like , interface". The
          first version explained the tree with a diagram and two
          paragraphs before it showed a button. He asked for "simple
          button with import and export", so that is all there is: the
          two buttons on one line, one sentence of columns under them,
          and everything else deleted. The explaining belongs in the
          sheet the Export button hands you, which is a thing you can
          read at your own speed, not on the screen in the way of it. */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <h2 className="section-title" style={{ margin: 0, flex: '1 1 auto' }}>Set up from one sheet</h2>
          <a href="/project/hierarchy/export" className="btn btn-secondary btn-sm">Export</a>
          <form action={importHierarchy} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="file" name="file" accept=".xlsx" required className="input" style={{ maxWidth: 230 }} />
            <button type="submit" className="btn btn-primary btn-sm">Import</button>
          </form>
        </div>
        <p className="text-secondary" style={{ fontSize: 13, margin: 0 }}>
          One spreadsheet builds the whole job: <strong>Asset</strong> · <strong>System</strong> ·{' '}
          <strong>Subsystem</strong> · <strong>Equipment Type</strong> · <strong>Tag</strong>. Export first — an
          empty project comes back with example rows to type over, so there is no format to guess at. Importing
          the same sheet twice changes nothing.
        </p>
      </div>

      {/* The plan first. Somebody opening Project Details wants to know
          where the job stands before they want to edit its name. */}
      <div className="panel-head" style={{ marginTop: 0 }}>
        <div className="panel-head-row">
          <h2 className="section-title" style={{ margin: 0 }}>
            The plan
          </h2>
          <div className="panel-head-links">
            <Link href="/milestones" className="link">
              Milestones &amp; Timeline →
            </Link>
            <Link href="/gates" className="link">
              Gates →
            </Link>
            <Link href="/plan" className="link">
              Plan &amp; Progress →
            </Link>
            <Link href="/project/configuration" className="link">
              Configuration →
            </Link>
          </div>
        </div>
        <p className="panel-head-means">
          Every dated commitment on the project: milestones as diamonds, gates as flags, today as the dashed line
          through both. Anything without a date is listed underneath rather than placed at a guess.
        </p>
      </div>
      {/* No wrapper. The sideways scroll for narrow screens now lives
          inside the component, where the thing that needs to scroll is. */}
      <TimelineChart timeline={timeline} />

      <div className="card" style={{ marginTop: 20 }}>
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
          {equipmentCount} equipment tag{equipmentCount === 1 ? '' : 's'}. Everything in CxNivora — checks,
          documents, punch list items and milestones — belongs to this project.
        </p>
      </div>

      <div style={{ marginTop: 16 }}>
        <DatabaseAccess projectExists />
      </div>
    </>
  )
}
