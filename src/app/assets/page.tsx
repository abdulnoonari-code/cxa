import Link from 'next/link'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { loadProjectRollup, rollupFor } from '@/data/rollup'
import { childrenOf, subjectLabel, subjectBadgeClass, refKey, type Subject } from '@/lib/subjects'
import { SubjectMeter, VerdictBadge } from '@/components/SubjectMeter'

export const dynamic = 'force-dynamic'

// Above this many tags the tree shows structure only, and equipment is reached
// by opening a system. Below it, every tag is listed.
const LEAF_LIMIT = 250

export default async function AssetsPage() {
  const project = await getCurrentProject()
  const index = await loadSubjectIndex(project?.id ?? null)
  const rollup = await loadProjectRollup(project?.id ?? null, index)

  const root = index.root
  const overall = rollupFor(rollup, root ? { type: 'project', id: root.id } : null)

  // Flatten the tree depth-first so it renders as one scannable table rather
  // than nested boxes — an engineer comparing forty systems needs rows.
  //
  // But a real substation carries thousands of tags, and rendering every one
  // of them here makes the page unusable for the thing it is actually for,
  // which is comparing systems. Past a threshold, the tree stops at the
  // structure and each branch reports how many tags sit under it; you open a
  // system to see its equipment. Small projects still show everything.
  const equipmentCount = [...index.byKey.values()].filter((s) => s.type === 'equipment').length
  const showLeaves = equipmentCount <= LEAF_LIMIT
  const isLeaf = (t: string) => t === 'equipment' || t === 'component'

  type Row = { subject: Subject; depth: number }
  const rows: Row[] = []
  const walk = (subject: Subject, depth: number) => {
    if (!showLeaves && isLeaf(subject.type)) return
    rows.push({ subject, depth })
    for (const child of childrenOf(index, { type: subject.type, id: subject.id })) {
      walk(child, depth + 1)
    }
  }
  if (root) {
    for (const child of childrenOf(index, { type: 'project', id: root.id })) walk(child, 0)
  }

  // How many tags hang under each row, so a collapsed branch still says how
  // much is in it. Counted bottom-up in one pass rather than by re-walking the
  // subtree per row, which on two thousand tags is the difference between a
  // page and a stall.
  const tagCount = new Map<string, number>()
  const countTags = (subject: Subject): number => {
    const key = refKey(subject)
    const cached = tagCount.get(key)
    if (cached !== undefined) return cached
    let n = subject.type === 'equipment' ? 1 : 0
    for (const child of childrenOf(index, { type: subject.type, id: subject.id })) n += countTags(child)
    tagCount.set(key, n)
    return n
  }
  if (root) countTags(root)
  const tagsUnder = (subject: Subject): number => tagCount.get(refKey(subject)) ?? 0

  const counts = {
    systems: [...index.byKey.values()].filter((s) => s.type === 'system').length,
    equipment: [...index.byKey.values()].filter((s) => s.type === 'equipment').length,
    blocked: rows.filter((r) => rollupFor(rollup, { type: r.subject.type, id: r.subject.id }).readiness.blockers.length > 0)
      .length,
  }

  return (
    <>
      <h1 className="page-title">Assets</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — the whole project from the top down. Every level carries
        its own state, worked out from the records beneath it. Click any row to open it.
      </p>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Project readiness</div>
          <div className="stat-value">{overall.readiness.percent}%</div>
          <div className="stat-note">
            {overall.readiness.requirementsMet} of {overall.readiness.requirementsTotal} requirements met
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Systems</div>
          <div className="stat-value">{counts.systems}</div>
          <div className="stat-note">{counts.equipment} tagged items beneath them</div>
        </div>
        <div className="stat">
          <div className="stat-label">Blocked</div>
          <div className="stat-value" style={{ color: counts.blocked > 0 ? 'var(--color-danger)' : undefined }}>
            {counts.blocked}
          </div>
          <div className="stat-note">Levels with at least one blocker</div>
        </div>
        <div className="stat">
          <div className="stat-label">Requirements proven</div>
          <div className="stat-value">
            {overall.requirementsVerified}
            <span className="text-secondary" style={{ fontSize: 16 }}>
              /{overall.requirements.length}
            </span>
          </div>
          <div className="stat-note">Verified and approved</div>
        </div>
      </div>

      {root && (
        <Link
          href={`/assets/project/${root.id}`}
          className="card"
          style={{ display: 'block', marginTop: 20, textDecoration: 'none', color: 'inherit' }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div>
              <div className="text-secondary mono" style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase' }}>
                Project
              </div>
              <div style={{ fontWeight: 600, fontSize: 18, marginTop: 3 }}>{root.name}</div>
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <VerdictBadge readiness={overall.readiness} />
              <SubjectMeter readiness={overall.readiness} width={160} />
            </div>
          </div>
          {overall.readiness.blockers.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 13.5, color: 'var(--color-danger)' }}>
              {overall.readiness.blockers.length} blocker
              {overall.readiness.blockers.length === 1 ? '' : 's'} across the project — open it to see each one.
            </div>
          )}
        </Link>
      )}

      {rows.length === 0 ? (
        <div className="card" style={{ marginTop: 20 }}>
          <p className="text-secondary" style={{ marginBottom: 0, fontSize: 14 }}>
            Nothing beneath the project yet. Add areas and systems on the{' '}
            <Link href="/systems" className="link">
              Systems
            </Link>{' '}
            page, and equipment on{' '}
            <Link href="/equipment" className="link">
              Equipment &amp; Tags
            </Link>
            . Everything you add appears here in its place.
          </p>
        </div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 20 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ minWidth: 300 }}>Asset</th>
                <th>State</th>
                <th style={{ minWidth: 180 }}>Readiness</th>
                <th style={{ textAlign: 'right' }}>Checks</th>
                <th style={{ textAlign: 'right' }}>Tests</th>
                <th style={{ textAlign: 'right' }}>Open issues</th>
                <th style={{ textAlign: 'right' }}>Held</th>
                <th style={{ textAlign: 'right' }}>Reqs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ subject, depth }) => {
                const r = rollupFor(rollup, { type: subject.type, id: subject.id })
                return (
                  <tr key={`${subject.type}:${subject.id}`}>
                    <td style={{ paddingLeft: 12 + depth * 22 }}>
                      <Link
                        href={`/assets/${subject.type}/${subject.id}`}
                        className="link"
                        style={{ fontWeight: depth === 0 ? 600 : 500, fontSize: 13.5 }}
                      >
                        {subject.code && <span className="mono">{subject.code}</span>}
                        {subject.code && subject.name !== subject.code ? ' — ' : ''}
                        {subject.name !== subject.code ? subject.name : ''}
                      </Link>
                      <div>
                        <span className={subjectBadgeClass(subject.type)} style={{ fontSize: 10 }}>
                          {subjectLabel(subject.type)}
                        </span>
                        {!showLeaves && tagsUnder(subject) > 0 && (
                          <span className="text-secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                            {tagsUnder(subject)} tag{tagsUnder(subject) === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <VerdictBadge readiness={r.readiness} />
                    </td>
                    <td>
                      <SubjectMeter readiness={r.readiness} width={110} />
                    </td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 12.5 }}>
                      {r.checks.length || '—'}
                    </td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 12.5 }}>
                      {r.tests.length || '—'}
                    </td>
                    <td
                      className="mono"
                      style={{
                        textAlign: 'right',
                        fontSize: 12.5,
                        color: r.categoryA > 0 ? 'var(--color-danger)' : undefined,
                        fontWeight: r.categoryA > 0 ? 600 : 400,
                      }}
                    >
                      {r.openIssues || '—'}
                      {r.categoryA > 0 && <span style={{ fontSize: 10 }}> ({r.categoryA}A)</span>}
                    </td>
                    <td
                      className="mono"
                      style={{
                        textAlign: 'right',
                        fontSize: 12.5,
                        color: r.heldPoints > 0 ? 'var(--color-danger)' : undefined,
                        fontWeight: r.heldPoints > 0 ? 600 : 400,
                      }}
                    >
                      {r.heldPoints || '—'}
                    </td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 12.5 }}>
                      {r.requirements.length > 0 ? `${r.requirementsVerified}/${r.requirements.length}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!showLeaves && (
        <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 14 }}>
          This project has <strong>{equipmentCount} tags</strong>, so the tree shows the structure and how many tags
          sit under each branch. Open a system to see its equipment. Every number still counts every tag beneath it.
        </p>
      )}

      <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 14 }}>
        Every number on this page is worked out from the records at the moment you loaded it — nothing here is
        stored, so a level can never show as ready while something beneath it has failed.
      </p>
    </>
  )
}
