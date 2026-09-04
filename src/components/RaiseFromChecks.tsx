import { raiseFromFailedChecks } from '@/app/issues/raise-actions'
import { loadFailedChecks } from '@/data/failed-checks'
import { unraised, draftTitle } from '@/lib/failed-checks'
import { levelCode } from '@/lib/levels'

/**
 * Failed checks that nobody has raised a defect for.
 *
 * The card only appears when there are some. A permanent "raise from checks"
 * button that usually does nothing teaches people to ignore it, and this is
 * the one thing on the punch list screen that should never be ignored.
 */
export default async function RaiseFromChecks({
  projectId,
  params,
}: {
  projectId: string | null
  params: Record<string, string | string[] | undefined>
}) {
  const one = (k: string) => {
    const v = params[k]
    return Array.isArray(v) ? v[0] : v
  }
  const state = one('raise')

  const { checks, raisedFor } = await loadFailedChecks(projectId)
  const todo = unraised(checks, raisedFor)

  if (todo.length === 0 && !state) return null

  return (
    <>
      {state === 'ok' && (
        <div className="alert" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
          <strong>
            {one('n')} punch item{one('n') === '1' ? '' : 's'} raised — {one('from')} to {one('to')}.
          </strong>{' '}
          Every one is uncategorised, because A, B or C is a commercial position and nothing in a failed check
          implies it. Set the category, the party and the date on each.
        </div>
      )}
      {state === 'none' && (
        <div className="alert alert-info">Nothing to raise — every failed check already has an item against it.</div>
      )}
      {state === 'error' && (
        <div className="alert alert-danger">
          <strong>Nothing was raised.</strong> {one('detail')}
        </div>
      )}

      {todo.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--color-danger)' }}>
          <h2 className="section-title" style={{ marginBottom: 4 }}>
            {todo.length} failed check{todo.length === 1 ? '' : 's'} with no punch item
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 13 }}>
            Somebody wrote <strong>No</strong> on a test sheet and nothing was raised. The check is honest and
            the punch list is honest, and between them {todo.length === 1 ? 'a defect exists' : 'defects exist'}{' '}
            that every count on this project reports as zero — including the readiness figures and anything sent
            to the client.
          </p>

          <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12.5 }}>
            {todo.slice(0, 6).map((c) => (
              <li key={c.id} className="text-secondary">
                <span className="mono" style={{ fontSize: 11 }}>
                  {levelCode(c.level)}
                </span>{' '}
                {c.serial ? `${c.serial}. ` : ''}
                {draftTitle(c.item)}
              </li>
            ))}
            {todo.length > 6 && <li className="text-secondary">and {todo.length - 6} more</li>}
          </ul>

          <form action={raiseFromFailedChecks} style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary">
              Raise {todo.length} punch item{todo.length === 1 ? '' : 's'}
            </button>
          </form>

          <p className="text-secondary" style={{ margin: '10px 0 0', fontSize: 11.5, fontStyle: 'italic' }}>
            Each item takes the check&apos;s own words, the section it sat in, its level and its tag, and stays
            linked to the check that found it. The category, severity, responsible party and date are left
            empty — those are decisions with money attached, and a failed check does not imply any of them.
          </p>
        </div>
      )}
    </>
  )
}
