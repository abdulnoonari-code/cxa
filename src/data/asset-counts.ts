// How much of the asset list is actually there.
//
// ── Why a count, on the page with the buttons ───────────────────────────
//
// "you have the project asset list on one file" — and the honest answer to
// "do I?" was, until now, go and look at four other screens and add up.
//
// The Export button on its own tells you nothing about whether the last
// import worked. Five numbers beside it do, and they are the five things
// the one file builds. An import that went in wrong shows up here as a
// count that is not what you expected, on the same screen where you pressed
// the button — rather than at handover, when somebody finally counts.

import { supabase } from '@/lib/supabase'

export type AssetCount = { label: string; n: number }

/**
 * The five things the asset list builds, counted.
 *
 * Every count is scoped to the project. `subsystems` carries no project_id
 * of its own, so it is counted through this project's systems — an
 * unfiltered count there would report every other job's bays as this job's,
 * which is the kind of wrong that looks plausible.
 *
 * A table that does not exist yet (a database missing an SQL step) counts
 * as zero rather than failing the page. A missing number is a smaller
 * problem than a screen that will not load.
 */
export async function loadAssetCounts(projectId: string | null): Promise<AssetCount[]> {
  const zero: AssetCount[] = [
    { label: 'Assets', n: 0 },
    { label: 'Systems', n: 0 },
    { label: 'Subsystems', n: 0 },
    { label: 'Equipment types', n: 0 },
    { label: 'Tags', n: 0 },
  ]
  if (!projectId) return zero

  const [areas, systems, types, tags] = await Promise.all([
    supabase.from('areas').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    supabase.from('systems').select('id').eq('project_id', projectId),
    supabase.from('equipment_types').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    supabase.from('equipment').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
  ])

  const systemIds = ((systems.data ?? []) as { id: string }[]).map((s) => s.id)
  const subs = systemIds.length
    ? await supabase
        .from('subsystems')
        .select('id', { count: 'exact', head: true })
        .in('system_id', systemIds)
    : { count: 0 }

  return [
    { label: 'Assets', n: areas.count ?? 0 },
    { label: 'Systems', n: systemIds.length },
    { label: 'Subsystems', n: subs.count ?? 0 },
    { label: 'Equipment types', n: types.count ?? 0 },
    { label: 'Tags', n: tags.count ?? 0 },
  ]
}
