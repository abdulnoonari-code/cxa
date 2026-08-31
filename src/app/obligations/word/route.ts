import { buildObligationReport } from '../report'
import { toWord, wordResponse, safeFileName } from '@/lib/docgen'

export async function GET(request: Request) {
  const built = await buildObligationReport(request.url)
  if (!built) return new Response('No project found', { status: 404 })
  const buffer = await toWord(built.report)
  return wordResponse(buffer, safeFileName(`${built.project.name}-obligations.docx`))
}
