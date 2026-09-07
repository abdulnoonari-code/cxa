import { refusalNote, type Verdict } from '@/lib/gate'
import { logout } from '@/app/login/actions'

/**
 * What a signed-in account that is not on any project sees.
 *
 * Deliberately austere, and deliberately carries NO project data — not a
 * count, not a name, not "3 projects exist". A refused page that leaks how
 * many projects there are has told a stranger something about the job.
 *
 * It does print the address they are signed in as, because that is the one
 * thing they have to quote to get access, and "ask to be added" without it
 * sends somebody back to check which of their three addresses they used.
 */
export default function NoAccess({ verdict }: { verdict: Verdict }) {
  return (
    <div className="plain-layout">
      <div className="plain-shell" style={{ maxWidth: 620 }}>
        <div className="card">
          <h1 className="page-title" style={{ fontSize: 22 }}>
            No access to this site
          </h1>
          <p className="text-secondary" style={{ fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>
            {refusalNote(verdict)}
          </p>

          {verdict.email && (
            <p className="mono" style={{ fontSize: 13, marginTop: 16, padding: '10px 12px', background: 'var(--color-neutral-bg)', borderRadius: 8 }}>
              {verdict.email}
            </p>
          )}

          <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 18, marginBottom: 0 }}>
            Signing in and being allowed in are two different things. This account exists; it is simply not on any
            project.
          </p>

          <form action={logout} style={{ marginTop: 18 }}>
            <button type="submit" className="btn btn-secondary">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
