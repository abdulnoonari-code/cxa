// The Inspection and Test Plan, as one document.
//
// This is the sheet a client approves before anybody lifts a tool. It has a
// conventional shape and departing from it wastes everybody's time, so the
// matrix is printed the way an ITP is always printed: activities down the
// side, parties across the top, and H / W / S / R in the cell.
//
// Two departures from the convention, both deliberate:
//
//   1. **A letter in brackets came from the project default**, not from this
//      activity. A client signing a sheet is entitled to know which of their
//      hold points were written for them and which were assumed for them.
//
//   2. **A column headed "Nobody"** carries the points no party holds. On a
//      normal ITP these rows simply have an empty row of cells and nobody
//      notices. Naming the column is the whole reason this document is worth
//      generating rather than typing.

import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { loadItp } from '@/data/itp'
import { subjectLabel, type SubjectType } from '@/lib/subjects'
import { LEVELS } from '@/lib/checklist'
import { INSPECTION_TYPES, inspectionCode, inspectionLabel, carriesRelease, releaseLabel } from '@/lib/inspection'
import {
  findingsIn,
  summarise,
  verdict,
  matrixColumns,
  matrixCell,
  unassignedCell,
  unassignedIsSerious,
  hasUnassigned,
  UNASSIGNED_COLUMN,
  severityWord,
  partyShort,
  partyLabel,
  PARTY_SOURCE_LABELS,
  MATRIX_KEY,
} from '@/lib/itp'
import type { Report, ReportTable } from '@/lib/docgen'

export type BuiltItp = {
  project: { id: string; name: string }
  title: string
  fileStem: string
  report: Report
}

