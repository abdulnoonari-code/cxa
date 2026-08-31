import { buildValidityReport } from '../report'
import { toPdf, pdfResponse, safeFileName } from '@/lib/docgen'

export async function GET(request: Request) {
  const built = await buildValidityReport(request.url)
  if (!built) return new Response('No project found', { status: 404 })
  return pdfResponse(await toPdf(built.report), safeFileName(`${built.project.name}-validity-review.pdf`))
}
