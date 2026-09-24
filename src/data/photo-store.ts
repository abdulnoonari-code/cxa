// Putting a photograph into storage and onto a punch item.
//
// Shared by the two places a photo arrives: the Raise form, where somebody is
// standing in front of the defect, and the punch item itself, where the fix
// photo turns up weeks later. A plain function rather than a server action, so
// both can call it without either owning it.

import { supabase } from '@/lib/supabase'
import { checkFile, type PhotoKind } from '@/lib/photo'
import { FILE_ROUTE, encodePath } from '@/lib/file-url'
import { missingColumn } from '@/lib/pg-columns'

export type StoreResult =
  /** `already` means the database recognised this clientRef. Also a success. */
  | { ok: true; id: string | null; already?: boolean }
  | { ok: false; reason: string; hint: string }

/** A unique-index refusal, which for a queued photograph means "already here". */
function isDuplicate(message: string, code?: string | null): boolean {
  return code === '23505' || /duplicate key value violates unique constraint/i.test(message)
}

export async function storeIssuePhoto(input: {
  projectId: string
  issueId: string
  file: File
  kind: PhotoKind
  caption?: string | null
  uploadedByName?: string | null
  /**
   * An id made on the phone, for a photograph queued with no signal.
   *
   * A photograph is uploaded as its own request and can be lost the same
   * way a defect can: the file lands, the reply does not, the phone tries
   * again, and the punch item ends up carrying the same picture twice. The
   * unique index from week5-part43 refuses the second one, and the caller
   * reads that refusal as "already there" — which it is.
   *
   * Absent on the desktop, where there is no queue and no retry.
   */
  clientRef?: string | null
}): Promise<StoreResult> {
  const problem = checkFile({ name: input.file.name, type: input.file.type, size: input.file.size })
  if (problem) return { ok: false, reason: problem.reason, hint: problem.hint }

  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_')
  const path = `punch/${input.issueId}/${input.kind}-${Date.now()}-${safeName}`

  const { error: uploadError } = await supabase.storage.from('documents').upload(path, input.file, {
    contentType: input.file.type,
    upsert: false,
  })
  if (uploadError) {
    return {
      ok: false,
      reason: `The photograph could not be uploaded: ${uploadError.message}`,
      hint: 'Check the "documents" bucket exists in Supabase → Storage.',
    }
  }

  // NOT getPublicUrl — see src/lib/file-url.ts.
  const publicUrl = { publicUrl: `${FILE_ROUTE}/${encodePath(path)}` }

  const row: Record<string, unknown> = {
    project_id: input.projectId,
    issue_id: input.issueId,
    kind: input.kind,
    file_name: input.file.name,
    file_path: path,
    file_url: publicUrl.publicUrl,
    content_type: input.file.type,
    size_bytes: input.file.size,
    caption: input.caption ?? null,
    uploaded_by_name: input.uploadedByName ?? null,
    ...(input.clientRef ? { client_ref: input.clientRef } : {}),
  }

  let { data, error } = await supabase.from('issue_photos').insert(row).select('id').single()

  // The phone sent this one before and the reply was lost. The index refused
  // the repeat, which is exactly what it is for — report it as the success it
  // is, so the phone ticks it off rather than trying forever.
  if (error && input.clientRef && isDuplicate(error.message, (error as { code?: string }).code)) {
    const { data: existing } = await supabase
      .from('issue_photos')
      .select('id')
      .eq('project_id', input.projectId)
      .eq('client_ref', input.clientRef)
      .maybeSingle()
    return { ok: true, id: (existing as { id: string } | null)?.id ?? null, already: true }
  }

  // week5-part43 has not been run. The photograph is worth more than the
  // protection, so it goes in without it — and the Setup page says so.
  if (error && input.clientRef && missingColumn(error.message) === 'client_ref') {
    delete row.client_ref
    ;({ data, error } = await supabase.from('issue_photos').insert(row).select('id').single())
  }

  if (error) {
    // The most likely cause by far, and worth saying rather than echoing a
    // Postgres error nobody can act on.
    const missing = /relation .*issue_photos.* does not exist/i.test(error.message)
    return {
      ok: false,
      reason: missing
        ? 'The database cannot hold photographs yet.'
        : `The photograph could not be saved: ${error.message}`,
      hint: missing ? 'Run week5-part21-photos.sql in Supabase → SQL Editor.' : 'The file itself did upload.',
    }
  }

  return { ok: true, id: (data as { id: string } | null)?.id ?? null }
}
