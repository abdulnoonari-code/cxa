// The obligations register as a document, built once and rendered three ways.
//
// Every export route reads the same filters off the URL as the screen does, so
// what you are looking at is what goes in the file — one party's obligations
// can be issued to that party and nothing else.

import { getCurrentProject } from '@/lib/project'
import { loadAllObligations, type ObligationRow } from '@/data/obligations'
import { LEVELS } from '@/lib/checklist'
import {
  partyLabel,
  partyShort,
  statusLabel,
  typeLabel,
  summarise,
  verdict,
  daysOverdue,
  isOutstanding,
} from '@/lib/obligations'
import type { Report } from '@/lib/docgen'

const SETTLED = new Set(['accepted', 'waived', 'not_applicable'])

export type Filtered = {
  project: { id: string; name: string }
  rows: ObligationRow[]
  report: Report
}

function levelLabel(value: string | null): string {
  return LEVELS.find((l) => l.value === value)?.label.split('—')[0].trim() ?? ''
}

/** Read the same filters the screen uses, so exports and screen never disagree. */
export function filtersFrom(url: string) {
  const p = new URL(url).searchParams
  return {
    party: p.get('party'),
    status: p.get('status'),
    type: p.get('type'),
    document: p.get('document'),
    outstandingOnly: p.get('open') === '1',
  }
}

export async function buildObligationReport(url: string): Promise<Filtered | null> {
  const project = await getCurrentProject()
  if (!project) return null

  const filter = filtersFrom(url)
  const all = await loadAllObligations(project.id)

  const rows = all.filter((r) => {
    if (filter.party === 'none' && r.party) return false
    if (filter.party && filter.party !== 'none' && r.party !== filter.party) return false
    if (filter.status && r.status !== filter.status) return false
    if (filter.type && r.obligation_type !== filter.type) return false
    if (filter.document && r.document_id !== filter.document) return false
    if (filter.outstandingOnly && SETTLED.has(r.status)) return false
    return true
  })

  // The figures describe what is in the document, not the whole project —
  // a register issued to one party that quotes project-wide totals invites
  // exactly the argument it was sent to avoid.
  const summary = summarise(rows)
  const reading = verdict(summary)

  const narrowed: string[] = []
  if (filter.party === 'none') narrowed.push('obligations with no party assigned')
  else if (filter.party) narrowed.push(`obligations owed by the ${partyLabel(filter.party)}`)
  if (filter.status) narrowed.push(`state “${statusLabel(filter.status)}”`)
  if (filter.type) narrowed.push(`duties of the kind “${typeLabel(filter.type)}”`)
  if (filter.outstandingOnly) narrowed.push('outstanding items only')

  const overdueRows = new Set<number>()
  rows.forEach((r, i) => {
    if (daysOverdue(r) !== null) overdueRows.add(i)
  })

  const report: Report = {
    title: 'Obligations Register',
    subtitle: narrowed.length > 0 ? `Filtered to ${narrowed.join(', ')}` : 'All obligations on record',
    project: project.name,
    standfirst: `${reading.label}. ${reading.detail}`,
    figures: [
      { label: 'In this register', value: rows.length, note: 'Obligations listed' },
      { label: 'Outstanding', value: summary.outstanding, note: 'Still owed' },
      { label: 'Overdue', value: summary.overdue, note: 'Past an agreed date' },
      { label: 'Not assigned', value: summary.unassigned, note: 'Nobody owns them' },
    ],
    tables: [
      ...(summary.byParty.length > 1
        ? [
            {
              title: 'By party',
              columns: ['Party', 'Outstanding', 'Overdue', 'Total'],
              widths: [4, 1.2, 1.2, 1.2],
              rows: summary.byParty.map((p) => [
                p.party === 'unassigned' ? 'Not assigned to anybody' : partyLabel(p.party),
                p.outstanding,
                p.overdue || '',
                p.total,
              ]),
            },
          ]
        : []),
      {
        title: 'The register',
        columns: ['Ref', 'Clause', 'Party', 'Obligation', 'Kind', 'State', 'Owner', 'Due'],
        widths: [1.1, 0.9, 1.2, 6.4, 1.1, 1.2, 1.4, 1],
        rows: rows.map((r) => [
          r.ref ?? '',
          r.clause ?? '',
          partyShort(r.party),
          r.statement,
          typeLabel(r.obligation_type),
          statusLabel(r.status),
          r.owner ?? '',
          r.due_date ?? '',
        ]),
        emphasise: overdueRows,
      },
      ...(rows.some((r) => r.source_name)
        ? [
            {
              title: 'Where these came from',
              columns: ['Source document', 'Obligations', 'Outstanding'],
              widths: [6, 1.4, 1.4],
              rows: [
                ...new Map(
                  rows
                    .filter((r) => r.source_name)
                    .map((r) => [r.source_name as string, r.source_name as string])
                ).keys(),
              ].map((source) => {
                const from = rows.filter((r) => r.source_name === source)
                return [source, from.length, from.filter((r) => isOutstanding(r.status)).length]
              }),
            },
          ]
        : []),
    ],
    footnotes: [
      'This register records what the documents read into CxSentinel say is owed. It is not a legal opinion, it does not discharge anything, and a clause absent from it has not stopped applying — it means the document it lives in has not been read into CxSentinel.',
      'Submitted and Accepted are separate states on purpose: the first is the owing party saying a duty is discharged, the second is the receiving party agreeing. Only Accepted, Waived and Not applicable close an obligation.',
    ],
  }

  // Level is only worth a column when somebody has used it.
  if (rows.some((r) => r.level)) {
    report.tables?.push({
      title: 'Obligations tied to a commissioning level',
      columns: ['Ref', 'Level', 'Party', 'Obligation', 'State'],
      widths: [1.1, 1.4, 1.4, 6.5, 1.4],
      rows: rows
        .filter((r) => r.level)
        .map((r) => [r.ref ?? '', levelLabel(r.level), partyShort(r.party), r.statement, statusLabel(r.status)]),
    })
  }

  return { project, rows, report }
}
