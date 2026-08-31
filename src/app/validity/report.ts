// The validity review as a document.
//
// This is the one an auditor asks for, and the one worth issuing before they
// do: every place the project's own records contradict themselves, with the
// reason each one matters written next to it.

import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { loadValidityInput } from '@/data/validity'
import { review, summarise, verdict, type Severity } from '@/lib/validity'
import type { Report } from '@/lib/docgen'

export type BuiltValidity = { project: { id: string; name: string }; report: Report }

export async function buildValidityReport(url: string): Promise<BuiltValidity | null> {
  const project = await getCurrentProject()
  if (!project) return null

  const only = new URL(url).searchParams.get('severity')

  const index = await loadSubjectIndex(project.id)
  const input = await loadValidityInput(project.id, index)
  const all = review(input)
  const examined = input.checks.length + input.tests.length + input.punch.length
  const summary = summarise(all, examined)
  const reading = verdict(summary)

  const findings = only ? all.filter((f) => f.severity === only) : all
  const serious = new Set<number>()
  findings.forEach((f, i) => {
    if (f.severity === 'critical') serious.add(i)
  })

  const report: Report = {
    title: 'Validity Review',
    subtitle: only
      ? `${only[0].toUpperCase()}${only.slice(1)} findings only`
      : 'Every place the records contradict themselves',
    project: project.name,
    standfirst: `${reading.label}. ${reading.detail}`,
    figures: [
      { label: 'Contradictions', value: summary.critical, note: 'The record argues with itself' },
      { label: 'Gaps', value: summary.high, note: 'Something required is missing' },
      { label: 'Worth a look', value: summary.medium + summary.low, note: 'Would be asked about' },
      { label: 'Records examined', value: examined, note: 'Checks, tests, punch items' },
    ],
    tables: [
      ...(summary.byKind.length > 0
        ? [
            {
              title: 'What was found',
              columns: ['Severity', 'Finding', 'Count'],
              widths: [1.4, 7, 1],
              rows: summary.byKind.map((k) => [k.severity, k.title, k.count]),
            },
          ]
        : []),
      {
        title: only ? 'The findings at this severity' : 'Every finding',
        columns: ['Severity', 'Finding', 'What was found', 'Why it matters'],
        widths: [1.1, 2.6, 4.3, 4],
        rows: findings.map((f) => [f.severity, f.title, f.detail, f.why]),
        emphasise: serious,
      },
    ],
    footnotes: [
      'Every finding here is arithmetic on records that already exist — no judgement and no interpretation. Nothing is stored and nothing can be dismissed: fix the cause and the finding is gone from the next issue of this document.',
      'A clean review means the records are consistent with each other. It is not a statement that the work is right, and it authorises nothing — whether plant is fit to energise is decided at its readiness gate, against rules, by a named person.',
    ],
  }

  return { project, report }
}

export type { Severity }
