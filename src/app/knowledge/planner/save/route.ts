// The planner's one door to the database.
//
// ── Why a route handler and not a server action ──────────────────────────
//
// The planner is a public page. Anybody can open it and size a load bank
// without an account, which is deliberate — it holds no project data and an
// engineer standing in a switchroom should not have to sign in to use a
// calculator.
//
// Saving is the moment that stops being true. A saved layout belongs to a
// project, and a project belongs to a team. So the page needs to ASK whether
// it may save before it offers to, and a GET that answers that question is
// the simplest honest way to do it. A server action could not have been
// called from a page that may have no session at all without the same check
// anyway, and the answer here is a description the screen prints rather than
// a redirect.
//
// ── Every route handler calls requireAccess() ────────────────────────────
//
// proxy.ts asks "are you signed in". The page layout asks "are you on a team
// here". A route handler passes through the first and NEVER REACHES THE
// SECOND, so without this it would answer with the project's data to any
// signed-in account at all. This is the class fix, and an assertion sweeps
// every route handler and fails if one of them is missing it.

import { requireAccess } from '@/data/require-access'
import { getCurrentProject } from '@/lib/project'
import { layoutsAvailable, listLayouts, loadLayout, saveLayout, deleteLayout } from '@/data/layouts'
import { asItems, asCables, orphanCable, clampNum } from '@/lib/layout-io'

export const dynamic = 'force-dynamic'

/**
 * What the planner is allowed to do, and what is already saved.
 *
 * Three distinguishable answers, because they need three different sentences
 * on the screen:
 *   · not signed in            — the calculator works, saving does not
 *   · signed in, no project    — pick a project first
 *   · signed in, no part 39    — run the SQL step
 */
export async function GET(request: Request) {
  const refused = await requireAccess()
  if (refused) {
    return Response.json({
      canSave: false,
      reason: 'Sign in and open a project to save a drawing. Everything the planner calculates works without an account.',
      layouts: [],
    })
  }

  const project = await getCurrentProject()
  if (!project) {
    return Response.json({
      canSave: false,
      reason: 'No project is open. Choose one from All Projects and come back.',
      layouts: [],
    })
  }

  const available = await layoutsAvailable()
  if (!available.ok) {
    return Response.json({ canSave: false, reason: available.reason, project: { id: project.id, name: project.name }, layouts: [] })
  }

  const url = new URL(request.url)
  const wanted = url.searchParams.get('open')
  if (wanted) {
    const bundle = await loadLayout(project.id, wanted)
    if (!bundle) return Response.json({ error: 'That layout is not on this project.' }, { status: 404 })
    return Response.json({ canSave: true, project: { id: project.id, name: project.name }, bundle })
  }

  return Response.json({
    canSave: true,
    project: { id: project.id, name: project.name },
    layouts: await listLayouts(project.id),
  })
}

/**
 * Save, or delete.
 *
 * Validated here rather than trusted, because a route handler is reachable
 * directly and "the browser would never send that" is not a check.
 */
export async function POST(request: Request) {
  const refused = await requireAccess()
  if (refused) return refused

  const project = await getCurrentProject()
  if (!project) return Response.json({ ok: false, error: 'No project is open.' }, { status: 400 })

  const available = await layoutsAvailable()
  if (!available.ok) return Response.json({ ok: false, error: available.reason }, { status: 400 })

  let body: unknown
  try { body = await request.json() } catch { return Response.json({ ok: false, error: 'Unreadable request.' }, { status: 400 }) }
  const b = body as Record<string, unknown>

  if (b.action === 'delete') {
    const id = typeof b.layoutId === 'string' ? b.layoutId : ''
    if (!id) return Response.json({ ok: false, error: 'Which layout?' }, { status: 400 })
    const r = await deleteLayout(project.id, id)
    return Response.json(r, { status: r.ok ? 200 : 400 })
  }

  const name = String(b.name ?? '').trim()
  if (!name) return Response.json({ ok: false, error: 'Give the drawing a name — it is how you will find it again.' }, { status: 400 })
  if (name.length > 120) return Response.json({ ok: false, error: 'That name is too long to print on a drawing. Keep it under 120 characters.' }, { status: 400 })

  const items = asItems(b.items)
  const cables = asCables(b.cables)
  // A drawing with a cable to nothing is not a drawing. Refused rather than
  // stored and discovered on the way back in.
  const orphan = orphanCable(items, cables)
  if (orphan)
    return Response.json({ ok: false, error: 'A cable on the drawing points at equipment that is not on it. Nothing was saved.' }, { status: 400 })

  const r = await saveLayout(project.id, {
    layoutId: typeof b.layoutId === 'string' && b.layoutId ? b.layoutId : null,
    name,
    subjectType: typeof b.subjectType === 'string' ? b.subjectType : 'project',
    subjectId: typeof b.subjectId === 'string' && b.subjectId ? b.subjectId : null,
    roomW: clampNum(b.roomW, 1, 500, 24),
    roomD: clampNum(b.roomD, 1, 500, 16),
    ambientC: clampNum(b.ambientC, -20, 80, 35),
    vdGuidance: typeof b.vdGuidance === 'string' ? b.vdGuidance : 'iec-b',
    items,
    cables,
  })
  return Response.json(r, { status: r.ok ? 200 : 400 })
}
