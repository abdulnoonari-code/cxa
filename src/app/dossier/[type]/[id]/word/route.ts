import { buildDossier } from '../../../report'
import { toWord, wordResponse, safeFileName } from '@/lib/docgen'

export async function GET(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params
  const built = await buildDossier(request.url, type, id)
  if (!built) return new Response('Not found', { status: 404 })
  return wordResponse(await toWord(built.report), safeFileName(`${built.fileStem}.docx`))
}
