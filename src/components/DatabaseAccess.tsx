import { USING_SERVICE_ROLE } from '@/lib/supabase'
import { probeAnonAccess, accessVerdict } from '@/lib/db-access'

/**
 * Who can reach this database, tested rather than assumed.
 *
 * It lives on the Project page because that is the screen somebody opens when
 * they are setting the project up, which is the moment this is worth knowing —
 * before anybody's real test results are in here.
 *
 * It is deliberately not hidden once the answer is good. A security control
 * that disappears when it passes gives no way to notice the day it stops
 * passing.
 */
export default async function DatabaseAccess({ projectExists }: { projectExists: boolean }) {
  const probe = await probeAnonAccess(projectExists)
  const verdict = accessVerdict(USING_SERVICE_ROLE, probe)

  const tone =
    verdict.level === 'danger'
      ? { border: 'var(--color-danger)', text: 'var(--color-danger)' }
      : verdict.level === 'ok'
        ? { border: 'var(--color-border)', text: 'var(--color-text)' }
        : { border: 'var(--color-warning, #a35700)', text: 'var(--color-warning, #a35700)' }

  return (
    <div
      className="card"
      style={{ borderLeft: `4px solid ${tone.border}` }}
      role={verdict.level === 'danger' ? 'alert' : undefined}
    >
      <h2 className="section-title" style={{ marginBottom: 4 }}>
        Database access
      </h2>
      <div style={{ fontSize: 14, fontWeight: 600, color: tone.text, marginTop: 8 }}>{verdict.title}</div>
      <p className="text-secondary" style={{ margin: '4px 0 0', fontSize: 13 }}>
        {verdict.detail}
      </p>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12 }}>
        <div>
          <div
            className="text-secondary"
            style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600 }}
          >
            This application reads with
          </div>
          <div style={{ fontSize: 13 }}>
            {USING_SERVICE_ROLE ? 'A server key the browser never receives' : 'The key inside the browser bundle'}
          </div>
        </div>
        <div>
          <div
            className="text-secondary"
            style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600 }}
          >
            A stranger reading projects directly
          </div>
          <div style={{ fontSize: 13 }}>
            {probe.canRead ? 'Succeeded' : probe.blocked ? 'Was refused' : 'Could not be determined'}
            {probe.detail && !probe.canRead ? (
              <span className="text-secondary mono" style={{ fontSize: 11 }}>
                {' '}
                — {probe.detail}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <p className="text-secondary" style={{ margin: '12px 0 0', fontSize: 11, fontStyle: 'italic' }}>
        Tested on every load by asking the database as an anonymous visitor would, using the same key that is
        compiled into this page. It is not read from a setting.
      </p>
    </div>
  )
}
