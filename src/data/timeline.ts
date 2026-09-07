import { supabase } from '@/lib/supabase'
import { buildTimeline, type Timeline, type TimelineInput } from '@/lib/timeline'
import { isOverdue } from '@/lib/milestones'

/**
 * The milestones and gates of a project, as one timeline.
 *
 * Two queries and no readiness computation. The gates screen works out
 * whether each gate's evidence stands up, which is expensive and is not
 * what a timeline is asking: this wants the DATE and whether the gate has
 * been signed, and `status` on the row already answers the second.
 *
 * Doing it that way keeps this cheap enough to sit on the project page.
 */
export async function loadTimeline(projectId: string | null, today: string): Promise<Timeline> {
  if (!projectId) return buildTimeline([], today)

  const [milestoneRes, gateRes] = await Promise.all([
    supabase
      .from('milestones')
      .select('id, name, target_date, status')
      .eq('project_id', projectId),
    supabase
      .from('gates')
      .select('id, name, planned_for, status')
      .eq('project_id', projectId)
      .order('sequence', { ascending: true }),
  ])

  const items: TimelineInput[] = []

  for (const m of (milestoneRes.data ?? []) as {
    id: string
    name: string
    target_date: string | null
    status: string | null
  }[]) {
    const done = m.status === 'complete' || m.status === 'completed' || m.status === 'done'
    items.push({
      kind: 'milestone',
      id: m.id,
      label: m.name,
      date: m.target_date,
      // isOverdue is the milestone screen's own rule. Using it here rather
      // than a second copy means the chart and the list can never disagree
      // about whether something is late.
      // isOverdue takes a status string; a row with no status recorded is
      // not complete, so an empty string is the honest thing to pass.
      state: done ? 'done' : isOverdue(m.target_date, m.status ?? '') ? 'blocked' : 'open',
      href: '/milestones',
      note: m.status ?? undefined,
    })
  }

  // A gates table that does not exist yet is an empty list, not an error
  // page. Same rule as everywhere else: a missing feature must not take a
  // working screen down with it.
  for (const g of (gateRes.data ?? []) as {
    id: string
    name: string
    planned_for: string | null
    status: string | null
  }[]) {
    const passed = g.status === 'passed' || g.status === 'signed' || g.status === 'closed'
    items.push({
      kind: 'gate',
      id: g.id,
      label: g.name,
      date: g.planned_for,
      state: passed ? 'done' : 'open',
      href: `/gates/${g.id}`,
      note: g.status ?? undefined,
    })
  }

  return buildTimeline(items, today)
}
