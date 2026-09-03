// Loading photo evidence for punch items.
//
// Kept apart from `data/punchlist.ts` because the photos arrive with SQL part
// 21 and the punch list has to keep working without them. If the table is not
// there yet, every query here fails on its own and the screens render with no
// photos and a banner naming the script — the same pattern as the ITP.

import { supabase } from '@/lib/supabase'
import type { PhotoKind } from '@/lib/photo'

export type IssuePhoto = {
  id: string
  project_id: string
  issue_id: string
  kind: PhotoKind
  file_name: string | null
  file_path: string | null
  file_url: string | null
  content_type: string | null
  size_bytes: number | null
  caption: string | null
  taken_at: string | null
  uploaded_by_name: string | null
  created_at: string | null
  ai_model: string | null
  ai_reviewed_at: string | null
  ai_reviewed_by_name: string | null
  ai_confidence: string | null
  ai_problem: string | null
  ai_recommendation: string | null
  ai_raw: string | null
}

const COLUMNS =
  'id, project_id, issue_id, kind, file_name, file_path, file_url, content_type, size_bytes, caption, ' +
  'taken_at, uploaded_by_name, created_at, ai_model, ai_reviewed_at, ai_reviewed_by_name, ai_confidence, ' +
  'ai_problem, ai_recommendation, ai_raw'

export type PhotoLoad = {
  byIssue: Map<string, IssuePhoto[]>
  all: IssuePhoto[]
  /** False when SQL part 21 has not been run yet. */
  schemaReady: boolean
}

export async function loadIssuePhotos(projectId: string | null): Promise<PhotoLoad> {
  const empty: PhotoLoad = { byIssue: new Map(), all: [], schemaReady: true }
  if (!projectId) return empty

  const { data, error } = await supabase
    .from('issue_photos')
    .select(COLUMNS)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) return { byIssue: new Map(), all: [], schemaReady: false }

  const all = (data ?? []) as unknown as IssuePhoto[]
  const byIssue = new Map<string, IssuePhoto[]>()
  for (const p of all) {
    const list = byIssue.get(p.issue_id)
    if (list) list.push(p)
    else byIssue.set(p.issue_id, [p])
  }
  // Defect photos before fix photos, so a card reads before-then-after in the
  // order somebody would look at them.
  for (const list of byIssue.values()) {
    list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'defect' ? -1 : 1
      return (a.created_at ?? '').localeCompare(b.created_at ?? '')
    })
  }

  return { byIssue, all, schemaReady: true }
}

export async function loadPhoto(id: string, projectId: string | null): Promise<IssuePhoto | null> {
  if (!projectId) return null
  const { data, error } = await supabase
    .from('issue_photos')
    .select(COLUMNS)
    .eq('id', id)
    .eq('project_id', projectId)
    .single()
  if (error) return null
  return (data as unknown as IssuePhoto) ?? null
}

/**
 * Download one photograph's bytes straight out of the storage bucket.
 *
 * Passed into `prepareGallery` so `lib/photo-prep.ts` stays free of Supabase
 * — the library is about shrinking and capping images, and it is asserted
 * without a database anywhere near it.
 */
export async function downloadPhotoBytes(path: string): Promise<{ data: Blob | null; error: unknown }> {
  const { data, error } = await supabase.storage.from('documents').download(path)
  return { data: (data as Blob | null) ?? null, error }
}
