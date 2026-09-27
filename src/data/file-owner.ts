import { supabase } from '@/lib/supabase'
import type { Verdict } from '@/lib/gate'

/**
 * Is this stored file referenced by a record on a project the caller may open?
 *
 * ── The hole ────────────────────────────────────────────────────────────
 *
 * `/file/[...path]` asked one question — "may this account use the
 * application?" — and then signed a URL for whatever path it was given.
 * `safePath()` refuses `..`, absolute paths, backslashes and null bytes, so
 * nobody could climb out of the bucket. Nobody needed to. Everything is
 * already in the bucket.
 *
 * And the paths are guessable, because the application builds them:
 *
 *     project/<project_id>/<timestamp>-<name>      project files
 *     revisions/<revision_id>/<timestamp>-<name>   controlled documents
 *
 * `project_id` is exactly the thing that shows on the projects list. So a
 * member of one job could read every photograph, drawing, certificate and
 * contract in the store, on every job, by asking for it.
 *
 * ── Why this is a lookup rather than reading the path ────────────────────
 *
 * The obvious fix is to split `project/<id>/…` and compare `<id>`. It is
 * the wrong fix, twice over:
 *
 *   · It only works for the one shape that carries a project id in it.
 *     `revisions/<revision_id>/…` does not, and a photograph does not.
 *   · It trusts a naming convention to carry a security decision. Somebody
 *     changes how a path is built in eight months — for a good reason, like
 *     collisions — and the door opens with nothing anywhere saying so.
 *
 * So the question asked here is the real one: IS THERE A RECORD, ON A
 * PROJECT YOU MAY OPEN, THAT POINTS AT THIS FILE? If no record points at
 * it, nobody may have it, which is also the right answer for an orphan left
 * behind by a delete.
 *
 * ── The four tables ──────────────────────────────────────────────────────
 *
 * Every column in the schema that holds a storage path:
 *
 *     attachments.file_path          evidence against a check
 *     document_revisions.file_path   a controlled document revision
 *     issue_photos.file_path         a defect photograph
 *     project_files.file_path        the project file library
 *
 * `document_revisions` has no project_id, so it is reached through its
 * document. An assertion checks this list against schema.sql, so a fifth
 * column added later cannot be silently unguarded.
 *
 * ── Legacy rows ──────────────────────────────────────────────────────────
 *
 * Rows written before update 90 hold a full public URL in `file_path`
 * rather than a bare path. They are matched with a suffix comparison as
 * well as an equality one — the same reason `viewUrl()` and
 * `pathFromPublicUrl()` exist. Migrating a live database was avoided then
 * and is still avoided now.
 */

/** Table, and how it reaches a project. */
const PATH_COLUMNS: { table: string; direct: boolean; via?: string; parent?: string }[] = [
  { table: 'attachments', direct: true },
  { table: 'issue_photos', direct: true },
  { table: 'project_files', direct: true },
  { table: 'document_revisions', direct: false, via: 'document_id', parent: 'controlled_documents' },
]

/** For the assertion suite. */
export const FILE_PATH_TABLES = PATH_COLUMNS.map((c) => c.table)

/** Which projects may this verdict open? `null` means every project (owner). */
function scopeOf(verdict: Verdict): string[] | null {
  if (verdict.state === 'owner') return null
  if (verdict.state === 'unconfigured') return null
  if (verdict.state === 'member') return verdict.projectIds
  return []
}

export async function mayReadStoredFile(verdict: Verdict, path: string): Promise<boolean> {
  const scope = scopeOf(verdict)
  if (scope !== null && scope.length === 0) return false

  // Equality first — every row written since update 90 is a bare path — and
  // a suffix match second, for the legacy rows holding a whole public URL.
  const match = `file_path.eq.${path},file_path.like.%/${path}`

  for (const col of PATH_COLUMNS) {
    if (col.direct) {
      let q = supabase.from(col.table).select('id').or(match).limit(1)
      if (scope !== null) q = q.in('project_id', scope)
      const { data } = await q
      if (data && data.length > 0) return true
      continue
    }

    const { data: rows } = await supabase.from(col.table).select(col.via!).or(match).limit(20)
    const parentIds = (rows ?? [])
      .map((r) => (r as unknown as Record<string, unknown>)[col.via!])
      .filter((v): v is string => typeof v === 'string')
    if (parentIds.length === 0) continue
    if (scope === null) return true
    let pq = supabase.from(col.parent!).select('id').in('id', parentIds).limit(1)
    pq = pq.in('project_id', scope)
    const { data: parents } = await pq
    if (parents && parents.length > 0) return true
  }

  return false
}
