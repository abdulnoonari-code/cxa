import ExcelJS from 'exceljs'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { getSubject } from '@/lib/subjects'
import { LEVELS } from '@/lib/checklist'
import { answerWords } from '@/lib/script-io'

// The whole project as a test script, in the same shape the template comes in.
//
// This is the file to mark up on site. Edit the answers, write the remarks,
// upload it back and nothing duplicates — the CXA ID column tells CxSentinel
// which check each row already is.
//
// It round-trips: an export that goes straight back in changes nothing.

export async function GET() {
  const project = await getCurrentProject()

  const wb = new ExcelJS.Workbook()
  wb.creator = 'CxSentinel'
  wb.created = new Date()
  const sheet = wb.addWorksheet('Test Script')

  sheet.getCell('A1').value = project ? `${project.name} — test script` : 'CxSentinel test script'
  sheet.getCell('A1').font = { name: 'Arial', bold: true, size: 13 }

  sheet.getCell('A2').value = 'Equipment / System:'
  sheet.getCell('D2').value = 'Level:'
  for (const ref of ['A2', 'D2']) sheet.getCell(ref).font = { name: 'Arial', bold: true }
  sheet.getCell('B2').value = ''
  sheet.getCell('E2').value = ''
  // The note goes on its own row, not beside the Level label.
  //
  // A labelled cell is read by scanning right for the first non-empty value,
  // so a comment sitting two columns along from an empty "Level:" was picked
  // up AS the level. Harmless here, because every row carries its own level —
  // but the day a sheet had no Level column, the error message would have
  // quoted this sentence back at somebody as though they had typed it.
  sheet.getCell('A3').value =
    'The two cells above are blank on purpose — every row carries its own tag and level, because one export covers the whole project.'
  sheet.getCell('A3').font = { name: 'Arial', italic: true, size: 9, color: { argb: 'FF6B7A99' } }

  const HEADERS = ['No.', 'Section', 'Content', 'Answer', 'Attachment', 'Remark', 'Links to', 'Tag / System', 'Level', 'CXA ID', 'Remove']
  const WIDTHS = [7, 26, 62, 11, 26, 34, 26, 20, 34, 38, 9]
  const header = sheet.getRow(4)
  HEADERS.forEach((h, i) => {
    header.getCell(i + 1).value = h
  })
  header.font = { name: 'Arial', bold: true }
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFBFD0F0' } } }
  })
  WIDTHS.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w
  })
  sheet.views = [{ state: 'frozen', ySplit: 4, xSplit: 3 }]

  if (project) {
    const [{ data }, index] = await Promise.all([
      supabase
        .from('checklist_items')
        .select(
          'id, item, level, status, notes, section_path, answer_type, serial_no, evidence_ref, links_to, source_line, subject_type, subject_id'
        )
        .eq('project_id', project.id)
        .order('level', { ascending: true })
        .order('source_line', { ascending: true, nullsFirst: false }),
      loadSubjectIndex(project.id),
    ])

    type Row = {
      id: string
      item: string | null
      level: string | null
      status: string | null
      notes: string | null
      section_path: string | null
      answer_type: string | null
      serial_no: string | null
      evidence_ref: string | null
      links_to: string | null
      subject_type: string | null
      subject_id: string | null
    }

    let n = 0
    for (const r of (data ?? []) as Row[]) {
      n += 1
      const subject =
        r.subject_type && r.subject_id
          ? getSubject(index, { type: r.subject_type as never, id: r.subject_id })
          : null
      const row = sheet.addRow([
        // A check that never came from a script has no serial of its own, so
        // it is given its position in this file. That is honest — the number
        // describes this sheet, and re-importing writes it back as the check's
        // serial, which is what somebody marking up the sheet would expect.
        r.serial_no ?? String(n),
        r.section_path ?? '',
        r.item ?? '',
        answerWords(r.status, r.answer_type),
        r.evidence_ref ?? '',
        r.notes ?? '',
        r.links_to ?? '',
        // The CODE, not a pretty title. This column is read back in and
        // matched against the asset register, and "GIS-115-CB-01 — Circuit
        // breaker" matches nothing. An export that cannot be re-imported is
        // not an export, it is a report.
        subject?.code ?? subject?.name ?? '',
        LEVELS.find((l) => l.value === r.level)?.label ?? r.level ?? '',
        r.id,
        '',
      ])
      row.alignment = { vertical: 'top', wrapText: true }
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  const name = (project?.name ?? 'project').replace(/[^\w-]+/g, '-').toLowerCase()
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}-test-script.xlsx"`,
    },
  })
}
