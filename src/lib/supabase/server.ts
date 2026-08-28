import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// A fresh, cookie-aware Supabase client for use inside Server Actions and
// Server Components that need to know who is logged in (login, signup,
// logout). This is separate from the plain client in src/lib/supabase.ts,
// which is used for regular data reads/writes and doesn't need to know
// about the logged-in user.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Called from a Server Component render, where cookies can't be
            // written. Safe to ignore because the proxy also refreshes the
            // session on every request.
          }
        },
      },
    }
  )
}
