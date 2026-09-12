// In Next.js 16, this file replaces what used to be called "middleware.ts".
// It runs on every request (see the matcher below) and checks whether the
// visitor is logged in. If not, and they're not already headed to /login or
// /signup, it sends them there instead of the page they asked for.
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // The pages a signed-out visitor may see. /about is here because the login
  // screen links to it: somebody sent an invitation should be able to find out
  // what they have been invited to before typing a password into it, and a
  // link that bounces them back to the login screen they came from is worse
  // than no link.
  //
  // /manual is here for the same reason and one more: an engineer standing in
  // a switchroom, or a client deciding whether to accept a handover pack,
  // should be able to read how the thing works without an account. The manual
  // describes the application; it holds no project data of any kind, so there
  // is nothing on it to protect.
  const isPublic =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup') ||
    request.nextUrl.pathname.startsWith('/about') ||
    request.nextUrl.pathname.startsWith('/manual') ||
    // Engineering reference. It holds no project data at all — it is arithmetic
    // and standards — and somebody standing in a switchroom should not have to
    // sign in to size a load bank.
    request.nextUrl.pathname.startsWith('/knowledge')

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
