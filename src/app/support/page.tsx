import Link from 'next/link'
import { runSetupProbes } from '@/data/setup-checks'
import { countStates } from '@/lib/setup-checks'
import { aiConfigured } from '@/lib/ai'

export const dynamic = 'force-dynamic'

// A help page that helps.
//
// The temptation with a page called Support is to fill it with a phone
// number nobody answers and a promise of a response time nobody has agreed
// to. This one does not invent any of that. It answers the questions this
// application actually generates — why is a screen empty, why is a panel
// off, why was my file refused — and it says plainly that the contact
// details have not been set, rather than printing a plausible-looking
// address that goes nowhere.

const QUESTIONS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'A screen is empty and I know there is work recorded',
    a: (
      <>
        Almost always the wrong project is open, or none is. The rail on the left says which one. If it says none,
        open one from the <Link href="/projects">project register</Link>. Every screen except this one, the register
        and Administrator is scoped to a single project.
      </>
    ),
  },
  {
    q: 'A number looks too good',
    a: (
      <>
        Check it against <Link href="/rules">Rule Checks</Link> before you send it anywhere. A level can read
        complete because nothing was ever recorded against it, and a defect can be closed with nothing to show it
        was fixed. That page is free, runs on every open, and says what could not be verified.
      </>
    ),
  },
  {
    q: 'An assessment panel says AI is switched off',
    a: (
      <>
        No API key is set, so the panels that ask a model to read a defect, an obligation or a document do not run
        and are not charged for. Everything on Rule Checks works without a key and always will. Administrator →
        Set-up says whether a key is present.
      </>
    ),
  },
  {
    q: 'My test script was refused when I imported it',
    a: (
      <>
        The message names the reason. The usual one is that the tag or system in the sheet does not exist on the
        open project yet — the importer will not invent a tag, because a check recorded against something that was
        never installed is worse than a check that was never imported. Add the tag first, then import again.
      </>
    ),
  },
  {
    q: 'A screen says a database step has not been run',
    a: (
      <>
        Administrator → Set-up lists every step and names the file to run for each one that is missing. It asks the
        database each time the page opens, so it is never a stale list. Every step is safe to run twice.
      </>
    ),
  },
  {
    q: 'Somebody cannot see a project',
    a: (
      <>
        The register shows a person the projects their email address is on. Add them on that project&rsquo;s team
        page. A project with no team list at all is visible to everybody — the register marks those.
      </>
    ),
  },
]

export default async function SupportPage() {
  const results = await runSetupProbes()
  const n = countStates(results)

  return (
    <>
      <h1 className="page-title">Support &amp; contact</h1>
      <p className="page-subtitle">
        What to do when something looks wrong, and where the application will tell you the truth about itself.
      </p>

      <div className="card">
        <h2 className="section-title">Before asking anybody</h2>
        <p style={{ fontSize: 13, margin: '0 0 10px' }}>
          Two pages answer most questions without a person, and both work out their answer from the records each
          time you open them rather than reading a stored summary.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/setup" className="btn btn-secondary">
            Set-up &amp; diagnostics — {n.ok}/{results.length} steps in place
          </Link>
          <Link href="/rules" className="btn btn-secondary">
            Rule Checks — what the records cannot prove
          </Link>
        </div>
        <p className="text-secondary" style={{ margin: '10px 0 0', fontSize: 12 }}>
          AI panels are {aiConfigured() ? 'switched on and will be charged for' : 'switched off — no key is set'}.
        </p>
      </div>

      <h2 className="section-title" style={{ marginTop: 26 }}>
        Common questions
      </h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {QUESTIONS.map((item) => (
          <details key={item.q} className="card" style={{ margin: 0 }}>
            <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>{item.q}</summary>
            <p style={{ margin: '8px 0 0', fontSize: 13 }}>{item.a}</p>
          </details>
        ))}
      </div>

      <div className="card" style={{ marginTop: 22 }}>
        <h2 className="section-title">Who to contact</h2>
        <p style={{ fontSize: 13, margin: 0 }}>
          No support contact has been set for this installation. Rather than print an address that goes nowhere,
          this page says so. Whoever administers this account can add one — until then, the person who set the
          application up is the contact.
        </p>
      </div>
    </>
  )
}
