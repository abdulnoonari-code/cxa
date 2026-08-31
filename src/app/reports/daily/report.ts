// The daily report as a document.
//
// This is the one that goes to the client every evening, so PDF matters more
// here than anywhere else: a daily report is a contractual submission, and a
// contractual submission that arrives as a spreadsheet reads as a draft.

import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { loadProjectRollup, rollupFor } from '@/data/rollup'
import {
  buildDailyReport,
  today,
  shiftDay,
  longDate,
  timeOf,
  emptyDayNote,
  sectionLabel,
  type AuditEvent,
} from '@/lib/daily-report'
import type { Report } from '@/lib/docgen'

export type BuiltDaily = { project: { id: string; name: string }; day: string; report: Report }

export async function buildDailyDocument(url: string): Promise<BuiltDaily | null> {
  const project = await getCurrentProject()
  if (!project) return null

  const raw = new URL(url).searchParams.get('day')
  const day = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today()

  const { data: auditRows } = await supabase
    .from('audit_log')
    .select(
      'id, actor_name, actor_email, actor_role, action, entity, entity_id, entity_label, old_value, new_value, comment, created_at'
    )
    .eq('project_id', project.id)
    .gte('created_at', `${shiftDay(day, -1)}T00:00:00`)
    .lte('created_at', `${shiftDay(day, 1)}T23:59:59`)
    .order('created_at', { ascending: true })

  const daily = buildDailyReport((auditRows ?? []) as AuditEvent[], day)

  const index = await loadSubjectIndex(project.id)
  const rollup = await loadProjectRollup(project.id, index)
  const overall = rollupFor(rollup, index.root ? { type: 'project', id: index.root.id } : null)

  const sections = daily.sections.filter((s) => s.events.length > 0)

  const report: Report = {
    title: 'Daily Commissioning Report',
    subtitle: longDate(day),
    project: project.name,
    // A day with nothing on it must say what that means, or the reader fills
    // in the blank themselves and usually fills it in wrong.
    standfirst:
      daily.total === 0
        ? emptyDayNote(day)
        : `${daily.total} entries recorded by ${daily.people.length} ${
            daily.people.length === 1 ? 'person' : 'people'
          }.`,
    figures: [
      { label: 'Entries today', value: daily.total, note: 'Recorded in CxSentinel' },
      { label: 'People', value: daily.people.length, note: 'Who recorded something' },
      { label: 'Project readiness', value: `${overall.readiness.percent}%`, note: 'Worked out live' },
      { label: 'Open issues', value: overall.openIssues, note: `${overall.categoryA} Category A` },
    ],
    tables: [
      ...(daily.people.length > 0
        ? [
            {
              title: 'Who did what',
              columns: ['Person', 'Role', 'Entries'],
              widths: [4, 4, 1.4],
              rows: daily.people.map((p) => [p.name, p.role ?? '', p.entries]),
            },
          ]
        : []),
      ...sections.map((section) => ({
        title: sectionLabel(section.key),
        columns: ['Time', 'Who', 'What happened', 'On what'],
        widths: [1, 2.2, 4.6, 4.2],
        rows: section.events.map((e) => [
          timeOf(e.created_at),
          e.actor_name ?? e.actor_email ?? '',
          e.action,
          [e.entity_label, e.new_value ? `→ ${e.new_value}` : '', e.comment].filter(Boolean).join(' · '),
        ]),
      })),
    ],
    footnotes: [
      'This report is built from what was entered into CxSentinel on the day. It records what was written down, not everything that happened on site — an activity carried out and not entered does not appear here.',
      'The readiness figure is worked out at the moment this document was generated and is never stored. It authorises nothing.',
    ],
  }

  return { project, day, report }
}
