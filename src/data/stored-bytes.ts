import { supabase } from '@/lib/supabase'
import { storagePathOf } from '@/lib/photo-prep'
import { BUCKET } from '@/lib/file-url'

/**
 * The bytes of a stored file, for anything that needs to READ one.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * Four places in this application needed a stored file's bytes — the AI
 * photograph reading, the two-photograph comparison, the document rule
 * checks and the AI document assessment — and every one of them did the
 * same thing: try the storage path, then fall back to `fetch(file_url)`
 * over HTTP.
 *
 * After update 90 that fallback was dead in both directions. A `/file/...`
 * address is RELATIVE, and fetch inside a serverless function has no page
 * to be relative to, so it throws. And the old public addresses stopped
 * answering the moment the bucket was made private.
 *
 * Every one of those four failed quietly — an AI panel saying it could not
 * read the photograph, a rule check saying there was no file. Nothing red,
 * nothing in a build log.
 *
 * So there is one way to read a stored file now, and it never uses HTTP:
 * work out the storage path from whatever the row spells (a path, a
 * `/file/...` address, or a legacy public URL) and download it with the
 * server key.
 */
export async function storedBytes(row: {
  file_path?: string | null
  file_url?: string | null
}): Promise<ArrayBuffer | null> {
  // storagePathOf speaks the document pipeline's names (path/url); the
  // database columns are file_path/file_url. Mapped here rather than
  // loosening that function's type, so it keeps meaning one thing.
  const path = storagePathOf({ path: row.file_path, url: row.file_url })
  if (!path) return null
  try {
    const { data } = await supabase.storage.from(BUCKET).download(path)
    return data ? await data.arrayBuffer() : null
  } catch {
    return null
  }
}
