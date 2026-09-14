import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { loadPhoto } from '@/data/photos'
import { requireAccess } from '@/data/require-access'
import { pathFromPublicUrl, refusalText, BUCKET } from '@/lib/file-url'

export const dynamic = 'force-dynamic'

// Download a photograph with its original filename.
//
// The file could be linked directly, but a direct link opens the image in a
// tab under a machine-generated name. On a punch list the file that lands in
// somebody's Downloads folder needs to say which item it belongs to, because
// it is going to be attached to an email and looked at a week later.
//
// ── WHERE THE BYTES COME FROM, AND WHY IT MATTERS ───────────────────────
//
// This used to `fetch(photo.file_url)` — reaching back out to a public
// storage address over the internet to collect a file this server already
// has a key for. That was wrong twice over.
//
// The obvious way: the address itself needed no sign-in, so anybody holding
// it had the photograph. SQL part 38 closed the bucket, which fixed the
// address and broke this route at the same moment — a private bucket
// answers that fetch with a refusal, and the download turned into a 502
// nobody could explain.
//
// The quieter way: a route handler is answered without the layout ever
// running, so the check that guards every page never ran here at all.
//
// Both are closed. The gate is called first, by name. The bytes are then
// pulled straight out of storage with the server key — no round trip to the
// public internet, and nothing that depends on the bucket being open.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const refused = await requireAccess()
  if (refused) return refused

  const { id } = await params
  const project = await getCurrentProject()
  if (!project) return new Response('No project selected', { status: 404 })

  const photo = await loadPhoto(id, project.id)
  if (!photo) return new Response(refusalText('not-found'), { status: 404 })

  // file_path is the truth. file_url is consulted only to recover the path
  // out of a row written before the file store was closed — those rows hold
  // a public address and no path, and they must keep working.
  const path = (photo.file_path ?? '').trim() || pathFromPublicUrl(photo.file_url)
  if (!path) return new Response(refusalText('not-found'), { status: 404 })

  const { data: blob, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !blob) return new Response(refusalText('failed'), { status: 502 })

  const name = (photo.file_name ?? `${photo.kind}-${id}.jpg`)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')

  return new Response(await blob.arrayBuffer(), {
    headers: {
      'content-type': photo.content_type ?? 'application/octet-stream',
      'content-disposition': `attachment; filename="${photo.kind}-${name}"`,
      'cache-control': 'no-store',
    },
  })
}
