import { requirePage } from '@/data/require-page'
import Link from 'next/link'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { loadProjectRollup, rollupFor } from '@/data/rollup'
import { childrenOf, partitionProjectChildren, subjectLabel, subjectBadgeClass, refKey, type Subject } from '@/lib/subjects'
import { SubjectMeter, VerdictBadge } from '@/components/SubjectMeter'

export const dynamic = 'force-dynamic'

// Above this many tags the tree shows structure only, and equipment is reached
// by opening a system. Below it, every tag is listed.
const LEAF_LIMIT = 250

export default async function AssetsPage() {
  // See src/data/require-page.tsx: the layout does not stop this page
  // running, nor its output being sent. This is the door.
  const refused = await requirePage()
  if (refused) return refused

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
  // ── Structure first, unplaced tags after ──────────────────────────
  //
  // A tag with no system used to be hung off the project, which put it at
  // the top level as a sibling of the substations. Five rows at one indent,
  // assets and equipment interleaved, nothing saying which was which.
  //
  // They are separated now. Nothing is hidden — the unplaced tags get their
  // own list under the tree, with a heading that says what they are.
  const { structure, unplaced } = partitionProjectChildren(
    root ? childrenOf(index, { type: 'project', id: root.id }) : [],
  )
  for (const child of structure) walk(child, 0)

  // Capped, because a register imported before systems existed can be the
  // whole project. The count above the list is always the true one.
  const UNPLACED_SHOWN = 100
  const unplacedShown = unplaced.slice(0, UNPLACED_SHOWN)

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
    blocked: [...rows.map((r) => r.subject), ...unplaced].filter(
      (s) => rollupFor(rollup, { type: s.type, id: s.id }).readiness.blockers.length > 0,
    ).length,
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
        {unplaced.length > 0 && (
          <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-warning)' }}>
            <div className="stat-label">Not placed</div>
            <div className="stat-value">{unplaced.length}</div>
            <div className="stat-note">Tags with no system above them</div>
          </div>
        )}
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
                    <td style={{ paddingLeft: 12 + depth * 24 }}>
                      {/* The indent alone is easy to lose across a wide
                          row, so each level below the top also carries a
                          rule down its left edge. */}
                      {depth > 0 && (
                        <span
                          aria-hidden="true"
                          style={{
                            display: 'inline-block',
                            width: 10,
                            marginLeft: -12,
                            marginRight: 4,
                            borderTop: '1px solid var(--color-border)',
                            verticalAlign: 'middle',
                          }}
                        />
                      )}
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

      {/* ── TAGS WITH NO PLACE IN THE TREE ────────────────────────────
          These used to be drawn at the top level, in among the
          substations, at the same indent, with nothing saying they were
          not top-level things. Now they are here, under their own
          heading, with the reason and the fix. */}
      {unplaced.length > 0 && (
        <div className="card" style={{ marginTop: 22, borderColor: 'var(--color-warning-border, var(--color-border))' }}>
          <h2 className="section-title" style={{ marginTop: 0, marginBottom: 6 }}>
            Not placed yet — {unplaced.length} tag{unplaced.length === 1 ? '' : 's'}
          </h2>
          <p className="text-secondary" style={{ fontSize: 13, margin: '0 0 14px', maxWidth: 680 }}>
            These tags have no system above them, so they do not sit anywhere in the tree. They are not lost and
            nothing about them has changed — they simply have no place yet. Give each one a System in the asset
            list and they move into the tree where they belong.{' '}
            <Link href="/project/configuration" className="link">
              Set up the project →
            </Link>
          </p>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ minWidth: 300 }}>Tag</th>
                  <th>State</th>
                  <th style={{ minWidth: 180 }}>Readiness</th>
                </tr>
              </thead>
              <tbody>
                {unplacedShown.map((subject) => {
                  const r = rollupFor(rollup, { type: subject.type, id: subject.id })
                  return (
                    <tr key={`${subject.type}:${subject.id}`}>
                      <td>
                        <Link href={`/assets/${subject.type}/${subject.id}`} className="link" style={{ fontSize: 13.5, fontWeight: 500 }}>
                          {subject.code && <span className="mono">{subject.code}</span>}
                          {subject.code && subject.name !== subject.code ? ' — ' : ''}
                          {subject.name !== subject.code ? subject.name : ''}
                        </Link>
                        <div>
                          <span className={subjectBadgeClass(subject.type)} style={{ fontSize: 10 }}>
                            {subjectLabel(subject.type)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <VerdictBadge readiness={r.readiness} />
                      </td>
                      <td>
                        <SubjectMeter readiness={r.readiness} width={160} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {unplaced.length > unplacedShown.length && (
            <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
              Showing the first {unplacedShown.length}. There are{' '}
              <strong>{unplaced.length - unplacedShown.length} more</strong> — they are all on{' '}
              <Link href="/equipment" className="link">Equipment &amp; Tags</Link>, where the
              &ldquo;Where it sits&rdquo; column says &ldquo;Not placed&rdquo; for each one.
            </p>
          )}
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