export async function buildItp(url: string): Promise<BuiltItp | null> {
  const project = await getCurrentProject()
  if (!project) return null

  const params = new URL(url).searchParams
  const type = params.get('type')
  const id = params.get('id')

  const index = await loadSubjectIndex(project.id)
  const plan = await loadItp(project.id, index, type && id ? { type: type as SubjectType, id } : null)
  if (!plan) return null

  const rows = plan.activities
  const findings = findingsIn(rows)
  const summary = summarise(rows)
  const reading = verdict(rows, findings, summary)
  const columns = matrixColumns(rows)

  const tables: ReportTable[] = []

  // ── What the plan is made of ───────────────────────────────────────────
  tables.push({
    title: 'Point types in this plan',
    columns: ['Code', 'Point type', 'Count', 'What it means'],
    widths: [0.8, 2.2, 0.9, 8.1],
    rows: INSPECTION_TYPES.map((t) => [
      t.code,
      t.label,
      summary.byType.find((b) => b.value === t.value)?.count ?? 0,
      t.note,
    ]),
  })

  // ── Who holds what ─────────────────────────────────────────────────────
  tables.push({
    title: 'Who holds the inspection points',
    columns: ['Party', 'Points held', 'Waiting on them'],
    widths: [6, 3, 3],
    rows: [
      ...summary.parties.map((p) => [partyLabel(p.party), p.holds, p.outstanding]),
      ...(summary.unowned > 0
        ? [['Nobody — see the findings below', summary.unowned, '—'] as (string | number)[]]
        : []),
      ...(summary.parties.length === 0 && summary.unowned === 0
        ? [['No inspection point in this plan is held by anybody', 0, 0] as (string | number)[]]
        : []),
    ],
    emphasise: summary.unowned > 0 ? new Set([summary.parties.length]) : undefined,
  })

  // ── Findings ───────────────────────────────────────────────────────────
  tables.push({
    title: 'What the records show against this plan',
    columns: ['', 'What', 'Owed by', 'Why it matters'],
    widths: [1.4, 3, 1.4, 6.2],
    rows:
      findings.length === 0
        ? [['—', 'Nothing outstanding', '—', 'Every inspection point has a party, and none is waiting on a signature that has not been asked for.']]
        : findings.map((f) => [severityWord(f.severity), f.title, f.owes, f.detail]),
    emphasise: new Set(findings.map((f, i) => (f.severity === 'blocking' ? i : -1)).filter((i) => i >= 0)),
  })

  // ── The matrix ─────────────────────────────────────────────────────────
  // Printed only when somebody holds something. A matrix with no columns is
  // an empty grid, and the finding above says the real thing.
  const anyUnassigned = hasUnassigned(rows)
  if (columns.length > 0 || anyUnassigned) {
    // Party columns get a full unit of width. At 0.8 the header "Contractor"
    // broke across two lines as "Contra ctor".
    const heads = ['Tag', 'Activity', 'Level', ...columns.map((c) => c.label)]
    const widths = [1.4, 5, 0.8, ...columns.map(() => 1.05)]
    if (anyUnassigned) {
      heads.push(UNASSIGNED_COLUMN)
      widths.push(1.1)
    }
    tables.push({
      title: 'The plan',
      columns: heads,
      widths,
      rows: rows.map((r) => {
        const cells: (string | number)[] = [
          r.tag,
          r.activity,
          r.level.split('_')[0],
          ...columns.map((c) => matrixCell(r, c.party)),
        ]
        if (anyUnassigned) cells.push(unassignedCell(r))
        return cells
      }),
      // Only the serious blanks are marked: a Hold or Witness Point nobody can
      // release. A surveillance check with no party named is untidy, not urgent.
      emphasise: new Set(rows.map((r, i) => (unassignedIsSerious(r) ? i : -1)).filter((i) => i >= 0)),
    })
  }

  // ── The inspection points in detail, by level ──────────────────────────
  for (const level of LEVELS) {
    const atLevel = rows.filter((r) => r.level === level.value && carriesRelease(r.inspectionType))
    if (atLevel.length === 0) continue
    tables.push({
      title: `Inspection points — ${level.label}`,
      columns: ['Tag', 'Activity', 'Point', 'Held by', 'How assigned', 'State', 'Signed by'],
      widths: [1.3, 4.2, 1.1, 1.5, 1.4, 1.5, 1.5],
      rows: atLevel.map((r) => [
        r.tag,
        r.activity,
        inspectionCode(r.inspectionType),
        r.holder.party ? partyShort(r.holder.party) : 'NOBODY',
        PARTY_SOURCE_LABELS[r.holder.source],
        releaseLabel(r.release),
        r.signedBy ?? '',
      ]),
      emphasise: new Set(atLevel.map((r, i) => (!r.holder.party ? i : -1)).filter((i) => i >= 0)),
    })
  }

  // ── The project's defaults ─────────────────────────────────────────────
  tables.push({
    title: 'Project defaults used in this plan',
    columns: ['Level', 'Point type', 'Held by'],
    widths: [4.5, 3.5, 4],
    rows:
      plan.conventions.length === 0
        ? [['—', '—', 'This project has no defaults. Every party on this plan was written against its own activity.']]
        : plan.conventions.map((c) => [
            LEVELS.find((l) => l.value === c.level)?.label ?? c.level,
            inspectionLabel(c.inspection_type),
            partyLabel(c.party),
          ]),
  })

  const scopeLabel = type ? `${subjectLabel(type as SubjectType)} — ${plan.title}` : plan.title

  const report: Report = {
    title: 'Inspection & Test Plan',
    subtitle: scopeLabel,
    project: project.name,
    standfirst: `${reading.label}. ${reading.detail}`,
    figures: [
      { label: 'Activities', value: summary.total, note: `${summary.points} inspection points` },
      { label: 'Hold Points', value: summary.byType.find((b) => b.value === 'hold')?.count ?? 0, note: 'Work stops until released' },
      { label: 'Points with no party', value: summary.unowned, note: 'Nobody to release or attend' },
      { label: 'Awaiting a signature', value: summary.awaiting, note: `${summary.released} released or witnessed` },
    ],
    tables,
    footnotes: [
      MATRIX_KEY,
      'This plan is derived from the checklist and test registers at the moment it was generated. Nothing on it is stored, so it cannot disagree with the records it describes.',
      'A party shown as a project default was not written against that activity. It is what this project usually does, and it is not an agreement about this point.',
      'This document states what the plan says and what the records show against it. It does not authorise work to proceed — that is a signature on the hold point itself, not on this.',
      !plan.schemaReady
        ? 'WARNING: the database does not yet carry the party that holds each point (SQL part 20 has not been run). Every point on this plan is therefore shown as held by nobody, which describes the database and not the job.'
        : '',
    ].filter(Boolean),
  }

  const same = plan.title.trim().toLowerCase() === project.name.trim().toLowerCase()
  const fileStem = same ? `${project.name}-ITP` : `${project.name}-${plan.title}-ITP`

  return { project, title: plan.title, fileStem, report }
}
