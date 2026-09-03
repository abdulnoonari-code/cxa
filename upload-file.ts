// Putting a file in storage and recording it, as one operation that reports.
//
// Every upload in this application is the same two steps: write the bytes to
// the bucket, then write a row saying what they are and what they belong to.
// Both can fail, and the second failing is the dangerous one — the file is
// there, so storage looks healthy, but nothing in the application can find it.
// That is precisely how an uploaded punch photograph came to be invisible.

import { supabase } from '@/lib/supabase'
import { describeStorageError, orphanedFileNote, type UploadOutcome } from '@/lib/uploads'

export { safeStorageName } from '@/lib/uploads'

export type StoredFile = {
  path: string
  url: string
  name: string
  size: number
  contentType: string
}

/** Step one: the bytes. */
export async function putFile(
  file: File,
  path: string
): Promise<{ ok: true; stored: StoredFile } | { ok: false; outcome: UploadOutcome }> {
  const { error } = await supabase.storage.from('documents').upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  })

  if (error) {
    const described = describeStorageError(error.message)
    return { ok: false, outcome: { ok: false, file: file.name, ...described } }
  }

  const { data } = supabase.storage.from('documents').getPublicUrl(path)
  return {
    ok: true,
    stored: {
      path,
      url: data.publicUrl,
      name: file.name,
      size: file.size,
      contentType: file.type || 'application/octet-stream',
    },
  }
}

/**
 * Step two: the row. And if it fails, the bytes are taken back out.
 *
 * Removing the orphan matters. Leaving it means the next upload of the same
 * file hits "already exists" and reports a completely misleading reason, and
 * it means the bucket slowly fills with files no screen can reach. If the
 * cleanup itself fails there is nothing useful to do about it, so it is not
 * allowed to change what the person is told.
 */
export async function recordFile(
  table: string,
  row: Record<string, unknown>,
  stored: StoredFile,
  against?: string
): Promise<UploadOutcome> {
  const { error } = await supabase.from(table).insert(row)

  if (error) {
    try {
      await supabase.storage.from('documents').remove([stored.path])
    } catch {
      // Nothing useful to do, and it must not change what the person is told.
    }
    const described = /relation|column|does not exist/i.test(error.message)
      ? describeStorageError(error.message)
      : orphanedFileNote(stored.name)
    return { ok: false, file: stored.name, ...described }
  }

  return { ok: true, file: stored.name, against }
}
