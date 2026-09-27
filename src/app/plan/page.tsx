import { requirePage } from '@/data/require-page'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { LEVELS } from '@/lib/checklist'
import { levelRuleStyle } from '@/lib/levels'
import { LevelBadge } from '@/components/LevelBadge'
import { MILESTONE_STATUSES, milestoneBadgeClass, isOverdue } from '@/lib/milestones'
import { forecast, forecastLine } from '@/lib/forecast'

export const dynamic = 'force-dynamic'

export default async function PlanPage() {
  // See src/data/require-page.tsx: the layout does not stop this page
  // running, nor its output being sent. This is the door.
  const refused = await requirePage()
  if (refused) return refused

  const project = await getCurrentProject()

  const { data: items } =
    project
      ? await supabase.from('checklist_items').select('id, level, status, updated_at').eq('project_id', project.id)
      : { data: [] }

  const itemIds = (items ?? []).map((it) => it.id)
  const { data: attachments } =
    itemIds.length > 0
      ? await supabase.from('attachments').select('checklist_item_id').in('checklist_item_id', itemIds)
      : { data: [] as { checklist_item_id: string }[] }

  const itemIdsWithEvidence = new Set((attachments ?? []).map((a) => a.checklist_item_id))

  const rows = LEVELS.map((level) => {
    const levelItems = (items ?? []).filter((it) => it.level === level.value)
    const total = levelItems.length
    const pass = levelItems.filter((it) => it.status === 'pass').length
    const fail = levelItems.filter((it) => it.status === 'fail').length
    const na = levelItems.filter((it) => it.status === 'na').length
    const pending = levelItems.filter((it) => it.status === 'pending').length
    const withEvidence = levelItems.filter((it) => itemIdsWithEvidence.has(it.id)).length
    const percent = total > 0 ? Math.round((pass / total) * 100) : 0
    const evidencePercent = total > 0 ? Math.round((withEvidence / total) * 100) : 0
    const blocked = fail > 0

    // ── When is this level actually going to be finished? ──────────
    //
    // Not from anybody's opinion: from the dates on the checks that have
    // already been signed. See src/lib/forecast.ts for the three things it
    // refuses to guess — a rate of zero, a bulk import, and a couple of
    // checks that are not a trend.
    //
    // `updated_at` is when the row was last written, not when the check
    // was passed. There is no passed_at column. For a check filled in once
    // and left alone — most of them — they are the same date; for one
    // corrected later they are not. That is said on the screen rather than
    // hidden here, because a forecast whose basis is not stated is a
    // forecast somebody will quote at a client.
    const done = levelItems.filter((it) => it.status === 'pass' || it.status === 'na')
    const view = forecast({
      total,
      done: done.length,
      completions: done
        .map((it) => ({ at: new Date(it.updated_at as string) }))
        .filter((c) => !Number.isNaN(c.at.getTime())),
      windowDays: 14,
      now: new Date(),
    })

    return { ...level, total, pass, fail, na, pending, withEvidence, evidencePercent, percent, blocked, view }
  })

  const rollupBadgeClass = (r: (typeof rows)[number]) =>
    r.blocked
      ? 'badge badge-danger'
      : r.total === 0
        ? 'badge badge-neutral'
        : r.percent === 100
          ? 'badge badge-success'
          : 'badge badge-warning'

  const rollupLabel = (r: (typeof rows)[number]) =>
    r.blocked ? 'Blocked' : r.total === 0 ? 'Not started' : r.percent === 100 ? 'Complete' : 'In progress'

  const { data: milestonesRaw } = project
    ? await supabase
        .from('milestones')
        .select('id, name, target_date, status')
        .eq('project_id', project.id)
        .neq('status', 'complete')
        .order('target_date', { ascending: true, nullsFirst: false })
        .limit(5)
    : { data: [] }

  const milestones = milestonesRaw ?? []

  return (
    <>
      <h1 className="page-title">Project Plan &amp; Rollup</h1>
        <p className="page-subtitle">
          Project: {project ? project.name : 'No project found — run the Week 2 SQL step first.'}
        </p>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Level</th>
                <th>Total</th>
                <th>Pass</th>
                <th>Fail</th>
                <th>Pending</th>
                <th>N/A</th>
                <th>Evidence</th>
                <th>% Complete</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.value} style={levelRuleStyle(r.value)}>
                  <td style={{ fontWeight: 600 }}>
                    <LevelBadge level={r.value} format="full" />
                  </td>
                  <td>{r.total}</td>
                  <td>{r.pass}</td>
                  <td>{r.fail}</td>
                  <td>{r.pending}</td>
                  <td>{r.na}</td>
                  <td>
                    {r.total > 0 ? `${r.withEvidence}/${r.total} (${r.evidencePercent}%)` : '—'}
                  </td>
                  <td>{r.percent}%</td>
                  <td>
                    <span className={rollupBadgeClass(r)}>{rollupLabel(r)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-secondary" style={{ marginTop: 20, fontSize: 13, marginBottom: 32 }}>
          &quot;Blocked&quot; means at least one item at that level is marked Fail — resolve it (see the item&apos;s Check
          note) before that level can be considered ready. &quot;Evidence&quot; is how many items at that level have at
          least one attached document.
        </p>

        <h2 className="section-title">At the rate it is actually going</h2>
        <div className="table-wrap" style={{ marginBottom: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Level</th>
                <th>Left</th>
                <th>Rate</th>
                <th>Finishes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`f-${r.value}`}>
                  <td><LevelBadge level={r.value} format="full" /></td>
                  <td className="mono">{r.view.state === 'ok' ? r.view.remaining : '—'}</td>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{forecastLine(r.view)}</td>
                  <td className="mono">
                    {r.view.state === 'ok'
                      ? r.view.finishes.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-secondary" style={{ marginTop: 0, fontSize: 13, marginBottom: 32 }}>
          Counted from the last 14 days, over calendar days rather than working days. The date a check was last
          written is used, because there is no column recording when it was passed — for a check filled in once and
          left alone those are the same day, and for one corrected afterwards they are not. A dash means there is no
          rate honest enough to extrapolate from, and the reason is in the Rate column.
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <h2 className="section-title" style={{ marginBottom: 0 }}>
            Upcoming milestones
          </h2>
          <Link href="/milestones" className="link" style={{ fontSize: 13 }}>
            View all &rarr;
          </Link>
        </div>

        {milestones.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Milestone</th>
                  <th>Target date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {milestones.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td>
                      {m.target_date ?? '—'}
                      {isOverdue(m.target_date, m.status) && (
                        <span className="badge badge-danger" style={{ marginLeft: 8 }}>
                          Overdue
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={milestoneBadgeClass(m.status)}>
                        {MILESTONE_STATUSES.find((s) => s.value === m.status)?.label ?? m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-secondary" style={{ fontSize: 13 }}>
            No open milestones —{' '}
            <Link href="/milestones" className="link">
              add one
            </Link>
            .
          </p>
      )}
    </>
  )
}
