import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { loadProjectRollup } from '@/data/rollup'
import { LEVELS, STATUSES, statusBadgeClass, reviewLabel, reviewBadgeClass } from '@/lib/checklist'
import { inspectionCode, inspectionLabel, inspectionBadgeClass, carriesRelease, releaseLabel, releaseBadgeClass } from '@/lib/inspection'
import { levelMeaning, levelBefore, levelAfter, levelRuleStyle, levelCode, levelName, levelTone } from '@/lib/levels'
import { LevelBadge } from '@/components/LevelBadge'

export const dynamic = 'force-dynamic'

/**
 * One commissioning level, across the whole project.
 *
 * There used to be two of these — Functional Tests (L4) and Integrated
 * Functional Tests (L5) — as separate hand-written pages, and the other three
 * levels had no screen at all. They are the same thing five times, so this is
 * one route.
 *
 * It is also built on the roll-up rather than on `equipment`, which fixes a
 * real hole: the old pages queried checklist items by `equipment_id` only, so
 * an item raised against a SYSTEM or a subsystem — which the subject spine has
 * allowed since Update 20 — simply did not appear on them. A check that exists
 * and is invisible is worse than one that does not exist.
 */
export default async function LevelPage({
  params,
  searchParams,
}: {
  params: Promise<{ level: string }>
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  const { level: slug } = await params
  const sp = await searchParams

  // The URL carries the short code — /checklists/l3 — because nobody types
  // "L3_prefunctional", and a link somebody pastes into an email should be
  // readable.
  const level = LEVELS.find(
    (l) => l.value.toLowerCase() === slug.toLowerCase() || levelCode(l.value).toLowerCase() === slug.toLowerCase()
  )
  if (!level) notFound()

  const project = await getCurrentProject()
  const index = await loadSubjectIndex(project?.id ?? null)
  const rollup = await loadProjectRollup(project?.id ?? null, index)

  const all = rollup.checks.filter((c) => c.level === level.value)

  const status = sp.status ?? ''
  const q = (sp.q ?? '').trim().toLowerCase()
  const items = all.filter((c) => {
    if (status && c.status !== status) return false
    if (q && !`${c.tag} ${c.item}`.toLowerCase().includes(q)) return false
    return true
  })

  // Evidence is the one thing the roll-up does not carry.
  const ids = all.map((c) => c.id)
  const { data: attachments } =
    ids.length > 0
      ? await supabase.from('attachments').select('checklist_item_id').in('checklist_item_id', ids)
      : { data: [] as { checklist_item_id: string }[] }
  const evidence = new Map<string, number>()
  for (const a of attachments ?? []) {
    evidence.set(a.checklist_item_id, (evidence.get(a.checklist_item_id) ?? 0) + 1)
  }

  const pass = all.filter((c) => c.status === 'pass').length
  const fail = all.filter((c) => c.status === 'fail').length
  const na = all.filter((c) => c.status === 'na').length
  const pending = all.filter((c) => c.status === 'pending').length
  const resolved = pass + na
  const percent = all.length > 0 ? Math.round((resolved / all.length) * 100) : 0
  const withEvidence = all.filter((c) => (evidence.get(c.id) ?? 0) > 0).length
  const points = all.filter((c) => carriesRelease(c.inspection_type))

  const meaning = levelMeaning(level.value)
  const before = levelBefore(level.value)
  const after = levelAfter(level.value)
  const tone = levelTone(level.value)

  // Grouped by tag, because that is how somebody walks a site: one piece of
  // equipment at a time, not one check type at a time.
  const byTag = new Map<string, typeof items>()
  for (const c of items) {
    const list = byTag.get(c.tag)
    if (list) list.push(c)
    else byTag.set(c.tag, [c])
  }
  const groups = [...byTag.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <>
      <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
        <LevelBadge level={level.value} format="code" style={{ fontSize: 13, padding: '4px 10px' }} />
        {levelName(level.value)}
      </h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — every check at this level, across every tag and system.
      </p>

      {/* ── What this level is for ──────────────────────────────────────── */}
      {meaning && (
        <div className="card" style={levelRuleStyle(level.value)}>
          <p style={{ margin: 0, fontSize: 14 }}>
            <strong>What it proves.</strong> {meaning.proves}
          </p>
          <p className="text-secondary" style={{ margin: '8px 0 0', fontSize: 13 }}>
            <strong>Before it starts.</strong> {meaning.before}
            {before && (
              <>
                {' '}
                <Link href={`/checklists/${levelCode(before).toLowerCase()}`} className="link">
                  Go to {levelCode(before)}
                </Link>
                .
              </>
            )}
          </p>
          <p className="text-secondary" style={{ margin: '6px 0 0', fontSize: 13 }}>
            <strong>What it blocks.</strong> {meaning.blocks}
            {after && (
              <>
                {' '}
                <Link href={`/checklists/${levelCode(after).toLowerCase()}`} className="link">
                  Go to {levelCode(after)}
                </Link>
                .
              </>
            )}
          </p>
        </div>
      )}

      {/* ── The five levels, always reachable ───────────────────────────── */}
      <div className="card" style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="text-secondary" style={{ fontSize: 12.5, marginRight: 4 }}>
          Level
        </span>
        {LEVELS.map((l) => {
          const here = l.value === level.value
          const count = rollup.checks.filter((c) => c.level === l.value).length
          return (
            <Link
              key={l.value}
              href={`/checklists/${levelCode(l.value).toLowerCase()}`}
              className={`btn btn-sm ${here ? 'btn-primary' : 'btn-secondary'}`}
              title={l.label}
            >
              <LevelBadge level={l.value} format="code" dot={!here} style={{ fontSize: 9.5, marginRight: 5 }} />
              {levelName(l.value)}
              <span className="mono" style={{ marginLeft: 6, opacity: 0.7, fontSize: 11 }}>
                {count}
              </span>
            </Link>
          )
        })}
        <Link href="/checklists" className="btn btn-secondary btn-sm">
          All levels
        </Link>
      </div>

      <div className="stat-grid" style={{ marginTop: 18 }}>
        <div className="stat" style={levelRuleStyle(level.value)}>
          <div className="stat-label">Checks at this level</div>
          <div className="stat-value" style={{ color: tone.solid }}>
            {all.length}
          </div>
          <div className="stat-note">{groups.length} tag{groups.length === 1 ? '' : 's'} shown</div>
        </div>
        <div className="stat">
          <div className="stat-label">Resolved</div>
          <div className="stat-value">{percent}%</div>
          <div className="stat-note">
            {pass} pass · {na} N/A · {pending} pending
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Failed</div>
          <div className="stat-value" style={{ color: fail > 0 ? 'var(--color-danger)' : undefined }}>
            {fail}
          </div>
          <div className="stat-note">Recorded Fail and not re-done</div>
        </div>
        <div className="stat">
          <div className="stat-label">With evidence</div>
          <div className="stat-value">
            {withEvidence}
            <span className="text-secondary" style={{ fontSize: 15 }}>
              /{all.length}
            </span>
          </div>
          {/* A pass with no evidence is somebody's word for it. Worth counting
              separately from the pass rate, because the pass rate hides it. */}
          <div className="stat-note">{points.length} hold or witness point{points.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <form className="card" style={{ marginTop: 14, display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          name="q"
          defaultValue={sp.q ?? ''}
          placeholder="Search the tag or the check"
          className="input"
          style={{ maxWidth: 320, fontSize: 13 }}
        />
        <select name="status" defaultValue={status} className="input" style={{ maxWidth: 180, fontSize: 13 }}>
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-secondary btn-sm">
          Filter
        </button>
        {(status || q) && (
          <Link href={`/checklists/${levelCode(level.value).toLowerCase()}`} className="btn btn-secondary btn-sm">
            Clear
          </Link>
        )}
        <span className="text-secondary" style={{ fontSize: 12 }}>
          Showing {items.length} of {all.length}
        </span>
      </form>

      {all.length === 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <p className="text-secondary" style={{ fontSize: 14, marginBottom: 0 }}>
            Nothing recorded at {levelCode(level.value)} yet. Load a checklist on the{' '}
            <Link href="/checklists" className="link">
              Checklists
            </Link>{' '}
            page — the importer reads the level from your file, or you can pick one for the whole upload.
          </p>
        </div>
      )}

      {groups.map(([tag, list]) => {
        const tagFail = list.filter((c) => c.status === 'fail').length
        return (
          <div className="card" style={{ marginTop: 14 }} key={tag}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <span className="mono" style={{ fontWeight: 600, fontSize: 14.5 }}>
                {tag}
              </span>
              <span className="text-secondary" style={{ fontSize: 12 }}>
                {list.length} check{list.length === 1 ? '' : 's'}
              </span>
              {tagFail > 0 && <span className="badge badge-danger">{tagFail} failed</span>}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Check</th>
                    <th style={{ width: 90 }}>Result</th>
                    <th style={{ width: 130 }}>Point</th>
                    <th style={{ width: 130 }}>Release</th>
                    <th style={{ width: 110 }}>Review</th>
                    <th style={{ width: 90 }}>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => {
                    const files = evidence.get(c.id) ?? 0
                    const claimed = c.status === 'pass' && files === 0
                    return (
                      <tr key={c.id}>
                        <td style={{ fontSize: 13 }}>{c.item}</td>
                        <td>
                          <span className={statusBadgeClass(c.status)} style={{ fontSize: 10 }}>
                            {STATUSES.find((s) => s.value === c.status)?.label ?? c.status}
                          </span>
                        </td>
                        <td>
                          <span className={inspectionBadgeClass(c.inspection_type)} style={{ fontSize: 10 }}>
                            {inspectionCode(c.inspection_type)} — {inspectionLabel(c.inspection_type)}
                          </span>
                        </td>
                        <td>
                          {carriesRelease(c.inspection_type) ? (
                            <span className={releaseBadgeClass(c.release)} style={{ fontSize: 10 }}>
                              {releaseLabel(c.release)}
                            </span>
                          ) : (
                            <span className="text-secondary" style={{ fontSize: 12 }}>
                              —
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={reviewBadgeClass(c.review_state)} style={{ fontSize: 10 }}>
                            {reviewLabel(c.review_state)}
                          </span>
                        </td>
                        <td>
                          {files > 0 ? (
                            <span className="mono" style={{ fontSize: 12 }}>
                              {files} file{files === 1 ? '' : 's'}
                            </span>
                          ) : claimed ? (
                            // A pass with nothing behind it is somebody's word
                            // for it, and that is exactly what gets challenged
                            // at handover.
                            <span className="badge badge-warning" style={{ fontSize: 9.5 }} title="Marked Pass with no file attached">
                              No evidence
                            </span>
                          ) : (
                            <span className="text-secondary" style={{ fontSize: 12 }}>
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 18 }}>
        These are the same records as on the Checklists page, filtered to {levelCode(level.value)} and grouped by tag.
        Edit them there or on the asset itself — nothing on this screen is a second copy.
      </p>
    </>
  )
}
