import { buildObligationReport } from '../report'
import { toPdf, pdfResponse, safeFileName } from '@/lib/docgen'
import { requireAccess } from '@/data/require-access'

export async function GET(request: Request) {
  const refused = await requireAccess()
  if (refused) return refused

  const built = await buildObligationReport(request.url)
  if (!built) return new Response('No project found', { status: 404 })
  const buffer = await toPdf(built.report)
  return pdfResponse(buffer, safeFileName(`${built.project.name}-obligations.pdf`))
}
