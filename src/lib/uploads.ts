// What happened to the file you just uploaded.
//
// This file exists because of a specific failure. A photograph was uploaded
// against a punch item, the row that links it to that item was never written,
// and the application said nothing at all. The person who uploaded it had no
// way to find out until they generated a PDF days later and found the page
// empty.
//
// That was not one bug. Five separate upload paths in this application ended
// with the same line:
//
//     if (uploadError) return
//
// A silent return. The form posts, the page re-renders looking exactly as it
// did before, and the only difference between success and failure is a file
// that is not there — which is invisible until somebody needs it.
//
// Three rules, and they apply to every upload in the application:
//
//   1. **Every upload ends in a sentence.** Succeeded or failed, the screen
//      says so, and it names the file. "Uploaded" with no filename is not
//      good enough when somebody has just picked the wrong one of two.
//
//   2. **A failure says what to do, not what went wrong.** "new row violates
//      row-level security policy" is a true statement and a useless one.
//      `describeStorageError` turns the errors that actually happen into an
//      instruction.
//
//   3. **The message survives the redirect.** Server actions redirect, which
//      throws away anything held in memory, so the outcome travels in the URL
//      and is rendered from there.

export type UploadOutcome = {
  ok: boolean
  /** The file this is about. Always named — see rule 1. */
  file: string
  /** On failure: what went wrong, in words somebody can act on. */
  reason?: string
  /** On failure: the specific thing to go and do. */
  hint?: string
  /** On success: what it was attached to, e.g. "P-0001" or "SUB-A". */
  against?: string
}

/** The query keys an outcome travels under. Kept in one place so no screen invents its own. */
export const UPLOAD_KEYS = {
  state: 'up',
  file: 'upFile',
  reason: 'upWhy',
  hint: 'upFix',
  against: 'upOn',
} as const

/**
 * Encode an outcome into search params.
 *
 * Truncated, because a Postgres error can run to several hundred characters
 * and a URL that long gets rejected by some proxies — which would turn a
 * failed upload into a failed *page*, and lose the message entirely.
 */
export function outcomeParams(outcome: UploadOutcome): string {
  const p = new URLSearchParams()
  p.set(UPLOAD_KEYS.state, outcome.ok ? 'ok' : 'failed')
  p.set(UPLOAD_KEYS.file, outcome.file.slice(0, 120))
  if (outcome.against) p.set(UPLOAD_KEYS.against, outcome.against.slice(0, 60))
  if (!outcome.ok) {
    if (outcome.reason) p.set(UPLOAD_KEYS.reason, outcome.reason.slice(0, 240))
    if (outcome.hint) p.set(UPLOAD_KEYS.hint, outcome.hint.slice(0, 240))
  }
  return p.toString()
}

/** Read one back off the URL. Returns null when there is nothing to say. */
export function readOutcome(sp: Record<string, string | string[] | undefined>): UploadOutcome | null {
  const one = (k: string): string | undefined => {
    const v = sp[k]
    return Array.isArray(v) ? v[0] : v
  }
  const state = one(UPLOAD_KEYS.state)
  if (state !== 'ok' && state !== 'failed') return null
  return {
    ok: state === 'ok',
    file: one(UPLOAD_KEYS.file) ?? 'the file',
    reason: one(UPLOAD_KEYS.reason),
    hint: one(UPLOAD_KEYS.hint),
    against: one(UPLOAD_KEYS.against),
  }
}

/**
 * Turn a storage or database error into something a site engineer can act on.
 *
 * Only the failures that actually happen are named. Everything else falls
 * through to the raw message rather than a vague catch-all — an unfamiliar
 * error printed verbatim can at least be searched for, whereas "something
 * went wrong" cannot.
 */
