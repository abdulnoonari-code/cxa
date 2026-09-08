import { supabase } from '@/lib/supabase'
import { accessVerdict } from '@/data/gate'
import { mayUseApp } from '@/lib/gate'
import { safePath, refusalText, BUCKET, SIGNED_SECONDS } from '@/lib/file-url'

export const dynamic = 'force-dynamic'

/**
 * The one way into stored files.
 *
 * Everything uploaded to this application — every site photograph, every
 * contract document, every marked-up drawing — used to be served from a
 * `getPublicUrl` address, which needs no sign-in of any kind. This route
 * replaces that: it asks WHO IS ASKING first, and only then mints a signed
 * URL that lives five minutes.
 *
 * ── Three things it deliberately does not do ────────────────────────────
 *
 * It does not stream the bytes through this server. Supabase can serve
 * them directly from a signed URL, and proxying every photograph through a
 * Vercel function would be slower, more expensive and no more private.
 *
 * It does not tell a refused caller anything about the file. Not whether
 * it exists, not its size, not its name. "You are not signed in to a
 * project that contains this file" is the whole answer, because the person
 * asking may be exactly the person who should not learn the rest.
 *
 * It does not fall back to a public URL when signing fails. That is the
 * one shortcut that would quietly reopen the hole this closes, and it is
 * the reason a failure here is an error rather than a redirect.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  // The gate first, before the path is even looked at. Deciding whether a
  // path is well formed before deciding whether the caller may be here
  // would answer "that file address is malformed" to a stranger, which is
  // one bit more than a stranger should get.
  const verdict = await accessVerdict()
  if (!mayUseApp(verdict)) {
    return new Response(refusalText('no-access'), {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }

  const { path: segments } = await ctx.params
  const path = safePath(segments ?? [])
  if (!path) {
    return new Response(refusalText('bad-path'), {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_SECONDS)

  if (error || !data?.signedUrl) {
    // Storage says "Object not found" for a file that is not there. That
    // is worth distinguishing for somebody who IS allowed in — a deleted
    // photograph and a broken site are different problems.
    const missing = /not found/i.test(error?.message ?? '')
    return new Response(refusalText(missing ? 'not-found' : 'failed'), {
      status: missing ? 404 : 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }

  // no-store on the redirect itself. The signed URL expires in five
  // minutes, and a cached 302 would keep handing out an address that has
  // stopped working — or, worse, hand a fresh visitor an address minted
  // for somebody else.
  return new Response(null, {
    status: 302,
    headers: { Location: data.signedUrl, 'Cache-Control': 'no-store, max-age=0' },
  })
}
