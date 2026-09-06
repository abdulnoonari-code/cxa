import Link from 'next/link'
import { runSetupProbes } from '@/data/setup-checks'
import { countStates } from '@/lib/setup-checks'
import { USING_SERVICE_ROLE } from '@/lib/supabase'
import { probeAnonAccess, accessVerdict } from '@/lib/db-access'
import { loadRegister } from '@/data/register'

export const dynamic = 'force-dynamic'

// Everything that is about the ACCOUNT rather than about a project.
//
// These four pages were scattered: Set-up sat in the project rail beside
// Project Details, so the worked example — a developer's diagnostic that
// creates a whole fake project — appeared on every project anybody opened.
// Roles sat under a project's People section although a role is defined for
// the account. All Projects, which can delete a project and everything in
// it, sat two items below the dashboard.
//
// The test for this page is simple: nothing here changes when you switch
// project, and nothing on a project screen belongs here.

function Row({ href, title, detail, state }: { href: string; title: string; detail: string; state?: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="card"
      style={{ margin: 0, display: 'block', textDecoration: 'none', color: 'inherit' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
        {state}
      </div>
      <p className="text-secondary" style={{ margin: '4px 0 0', fontSize: 13 }}>
        {detail}
      </p>
    </Link>
  )
}

export default async function AdminPage() {
  const [results, anon, reg] = await Promise.all([runSetupProbes(), probeAnonAccess(false), loadRegister()])
  const n = countStates(results)
  const access = accessVerdict(USING_SERVICE_ROLE, anon)

  return (
    <>
      <h1 className="page-title">Administrator</h1>
      <p className="page-subtitle">
        The account, not any one project. Nothing on this page changes when you switch project.
      </p>

      {access.level === 'danger' && (
        <div className="alert alert-danger" style={{ marginBottom: 16 }}>
          <strong>{access.title}</strong> {access.detail}
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        <Row
          href="/setup"
          title="Set-up &amp; diagnostics"
          detail="Which database steps are actually in place, who can reach the data, whether AI is switched on, and the worked example."
          state={
            <span
              className="badge"
              style={{ color: n.missing > 0 ? 'var(--color-danger)' : undefined, fontWeight: 700 }}
            >
              {n.ok}/{results.length} steps
            </span>
          }
        />
        <Row
          href="/projects/manage"
          title="All projects"
          detail="Create a project, or delete one and every record in it. The delete asks for your password and cannot be undone."
          state={<span className="badge">{reg.entries.length + reg.hidden} registered</span>}
        />
        <Row
          href="/roles"
          title="People &amp; roles"
          detail="The roles a project can define and what each one may do. Who is on which project is set on that project's team page."
        />
        <Row
          href="/audit"
          title="Audit trail"
          detail="Every change anybody made, in order. Append-only — nothing here can be edited or deleted, including by an administrator."
        />
      </div>
    </>
  )
}
