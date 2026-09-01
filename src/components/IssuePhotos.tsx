import { uploadIssuePhoto, deleteIssuePhoto, reviewIssuePhoto, comparePhotos } from '@/app/issues/photo-actions'
import {
  PHOTO_KINDS,
  kindLabel,
  kindBadgeClass,
  confidenceBadgeClass,
  CONFIDENCE_LABELS,
  caveatFor,
  overreaches,
  summarise,
  canCompare,
  isConfidence,
  MAX_BYTES,
  ACCEPTED_TYPES,
} from '@/lib/photo'
import type { IssuePhoto } from '@/data/photos'

function when(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Photo evidence on one punch item.
 *
 * The layout says the important thing before anybody reads a word: the
 * photograph is large and the AI's opinion of it sits underneath in a box that
 * is visibly a comment rather than a field. On a punch list the picture is the
 * evidence; what a model made of it is a prompt to go and look.
 */
export function IssuePhotos({
  issueId,
  photos,
  schemaReady,
  aiConfigured,
  notice,
}: {
  issueId: string
  photos: IssuePhoto[]
  schemaReady: boolean
  aiConfigured: boolean
  notice?: { photo?: string; ai?: string; reason?: string; hint?: string }
}) {
  const summary = summarise(photos)
  const defect = photos.find((p) => p.kind === 'defect')
  const fix = photos.find((p) => p.kind === 'fix')
  const comparable = canCompare(photos)

  if (!schemaReady) {
    return (
      <div className="card" style={{ marginTop: 18, borderLeft: '4px solid var(--color-warning-solid, #d97706)' }}>
        <h2 className="section-title">Photo evidence</h2>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>The database cannot hold photographs yet.</p>
        <p className="text-secondary" style={{ margin: '6px 0 0', fontSize: 13 }}>
          Run <span className="mono">week5-part21-photos.sql</span> in Supabase → SQL Editor, then reload this page.
        </p>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2 className="section-title">Photo evidence</h2>
      <p className="text-secondary" style={{ fontSize: 13, margin: '0 0 4px' }}>
        A punch item is a defect somebody walked up to and saw. The photograph is the only part of that anybody else
        will ever see.
      </p>
      <p className="text-secondary" style={{ fontSize: 12.5, margin: '0 0 12px' }}>
        <strong>The photo is evidence. What the AI makes of it is not.</strong> A reading is a prompt to go and look —
        it never changes a status, never closes an item, and is not counted anywhere. Closing this item is your
        signature, not the model&rsquo;s.
      </p>

      {summary.fixWithoutDefect && (
        <p className="badge badge-warning" style={{ display: 'inline-block', marginBottom: 10 }}>
          There is an after-photo but no before-photo, so there is nothing to compare it against.
        </p>
      )}
      {notice?.photo === 'ok' && (
        <p className="badge badge-success" style={{ display: 'inline-block', marginBottom: 10 }}>Photo attached.</p>
      )}
      {notice?.photo === 'removed' && (
        <p className="badge badge-neutral" style={{ display: 'inline-block', marginBottom: 10 }}>
          Photo deleted. The audit entry is the only record it existed.
        </p>
      )}
      {notice?.photo === 'badfile' && (
        <div className="card" style={{ borderLeft: '4px solid var(--color-danger-solid)', marginBottom: 10 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>{notice.reason}</p>
          <p className="text-secondary" style={{ margin: '5px 0 0', fontSize: 12.5 }}>{notice.hint}</p>
        </div>
      )}
      {notice?.photo === 'denied' && (
        <p className="badge badge-danger" style={{ display: 'inline-block', marginBottom: 10 }}>
          Your role cannot change the evidence on this item.
        </p>
      )}
      {notice?.ai === 'failed' && (
        <div className="card" style={{ borderLeft: '4px solid var(--color-danger-solid)', marginBottom: 10 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>The review could not be done.</p>
          <p className="text-secondary" style={{ margin: '5px 0 0', fontSize: 12.5 }}>{notice.reason}</p>
        </div>
      )}
      {notice?.ai === 'unreadable' && (
        <p className="badge badge-warning" style={{ display: 'inline-block', marginBottom: 10 }}>
          The model replied, but not in a form this app could read. Nothing was saved.
        </p>
      )}
      {notice?.ai === 'unreachable' && (
        <p className="badge badge-warning" style={{ display: 'inline-block', marginBottom: 10 }}>
          The photograph could not be fetched from storage — check the bucket is public.
        </p>
      )}

      {/* ── Upload ──────────────────────────────────────────────────────── */}
      <form
        action={uploadIssuePhoto}
        style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}
      >
        <input type="hidden" name="issue_id" value={issueId} />
        <select name="kind" className="input" style={{ fontSize: 12.5, maxWidth: 180 }} defaultValue="defect">
          {PHOTO_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <input
          type="file"
          name="file"
          required
          accept={ACCEPTED_TYPES.join(',')}
          className="input"
          style={{ maxWidth: 300, fontSize: 12.5 }}
        />
        <input
          name="caption"
          placeholder="What the photo shows (optional)"
          className="input"
          style={{ maxWidth: 280, fontSize: 12.5 }}
        />
        <button type="submit" className="btn btn-primary btn-sm">
          Attach photo
        </button>
        <span className="text-secondary" style={{ fontSize: 11.5 }}>
          JPEG, PNG or WebP, up to {MAX_BYTES / 1024 / 1024} MB
        </span>
      </form>

      {/* ── Before and after ────────────────────────────────────────────── */}
      {comparable && aiConfigured && defect && fix && (
        <div className="card" style={{ marginBottom: 14, background: 'var(--color-primary-light)' }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>Compare the before and after</p>
          <p className="text-secondary" style={{ margin: '5px 0 9px', fontSize: 12.5 }}>
            The useful question is not &ldquo;what is wrong in this photo&rdquo; — it is whether the after-photo shows
            the <em>same place</em> as the before-photo, with that defect addressed. A fix photo of a different panel is
            the commonest way a punch item gets closed out without the work being done, and nothing else here can catch
            it.
          </p>
          <form action={comparePhotos}>
            <input type="hidden" name="issue_id" value={issueId} />
            <input type="hidden" name="defect_id" value={defect.id} />
            <input type="hidden" name="fix_id" value={fix.id} />
            <button type="submit" className="btn btn-secondary btn-sm">
              Ask the AI to compare them
            </button>
          </form>
        </div>
      )}

      {photos.length === 0 && (
        <p className="text-secondary" style={{ fontSize: 13, marginBottom: 0 }}>
          No photographs yet. A punch item with no picture is one somebody has to walk back out to see.
        </p>
      )}

      {/* ── The photographs ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {photos.map((p) => (
          <div key={p.id} className="card" style={{ padding: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <span className={kindBadgeClass(p.kind)} style={{ fontSize: 10 }}>
                {kindLabel(p.kind)}
              </span>
              <span className="text-secondary mono" style={{ fontSize: 10.5 }}>
                {p.uploaded_by_name ?? 'unknown'} · {when(p.created_at)}
              </span>
            </div>

            {p.file_url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={p.file_url}
                alt={p.caption ?? kindLabel(p.kind)}
                style={{
                  width: '100%',
                  maxHeight: 320,
                  objectFit: 'contain',
                  background: 'var(--color-neutral-bg)',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                }}
              />
            )}

            {p.caption && (
              <p style={{ fontSize: 12.5, margin: '8px 0 0' }}>
                <strong>Caption:</strong> {p.caption}
              </p>
            )}
            <p className="text-secondary mono" style={{ fontSize: 10.5, margin: '6px 0 0' }}>
              {p.file_name} · {p.size_bytes ? `${Math.round(p.size_bytes / 1024)} KB` : '—'}
            </p>

            {/* ── What the AI made of it ──────────────────────────────── */}
            {p.ai_reviewed_at && isConfidence(p.ai_confidence) && (
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  borderRadius: 8,
                  background: 'var(--color-neutral-bg)',
                  border: '1px dashed var(--color-border)',
                }}
              >
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                  <span className={confidenceBadgeClass(p.ai_confidence)} style={{ fontSize: 10 }}>
                    {CONFIDENCE_LABELS[p.ai_confidence]}
                  </span>
                  <span className="text-secondary mono" style={{ fontSize: 10 }}>
                    {p.ai_model} · {when(p.ai_reviewed_at)}
                  </span>
                </div>
                {p.ai_problem && (
                  <p style={{ fontSize: 12.5, margin: '0 0 6px' }}>
                    <strong>What it sees:</strong> {p.ai_problem}
                  </p>
                )}
                {p.ai_recommendation && (
                  <p style={{ fontSize: 12.5, margin: '0 0 6px' }}>
                    <strong>What it suggests:</strong> {p.ai_recommendation}
                  </p>
                )}
                {/* The caveat is never optional. An unqualified AI paragraph
                    beside a photograph of switchgear reads as a finding. */}
                <p
                  className="text-secondary"
                  style={{
                    fontSize: 11.5,
                    margin: 0,
                    fontWeight:
                      overreaches({
                        confidence: p.ai_confidence,
                        problem: p.ai_problem ?? '',
                        recommendation: p.ai_recommendation ?? '',
                      })
                        ? 600
                        : 400,
                    color: overreaches({
                      confidence: p.ai_confidence,
                      problem: p.ai_problem ?? '',
                      recommendation: p.ai_recommendation ?? '',
                    })
                      ? 'var(--color-danger)'
                      : undefined,
                  }}
                >
                  {caveatFor({
                    confidence: p.ai_confidence,
                    problem: p.ai_problem ?? '',
                    recommendation: p.ai_recommendation ?? '',
                  })}
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
              <a href={`/issues/photo/${p.id}/download`} className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}>
                Download
              </a>
              {aiConfigured && (
                <form action={reviewIssuePhoto}>
                  <input type="hidden" name="issue_id" value={issueId} />
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}>
                    {p.ai_reviewed_at ? 'Review again' : 'Ask the AI to look'}
                  </button>
                </form>
              )}
              <form action={deleteIssuePhoto}>
                <input type="hidden" name="issue_id" value={issueId} />
                <input type="hidden" name="id" value={p.id} />
                <button type="submit" className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}>
                  Delete
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>

      {!aiConfigured && photos.length > 0 && (
        <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
          No Anthropic API key is set on this deployment, so nothing can be reviewed. Add{' '}
          <span className="mono">ANTHROPIC_API_KEY</span> in Vercel → Settings → Environment Variables and redeploy.
          The photographs and the download work without it.
        </p>
      )}
    </div>
  )
}
