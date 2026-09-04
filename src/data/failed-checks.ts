import { supabase } from '@/lib/supabase'
import { sheetOf } from '@/lib/check-links'
import type { FailedCheck } from '@/lib/failed-checks'

export type FailedCheckLoad = {
  checks: FailedCheck[]
  /** Checklist item ids that already have a punch item against them — open or closed. */
  raisedFor: Set<string>
}

/**
 * Every failed check on the project, and which of them already have an item.
 *
 * Two queries. The second asks the issues table which checks it points at,
 * rather than asking each check whether anything points at it, because the
 * second shape is one round trip per check.
 */
export async function loadFailedChecks(projectId: string | null): Promise<FailedCheckLoad> {
  if (!projectId) return { checks: [], raisedFor: new Set() }

  const [{ data: rows }, { data: issues }] = await Promise.all([
    supabase
      .from('checklist_items')
      .select(
        'id, serial_no, item, section_path, level, status, notes, evidence_ref, source_ref, subject_type, subject_id, equipment_id'
      )
      .eq('project_id', projectId)
      .eq('status', 'fail'),
    supabase.from('issues').select('checklist_item_id').eq('project_id', projectId).not('checklist_item_id', 'is', null),
  ])

  const raisedFor = new Set(
    ((issues ?? []) as { checklist_item_id: string | null }[])
      .map((i) => i.checklist_item_id)
      .filter((id): id is string => !!id)
  )

  const checks: FailedCheck[] = ((rows ?? []) as {
    id: string
    serial_no: string | null
    item: string | null
    section_path: string | null
    level: string | null
    status: string | null
    notes: string | null
    evidence_ref: string | null
    source_ref: string | null
    subject_type: string | null
    subject_id: string | null
    equipment_id: string | null
  }[]).map((r) => ({
    id: r.id,
    serial: r.serial_no,
    sheet: sheetOf(r.source_ref),
    item: r.item,
    section: r.section_path,
    level: r.level,
    status: r.status,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    equipmentId: r.equipment_id,
    remark: r.notes,
    evidenceRef: r.evidence_ref,
  }))

  return { checks, raisedFor }
}
