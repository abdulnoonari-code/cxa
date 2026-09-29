import { supabase } from '@/lib/supabase'
import { loadSubjectIndex } from '@/data/subjects'
import { refKey } from '@/lib/subjects'
import { scopeOf } from '@/lib/scope'
import type { AppliedRecord, Target, Template, EquipmentKind } from '@/lib/templates'
import { supabase as db } from '@/lib/supabase'

const T_COLUMNS = 'id, code, title, level, section, answer_type, guidance'
const R_COLUMNS = 'id, template_id, subject_id, subject_type, level, item, status'

export type LibraryLoad = {
  templates: Template[]
  records: AppliedRecord[]
  /** Everything a template could be applied to, tags and systems alike. */
  targets: Target[]
  /**
   * The equipment KINDS, each carrying its tags.
   *
   * Offered as one thing to tick so that one check reaches a hundred
   * panels. The expansion happens in expandKinds() before planApply, so
   * everything downstream still sees ordinary tag targets.
   */
  kinds: EquipmentKind[]
  codeOf: (id: string | null) => string
  /** False when SQL part 30 has not been run. */
  ready: boolean
}

export async function loadLibrary(projectId: string | null): Promise<LibraryLoad> {
  const empty: LibraryLoad = { templates: [], records: [], targets: [], kinds: [], codeOf: () => '—', ready: true }
  if (!projectId) return empty

  const [tpl, rec, index] = await Promise.all([
    supabase.from('check_templates').select(T_COLUMNS).eq('project_id', projectId).order('level'),
    supabase.from('checklist_items').select(R_COLUMNS).eq('project_id', projectId),
    loadSubjectIndex(projectId),
  ])

  // The table or the column is missing until part 30 has been run. Reported
  // rather than shown as an empty library, because "you have no templates"
  // and "this feature is not installed" are different sentences and only one
  // of them tells somebody what to do.
  if (tpl.error || rec.error) {
    return { ...empty, ready: false }
  }

  const templates: Template[] = ((tpl.data ?? []) as {
    id: string
    code: string | null
    title: string
    level: string
    section: string | null
    answer_type: string | null
    guidance: string | null
  }[]).map((t) => ({
    id: t.id,
    code: t.code,
    title: t.title,
    level: t.level,
    section: t.section,
    answerType: t.answer_type,
    guidance: t.guidance,
  }))

  const records: AppliedRecord[] = ((rec.data ?? []) as {
    id: string
    template_id: string | null
    subject_id: string | null
    subject_type: string | null
    level: string | null
    item: string | null
    status: string | null
  }[]).map((r) => ({
    id: r.id,
    templateId: r.template_id,
    subjectId: r.subject_id,
    subjectType: r.subject_type,
    level: r.level,
    item: r.item,
    status: r.status,
  }))

  const targets: Target[] = [...index.byKey.values()]
    .filter((s) => s.type === 'equipment' || s.type === 'component' || s.type === 'system' || s.type === 'subsystem')
    .map((s) => ({ id: s.id, type: s.type, code: s.code ?? s.name ?? '—' }))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))

  // ── The equipment kinds, with their tags ──
  //
  // Read straight from the two tables rather than from the subject index,
  // because the index has no Equipment level in it: the kind lives on
  // equipment_types, beside the tags rather than above them.
  const [{ data: kindRows }, { data: tagRows }] = await Promise.all([
    db.from('equipment_types').select('id, type_code, name').eq('project_id', projectId),
    db.from('equipment').select('id, tag_id, type_id').eq('project_id', projectId).not('type_id', 'is', null),
  ])
  const tagsByKind = new Map<string, Target[]>()
  for (const t of (tagRows ?? []) as { id: string; tag_id: string; type_id: string | null }[]) {
    if (!t.type_id) continue
    const list = tagsByKind.get(t.type_id)
    const entry: Target = { id: t.id, type: 'equipment', code: t.tag_id }
    if (list) list.push(entry)
    else tagsByKind.set(t.type_id, [entry])
  }
  const kinds: EquipmentKind[] = ((kindRows ?? []) as { id: string; type_code: string; name: string | null }[])
    .map((k) => ({
      id: k.id,
      code: k.name || k.type_code,
      tags: (tagsByKind.get(k.id) ?? []).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    }))
    .sort((a, b) => a.code.localeCompare(b.code))

  const byId = new Map(targets.map((t) => [t.id, t.code]))
  const typeById = new Map(records.map((r) => [r.subjectId ?? '', r.subjectType ?? '']))

  return {
    templates,
    records,
    targets,
    kinds,
    codeOf: (id) => {
      if (!id) return 'Unassigned'
      const direct = byId.get(id)
      if (direct) return direct
      const type = typeById.get(id)
      if (!type) return 'Unassigned'
      return index.byKey.get(refKey({ type, id }))?.code ?? 'Unassigned'
    },
    ready: true,
  }
}

/** The targets a template of this level may be applied to. */
export function targetsForLevel(targets: Target[], level: string): Target[] {
  const want = scopeOf(level)
  if (want === 'unknown') return targets
  return targets.filter((t) =>
    want === 'tag' ? t.type === 'equipment' || t.type === 'component' : t.type === 'system' || t.type === 'subsystem'
  )
}
