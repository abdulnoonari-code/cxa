import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { LEVELS } from '@/lib/checklist'
import { MILESTONE_STATUSES, milestoneBadgeClass, isOverdue } from '@/lib/milestones'

export const dynamic = 'force-dynamic'

export default async function PlanPage() {
  const project = await getCurrentProject()

  const { data: equipmentRows } = project
    ? await supabase.from('equipment').select('id').eq('project_id', project.id)
    : { data: [] }

  const equipmentIds = (equipmentRows ?? []).map((e) => e.id)

  const { data: items } =
    equipmentIds.length > 0
      ? await supabase.from('checklist_items').select('id, level, status').in('equipment_id', equipmentIds)
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

    return { ...level, total, pass, fail, na, pending, withEvidence, evidencePercent, percent, blocked }
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
                <tr key={r.value}>
                  <td style={{ fontWeight: 600 }}>{r.label}</td>
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
