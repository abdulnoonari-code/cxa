'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { recordAudit } from '@/lib/audit'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { buildTextIndex, findSubjectByText, subjectLabel } from '@/lib/subjects'
import { matchLevel } from '@/lib/checklist-io'
import { LEVELS } from '@/lib/checklist'
import {
  parseScriptWorkbook,
  describeScriptProblem,
  linksText,
  type ScriptProblem,
  type ScriptRow,
} from '@/lib/script-io'

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function reject(reason: string, detail: string): never {
  redirect(`/checklists?script=rejected&reason=${reason}&detail=${encodeURIComponent(detail.slice(0, 400))}`)
}

type Planned = {
  row: ScriptRow
  sheet: string
  subjectType: string
  subjectId: string
  equipmentId: string | null
  level: string
  sourceRef: string
}

/**
 * Import a test script.
 *
 * Three refusals, each one there because the alternative is a register that
 * looks complete and is not:
 *
 *   1. **The equipment must already exist.** A script names what it tests. A
 *      name that is not a tag, system or area on this project stops the file.
 *      Creating the asset from the script would put equipment on the project
 *      that nobody surveyed, carrying two hundred checks, counted in a
 *      readiness figure somebody signs.
 *
 *   2. **The level is never guessed.** It decides what a check counts
 *      towards. If the sheet does not say, the upload screen asks.
 *
 *   3. **Nothing is written if anything is wrong.** Half a script is worse
 *      than none.
 *
 * And one thing that is deliberately NOT a refusal: a link this cannot
 * resolve. A drawing number, a submittal, a standard clause — nothing here
 * knows what those are, so they are kept exactly as typed and reported. Only
 * a link that CAN be checked and is wrong stops the file.
 */
