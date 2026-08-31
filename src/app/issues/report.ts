// The punch list as a document, for issuing rather than editing.
//
// Same shape as the obligations report: read the screen's own filters off the
// URL, so what somebody is looking at is what lands in the file, and quote
// figures for what is in the document rather than for the whole project.

import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { loadAllPunch, type PunchRow } from '@/data/punchlist'
import { refKey } from '@/lib/subjects'
import { LEVELS } from '@/lib/checklist'
import { CATEGORIES } from '@/lib/issues'
import {
  CATEGORY_BLOCKS,
  summarise,
  verdict,
  daysOverdue,
  ageInDays,
  statusLabel,
  severityLabel,
  categoryLabel,
} from '@/lib/punchlist'
import type { Report } from '@/lib/docgen'

const SETTLED = new Set(['verified', 'closed'])

export type BuiltPunch = { project: { id: string; name: string }; rows: PunchRow[]; report: Report }

export async function buildPunchReport(url: string): Promise<BuiltPunch | null> {
  const project = await getCurrentProject()
  if (!project) return null

  const p = new URL(url).searchParams
  const filter = {
    status: p.get('status'),
    category: p.get('category'),
    severity: p.get('severity'),
    level: p.get('level'),
    party: p.get('party'),
    openOnly: p.get('open') === '1',
  }

  const [index, all] = await Promise.all([loadSubjectIndex(project.id), loadAllPunch(project.id)])

  const rows = all.filter((r) => {
    if (filter.status && r.status !== filter.status) return false
    if (filter.category === 'none' && r.category) return false
    if (filter.category && filter.category !== 'none' && r.category !== filter.category) return false
    if (filter.severity && r.severity !== filter.severity) return false
    if (filter.level && r.level !== filter.level) return false
    if (filter.party && r.responsible_party !== filter.party) return false
    if (filter.openOnly && SETTLED.has(r.status)) return false
    return true
  })

  const summary = summarise(rows)
  const reading = verdict(summary)

  const label = (r: PunchRow): string => {
    const subject =
      r.subject_type && r.subject_id
        ? index.byKey.get(refKey({ type: r.subject_type, id: r.subject_id }))
        : r.equipment_id
          ? index.byKey.get(refKey({ type: 'equipment', id: r.equipment_id }))
          : undefined
    return subject?.code ?? subject?.name ?? 'Unassigned'
  }

  const levelLabel = (v: string | null) => LEVELS.find((l) => l.value === v)?.label.split('—')[0].trim() ?? ''

  const narrowed: string[] = []
  if (filter.party) narrowed.push(`items the ${filter.party} is responsible for`)
  if (filter.category === 'none') narrowed.push('items with no category')
  else if (filter.category) narrowed.push(`Category ${filter.category}`)
  if (filter.level) narrowed.push(levelLabel(filter.level))
  if (filter.status) narrowed.push(`state “${statusLabel(filter.status)}”`)
  if (filter.openOnly) narrowed.push('open items only')

  const late = new Set<number>()
  rows.forEach((r, i) => {
    if (daysOverdue(r) !== null) late.add(i)
  })

  const report: Report = {
    title: 'Punch List',
    subtitle: narrowed.length > 0 ? `Filtered to ${narrowed.join(', ')}` : 'All punch items on record',
    project: project.name,
    standfirst: `${reading.label}. ${reading.detail}`,
    figures: [
      { label: 'In this list', value: rows.length, note: 'Items shown' },
      { label: 'Open', value: summary.open, note: 'Still outstanding' },
      { label: 'Category A open', value: summary.openA, note: 'Stops the system advancing' },
      { label: 'Overdue', value: summary.overdue, note: 'Past an agreed date' },
    ],
    tables: [
      {
        title: 'The list',
        columns: ['No', 'Against', 'What is wrong', 'Cat', 'State', 'Responsible', 'Due', 'Age'],
        widths: [1, 1.5, 6.2, 0.7, 1.3, 1.6, 1.1, 0.8],
        rows: rows.map((r) => [
          r.ref ?? '',
          label(r),
          r.description ? `${r.title} — ${r.description}` : r.title,
          r.category ?? '?',
          statusLabel(r.status),
          r.responsible_party ?? '',
          r.due_date ?? '',
          ageInDays(r) === null ? '' : `${ageInDays(r)}d`,
        ]),
        emphasise: late,
      },
      {
        title: 'What the categories mean',
        columns: ['Category', 'What it blocks'],
        widths: [2, 8],
        rows: CATEGORIES.map((c) => [categoryLabel(c.value), CATEGORY_BLOCKS[c.value]]),
      },
    ],
    footnotes: [
      'This is a record of what is outstanding, not a clearance. Whether a system may proceed is decided by its readiness gate, which reads these categories as rules.',
      'An item with no category is counted as blocking until somebody assesses it — an item nobody has assessed cannot be assumed harmless.',
      `Severity and category are different things: severity is how bad the defect is (${severityLabel('critical')}, ${severityLabel('major')}, ${severityLabel('minor')}, ${severityLabel('observation')}); category is what it is allowed to stop.`,
    ],
  }

  return { project, rows, report }
}
