import { assessAttachment, clearAttachmentAssessment } from '@/app/documents/ai-actions'
import { VALUES_NOTE, type ExtractedValue } from '@/lib/document-review'

export type AttachmentAiFields = {
  id: string
  file_name: string | null
  ai_model: string | null
  ai_reviewed_at: string | null
  ai_reviewed_by_name: string | null
  ai_confidence: string | null
  ai_appears_to_be: string | null
  ai_matches_filing: string | null
  ai_mismatch: string | null
  ai_problem: string | null
  ai_recommendation: string | null
  ai_values: unknown
}

function valuesOf(raw: unknown): ExtractedValue[] {
  if (!Array.isArray(raw)) return []
  const out: ExtractedValue[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    if (typeof r.label === 'string' && typeof r.value === 'string') {
      out.push({
        label: r.label,
        value: r.value,
        where: typeof r.where === 'string' ? r.where : 'location not stated',
      })
    }
  }
  return out
}

/**
 * An AI reading of an uploaded document.
 *
 * The mismatch verdict is deliberately the first thing on the panel and the
 * loudest. "This certificate is for a different tag" is the finding that
 * saves somebody at handover; everything else is supporting detail.
 */
export default function DocumentAssessment({ row }: { row: AttachmentAiFields }) {
  const has = !!row.ai_reviewed_at
  const values = valuesOf(row.ai_values)
  const mismatch = row.ai_matches_filing === 'no'

  return (
    <div
      style={{
        border: `1px dashed ${mismatch ? 'var(--color-danger)' : 'var(--color-border)'}`,
        borderRadius: 8,
        padding: 12,
        marginTop: 10,
        background: 'var(--color-surface-2, #f8fafc)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>
          AI reading of the document
        </span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {has && (
            <span className="text-secondary" style={{ fontSize: 11 }}>
              {row.ai_model ?? 'not sent to a model'} · {(row.ai_reviewed_at ?? '').slice(0, 10)}
            </span>
          )}
          <form action={assessAttachment}>
            <input type="hidden" name="id" value={row.id} />
            <button type="submit" className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}>
              {has ? 'Read again' : 'Read this document'}
            </button>
          </form>
          {has && (
            <form action={clearAttachmentAssessment}>
              <input type="hidden" name="id" value={row.id} />
              <button type="submit" className="btn-link" style={{ fontSize: 11 }}>
                Clear
              </button>
            </form>
          )}
        </div>
      </div>

      {!has && (
        <p className="text-secondary" style={{ margin: '8px 0 0', fontSize: 12.5 }}>
          Opens the file, says what it appears to be from its content rather than its name, whether it is about the
          thing it is filed against, and what is printed on it. It never says a document is acceptable — accepting
          evidence is your signature.
        </p>
      )}

      {has && (
        <>
          {mismatch && (
            <div
              style={{
                marginTop: 10,
                padding: '8px 10px',
                borderRadius: 6,
                background: 'var(--color-danger-bg, #fef2f2)',
              }}
            >
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--color-danger)' }}>
                This may not be about what it is filed against.
              </p>
              {row.ai_mismatch && <p style={{ margin: '4px 0 0', fontSize: 12.5 }}>{row.ai_mismatch}</p>}
              <p className="text-secondary" style={{ margin: '4px 0 0', fontSize: 11.5 }}>
                A certificate for the wrong tag or the wrong revision makes a record look complete while proving
                nothing — and an attachment that looks complete never gets chased.
              </p>
            </div>
          )}

          {row.ai_matches_filing === 'yes' && (
            <p style={{ margin: '10px 0 0', fontSize: 12.5 }}>
              <strong>Appears to be about the right thing.</strong> That is the model&apos;s reading of the page, not
              a check that anybody has signed.
            </p>
          )}

          {row.ai_appears_to_be && <Block title="What this appears to be" body={row.ai_appears_to_be} />}
          {row.ai_problem && <Block title="What is missing or unusable" body={row.ai_problem} />}
          {row.ai_recommendation && <Block title="What to do" body={row.ai_recommendation} />}

          {values.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 0.3,
                  color: 'var(--color-text-secondary, #5b6b85)',
                }}
              >
                Read off the page — {values.length} value{values.length === 1 ? '' : 's'}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ marginTop: 6, fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 130 }}>What</th>
                      <th style={{ minWidth: 110 }}>As printed</th>
                      <th>Where it was found</th>
                    </tr>
                  </thead>
                  <tbody>
                    {values.map((v, i) => (
                      <tr key={i}>
                        <td>{v.label}</td>
                        <td className="mono">{v.value}</td>
                        <td className="text-secondary" style={{ fontSize: 11.5 }}>
                          {v.where}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-secondary" style={{ margin: '6px 0 0', fontSize: 11.5, fontStyle: 'italic' }}>
                {VALUES_NOTE}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.3,
          color: 'var(--color-text-secondary, #5b6b85)',
        }}
      >
        {title}
      </div>
      <p style={{ margin: '2px 0 0', fontSize: 13 }}>{body}</p>
    </div>
  )
}
