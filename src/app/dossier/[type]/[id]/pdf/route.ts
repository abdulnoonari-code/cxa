import { buildDossier } from '../../../report'
import { toPdf, pdfResponse, safeFileName } from '@/lib/docgen'
import { requireAccess } from '@/data/require-access'

export async function GET(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const refused = await requireAccess()
  if (refused) return refused
  const { type, id } = await params
  const built = await buildDossier(request.url, type, id)
  if (!built) return new Response('Not found', { status: 404 })
  return pdfResponse(await toPdf(built.report), safeFileName(`${built.fileStem}.pdf`))
}
