import ExcelJS from 'exceljs'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { loadItp } from '@/data/itp'
import { LEVELS } from '@/lib/checklist'
import { INSPECTION_TYPES, inspectionCode, inspectionLabel, carriesRelease, releaseLabel } from '@/lib/inspection'
import {
  findingsIn,
  summarise,
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
import type { SubjectType } from '@/lib/subjects'

// The ITP as a workbook: the matrix a client marks up, the points in detail,
// and the findings.
//
// The matrix sheet is the one that gets emailed. It is laid out the way an ITP
// always is, so somebody who has never seen CxSentinel can read it — with the
// one addition that earns this file its keep: a column headed **Nobody**, for
// the points no party holds.
export async function GET(request: Request) {
  const project = await getCurrentProject()
  if (!project) return new Response('No project found', { status: 404 })

  const params = new URL(request.url).searchParams
  const type = params.get('type')
  const id = params.get('id')

  const index = await loadSubjectIndex(project.id)
  const plan = await loadItp(project.id, index, type && id ? { type: type as SubjectType, id } : null)
  if (!plan) return new Response('No plan', { status: 404 })

  const rows = plan.activities
  const summary = summarise(rows)
  const findings = findingsIn(rows)
  const columns = matrixColumns(rows)
  const anyUnowned = hasUnassigned(rows)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'CxSentinel'
  wb.created = new Date()

  const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFEAF1FF' } }
  const dangerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFDE2E2' } }

  // ── Sheet 1: the matrix ────────────────────────────────────────────────
  const matrix = wb.addWorksheet('ITP matrix')
  matrix.columns = [
    { header: 'Tag / System', key: 'tag', width: 18 },
    { header: 'Activity', key: 'activity', width: 52 },
    { header: 'Level', key: 'level', width: 10 },
    { header: 'Point', key: 'point', width: 8 },
    ...columns.map((c) => ({ header: c.label, key: `p_${c.party}`, width: 12 })),
    ...(anyUnowned ? [{ header: UNASSIGNED_COLUMN, key: 'p_none', width: 14 }] : []),
    { header: 'Acceptance criteria', key: 'criteria', width: 26 },
    { header: 'Reference', key: 'reference', width: 18 },
  ]
  matrix.getRow(1).font = { name: 'Arial', bold: true }
  matrix.getRow(1).eachCell((cell) => {
    cell.fill = headerFill
  })
  matrix.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }]

  for (const r of rows) {
    const cells: Record<string, string> = {
      tag: r.tag,
      activity: r.activity,
      level: r.level.split('_')[0],
      point: inspectionCode(r.inspectionType),
      criteria: r.criteria ?? '',
      reference: r.reference ?? '',
    }
    for (const c of columns) cells[`p_${c.party}`] = matrixCell(r, c.party)
    const orphan = unassignedIsSerious(r)
    if (anyUnowned) cells.p_none = unassignedCell(r)

    const row = matrix.addRow(cells)
    row.font = { name: 'Arial' }
    row.alignment = { vertical: 'top', wrapText: true }
    for (const c of columns) row.getCell(`p_${c.party}`).alignment = { horizontal: 'center', vertical: 'top' }
    if (anyUnowned) {
      row.getCell('p_none').alignment = { horizontal: 'center', vertical: 'top' }
      if (orphan) row.getCell('p_none').fill = dangerFill
    }
  }

  // ── Sheet 2: the inspection points in detail ───────────────────────────
  const detail = wb.addWorksheet('Inspection points')
  detail.columns = [
    { header: 'Level', key: 'level', width: 26 },
    { header: 'Tag / System', key: 'tag', width: 18 },
    { header: 'Activity', key: 'activity', width: 48 },
    { header: 'Point', key: 'point', width: 16 },
    { header: 'Held by', key: 'party', width: 18 },
    { header: 'How assigned', key: 'source', width: 18 },
    { header: 'State', key: 'state', width: 20 },
    { header: 'Notice given', key: 'notified', width: 14 },
    { header: 'Signed by', key: 'signed', width: 20 },
    { header: 'Company', key: 'company', width: 20 },
    { header: 'Date', key: 'date', width: 12 },
  ]
  detail.getRow(1).font = { name: 'Arial', bold: true }
  detail.getRow(1).eachCell((cell) => {
    cell.fill = headerFill
  })
  detail.views = [{ state: 'frozen', ySplit: 1 }]

  for (const r of rows.filter((a) => carriesRelease(a.inspectionType))) {
    const row = detail.addRow({
      level: LEVELS.find((l) => l.value === r.level)?.label ?? r.level,
      tag: r.tag,
      activity: r.activity,
      point: inspectionLabel(r.inspectionType),
      party: r.holder.party ? partyShort(r.holder.party) : 'NOBODY',
      source: PARTY_SOURCE_LABELS[r.holder.source],
      state: releaseLabel(r.release),
      notified: (r.notifiedAt ?? '').slice(0, 10),
      signed: r.signedBy ?? '',
      company: r.signedCompany ?? '',
      date: (r.signedAt ?? '').slice(0, 10),
    })
    row.font = { name: 'Arial' }
    row.alignment = { vertical: 'top', wrapText: true }
    if (!r.holder.party) row.getCell('party').fill = dangerFill
  }

  // ── Sheet 3: who holds what ────────────────────────────────────────────
  const who = wb.addWorksheet('Who holds what')
  who.columns = [
    { header: 'Party', key: 'party', width: 34 },
    { header: 'Points held', key: 'holds', width: 14 },
    { header: 'Waiting on them', key: 'outstanding', width: 18 },
  ]
  who.getRow(1).font = { name: 'Arial', bold: true }
  who.getRow(1).eachCell((cell) => {
    cell.fill = headerFill
  })
  for (const p of summary.parties) {
    const row = who.addRow({ party: partyLabel(p.party), holds: p.holds, outstanding: p.outstanding })
    row.font = { name: 'Arial' }
  }
  if (summary.unowned > 0) {
    const row = who.addRow({ party: 'Nobody', holds: summary.unowned, outstanding: '—' })
    row.font = { name: 'Arial', bold: true }
    row.getCell('party').fill = dangerFill
  }

  // ── Sheet 4: findings ──────────────────────────────────────────────────
  const found = wb.addWorksheet('Findings')
  found.columns = [
    { header: '', key: 'severity', width: 16 },
    { header: 'Tag / System', key: 'tag', width: 18 },
    { header: 'What', key: 'title', width: 40 },
    { header: 'Owed by', key: 'owes', width: 18 },
    { header: 'Why it matters', key: 'detail', width: 88 },
  ]
  found.getRow(1).font = { name: 'Arial', bold: true }
  found.getRow(1).eachCell((cell) => {
    cell.fill = headerFill
  })
  if (findings.length === 0) {
    const row = found.addRow({
      severity: '—',
      tag: '',
      title: 'Nothing outstanding',
      owes: '',
      detail:
        'Every inspection point in this plan has a party, and none is waiting on a signature that has not been asked for.',
    })
    row.font = { name: 'Arial' }
  }
  for (const f of findings) {
    const row = found.addRow({
      severity: severityWord(f.severity),
      tag: f.activity.tag,
      title: f.title,
      owes: f.owes,
      detail: f.detail,
    })
    row.font = { name: 'Arial' }
    row.alignment = { vertical: 'top', wrapText: true }
    if (f.severity === 'blocking') row.getCell('severity').fill = dangerFill
  }

  // ── Sheet 5: how to read this ──────────────────────────────────────────
  const guide = wb.addWorksheet('How to read this')
  guide.columns = [
    { header: 'Thing', key: 'thing', width: 24 },
    { header: 'What it means', key: 'meaning', width: 108 },
  ]
  guide.getRow(1).font = { name: 'Arial', bold: true }
  guide.getRow(1).fill = headerFill
  const note = (thing: string, meaning: string) => {
    const r = guide.addRow({ thing, meaning })
    r.font = { name: 'Arial' }
    r.alignment = { vertical: 'top', wrapText: true }
  }

  for (const t of INSPECTION_TYPES) note(`${t.code} — ${t.label}`, t.note)
  note('A letter in brackets', MATRIX_KEY.split('A letter in brackets')[1]?.trim() ?? 'Taken from the project default.')
  note(
    `The "${UNASSIGNED_COLUMN}" column`,
    'Activities with no party recorded against them. What it means depends entirely on the letter: an S means nobody wrote down who does the work, which is untidy. An H means the Hold Point can never be released, because there is nobody whose job it is — it is not waiting on anybody, it is missing a person. Those cells are shaded. This column is the reason this file is generated rather than typed.'
  )
  note(
    'How assigned',
    '"On the plan" means a party is written against that activity. "Project default" means it was taken from what this project usually does at that level for that kind of point — a default, not an agreement anybody made about this activity.'
  )
  note(
    'What this document is not',
    'It states what the plan says and what the records show against it. It does not authorise work to proceed. That is a signature on the hold point itself.'
  )
  if (!plan.schemaReady) {
    note(
      'WARNING',
      'The database does not yet carry the party that holds each point — SQL part 20 has not been run. Every point in this file is therefore shown as held by nobody, which describes the database and not the job.'
    )
  }

  const buffer = await wb.xlsx.writeBuffer()
  const stem = plan.title.trim().toLowerCase() === project.name.trim().toLowerCase() ? project.name : `${project.name}-${plan.title}`
  return new Response(buffer as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${stem.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_')}-ITP.xlsx"`,
    },
  })
}
