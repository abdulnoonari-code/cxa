import { accessVerdict } from '@/data/gate'
import { mayUseApp } from '@/lib/gate'

/**
 * The gate, for a Server Action.
 *
 * ── Why an action needs its own call ─────────────────────────────────────
 *
 * There are three ways into this application and they were guarded by two
 * checks:
 *
 *   proxy.ts    — "are you signed in at all?"   (authentication)
 *   layout.tsx  — "are you on a team here?"     (authorisation, for pages)
 *   route handlers — requireAccess(), added in update 90
 *   SERVER ACTIONS — nothing
 *
 * A Server Action is a POST to a URL with a header naming the function. It
 * passes the proxy, because the caller is signed in. It never reaches the
 * layout, because the action body runs BEFORE anything is re-rendered. So
 * the layout refusing to draw a screen has no bearing whatsoever on whether
 * the function behind that screen can be called.
 *
 * Reproduced in this repository on 26 September 2026, against this version
 * of Next, in a route whose layout refused every request:
 *
 *     curl -X POST .../rsctest/inner \
 *          -H "Next-Action: 0089178ca909f96b77fc7bd7b1f6b3e3718f6c98bf" \
 *          -H "Content-Type: text/plain;charset=UTF-8" --data '[]'
 *
 *     → 200, and the action's side effect had happened.
 *
 * The action id is not a secret either: it is inlined into the HTML of the
 * page it belongs to, which — see require-page.tsx — a refused account can
 * still fetch. So the ids are harvested from the same response that was
 * supposed to be a refusal.
 *
 * Next's documentation is unambiguous:
 *
 *   "Treat Server Actions with the same security considerations as
 *    public-facing API endpoints, and verify if the user is allowed to
 *    perform a mutation."
 *
 * Before this file, 37 of the 38 action files in this application did not.
 * Every create, update and delete on the job — equipment, checklists, test
 * records, gates, signatures, hold points, team membership — was callable by
 * any account that could sign up, on a site whose own gate file says
 * "Supabase allows anybody to create an account by default".
 *
 * ── How to use it ────────────────────────────────────────────────────────
 *
 *   export async function deleteEquipment(id: string) {
 *     await requireActor()
 *     ...
 *   }
 *
 * FIRST STATEMENT, before reading the form data and before any query.
 *
 * ── Why this one throws when the other two return ────────────────────────
 *
 * `requireAccess()` returns a Response and `requirePage()` returns an
 * element, because a route handler and a page both have to answer with
 * something, and something is better than a blank screen.
 *
 * An action has no such obligation, and the ways of returning are worse than
 * throwing. Actions here have thirty different return shapes — some return
 * an outcome object, some redirect, some return nothing — so there is no one
 * refusal value that fits them all. Worse, a refusal returned as an ordinary
 * value can be ignored by a caller that does not check it, and the action
 * would then have "refused" while carrying on. A throw cannot be ignored.
 *
 * The message is the same for every refusal and says nothing about what was
 * asked for. Whether a record exists is not something a refused caller
 * should be able to learn by comparing two errors.
 *
 * ── The one that is not forgotten ────────────────────────────────────────
 *
 * `src/checks/access.check.mts` walks every file in the application that
 * begins with 'use server', and fails if an exported async function in it
 * does not call this — with a named list of the functions that are
 * deliberately exempt, which is the sign-in path and nothing else.
 */
export async function requireActor(): Promise<void> {
  const verdict = await accessVerdict()
  if (mayUseApp(verdict)) return
  throw new Error('You are not signed in to a project on this site.')
}
