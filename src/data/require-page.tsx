import { accessVerdict } from '@/data/gate'
import { mayUseApp } from '@/lib/gate'
import NoAccess from '@/components/NoAccess'

/**
 * The gate, for a page.
 *
 * ── Why a page needs its own call, when the layout already has one ───────
 *
 * Because the layout's check does not stop the page from running, and does
 * not stop what the page rendered from being sent to the browser.
 *
 * `layout.tsx` refuses by rendering <NoAccess/> INSTEAD OF {children}. That
 * reads like a door. It is not one. The page segment is rendered by the
 * router, not by the layout, so it runs anyway — and its output is inlined
 * into the HTML response as React flight data. The browser shows the
 * refusal. The response body contains the tag list.
 *
 * This is not a guess. It was reproduced in this repository against this
 * version of Next, on 26 September 2026: a layout that rendered a refusal
 * instead of its children, a child page that rendered the string
 * SECRET-9f3a-SUDB-MV-SWGR-TAGLIST, and then:
 *
 *     curl .../rsctest/inner | grep -c SECRET-9f3a     →  1
 *
 * with the visible text being "REFUSED: you are not on a team on this
 * site." One `curl` and a refused account reads the job.
 *
 * Next's own documentation says it plainly, and it is worth quoting because
 * the sentence is easy to read past:
 *
 *   "A layout also does not control whether the rest of the route renders.
 *    Route segments and parallel route slots are rendered by the router, so
 *    a layout that hides or swaps them does not stop them from running or
 *    from appearing in the RSC Payload."
 *
 * ── The thing that surprised me, and is worth knowing ────────────────────
 *
 * Making the layout `redirect()` instead of swapping children DOES NOT FIX
 * IT. The response comes back 307 — and still carries the secret in its
 * body, because the child had already rendered by the time the redirect was
 * thrown. Also reproduced. A redirect is a header; the leak is in the body.
 *
 * Refusing in the PAGE leaks nothing, because then there is nothing rendered
 * to leak. Same test, same build: 0 occurrences.
 *
 * ── How to use it ────────────────────────────────────────────────────────
 *
 *   export default async function Page() {
 *     const refused = await requirePage()
 *     if (refused) return refused
 *     ...
 *   }
 *
 * FIRST STATEMENT IN THE FUNCTION, before any query. A gate after a fetch
 * still fetched, and on a site that bills per read that is a cost as well as
 * a leak.
 *
 * It returns an element to return, or null to carry on — the same shape as
 * `requireAccess()` for route handlers, for the same reason: a boolean
 * invites `if (!ok) return` with no body, and a page that returns nothing
 * renders as a blank screen rather than as a refusal.
 *
 * `accessVerdict` is wrapped in React's `cache`, so calling it here as well
 * as in the layout costs one query per request, not two.
 *
 * ── The one that is not forgotten ────────────────────────────────────────
 *
 * "Thirty-odd screens, and the one somebody forgets to add it to is the one
 * that leaks" is the argument that put this check in the layout in the first
 * place, and it is a good argument. The answer is not to trust anybody to
 * remember: `src/checks/access.check.mts` walks every page file in the
 * application and fails if one does not call this, with a named list of the
 * pages that are deliberately public. That is the same way every route
 * handler is held to `requireAccess()`.
 */
export async function requirePage(): Promise<React.ReactElement | null> {
  const verdict = await accessVerdict()
  if (mayUseApp(verdict)) return null
  return <NoAccess verdict={verdict} />
}
