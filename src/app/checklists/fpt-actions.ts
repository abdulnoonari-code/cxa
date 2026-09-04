'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { recordAudit } from '@/lib/audit'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { buildTextIndex, findSubjectByText, subjectLabel } from '@/lib/subjects'
import { parseFptWorkbook, describeFptProblem, type FptProblem } from '@/lib/fpt-io'
import { LEVELS } from '@/lib/checklist'

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function reject(reason: string, detail: string): never {
  redirect(`/checklists?fpt=rejected&reason=${reason}&detail=${encodeURIComponent(detail.slice(0, 400))}`)
}

/**
 * Import a Functional Performance Test script as checks.
 *
 * Three refusals, and each one is here because the alternative is a record
 * that looks complete and is not:
 *
 *   1. **The equipment must already exist.** A test script names what it
 *      tests. If that name is not a tag, system or area on this project, the
 *      file stops. Creating the asset from the script would put a piece of
 *      equipment on the project that nobody surveyed, carrying two hundred
 *      checks, counted in a readiness figure.
 *
 *   2. **The level must be known, not assumed.** Most FPT types decide their
 *      own level. The ones that do not are asked about rather than defaulted,
 *      because the level is what a check counts towards.
 *
 *   3. **Nothing is written if anything is wrong.** Half a test script is
 *      worse than none: the missing half is invisible, and the half that
 *      arrived makes the register look like it was imported successfully.
 */
export async function importFptScript(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) redirect('/checklists?fpt=noproject')

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) reject('nofile', 'No file was chosen.')

  const chosenLevel = (formData.get('level') as string | null)?.trim() || null
  if (chosenLevel && !LEVELS.some((l) => l.value === chosenLevel)) {
    reject('level', 'That is not a level this project uses.')
  }

  let parsed
  try {
    parsed = await parseFptWorkbook(await file.arrayBuffer(), { fileName: file.name })
  } catch (e) {
    reject('unreadable', e instanceof Error ? e.message : 'The file could not be opened.')
  }

  const errors: FptProblem[] = [...parsed.errors]

  // ── Resolve every script's equipment before writing anything ───────────
  const index = await loadSubjectIndex(project.id)
  const text = buildTextIndex(index)

  const resolved: {
    sheet: string
    subjectType: string
    subjectId: string
    equipmentId: string | null
    level: string
    checks: typeof parsed.scripts[number]['checks']
    fptName: string
  }[] = []

  for (const script of parsed.scripts) {
    if (!script.fptName) continue // already an error from the parser

    const match = findSubjectByText(text, script.fptName)
    if (!match.subject) {
      errors.push({
        sheet: script.sheet,
        row: 0,
        column: 'FPT NAME',
        value: script.fptName,
        message:
          match.candidates.length > 0
            ? `Matches more than one thing on this project (${match.candidates
                .slice(0, 3)
                .map((c) => subjectLabel(c.type))
                .join(', ')}). Use the exact tag or system code.`
            : 'Not a tag, system or area on this project. Add the equipment first — a test script cannot create the thing it tests.',
      })
      continue
    }

    const level = script.level ?? chosenLevel
    if (!level) {
      errors.push({
        sheet: script.sheet,
        row: 0,
        column: 'FPT TYPE',
        value: script.fptType ?? '(blank)',
        message: script.fptType
          ? `There is no single right level for "${script.fptType}" — different projects place it differently. Choose the level above and import again.`
          : 'No FPT type on this sheet, so the level cannot be worked out. Choose the level above and import again.',
      })
      continue
    }

    resolved.push({
      sheet: script.sheet,
      subjectType: match.subject.type,
      subjectId: match.subject.id,
      equipmentId: match.subject.type === 'equipment' ? match.subject.id : null,
      level,
      checks: script.checks,
      fptName: script.fptName,
    })
  }

  if (errors.length > 0) {
    await recordAudit({
      projectId: project.id,
      action: 'test script import rejected',
      entity: 'checklist_item',
      entityLabel: file.name,
      newValue: `${errors.length} problems, nothing imported`,
      comment: errors.slice(0, 12).map(describeFptProblem).join(' | '),
    })
    reject('problems', errors.slice(0, 3).map(describeFptProblem).join(' · '))
  }

  // ── Write. Re-importing the same script updates it, never doubles it ───
  //
  // Every check carries the sheet and line number it came from. A revised
  // script re-imported changes the wording of line 84 rather than adding a
  // second line 84 beside it — which is what would happen with no stable
  // reference, and would quietly double a two hundred item register.
  let added = 0
  let updated = 0

  for (const r of resolved) {
    const refs = r.checks.map((c) => c.sourceRef)
    const existing = new Map<string, string>()

    for (const part of chunk(refs, 200)) {
      const { data } = await supabase
        .from('checklist_items')
        .select('id, source_ref')
        .eq('project_id', project.id)
        .eq('subject_id', r.subjectId)
        .in('source_ref', part)
      for (const row of (data ?? []) as { id: string; source_ref: string }[]) {
        existing.set(row.source_ref, row.id)
      }
    }

    const inserts = []
    for (const c of r.checks) {
      const id = existing.get(c.sourceRef)
      if (id) {
        await supabase
          .from('checklist_items')
          .update({
            item: c.item,
            level: r.level,
            section_path: c.sectionPath,
            answer_type: c.answerType,
            source_line: c.lineNo,
          })
          .eq('id', id)
        updated++
      } else {
        inserts.push({
          project_id: project.id,
          equipment_id: r.equipmentId,
          subject_type: r.subjectType,
          subject_id: r.subjectId,
          level: r.level,
          item: c.item,
          status: 'pending',
          notes: null,
          inspection_type: 'surveillance',
          section_path: c.sectionPath,
          answer_type: c.answerType,
          source_ref: c.sourceRef,
          source_line: c.lineNo,
        })
      }
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
          comment: `${added} checks had already been written when this failed. ${r.sheet}, ${r.fptName}.`,
        })
        reject('write', error.message)
      }
      added += part.length
    }
  }

  const skippedSummary = parsed.scripts
    .flatMap((s) => s.skipped.map((k) => `${k.count} ${k.kind}`))
    .join('; ')

  await recordAudit({
    projectId: project.id,
    action: 'imported a test script',
    entity: 'checklist_item',
    entityLabel: file.name,
    newValue: `${added} added, ${updated} updated`,
    comment:
      resolved
        .map((r) => `${r.sheet}: ${r.checks.length} questions against ${r.fptName} at ${r.level}`)
        .join(' | ') +
      (skippedSummary ? ` — not imported: ${skippedSummary}.` : '') +
      (parsed.warnings.length > 0
        ? ` ${parsed.warnings.length} warnings: ${parsed.warnings.slice(0, 6).map(describeFptProblem).join(' | ')}`
        : ''),
  })

  revalidatePath('/checklists')
  revalidatePath('/dashboard')

  const notImported = parsed.scripts.reduce((n, s) => n + s.skipped.reduce((m, k) => m + k.count, 0), 0)
  redirect(
    `/checklists?fpt=ok&added=${added}&updated=${updated}&scripts=${resolved.length}` +
      `&skipped=${notImported}&warnings=${parsed.warnings.length}`
  )
}
