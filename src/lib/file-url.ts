// How a stored file is reached.
//
// ── The hole this closes ─────────────────────────────────────────────────
//
// Every photograph and every document uploaded to this application was
// stored with `getPublicUrl`, which does exactly what it says: it returns
// an address that needs no sign-in, no cookie and no permission of any
// kind. Anybody holding the link — forwarded in an email, pasted into a
// chat, sitting in a browser history, or scraped from a page — could open
// a client's site photographs and contract documents.
//
// That is the same shape of hole as the open sign-up: the application had
// a front door and a second entrance nobody had thought about. The front
// door was fixed in update 81. This is the other entrance.
//
// ── How it is closed ─────────────────────────────────────────────────────
//
// Two halves, and BOTH are needed. Either one alone leaves the door open:
//
//   1. THE BUCKET IS MADE PRIVATE (SQL step 38). Until that is run, every
//      public URL ever issued still works, including the ones already in
//      the database. Code alone cannot close this.
//
//   2. EVERY LINK GOES THROUGH /file, which checks who is asking before it
//      hands out a short-lived signed URL. Nothing in a page, an export or
//      a report points at storage directly any more.
//
// ── Why the legacy rows are handled here rather than migrated ────────────
//
// Rows written before this update hold a public URL in `file_url`. They
// could be rewritten with an UPDATE, and that was the first plan. It is
// worse: an UPDATE across several tables on somebody's live database, to
// fix something that can be fixed by reading the row differently, is risk
// taken for no gain. So `viewUrl` recovers the storage path out of a
// legacy public URL and routes it through the gate like everything else.
// Nothing is migrated, nothing is lost, and an old row is as protected as
// a new one the moment the bucket is private.
//
// Pure: no database, no clock, no network.

/** The gated route every file is served through. */
export const FILE_ROUTE = '/file'

/** The one bucket this application stores anything in. */
export const BUCKET = 'documents'

/**
 * The object path hidden inside a Supabase public URL, or null.
 *
 * The shape is
 *   https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
 * and the path can contain slashes, so everything after the bucket is the
 * path — splitting on the last slash would lose the folders.
 */
export function pathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const m = /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/.exec(url)
  if (!m) return null
  try {
    return decodeURIComponent(m[2])
  } catch {
    // A malformed escape sequence. The raw text is still the best answer
    // available and is more useful than throwing on a page load.
    return m[2]
  }
}

/** True for a URL that points at this application's own storage. */
export function isStorageUrl(url: string | null | undefined): boolean {
  return pathFromPublicUrl(url) !== null
}

/**
 * A link that is ALREADY pointing at the gated route.
 *
 * Rows written after this update store `/file/<path>` in the URL column.
 * Reading one back has to recognise it and hand it straight over — the
 * first version of this file did not, and returned null instead, which
 * meant a document uploaded after the update had no download link at all
 * on any screen that reads the URL column without also selecting
 * `file_path`. Document Control is exactly that shape.
 */
export function isGatedUrl(url: string | null | undefined): boolean {
  return typeof url === 'string' && (url === FILE_ROUTE || url.startsWith(`${FILE_ROUTE}/`))
}

/**
 * A link somebody pasted that has nothing to do with our storage — a
 * vendor's site, a shared drive. Left exactly as it is: gating a URL we do
 * not serve would break it and protect nothing.
 */
export function isExternal(url: string | null | undefined): boolean {
  if (!url) return false
  if (isStorageUrl(url)) return false
  return /^https?:\/\//i.test(url)
}

/** Percent-encode a storage path for a URL without destroying its slashes. */
export function encodePath(path: string): string {
  return path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

export type FileRow = {
  file_path?: string | null
  file_url?: string | null
}

/**
 * Where a link to this file should point.
 *
 * `file_path` first, because it is the truth: a path into the bucket. The
 * URL column is a derived convenience that has held three different
 * things over the life of this application, so it is only consulted when
 * there is no path — either to recover the path from a legacy public URL,
 * or to pass an external link through untouched.
 *
 * Returns null when there is nothing to link to. The caller shows the file
 * name without a link rather than an <a> that goes nowhere.
 */
export function viewUrl(row: FileRow | null | undefined): string | null {
  if (!row) return null

  const path = (row.file_path ?? '').trim() || pathFromPublicUrl(row.file_url)
  if (path) return `${FILE_ROUTE}/${encodePath(path)}`

  // Already gated. A row written after this update, on a screen that does
  // not select file_path. Returning null here — which the first version
  // did — silently removes the link to a file that is perfectly fine.
  if (isGatedUrl(row.file_url)) return row.file_url ?? null

  // Not ours. Pasted by a person, pointing somewhere else.
  if (isExternal(row.file_url)) return row.file_url ?? null

  return null
}

/**
 * The storage path a /file request is asking for.
 *
 * Everything a route hands over comes from a URL, so this is where the
 * refusals live. A path may not climb out of the bucket, may not be empty,
 * and may not be absolute — the first two are what turn a file route into
 * a way of reading whatever is on the disk.
 */
export function safePath(segments: string[]): string | null {
  if (segments.length === 0) return null
  let path: string
  try {
    path = segments.map((s) => decodeURIComponent(s)).join('/')
  } catch {
    return null
  }
  const trimmed = path.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('/')) return null
  // `..` anywhere, not just at the start: a/../../b escapes just as well.
  if (trimmed.split('/').some((s) => s === '..' || s === '.')) return null
  if (trimmed.includes('\\')) return null
  // A null byte truncates a path in some storage layers, so the part after
  // it would be silently dropped and the check above would have inspected
  // a different string from the one that gets used.
  if (trimmed.includes('\0')) return null
  return trimmed
}

/** How long a signed link lives. */
export const SIGNED_SECONDS = 300

/**
 * What a person is told when a file cannot be served. Never the raw
 * storage error: it names bucket paths, and the person asking may be
 * exactly the person who should not learn them.
 */
export function refusalText(reason: 'no-access' | 'bad-path' | 'not-found' | 'failed'): string {
  switch (reason) {
    case 'no-access':
      return 'You are not signed in to a project that contains this file.'
    case 'bad-path':
      return 'That is not a valid file address.'
    case 'not-found':
      return 'That file is not in storage. It may have been deleted.'
    default:
      return 'The file could not be fetched. Try again, and tell whoever runs this site if it keeps happening.'
  }
}
