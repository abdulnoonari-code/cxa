import { getCurrentProject } from '@/lib/project'
import { loadPhoto } from '@/data/photos'

// Download a photograph with its original filename.
//
// The file itself sits in Supabase storage and could be linked directly, but a
// direct link opens the image in a tab under a machine-generated name. On a
// punch list the file that lands in somebody's Downloads folder needs to say
// which item it belongs to, because it is going to be attached to an email
// and looked at a week later.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await getCurrentProject()
  if (!project) return new Response('No project selected', { status: 404 })

  const photo = await loadPhoto(id, project.id)
  if (!photo?.file_url) return new Response('Not found', { status: 404 })

  const upstream = await fetch(photo.file_url, { cache: 'no-store' })
  if (!upstream.ok) {
    return new Response('The photograph could not be fetched from storage.', { status: 502 })
  }

  const name = (photo.file_name ?? `${photo.kind}-${id}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_')

  return new Response(await upstream.arrayBuffer(), {
    headers: {
      'content-type': photo.content_type ?? 'application/octet-stream',
      'content-disposition': `attachment; filename="${photo.kind}-${name}"`,
      'cache-control': 'no-store',
    },
  })
}
