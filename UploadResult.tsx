import { readOutcome } from '@/lib/uploads'

/**
 * The sentence at the top of a screen after a file was uploaded.
 *
 * Deliberately the same on every screen that takes a file. Five upload paths
 * used to report their results five different ways — one redirected with a
 * flag, one showed nothing at all, three returned silently — so somebody who
 * learned what a successful upload looked like on the checklist screen learned
 * nothing about the punch list.
 *
 * The failure state is not dismissible and does not fade. An upload failure is
 * the one thing on these screens that will not fix itself, and it is what a
 * missing photograph in a handover pack looks like six weeks earlier.
 */
export default function UploadResult({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const outcome = readOutcome(searchParams)
  if (!outcome) return null

  if (outcome.ok) {
    return (
      <div
        className="card"
        style={{ borderLeft: '4px solid var(--color-success-solid, #16a34a)', marginBottom: 14 }}
        role="status"
      >
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>
          Uploaded — <span className="mono">{outcome.file}</span>
          {outcome.against ? (
            <>
              {' '}
              is now attached to <span className="mono">{outcome.against}</span>.
            </>
          ) : (
            ' is saved.'
          )}
        </p>
        <p className="text-secondary" style={{ margin: '4px 0 0', fontSize: 12.5 }}>
          It is recorded against this project and will appear in the documents that carry evidence.
        </p>
      </div>
    )
  }

  return (
    <div className="card" style={{ borderLeft: '4px solid var(--color-danger)', marginBottom: 14 }} role="alert">
      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--color-danger)' }}>
        <span className="mono">{outcome.file}</span> was not saved.
      </p>
      {outcome.reason && (
        <p style={{ margin: '5px 0 0', fontSize: 12.5 }}>{outcome.reason}</p>
      )}
      {outcome.hint && (
        <p className="text-secondary" style={{ margin: '5px 0 0', fontSize: 12.5 }}>
          {outcome.hint}
        </p>
      )}
    </div>
  )
}
