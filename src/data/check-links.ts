import { supabase } from '@/lib/supabase'
import { loadSubjectIndex } from '@/data/subjects'
import { sheetOf, type CheckLinkInput, type LinkContext, type LinkTarget } from '@/lib/check-links'

/**
 * Everything the Links to column might point at, in four small queries.
 *
 * Loaded once per page rather than once per check: a screen showing forty
 * checks, each with three links, would otherwise be a hundred and twenty
 * round trips to resolve labels that all come from the same four tables.
 *
 * Sibling checks are kept grouped BY SHEET. Two scripts on one project will
 * both have a line 12, and a link on one script must never resolve to the
 * other one's line 12 — it would silently point at a different piece of plant
 * and read as though it had been verified.
 */
export type ProjectLinkContext = {
  bySheet: Map<string, Map<string, LinkTarget>>
  subjects: Map<string, LinkTarget>
  records: Map<string, LinkTarget>
}

export async function loadProjectLinkContext(projectId: string | null): Promise<ProjectLinkContext> {
  const empty: ProjectLinkContext = { bySheet: new Map(), subjects: new Map(), records: new Map() }
  if (!projectId) return empty

  const [{ data: sibs }, { data: reqs }, { data: obls }, index] = await Promise.all([
    supabase
      .from('checklist_items')
      .select('id, serial_no, item, status, source_ref')
      .eq('project_id', projectId)
      .not('source_ref', 'is', null),
    supabase.from('requirements').select('ref, title').eq('project_id', projectId),
    supabase.from('obligations').select('ref, statement').eq('project_id', projectId),
    loadSubjectIndex(projectId),
  ])

  const bySheet = new Map<string, Map<string, LinkTarget>>()
  for (const r of (sibs ?? []) as {
    id: string
    serial_no: string | null
    item: string | null
    status: string | null
    source_ref: string | null
  }[]) {
    const sheet = sheetOf(r.source_ref)
    if (!sheet || !r.serial_no) continue
    const m = bySheet.get(sheet) ?? new Map<string, LinkTarget>()
    m.set(r.serial_no, {
      label: (r.item ?? '').slice(0, 70),
      href: `/checklists#check-${r.id}`,
      status: r.status,
    })
    bySheet.set(sheet, m)
  }

  const subjects = new Map<string, LinkTarget>()
  for (const s of index.byKey.values()) {
    if (s.type === 'project') continue
    if (s.code) subjects.set(s.code.trim().toLowerCase(), { label: s.code, href: '/equipment' })
  }

  const records = new Map<string, LinkTarget>()
  for (const r of (reqs ?? []) as { ref: string | null; title: string | null }[]) {
    if (r.ref) records.set(r.ref.trim().toLowerCase(), { label: `${r.ref} — ${(r.title ?? '').slice(0, 50)}`, href: '/requirements' })
  }
  for (const o of (obls ?? []) as { ref: string | null; statement: string | null }[]) {
    if (o.ref) records.set(o.ref.trim().toLowerCase(), { label: `${o.ref} — ${(o.statement ?? '').slice(0, 50)}`, href: '/obligations' })
  }

  return { bySheet, subjects, records }
}

/** The view of that context a single check sees — only its own sheet. */
export function contextFor(ctx: ProjectLinkContext, sourceRef: string | null | undefined): LinkContext {
  const sheet = sheetOf(sourceRef)
  return {
    siblings: (sheet ? ctx.bySheet.get(sheet) : undefined) ?? new Map(),
    subjects: ctx.subjects,
    records: ctx.records,
  }
}

/** Every check on the project, in the shape the link findings read. */
export async function loadCheckLinkInputs(projectId: string | null): Promise<CheckLinkInput[]> {
  if (!projectId) return []

  const [{ data: checks }, { data: files }] = await Promise.all([
    supabase
      .from('checklist_items')
      .select('id, serial_no, item, status, links_to, evidence_ref, source_ref')
      .eq('project_id', projectId),
    supabase.from('attachments').select('checklist_item_id').eq('project_id', projectId),
  ])

  const counts = new Map<string, number>()
  for (const f of (files ?? []) as { checklist_item_id: string | null }[]) {
    if (!f.checklist_item_id) continue
    counts.set(f.checklist_item_id, (counts.get(f.checklist_item_id) ?? 0) + 1)
  }

  return ((checks ?? []) as {
    id: string
    serial_no: string | null
    item: string | null
    status: string | null
    links_to: string | null
    evidence_ref: string | null
    source_ref: string | null
  }[]).map((c) => ({
    id: c.id,
    sheet: sheetOf(c.source_ref),
    serial: c.serial_no,
    item: c.item,
    status: c.status,
    links: c.links_to,
    evidenceRef: c.evidence_ref,
    attachments: counts.get(c.id) ?? 0,
  }))
}
