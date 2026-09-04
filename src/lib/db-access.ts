// Asking the database, from outside, what a stranger can see.
//
// The Project page could simply report whether the server key is configured.
// That would be an inference — the key is set, therefore the data must be
// safe — and inferences are exactly what this application exists to distrust.
// A configuration flag says what somebody intended. It does not say what is
// true.
//
// So this does the actual test instead. It builds a throwaway client with the
// ANON key — the one every visitor already has, compiled into the JavaScript
// they downloaded — and asks it to read the projects table. Whatever comes
// back is what a stranger with a browser would get.
//
// Nothing here is cached, nothing is stored, and it reads one column of one
// row. It is the cheapest honest answer available.

import { createClient } from '@supabase/supabase-js'

export type AnonProbe = {
  /** True when the browser key could read project rows. */
  canRead: boolean
  /** True when the read was refused or returned nothing. */
  blocked: boolean
  /** Set when the probe could not be run at all. */
  unknown: boolean
  /** The database's own words, when it gave any. */
  detail: string | null
}

/**
 * What the anon key can read right now.
 *
 * `knownToHaveRows` matters. RLS with no policies does not raise an error —
 * it returns an empty list, which is indistinguishable from a table that is
 * genuinely empty. The caller knows a project exists, because it is rendering
 * one. Without that, an empty answer proves nothing and is reported as
 * unknown rather than as safety.
 */
export async function probeAnonAccess(knownToHaveRows: boolean): Promise<AnonProbe> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return { canRead: false, blocked: false, unknown: true, detail: 'The browser key is not configured.' }
  }

  try {
    const asStranger = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { data, error } = await asStranger.from('projects').select('id').limit(1)

    if (error) {
      // A refusal and a failure are not the same answer, and the first draft
      // of this treated them as one. supabase-js does not throw when the
      // network is down — it hands back an ordinary error object saying
      // "fetch failed". So a paused database, a DNS problem or a dropped
      // connection all arrived here and were reported as "the browser key
      // cannot reach the data", in a panel with a calm border.
      //
      // A network outage reading as a security guarantee is the worst
      // direction this check could be wrong in. It would say the door is
      // locked at precisely the moments nobody had checked the door.
      //
      // So: the database refused only if the DATABASE answered. A Postgres
      // error carries a five-character SQLSTATE code. A transport failure
      // does not carry one at all.
      const code = (error as { code?: string }).code ?? ''
      if (/^[0-9A-Za-z]{5}$/.test(code)) {
        return { canRead: false, blocked: true, unknown: false, detail: `${error.message} (${code})` }
      }
      return {
        canRead: false,
        blocked: false,
        unknown: true,
        detail: `The database could not be reached — ${error.message}`,
      }
    }
    if ((data ?? []).length > 0) {
      return { canRead: true, blocked: false, unknown: false, detail: null }
    }
    if (knownToHaveRows) {
      return { canRead: false, blocked: true, unknown: false, detail: 'The read returned nothing.' }
    }
    return {
      canRead: false,
      blocked: false,
      unknown: true,
      detail: 'The read returned nothing, but there may be nothing to read.',
    }
  } catch (e) {
    return {
      canRead: false,
      blocked: false,
      unknown: true,
      detail: e instanceof Error ? e.message : 'The check could not be run.',
    }
  }
}

/** The heading shown for each outcome, and the sentence under it. */
export function accessVerdict(
  usingServiceRole: boolean,
  probe: AnonProbe
): { level: 'ok' | 'danger' | 'unknown'; title: string; detail: string } {
  if (probe.canRead) {
    return {
      level: 'danger',
      title: 'Anyone with the site address can read this database',
      detail:
        'The key compiled into every visitor\'s browser was just able to read project records directly, without logging in. It can read every table Row Level Security is switched off on, and write to them. Run SQL part 27 to close this.',
    }
  }
  if (probe.blocked) {
    return {
      level: 'ok',
      title: 'The browser key cannot reach the data',
      detail: usingServiceRole
        ? 'Reading as an anonymous visitor was refused. This application reads with a server key that is never sent to the browser.'
        : 'Reading as an anonymous visitor was refused — but this application has no server key configured either, so screens may be empty. Set SUPABASE_SERVICE_ROLE_KEY in Vercel.',
    }
  }
  return {
    level: 'unknown',
    title: 'The check could not give a clear answer',
    detail: probe.detail ?? 'The check could not be run.',
  }
}
