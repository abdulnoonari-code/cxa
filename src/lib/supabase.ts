// Server-side database access.
//
// ─────────────────────────────────────────────────────────────────────────
// WHY THE KEY ON THIS LINE MATTERS MORE THAN ANY OTHER LINE HERE
// ─────────────────────────────────────────────────────────────────────────
//
// This file used to hold the ANON key — the one whose name begins
// NEXT_PUBLIC_. In Next.js, NEXT_PUBLIC_ does not mean "convenient". It
// means "compiled into the JavaScript that every visitor downloads". Anybody
// who opens the site, presses F12 and looks at the bundle has that key and
// the project URL, and can talk to the database directly without going
// through this application at all.
//
// That is normally survivable, because Row Level Security stands between the
// key and the data. On this database RLS was switched off on nearly every
// table — which is the only reason anything worked, because the client below
// carries no logged-in session and would otherwise have been refused
// everything. So the two mistakes were cancelling each other out, and the
// result was a database that a stranger could read and write in full.
//
// The fix is not to bolt policies onto a browser key. It is to stop using a
// browser key on the server. Every one of the 83 files that imports this
// client is a Server Component or a Server Action — not one of them runs in
// the browser, and `proxy.ts` already turns away anybody who is not logged in
// before a page is reached. So the server can hold a key the browser never
// sees.
//
// SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_ prefix, and that prefix is
// the whole mechanism: Next.js only substitutes a value into the browser
// bundle for variables that carry it. A variable without it is simply not
// there client-side — not obscured, not minified, absent.
//
// With that key in place, RLS can be switched ON with no policies at all
// (SQL part 27). The service role bypasses RLS by design, so this
// application keeps working; the anon key in the browser then has no route to
// any table. The door is not guarded — it is bricked up.
//
// If the variable is missing, this falls back to the anon key so that
// nothing breaks before it is set. That fallback is a bridge, not a
// destination: run part 27 while it is still in force and every screen goes
// blank. Set the variable, redeploy, confirm on the Project page that the
// server key is in use, and only then run the SQL.

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/** Whether the server is holding a key the browser cannot see. */
export const USING_SERVICE_ROLE = typeof serviceKey === 'string' && serviceKey.trim().length > 0

// A loud failure rather than a quiet one.
//
// If a Client Component ever imports this file, `serviceKey` is undefined in
// the browser and the client below would quietly fall back to the anon key —
// working perfectly today and returning nothing at all the moment RLS is on,
// with no error to explain it. Throwing here turns a silent future outage
// into an immediate, obvious one during development.
//
// Nothing imports it that way today; this is here so that nothing starts to.
if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/supabase.ts is server-only. A Client Component has imported it. ' +
      'Move the database call into a Server Component or a Server Action, or use ' +
      'createClient() from @/lib/supabase/server if you need the logged-in user.'
  )
}

export const supabase = createClient(url, USING_SERVICE_ROLE ? serviceKey! : anonKey, {
  // There is no browser here and no session to keep. Left on, supabase-js
  // sets up refresh timers that serve no purpose in a server process and
  // keep it from settling between requests.
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
