import { supabase } from '@/lib/supabase'
import { selectWithFallback } from '@/lib/pg-columns'
import { buildAssetReport, type AssetReport, type SystemRow, type TypeRow, type TagRow } from '@/lib/asset-report'
import { CATEGORIES, INSTALL_STATUSES } from '@/app/equipment/styles'

export type AssetReportLoad = {
  report: AssetReport
  /** Columns this database has not got yet. Shown on the page, never swallowed. */
  missing: string[]
  error: string | null
}

const label = (options: { value: string; label: string }[]) => (v: string) =>
  options.find((o) => o.value === v)?.label ?? v

/**
 * Everything the asset report needs, in three queries.
 *
 * All three go through `selectWithFallback`, because this report reads
 * nearly every column the asset tables have and several of them arrive
 * with different SQL steps — `building`, `floor` and `critical` in parts
 * 31 and 32, `type_id` in part 35. Asking for a column the database has
 * not got fails the WHOLE query, so one un-run step would otherwise turn
 * the entire report into an empty page with nothing on it explaining why.
 *
 * A column that is missing behaves exactly as a column full of blanks,
 * which is what it effectively is — and the findings that depend on it
 * then report every row, which is honest and is why the page prints the
 * missing-column banner above them.
 */
export async function loadAssetReport(projectId: string | null): Promise<AssetReportLoad> {
  const labels = { category: label(CATEGORIES), status: label(INSTALL_STATUSES) }
  if (!projectId) return { report: buildAssetReport([], [], [], labels), missing: [], error: null }

  const [sysRes, typeRes, tagRes] = await Promise.all([
    selectWithFallback<SystemRow>(
      ['id', 'system_id', 'name', 'discipline', 'building', 'area', 'floor'],
      async (cols) => {
        const r = await supabase.from('systems').select(cols.join(', ')).eq('project_id', projectId)
        return { data: r.data as unknown as SystemRow[] | null, error: r.error }
      }
    ),
    selectWithFallback<TypeRow>(['id', 'type_code', 'name', 'manufacturer', 'model', 'category'], async (cols) => {
      const r = await supabase.from('equipment_types').select(cols.join(', ')).eq('project_id', projectId)
      return { data: r.data as unknown as TypeRow[] | null, error: r.error }
    }),
    selectWithFallback<TagRow>(
      [
        'id', 'tag_id', 'description', 'category', 'manufacturer', 'model',
        'location', 'building', 'floor', 'install_status', 'critical',
        'system_id', 'subsystem_id', 'type_id',
      ],
      async (cols) => {
        const r = await supabase.from('equipment').select(cols.join(', ')).eq('project_id', projectId)
        return { data: r.data as unknown as TagRow[] | null, error: r.error }
      }
    ),
  ])

  // The equipment_types table itself may not exist yet — part 35. That is
  // an empty catalogue, not a broken report: every other section still
  // answers, and the "not linked to a type" finding tells the truth.
  const typesMissing = typeRes.error !== null

  return {
    report: buildAssetReport(sysRes.rows, typesMissing ? [] : typeRes.rows, tagRes.rows, labels),
    missing: Array.from(new Set([...sysRes.missing, ...typeRes.missing, ...tagRes.missing])),
    error: sysRes.error ?? tagRes.error,
  }
}
