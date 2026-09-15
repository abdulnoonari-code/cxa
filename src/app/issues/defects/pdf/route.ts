import { buildDefectReport } from '../../defect-report'
import { toPdf, pdfResponse, safeFileName } from '@/lib/docgen'
import { requireAccess } from '@/data/require-access'

export async function GET(request: Request) {
  const refused = await requireAccess()
  if (refused) return refused

  const built = await buildDefectReport(request.url)
  if (!built) return new Response('No project found', { status: 404 })
  return pdfResponse(await toPdf(built.report), safeFileName(`${built.project.name}-defect-report.pdf`))
}