export function describeStorageError(message: string): { reason: string; hint: string } {
  const m = message.toLowerCase()

  // Specific, and first only because it is unambiguous. A looser test for
  // "bucket" would swallow errors that merely mention one — "duplicate key
  // in bucket documents" is a naming clash, not a missing bucket.
  if (m.includes('bucket not found') || (m.includes('bucket') && m.includes('not found'))) {
    return {
      reason: 'The storage area this application uploads into does not exist.',
      hint: 'In Supabase → Storage, create a bucket named exactly "documents".',
    }
  }
  if (m.includes('already exists') || m.includes('duplicate')) {
    return {
      reason: 'A file is already stored under that name.',
      hint: 'Rename the file and upload it again. Nothing was overwritten.',
    }
  }
  if (m.includes('payload too large') || m.includes('413') || m.includes('exceeded the maximum')) {
    return {
      reason: 'The file is larger than the storage limit.',
      hint: 'Reduce it and upload again — a photograph taken at full resolution is usually the cause.',
    }
  }
  if (m.includes('row-level security') || m.includes('permission') || m.includes('unauthorized') || m.includes('403')) {
    return {
      reason: 'The application was not allowed to write this file.',
      hint: 'In Supabase → Storage → documents → Policies, allow insert. Nothing was saved.',
    }
  }
  if (m.includes('does not exist') && m.includes('relation')) {
    const table = /relation "?([a-z_]+)"?/.exec(m)?.[1]
    return {
      reason: `The database has no ${table ?? 'table'} table, so there is nowhere to record this file.`,
      hint: 'Run the SQL script for this feature in Supabase → SQL Editor, then upload again.',
    }
  }
  if (m.includes('column') && m.includes('does not exist')) {
    return {
      reason: 'The database is missing a column this upload needs.',
      hint: 'Run the most recent SQL script in Supabase → SQL Editor, then upload again.',
    }
  }
  return {
    reason: message,
    hint: 'Nothing was saved. If this repeats, the exact wording above is what to search for.',
  }
}

/**
 * The half-saved case, which is the dangerous one.
 *
 * A file can reach storage and then fail to be recorded in the database. The
 * upload "worked" by one measure and produced nothing usable by the other,
 * and this is exactly what happened with the punch photograph. It must never
 * be reported as success.
 */
export function orphanedFileNote(fileName: string): { reason: string; hint: string } {
  return {
    reason: `${fileName} reached storage but could not be recorded against this item, so the application cannot find it.`,
    hint: 'This is almost always a SQL script that has not been run yet. Run it, then upload the file again — the stray copy in storage is harmless.',
  }
}

/**
 * A file name that is safe as a storage key.
 *
 * The stem and the extension are handled separately. The obvious version —
 * strip everything outside [A-Za-z0-9._-] and trim the underscores — turns
 * "รูปถ่าย.jpg" into ".jpg": a key with no name at all, just an extension.
 * Not a hypothetical, since this application is used in Bangkok.
 *
 * To be accurate about what that costs: every caller prefixes the key with a
 * timestamp, so two such files do NOT collide and no upload fails because of
 * it. What is lost is legibility — a bucket full of objects called ".jpg" is
 * one nobody can look through when something needs to be found by hand. The
 * name a person sees is `file_name` in the database, which keeps the original
 * exactly as it was typed, in Thai or anything else.
 *
 * So a non-Latin stem becomes "file" rather than nothing, and the extension is
 * preserved so the object is still recognisable as an image.
 */
export function safeStorageName(name: string): string {
  const dot = name.lastIndexOf('.')
  const hasExt = dot > 0 && dot < name.length - 1 && name.length - dot <= 6
  const rawStem = hasExt ? name.slice(0, dot) : name
  const rawExt = hasExt ? name.slice(dot + 1) : ''

  const clean = (v: string) => v.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '')

  const stem = clean(rawStem) || 'file'
  const ext = clean(rawExt)

  return (ext ? `${stem.slice(0, 110)}.${ext.slice(0, 8)}` : stem.slice(0, 120))
}
