// Where a defect raised with no signal arrives when the signal comes back.
//
// ── Why this is a route handler and not a Server Action ────────────────
//
// A Server Action is a form submission. This is not a form submission — it
// is a phone, possibly in the background, possibly hours later, sending
// something it has been carrying, and needing a clear ANSWER back so it
// knows whether it may stop carrying it. It needs:
//
//   · an honest status code the phone can map to "keep it" or "let it go"
//   · a JSON body with the punch number, so the phone can show it
//   · to be safe to call twice, because a lost reply is indistinguishable
//     from a lost request and the phone must try again
//
// A Server Action gives none of those cleanly.
//
// ── The three answers, and what each means to the phone ────────────────
//
//   200 {ok:true}          Written, or already written. LET IT GO.
//   4xx                    Answered, and no. KEEP IT, show the reason, stop
//                          trying by itself — this needs a person.
//   5xx / no reply at all  KEEP IT and try again, forever.
//
// Getting the middle one wrong in either direction is the whole risk: a
// refusal treated as unreachable retries a broken thing for ever, and an
// unreachable server treated as a refusal strands a perfectly good defect
// behind an error message nobody can clear.

import { requireAccess } from '@/data/require-access'
import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { getActor, recordAudit } from '@/lib/audit'
import { loadPunchRefs } from '@/data/punchlist'
import { nextRef } from '@/lib/punchlist'
import { insertIssue, droppedNote } from '@/data/punch-write'
import { ACTION_SQL } from '@/data/punchlist'
import { storeIssuePhoto } from '@/data/photo-store'
import { missingColumn } from '@/lib/pg-columns'
import { loadSubjectIndex } from '@/data/subjects'

export const dynamic = 'force-dynamic'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function str(form: FormData, key: string): string | null {
  const value = form.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

/** A unique-index refusal. For a queued defect this means "already landed". */
function isDuplicate(message: string, code?: string | null): boolean {
  return code === '23505' || /duplicate key value violates unique constraint/i.test(message)
}

export async function POST(request: Request) {
  // Signed out. The phone must KEEP the defect and say so — a 403 is a
  // refusal, not a failure, and retrying it on a timer would never help.
  const refused = await requireAccess()
  if (refused) return json({ ok: false, reason: 'You are not signed in. Sign in on this phone and send again.' }, 403)

  const project = await getCurrentProject()
  if (!project) return json({ ok: false, reason: 'No project is open on this account.' }, 409)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json({ ok: false, reason: 'That request could not be read.' }, 400)
  }

  const clientRef = str(form, 'client_ref')
  const title = str(form, 'title')
  const subjectRef = str(form, 'subject')

  // Data the server will never accept, however many times it is sent. A
  // refusal, so the phone stops trying and shows it — with enough detail
  // that somebody can see what is missing.
  if (!clientRef) return json({ ok: false, reason: 'That defect has no id, so it cannot be sent safely.' }, 400)
  if (!title) return json({ ok: false, reason: 'That defect has no description of what is wrong.' }, 400)
  if (!subjectRef || !subjectRef.includes(':')) {
    return json({ ok: false, reason: 'That defect is not against a tag or a system.' }, 400)
  }

  const [subject_type, subject_id] = subjectRef.split(':')
  if (!subject_id) return json({ ok: false, reason: 'That defect is not against a tag or a system.' }, 400)

  // ── Has it already landed? ────────────────────────────────────────────
  //
  // Asked FIRST rather than relying only on the insert failing, because the
  // common case is a phone that has been retrying for an hour and the
  // cheapest honest answer is "yes, it is P-014, let it go".
  {
    const { data, error } = await supabase
      .from('issues')
      .select('id, ref')
      .eq('project_id', project.id)
      .eq('client_ref', clientRef)
      .maybeSingle()

    // A database without part 43 cannot answer this. That is not a refusal
    // and it is not a duplicate — carry on and write it, and say so below.
    if (!error && data) {
      const row = data as { id: string; ref: string | null }
      return json({ ok: true, already: true, ref: row.ref, id: row.id })
    }
  }

  const actor = await getActor(project.id)
  const action = str(form, 'required_action')
  const raisedAt = str(form, 'created_at')

  const written = await insertIssue({
    project_id: project.id,
    ref: nextRef(await loadPunchRefs(project.id)),
    client_ref: clientRef,
    equipment_id: subject_type === 'equipment' ? subject_id : null,
    subject_type,
    subject_id,
    title,
    description: str(form, 'description'),
    severity: str(form, 'severity') ?? 'minor',
    category: str(form, 'category'),
    status: 'open',
    level: str(form, 'level'),
    raised_by: actor.name ?? actor.email ?? null,
    responsible_party: str(form, 'responsible_party'),
    location: str(form, 'location'),
    due_date: str(form, 'due_date'),
    required_action: action,
    action_set_by: action ? actor.name ?? actor.email ?? null : null,
    action_set_at: action ? raisedAt ?? new Date().toISOString() : null,
  })

  if (written.error) {
    // The index did its job: this arrived twice and the second one was
    // refused. That refusal IS the confirmation — fetch the number and tell
    // the phone to let it go.
    if (isDuplicate(written.error)) {
      const { data } = await supabase
        .from('issues')
        .select('id, ref')
        .eq('project_id', project.id)
        .eq('client_ref', clientRef)
        .maybeSingle()
      const row = data as { id: string; ref: string | null } | null
      return json({ ok: true, already: true, ref: row?.ref ?? null, id: row?.id ?? null })
    }

    // Anything else is the server's problem, not the defect's. A 500 tells
    // the phone to keep it and try again — which is what we want, because
    // the alternative is throwing away work over a bad minute.
    await recordAudit({
      projectId: project.id,
      action: 'defect from a phone NOT saved',
      entity: 'issue',
      entityLabel: title,
      newValue: written.error,
      comment: 'Raised with no signal and sent later. The phone still has it and will try again.',
    })
    return json({ ok: false, reason: written.error, keep: true }, 500)
  }

  const issueId = written.id
  const lost = droppedNote(written.dropped, ACTION_SQL)

  // `client_ref` itself being dropped means part 43 has not been run. The
  // defect is worth more than the protection, so it is written without it —
  // but that must be SAID, because it is the one thing standing between a
  // bad signal and two copies of the same defect.
  const unprotected = written.dropped.includes('client_ref')

  await recordAudit({
    projectId: project.id,
    action: 'raised punch item from a phone',
    entity: 'issue',
    entityId: issueId,
    entityLabel: title,
    comment: [
      raisedAt ? `Raised on site at ${raisedAt}` : 'Raised on site',
      'and sent when the signal came back.',
      unprotected ? 'WITHOUT duplicate protection — week5-part43 has not been run on this database.' : '',
      lost ?? '',
    ]
      .filter(Boolean)
      .join(' '),
  })

  // ── The photograph ────────────────────────────────────────────────────
  //
  // After the defect, and never allowed to take it down with it. A defect
  // with no picture is a defect; a picture with no defect is nothing.
  let photo: { ok: boolean; reason?: string } = { ok: true }
  const file = form.get('photo')
  if (issueId && file instanceof File && file.size > 0) {
    const stored = await storeIssuePhoto({
      projectId: project.id,
      issueId,
      file,
      kind: 'defect',
      caption: str(form, 'photo_caption'),
      uploadedByName: actor.name ?? actor.email ?? null,
      clientRef: str(form, 'photo_ref'),
    })
    if (!stored.ok) {
      photo = { ok: false, reason: `${stored.reason} ${stored.hint}` }
      await recordAudit({
        projectId: project.id,
        action: 'photo from a phone not attached',
        entity: 'issue',
        entityId: issueId,
        entityLabel: title,
        comment: `${stored.reason} The defect itself was saved and is not affected.`,
      })
    }
  }

  // 200 even when the photograph failed: the DEFECT is on the punch list,
  // and telling the phone to keep carrying it would create a second copy of
  // a defect that is already recorded. The photograph problem is reported
  // separately, in words, and the person can attach it from the item.
  const { data: saved } = await supabase.from('issues').select('ref').eq('id', issueId ?? '').maybeSingle()

  return json({
    ok: true,
    already: false,
    id: issueId,
    ref: (saved as { ref: string | null } | null)?.ref ?? null,
    photo,
    note: [lost, unprotected ? 'This database has no protection against the same defect arriving twice — run week5-part43-raised-offline.sql.' : null]
      .filter(Boolean)
      .join(' ') || undefined,
  })
}