export async function importTestScript(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) redirect('/checklists?script=noproject')

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) reject('nofile', 'No file was chosen.')

  const chosenLevel = (formData.get('level') as string | null)?.trim() || null
  if (chosenLevel && !LEVELS.some((l) => l.value === chosenLevel)) {
    reject('level', 'That is not a level this project uses.')
  }

  let parsed
  try {
    parsed = await parseScriptWorkbook(await file.arrayBuffer(), { fileName: file.name })
  } catch (e) {
    reject('unreadable', e instanceof Error ? e.message : 'The file could not be opened.')
  }

  const errors: ScriptProblem[] = [...parsed.errors]
  const warnings: ScriptProblem[] = [...parsed.warnings]

  const index = await loadSubjectIndex(project.id)
  const text = buildTextIndex(index)

  // What this project actually has, for the error message.
  //
  // "Not a tag on this project" is true and useless: it leaves somebody
  // guessing at the spelling of a code they cannot see from the upload
  // screen. Naming a few of the real ones turns a round trip into a
  // correction, and if the list is empty it says THAT, which is a different
  // problem with a different fix.
  const codes = [...index.byKey.values()]
    .filter((s) => s.type !== 'project' && s.code)
    .map((s) => s.code as string)
    .sort((a, b) => a.localeCompare(b))
  const whatExists =
    codes.length === 0
      ? ' This project has no tags or systems on it yet — add the equipment on Equipment & Tags first.'
      : ` This project has ${codes.length}: ${codes.slice(0, 8).join(', ')}${codes.length > 8 ? ', …' : ''}.`

  // What the project already has, so a link can be checked rather than
  // assumed. Two small queries; both registers are short.
  const [{ data: reqRows }, { data: oblRows }] = await Promise.all([
    supabase.from('requirements').select('ref').eq('project_id', project.id),
    supabase.from('obligations').select('ref').eq('project_id', project.id),
  ])
  const known = new Set(
    [...((reqRows ?? []) as { ref: string | null }[]), ...((oblRows ?? []) as { ref: string | null }[])]
      .map((r) => (r.ref ?? '').trim().toLowerCase())
      .filter(Boolean)
  )

  const planned: Planned[] = []

  for (const sheet of parsed.sheets) {
    for (const row of sheet.rows) {
      // ── Which asset this check belongs to ────────────────────────────
      const nameText = row.subjectText ?? sheet.subjectText
      if (!nameText) {
        errors.push({
          sheet: sheet.sheet,
          row: row.row,
          column: 'Equipment / System',
          value: '',
          message:
            'Nothing says what this check is against. Put the tag or system in cell B2 above the table, or in a Tag / System column on the row.',
        })
        continue
      }

      const match = findSubjectByText(text, nameText)
      if (!match.subject) {
        errors.push({
          sheet: sheet.sheet,
          row: row.row,
          column: row.subjectText ? 'Tag / System' : 'Equipment / System',
          value: nameText,
          message:
            match.candidates.length > 0
              ? `Matches more than one thing on this project (${match.candidates
                  .slice(0, 3)
                  .map((c) => subjectLabel(c.type))
                  .join(', ')}). Use the exact tag or system code.`
              : `Not a tag, system or area on this project.${whatExists} Add it on Equipment & Tags, or change the name on the sheet to match one of these — a test script cannot create the thing it tests.`,
        })
        continue
      }

      // ── Which level ──────────────────────────────────────────────────
      // A Level column on the row wins over the one above the table, because
      // the project-wide export writes a level per row and leaves the header
      // blank — one file covering five levels could not work any other way.
      const levelText = row.levelText ?? sheet.levelText
      const level = (levelText ? matchLevel(levelText) : null) ?? chosenLevel
      if (!level) {
        errors.push({
          sheet: sheet.sheet,
          row: row.row,
          column: 'Level',
          value: levelText ?? '(blank)',
          message: levelText
            ? `"${levelText}" is not a level this project uses. Write it as L1 to L5, or choose the level on the upload screen.`
            : 'No level on this sheet. Put it in cell E2, or choose one on the upload screen.',
        })
        continue
      }

      // ── Links that can be checked ────────────────────────────────────
      for (const link of row.links) {
        if (link.kind === 'requirement' || link.kind === 'obligation') {
          if (!known.has(link.raw.trim().toLowerCase())) {
            errors.push({
              sheet: sheet.sheet,
              row: row.row,
              column: 'Links to',
              value: link.raw,
              message: `There is no ${link.kind} with that reference on this project. A check that claims to prove a requirement nobody can look up proves nothing.`,
            })
          }
          continue
        }
        if (link.kind === 'subject' && !findSubjectByText(text, link.raw).subject) {
          // Not an error. A drawing number and a tag look identical on paper,
          // and refusing the file over one would make the column unusable for
          // the thing it is most often used for.
          warnings.push({
            sheet: sheet.sheet,
            row: row.row,
            column: 'Links to',
            value: link.raw,
            message: 'Not a tag on this project, so it was kept as written — as a drawing, submittal or standard would be.',
          })
        }
      }

      planned.push({
        row,
        sheet: sheet.sheet,
        subjectType: match.subject.type,
        subjectId: match.subject.id,
        equipmentId: match.subject.type === 'equipment' ? match.subject.id : null,
        level,
        sourceRef: `SCRIPT:${sheet.sheet}:${row.serial ?? `r${row.row}`}`,
      })
    }
  }

  if (errors.length > 0) {
    await recordAudit({
      projectId: project.id,
      action: 'test script import rejected',
      entity: 'checklist_item',
      entityLabel: file.name,
      newValue: `${errors.length} problems, nothing imported`,
      comment: errors.slice(0, 12).map(describeScriptProblem).join(' | '),
    })
    // One example of each DISTINCT problem, not the first three rows.
    //
    // A script whose equipment name is wrong produces the identical error two
    // hundred and three times, and showing rows 5, 6 and 7 of it fills the
    // banner with the same sentence three times over while hiding whatever
    // else is wrong with the file.
    const seen = new Set<string>()
    const distinct = errors.filter((e) => {
      const key = `${e.column}|${e.message}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const more = errors.length - distinct.length
    reject(
      'problems',
      distinct.slice(0, 3).map(describeScriptProblem).join(' · ') +
        (more > 0 ? ` · and ${more} more row${more === 1 ? '' : 's'} with the same problems.` : '')
    )
  }

  if (planned.length === 0) {
    reject('empty', 'The file was read but there were no checks in it.')
  }

  // ── Work out what already exists ───────────────────────────────────────
  //
  // By CXA ID first, because that is exact and comes off our own export. By
  // source reference second, so a script re-imported from the engineer's own
  // copy — which has no CXA ID on it — updates rather than doubling.
  const byId = new Map<string, Planned>()
  const needRef: Planned[] = []
  for (const p of planned) {
    if (p.row.id) byId.set(p.row.id, p)
    else needRef.push(p)
  }

  const refToId = new Map<string, string>()
  for (const part of chunk(needRef.map((p) => p.sourceRef), 200)) {
    const { data } = await supabase
      .from('checklist_items')
      .select('id, source_ref')
      .eq('project_id', project.id)
      .in('source_ref', part)
    for (const r of (data ?? []) as { id: string; source_ref: string }[]) refToId.set(r.source_ref, r.id)
  }

  const fields = (p: Planned) => ({
    level: p.level,
    item: p.row.content,
    status: p.row.status,
    notes: p.row.remark,
    section_path: p.row.section,
    answer_type: p.row.answerType,
    serial_no: p.row.serial,
    evidence_ref: p.row.attachment,
    links_to: p.row.links.length > 0 ? linksText(p.row.links) : null,
    source_ref: p.sourceRef,
    source_line: p.row.serial && /^\d+$/.test(p.row.serial) ? Number(p.row.serial) : null,
  })

  const removeIds: string[] = []
  const updates: { id: string; p: Planned }[] = []
  const inserts: Record<string, unknown>[] = []

  for (const p of planned) {
    const id = p.row.id ?? refToId.get(p.sourceRef) ?? null
    if (p.row.remove) {
      if (id) removeIds.push(id)
      continue
    }
    if (id) updates.push({ id, p })
    else
      inserts.push({
        project_id: project.id,
        equipment_id: p.equipmentId,
        subject_type: p.subjectType,
        subject_id: p.subjectId,
        inspection_type: 'surveillance',
        ...fields(p),
      })
  }

  for (const part of chunk(removeIds, 200)) {
    await supabase.from('checklist_items').delete().in('id', part)
  }
  for (const u of updates) {
    await supabase.from('checklist_items').update(fields(u.p)).eq('id', u.id)
  }
  for (const part of chunk(inserts, 500)) {
    const { error } = await supabase.from('checklist_items').insert(part)
    if (error) {
      await recordAudit({
        projectId: project.id,
        action: 'test script import failed',
        entity: 'checklist_item',
        entityLabel: file.name,
        newValue: error.message,
        comment: 'Part of the script had already been written when the database refused the rest.',
      })
      reject('write', error.message)
    }
  }

  await recordAudit({
    projectId: project.id,
    action: 'imported a test script',
    entity: 'checklist_item',
    entityLabel: file.name,
    newValue: `${inserts.length} added, ${updates.length} updated, ${removeIds.length} removed`,
    comment:
      parsed.sheets
        .map((s) => `${s.sheet}: ${s.rows.length} checks, columns used — ${s.columnsFound.join(', ')}`)
        .join(' | ') +
      (warnings.length > 0
        ? ` ${warnings.length} warnings: ${warnings.slice(0, 6).map(describeScriptProblem).join(' | ')}`
        : ''),
  })

  revalidatePath('/checklists')
  revalidatePath('/dashboard')
  revalidatePath('/rules')

  redirect(
    `/checklists?script=ok&added=${inserts.length}&updated=${updates.length}&removed=${removeIds.length}` +
      `&sheets=${parsed.sheets.length}&warnings=${warnings.length}`
  )
}
