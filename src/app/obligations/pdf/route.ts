import { buildObligationReport } from '../report'
import { toPdf, pdfResponse, safeFileName } from '@/lib/docgen'

export async function GET(request: Request) {
  const built = await buildObligationReport(request.url)
  if (!built) return new Response('No project found', { status: 404 })
  const buffer = await toPdf(built.report)
  return pdfResponse(buffer, safeFileName(`${built.project.name}-obligations.pdf`))
}
