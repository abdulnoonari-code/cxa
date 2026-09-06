import Link from 'next/link'
import { devicePercent, systemPercent, sumCells, HIERARCHY_NOTE, type HierarchyNode } from '@/lib/hierarchy'

// The project summary, by where the work sits.
//
// The dashboard had become a punch-list screen with charts on it. A punch
// list says what went wrong; it says nothing about how far through the job
// is or which branch of it is behind, and those are the two questions asked
// in every progress meeting before anybody mentions a defect.
//
// One row per site, area and system, indented like the tree. Read down the
// L1-L3 column and the branch that is behind is obvious; read down Blocking
// and the board that stops the next step names itself.

const TYPE_WORD: Record<string, string> = {
  site: 'Site',
  area: 'Area',
  system: 'System',
  subsystem: 'Subsystem',
}

/**
 * Where a row leads.
 *
 * The id is carried in the node key as `type:id`, which is how the subject
 * tree addresses everything — so the link is built from the same value the
 * roll-up used, not from a second lookup that could drift out of step with
 * it.
 */
function hrefFor(n: HierarchyNode): string {
  const [type, id] = n.key.split(':')
  return `/assets/${type}/${id}`
}

function Bar({ percent }: { percent: number | null }) {
  if (percent === null) {
    return (
      <span className="text-secondary" title="Nothing recorded at this level">
        —
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <span
        aria-hidden
        style={{
          flex: 1,
          minWidth: 48,
          height: 6,
          borderRadius: 999,
          background: 'var(--color-neutral-bg)',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            display: 'block',
            height: '100%',
            width: `${percent}%`,
            borderRadius: 999,
            background:
              percent >= 90
                ? 'var(--color-success-solid)'
                : percent >= 50
                  ? 'var(--color-warning-solid, #d97706)'
                  : 'var(--color-danger-solid)',
          }}
        />
      </span>
      <span className="mono" style={{ fontSize: 12, fontWeight: 600, minWidth: 34, textAlign: 'right' }}>
        {percent}%
      </span>
    </span>
  )
}

export default function ProjectSummary({ nodes }: { nodes: HierarchyNode[] }) {
  if (nodes.length === 0) {
    return (
      <section className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title">Project summary</h2>
        <p style={{ fontSize: 13, margin: 0 }}>
          Nothing is set up yet. Add a site, an area and a system under{' '}
          <Link href="/assets" className="link">
            Assets
          </Link>
          , then equipment under each system, and this fills in by itself.
        </p>
      </section>
    )
  }

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}
      >
        <h2 className="section-title" style={{ margin: 0 }}>
          Project summary
        </h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
          <a href="/dashboard/export?chart=hierarchy" className="link" style={{ fontSize: 11.5 }} download>
            Export CSV
          </a>
          <Link href="/assets" className="link" style={{ fontSize: 11.5 }}>
            Assets →
          </Link>
        </div>
      </div>
      <p className="text-secondary" style={{ margin: '2px 0 12px', fontSize: 12.5 }}>
        Every site, area and system on the project. Devices are counted, not listed — their detail is on the system.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 200 }}>Where</th>
              <th style={{ minWidth: 60 }}>Tags</th>
              <th style={{ minWidth: 150 }}>Device work · L1–L3</th>
              <th style={{ minWidth: 150 }}>System work · L4–L5</th>
              <th style={{ minWidth: 70 }}>Open</th>
              <th style={{ minWidth: 80 }}>Blocking</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((n) => {
              const dev = sumCells(n.deviceCells)
              const sys = sumCells(n.systemCells)
              return (
                <tr key={n.key}>
                  <td style={{ paddingLeft: 8 + n.depth * 18 }}>
                    {/* Every row goes somewhere. A summary that names the
                        branch holding the project up and then makes you go
                        and find it by hand has done half a job. */}
                    <Link href={hrefFor(n)} style={{ color: 'inherit', textDecoration: 'none' }}>
                      <span style={{ fontWeight: n.depth === 0 ? 700 : 600 }}>{n.code}</span>
                      {n.name && n.name !== n.code && <span className="text-secondary"> — {n.name}</span>}
                    </Link>
                    <div className="text-secondary" style={{ fontSize: 10.5, letterSpacing: '0.04em' }}>
                      {TYPE_WORD[n.type] ?? n.type}
                    </div>
                  </td>
                  <td className="mono">{n.devices}</td>
                  <td>
                    <Bar percent={devicePercent(n)} />
                    <div className="text-secondary" style={{ fontSize: 10.5 }}>
                      {dev.total === 0 ? 'nothing recorded' : `${dev.done} of ${dev.total}${dev.failed > 0 ? ` · ${dev.failed} failed` : ''}`}
                    </div>
                  </td>
                  <td>
                    <Bar percent={systemPercent(n)} />
                    <div className="text-secondary" style={{ fontSize: 10.5 }}>
                      {sys.total === 0 ? 'nothing recorded' : `${sys.done} of ${sys.total}${sys.failed > 0 ? ` · ${sys.failed} failed` : ''}`}
                    </div>
                  </td>
                  <td className="mono" style={{ color: n.punchOpen > 0 ? 'var(--color-danger)' : undefined }}>
                    {n.punchOpen}
                  </td>
                  <td
                    className="mono"
                    style={{ fontWeight: n.punchBlocking > 0 ? 700 : 400, color: n.punchBlocking > 0 ? 'var(--color-danger)' : undefined }}
                  >
                    {n.punchBlocking}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-secondary" style={{ margin: '10px 0 0', fontSize: 11.5, lineHeight: 1.55 }}>
        <strong>Blocking</strong> is Category A defects not closed — the ones that stop the next step. {HIERARCHY_NOTE}
      </p>
    </section>
  )
}
