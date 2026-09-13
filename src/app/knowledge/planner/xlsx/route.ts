// The load bank plan, as a downloadable workbook.
//
// ── Why POST and not GET ─────────────────────────────────────────────────
//
// The drawing lives in the browser. It may never have been saved — an
// engineer sizing a bank at half past six should be able to take the
// workbook away without first creating a record. So the page sends what is
// on screen and gets a file back.
//
// The two pictures come the same way. The browser already knows how to turn
// its own SVG into a PNG — it does it for the PNG button — so it sends those
// too rather than this route trying to re-draw a canvas it cannot see.
//
// ── Every route handler calls requireAccess() ────────────────────────────
//
// Even this one, which reads nothing from the database. A route handler
// passes the proxy's "are you signed in" and never reaches the layout's "are
// you on a team here", and an assertion sweeps every handler and fails if one
// is missing the check. Exporting a workbook is not a reason to be the
// exception.

import { requireAccess } from '@/data/require-access'
import { getCurrentProject } from '@/lib/project'
import {
  cableResult, layoutFindings, summarise,
  type LayoutItem, type Cable, type CableResult, type LayoutOptions,
} from '@/lib/layout'
import { asItems, asCables, storedToItems, storedToCables, clampNum } from '@/lib/layout-io'
import { buildWorkbook, type PlanInput } from '@/lib/loadbank-plan'
import { VD_GUIDANCE } from '@/lib/techdesign'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const refused = await requireAccess()
  if (refused) return refused

  let body: unknown
  try { body = await request.json() } catch { return new Response('Unreadable request.', { status: 400 }) }
  const b = body as Record<string, unknown>

  const project = await getCurrentProject()
  const items: LayoutItem[] = storedToItems(asItems(b.items))
  const cables: Cable[] = storedToCables(asCables(b.cables))
  const roomW = clampNum(b.roomW, 1, 500, 24)
  const roomD = clampNum(b.roomD, 1, 500, 16)
  const ambientC = clampNum(b.ambientC, -20, 80, 35)
  const vd = VD_GUIDANCE.find((g) => g.id === b.vdGuidance) ?? VD_GUIDANCE[1]
  const opts: LayoutOptions = { ambientC, voltDropGuidance: vd.other }

  const results = cables
    .map((c) => cableResult(items, cables, c, opts))
    .filter((r): r is CableResult => r !== null)

  const input: PlanInput = {
    projectName: project?.name ?? 'No project',
    drawingName: String(b.drawingName ?? '').trim() || 'Untitled drawing',
    roomW, roomD, ambientC,
    vdGuidanceLabel: vd.label,
    vdGuidancePct: vd.other,
    items, cables, results,
    findings: layoutFindings(items, cables, roomW, roomD, opts),
    summary: summarise(items, cables, roomW, roomD, opts),
    generatedAt: new Date(),
  }

  const wb = buildWorkbook(input, {
    planPng: typeof b.planPng === 'string' ? b.planPng : null,
    singlePng: typeof b.singlePng === 'string' ? b.singlePng : null,
  })

  const buf = await wb.xlsx.writeBuffer()
  const safe = input.drawingName.replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 60) || 'load-bank-plan'
  return new Response(buf as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${safe} - load bank plan.xlsx"`,
      'cache-control': 'no-store',
    },
  })
}
