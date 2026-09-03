// Proving it is really you, immediately before something irreversible.
//
// Deleting a project destroys every record in it. Being logged in is not
// enough authority for that: a session can be hours old, on an unlocked
// laptop, on a site office desk somebody else is now sitting at. The question
// a password answers is not "who are you" — the session already answered that
// — it is "are you here, right now, and did you mean this".
//
// It is the same reasoning as a permit to work. A signature at the start of
// the shift does not authorise a switching operation at four o'clock.
//
// The password checked is the one you log in with. There is no second
// password to set, forget, share, or write on a whiteboard, and nothing new
// is stored anywhere.

import { createClient as createBrowserStyleClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export type ReauthResult =
  | { ok: true; email: string }
  | { ok: false; reason: string }

/**
 * Check a password against the signed-in account.
 *
 * Verified on a throwaway client with `persistSession: false`, deliberately.
 * Signing in on the normal client would rotate the session cookie as a side
 * effect of a confirmation check — so a wrong password, or a right one, could
 * quietly change the state of the session that is about to do the deleting.
 * A check should check and change nothing.
 */
export async function verifyPassword(password: string | null | undefined): Promise<ReauthResult> {
  if (!password || password.trim() === '') {
    return { ok: false, reason: 'Enter your password to confirm.' }
  }

  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()

  if (!user?.email) {
    // Not "wrong password" — a different problem with a different fix, and
    // saying the wrong one sends somebody off retyping a password that was
    // never the issue.
    return { ok: false, reason: 'Nobody is signed in, so nothing can be confirmed. Sign in and try again.' }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return { ok: false, reason: 'This deployment is not configured for sign-in, so a password cannot be checked.' }
  }

  const checker = createBrowserStyleClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { error } = await checker.auth.signInWithPassword({ email: user.email, password })

  if (error) {
    // Rate limiting and outages must not read as "wrong password" — that
    // sends somebody to reset a password that was correct.
    const m = error.message.toLowerCase()
    if (m.includes('rate') || m.includes('too many')) {
      return { ok: false, reason: 'Too many attempts. Wait a minute and try again.' }
    }
    if (m.includes('invalid login') || m.includes('credentials')) {
      return { ok: false, reason: 'That password is not correct. Nothing was deleted.' }
    }
    return { ok: false, reason: `The password could not be checked: ${error.message}. Nothing was deleted.` }
  }

  // The throwaway session is discarded rather than left alive on the server.
  await checker.auth.signOut({ scope: 'local' }).catch(() => undefined)

  return { ok: true, email: user.email }
}
