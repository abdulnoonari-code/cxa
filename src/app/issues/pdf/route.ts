import { buildPunchReport } from '../report'
import { toPdf, pdfResponse, safeFileName } from '@/lib/docgen'

export async function GET(request: Request) {
  const built = await buildPunchReport(request.url)
  if (!built) return new Response('No project found', { status: 404 })
  return pdfResponse(await toPdf(built.report), safeFileName(`${built.project.name}-punchlist.pdf`))
}
