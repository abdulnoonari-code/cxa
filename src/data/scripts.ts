import { supabase } from '@/lib/supabase'
import { loadSubjectIndex } from '@/data/subjects'
import { refKey } from '@/lib/subjects'
import { scriptsFrom, type Script, type ScriptCheck } from '@/lib/scripts'

/**
 * Every script on the project, rebuilt from the register.
 *
 * Three queries whatever the size of the project: the checks that came from a
 * script, how many files are attached to each, and the asset names. The
 * alternative — a query per script, or per line — is what makes a page like
 * this take four seconds on a project with two thousand checks.
 */
export async function loadScripts(projectId: string | null): Promise<Script[]> {
  if (!projectId) return []

  const [{ data: rows }, { data: files }, index] = await Promise.all([
    supabase
      .from('checklist_items')
      .select(
        'id, serial_no, source_line, section_path, item, status, notes, answer_type, evidence_ref, links_to, level, source_ref, subject_type, subject_id, equipment_id'
      )
      .eq('project_id', projectId)
      .not('source_ref', 'is', null),
    supabase.from('attachments').select('checklist_item_id').eq('project_id', projectId),
    loadSubjectIndex(projectId),
  ])

  const counts = new Map<string, number>()
  for (const f of (files ?? []) as { checklist_item_id: string | null }[]) {
    if (!f.checklist_item_id) continue
    counts.set(f.checklist_item_id, (counts.get(f.checklist_item_id) ?? 0) + 1)
  }

  const typed = (rows ?? []) as {
    id: string
    serial_no: string | null
    source_line: number | null
    section_path: string | null
    item: string | null
    status: string | null
    notes: string | null
    answer_type: string | null
    evidence_ref: string | null
    links_to: string | null
    level: string | null
    source_ref: string | null
    subject_type: string | null
    subject_id: string | null
    equipment_id: string | null
  }[]

  const checks: ScriptCheck[] = typed.map((r) => ({
    id: r.id,
    // Fall back to the imported line number.
    //
    // Checks brought in before update 49 have a source_line and no serial_no,
    // because serial_no did not exist yet. Without this every one of those
    // lines shows a dash for its number and they all sort together at the
    // bottom — which on a 232-line procedure means the screen is in database
    // order, not procedure order, and is useless for the one job it has.
    serial: r.serial_no ?? (r.source_line !== null ? String(r.source_line) : null),
    section: r.section_path,
    item: r.item,
    status: r.status,
    notes: r.notes,
    answerType: r.answer_type,
    evidenceRef: r.evidence_ref,
    links: r.links_to,
    level: r.level,
    sourceRef: r.source_ref,
    subjectId: r.subject_id,
    equipmentId: r.equipment_id,
    attachments: counts.get(r.id) ?? 0,
  }))

  // The subject type is needed to look a subject up, so it is carried in a
  // side map rather than widened into ScriptCheck — the pure module has no
  // business knowing how this project indexes its assets.
  const typeById = new Map(typed.map((r) => [r.subject_id ?? '', r.subject_type ?? '']))
  const subjectName = (id: string | null): string => {
    if (!id) return ''
    const type = typeById.get(id)
    if (!type) return ''
    const s = index.byKey.get(refKey({ type, id }))
    return s?.code ?? s?.name ?? ''
  }

  return scriptsFrom(checks, subjectName)
}

/** One script, by the sheet name it was imported from. */
export async function loadScript(projectId: string | null, sheet: string): Promise<Script | null> {
  const all = await loadScripts(projectId)
  return all.find((s) => s.sheet === sheet) ?? null
}
