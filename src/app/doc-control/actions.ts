'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { actorCan, recordAudit } from '@/lib/audit'

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

function subjectRef(formData: FormData): { type: string | null; id: string | null } {
  const raw = str(formData, 'subject')
  if (!raw || !raw.includes(':')) return { type: null, id: null }
  const [type, id] = raw.split(':')
  return { type: type || null, id: id || null }
}

function refresh() {
  revalidatePath('/doc-control')
  revalidatePath('/requirements')
  revalidatePath('/audit')
}

export async function addDocument(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('review', project.id))) return

  const number = str(formData, 'doc_number')
  if (!number) return

  const subject = subjectRef(formData)

  const { data } = await supabase
    .from('controlled_documents')
    .insert({
      project_id: project.id,
      doc_number: number,
      title: str(formData, 'title'),
      doc_type: str(formData, 'doc_type') ?? 'specification',
      discipline: str(formData, 'discipline'),
      owner: str(formData, 'owner'),
      subject_type: subject.type,
      subject_id: subject.id,
    })
    .select('id')
    .single()

  const documentId = (data as { id: string } | null)?.id

  // A document with no revision cannot be cited, so the first revision is
  // created with it rather than as a second step somebody forgets.
  const firstRev = str(formData, 'first_rev')
  if (documentId && firstRev) {
    await supabase.from('document_revisions').insert({
      document_id: documentId,
      rev: firstRev,
      status: str(formData, 'first_status') ?? 'issued',
      issued_date: str(formData, 'first_issued'),
    })
  }

  await recordAudit({
    projectId: project.id,
    action: 'registered controlled document',
    entity: 'controlled_document',
    entityId: documentId,
    entityLabel: number,
    newValue: firstRev,
  })

  refresh()
}

// Issuing a revision supersedes whatever was effective before it. This is the
// action that makes every requirement citing the old revision light up as
// needing review — which is the §7 impact question, answered by the data
// rather than by somebody remembering.
export async function addRevision(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('review', project.id))) return

  const documentId = str(formData, 'document_id')
  const rev = str(formData, 'rev')
  if (!documentId || !rev) return

  const status = str(formData, 'status') ?? 'issued'

  const { data } = await supabase
    .from('document_revisions')
    .insert({
      document_id: documentId,
      rev,
      status,
      issued_date: str(formData, 'issued_date'),
      notes: str(formData, 'notes'),
    })
    .select('id')
    .single()

  const newId = (data as { id: string } | null)?.id

  // Only a revision that is actually in force supersedes the previous ones. A
  // draft sitting alongside an approved revision changes nothing.
  if (newId && (status === 'approved' || status === 'issued')) {
    const { data: others } = await supabase
      .from('document_revisions')
      .select('id')
      .eq('document_id', documentId)
      .neq('id', newId)

    const ids = ((others ?? []) as { id: string }[]).map((o) => o.id)
    if (ids.length > 0) {
      await supabase
        .from('document_revisions')
        .update({ status: 'superseded', superseded_by: newId })
        .in('id', ids)
        .neq('status', 'draft')
    }
  }

  await recordAudit({
    projectId: project.id,
    action: 'issued document revision',
    entity: 'controlled_document',
    entityId: documentId,
    entityLabel: str(formData, 'label'),
    oldValue: str(formData, 'previous_rev'),
    newValue: rev,
    comment: str(formData, 'notes'),
  })

  refresh()
}

export async function deleteDocument(formData: FormData) {
  const project = await getCurrentProject()
  if (!project) return
  if (!(await actorCan('manage', project.id))) return

  const id = str(formData, 'id')
  if (!id) return

  // Requirements citing it keep their revision text; they simply stop showing
  // a linked document. Nothing silently loses its stated source.
  await supabase.from('requirements').update({ document_id: null }).eq('document_id', id)
  await supabase.from('controlled_documents').delete().eq('id', id)

  await recordAudit({
    projectId: project.id,
    action: 'removed controlled document',
    entity: 'controlled_document',
    entityId: id,
    entityLabel: str(formData, 'label'),
  })

  refresh()
}
