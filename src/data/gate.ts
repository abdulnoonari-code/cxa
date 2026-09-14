import { cache } from 'react'
import { supabase } from '@/lib/supabase'
import { createClient } from '@/lib/supabase/server'
import { decideAccess, parseOwners, type Verdict } from '@/lib/gate'

/**
 * Whether the signed-in account may use this application.
 *
 * Wrapped in React's `cache`, so the auth call and the team query happen ONCE
 * per request however many times this is asked. That matters now that
 * `getCurrentProject` calls it too: that helper runs in a hundred files and
 * several times on a single screen, and without this every one of them would
 * be a round trip to Supabase for an answer that cannot have changed since
 * the last one a millisecond earlier.
 *
 * Read with the SERVER key, deliberately. Since SQL part 27 the database is
 * closed to the browser key and the team list cannot be read with it at all
 * — so a gate that used the browser key would refuse everybody, including
 * the owner, and look like a broken login.
 *
 * One query, and it asks only for what the decision needs: which addresses
 * are on which project. No names, no roles, nothing that would make this
 * worth caching or worth leaking.
 */
export const accessVerdict = cache(async function accessVerdict(): Promise<Verdict> {
  const auth = await createClient()
  const {
    data: { user },
  } = await auth.auth.getUser()

  const { data, error } = await supabase.from('project_members').select('project_id, email')

  // A table that cannot be read is NOT an empty team list. Treating an error
  // as "nobody is on any project" would trip the first-run exception and
  // open the site to everybody the first time the database hiccuped.
  if (error) {
    return {
      state: 'blocked',
      email: user?.email ?? '',
      reason: user?.email ? 'not-on-any-team' : 'no-address',
    }
  }

  return decideAccess({
    email: user?.email ?? null,
    memberships: (data ?? []) as { project_id: string; email: string | null }[],
    owners: parseOwners(process.env.CXA_OWNER_EMAILS),
  })
})
