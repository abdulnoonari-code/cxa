import { buildTestReport } from '../report'
import { toWord, wordResponse, safeFileName } from '@/lib/docgen'

export async function GET(request: Request) {
  const built = await buildTestReport(request.url)
  if (!built) return new Response('No project found', { status: 404 })
  return wordResponse(await toWord(built.report), safeFileName(`${built.project.name}-test-register.docx`))
}
