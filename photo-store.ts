// Putting a photograph into storage and onto a punch item.
//
// Shared by the two places a photo arrives: the Raise form, where somebody is
// standing in front of the defect, and the punch item itself, where the fix
// photo turns up weeks later. A plain function rather than a server action, so
// both can call it without either owning it.

import { supabase } from '@/lib/supabase'
import { checkFile, type PhotoKind } from '@/lib/photo'

export type StoreResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: string; hint: string }

export async function storeIssuePhoto(input: {
  projectId: string
  issueId: string
  file: File
  kind: PhotoKind
  caption?: string | null
  uploadedByName?: string | null
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

  const { data: publicUrl } = supabase.storage.from('documents').getPublicUrl(path)

  const { data, error } = await supabase
    .from('issue_photos')
    .insert({
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
    })
    .select('id')
    .single()

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
