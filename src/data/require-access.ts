import { accessVerdict } from '@/data/gate'
import { mayUseApp } from '@/lib/gate'

/**
 * The gate, for a route handler.
 *
 * ── Why route handlers need their own call ───────────────────────────────
 *
 * There are two checks in front of this application and they answer
 * different questions:
 *
 *   proxy.ts   — "are you signed in at all?"      (authentication)
 *   layout.tsx — "are you on a team here?"        (authorisation)
 *
 * A route handler passes through the first and NEVER REACHES THE SECOND.
 * The layout is part of rendering a page; a request for
 * /equipment/export is answered by the route handler directly and no
 * layout runs. So every one of them was answering with the project's data
 * to any signed-in account at all — including an account created before
 * sign-up was closed, which the layout has been refusing at the front door
 * the whole time. The person is bounced off every screen and can still
 * pull the complete tag list, the punch list, and every PDF.
 *
 * This was found while fixing the file store in update 90: two routes were
 * given the check because they were being edited anyway. That is fixing an
 * instance. This is the class — every route handler calls this, and an
 * assertion sweeps all of them and fails if one does not.
 *
 * ── How to use it ────────────────────────────────────────────────────────
 *
 *   export async function GET() {
 *     const refused = await requireAccess()
 *     if (refused) return refused
 *     ...
 *   }
 *
 * It returns a Response to send, or null to carry on. Not a boolean and
 * not a throw: a boolean invites `if (!ok) return` with no body, and a
 * throw in a route handler becomes a 500, which tells a stranger the
 * server broke rather than that they are not welcome.
 */
export async function requireAccess(): Promise<Response | null> {
  const verdict = await accessVerdict()
  if (mayUseApp(verdict)) return null

  // The same words for every refusal, and nothing about what was asked
  // for. Whether a file, a project or an export exists is not something a
  // refused caller should be able to learn by comparing two messages.
  return new Response('You are not signed in to a project on this site.', {
    status: 403,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