/**
 * What the phone asks for on the way IN — the tag list and what is already
 * outstanding — so that it has something to work from when the signal goes.
 *
 * Deliberately small: codes and names, not the whole register. This is
 * fetched over a site connection that may be one bar.
 */
export async function GET() {
  const refused = await requireAccess()
  if (refused) return json({ ok: false, reason: 'not signed in' }, 403)

  const project = await getCurrentProject()
  if (!project) return json({ ok: false, reason: 'no project' }, 409)

  const { data, error } = await supabase
    .from('issues')
    .select('id, ref, title, category, status, due_date, required_action')
    .eq('project_id', project.id)
    .not('status', 'in', '("verified","closed")')
    .order('created_at', { ascending: false })
    .limit(200)

  // A database missing part 42 fails this select. Ask again without the
  // column rather than handing the phone nothing at all.
  const rows =
    error && missingColumn(error.message)
      ? (
          await supabase
            .from('issues')
            .select('id, ref, title, category, status, due_date')
            .eq('project_id', project.id)
            .not('status', 'in', '("verified","closed")')
            .order('created_at', { ascending: false })
            .limit(200)
        ).data
      : data

  // The tag picker has to work with no signal, so the list comes down with
  // everything else. Codes and names only — the whole asset tree over one
  // bar of signal is a download somebody cancels.
  const index = await loadSubjectIndex(project.id)
  const subjects = [...index.byKey.values()]
    .filter((s) => s.type !== 'project')
    .map((s) => ({ ref: `${s.type}:${s.id}`, code: s.code, name: s.name, type: s.type }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'equipment' ? 1 : -1
      return (a.code ?? a.name).localeCompare(b.code ?? b.name)
    })

  return json({
    ok: true,
    project: { id: project.id, name: project.name },
    subjects,
    open: rows ?? [],
    at: new Date().toISOString(),
  })
}
