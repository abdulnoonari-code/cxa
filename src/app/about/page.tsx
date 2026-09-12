import Link from 'next/link'

export const metadata = { title: 'About CxSentinel' }

// The public page. Reachable without logging in, because the login screen
// links to it and somebody who has been sent an invitation should be able to
// find out what they have been invited to.
//
// Nothing on it is invented. The manual describes what the application
// actually does, and the contact block says plainly that no contact has been
// set rather than printing an address that goes nowhere — a support number
// that is not answered is worse than none, because somebody waits on it.

const LEVELS = [
  ['L1', 'Factory acceptance', 'Proved at the works, before it ships. Belongs to a device.'],
  ['L2', 'Installation verification', 'Installed correctly, on site. Belongs to a device.'],
  ['L3', 'Pre-functional', 'Ready to be energised and driven. Belongs to a device.'],
  ['L4', 'Functional test', 'The assembly works on its own — interlocks, sequences, changeover. Belongs to the system.'],
  ['L5', 'Integrated test', 'The assembly works with the systems around it. Belongs to the system.'],
]

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginTop: 16 }} id={id}>
      <h2 className="section-title">{title}</h2>
      {children}
    </div>
  )
}

export default function AboutPage() {
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 11,
            background: 'var(--color-primary)',
            color: '#fff',
            fontWeight: 800,
            fontSize: 15,
          }}
        >
          CX
        </span>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>CxSentinel</h1>
      </div>
      <p className="text-secondary" style={{ fontSize: 14.5, margin: '0 0 4px' }}>
        Commissioning management for data centres, substations and power plants.
      </p>

      <div style={{ display: 'flex', gap: 14, fontSize: 13, marginTop: 14 }}>
        <a href="#what" className="link">
          What it is
        </a>
        <a href="#manual" className="link">
          Manual
        </a>
        <a href="#contact" className="link">
          Contact
        </a>
        <Link href="/login" className="link">
          Log in
        </Link>
      </div>

      <Section id="what" title="What it is">
        <p style={{ fontSize: 13.5, margin: '0 0 10px' }}>
          A commissioning record that can be handed over and stood behind. It holds the equipment register, the
          checklists at every level, the test scripts, the punch list and the documents, and it works out
          completion from those records rather than from anybody&rsquo;s summary of them.
        </p>
        <p style={{ fontSize: 13.5, margin: 0 }}>
          The part that makes it different is that it argues with itself. A set of free checks runs over the
          records every time a screen opens and reports what the records cannot prove — a check marked complete
          that depends on a line that failed, a defect closed with no photograph of the repair, a level that reads
          finished because nothing was ever recorded against it. Those are the things that get found at handover
          when it is expensive, and there is no cost and no AI involved in finding them here.
        </p>
      </Section>

      <Section id="manual" title="Manual">
        <p style={{ fontSize: 13.5, margin: '0 0 12px' }}>
          <strong>Everything lives inside a project.</strong> Log in, choose a project, and every screen from then
          on shows that project only. You see the projects your email address has been given access to.
        </p>

        <p style={{ fontSize: 13.5, margin: '0 0 6px' }}>
          <strong>Five levels, and two different owners.</strong>
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ fontSize: 12.5 }}>
            <tbody>
              {LEVELS.map(([code, name, what]) => (
                <tr key={code}>
                  <td className="mono" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {code}
                  </td>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{name}</td>
                  <td className="text-secondary">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-secondary" style={{ fontSize: 12.5, margin: '8px 0 12px' }}>
          The two halves are never added together. One figure across L1 to L5 would let a switchboard read most of
          the way finished on the strength of factory tests alone, with no functional testing carried out at all.
        </p>

        <p style={{ fontSize: 13.5, margin: '0 0 6px' }}>
          <strong>Getting your work in.</strong> Equipment and checklists import from a spreadsheet. Test scripts
          use a standard format with a serial number, the content, a Yes / No / N-A answer, an attachment, a remark
          and what each line connects to. Every imported line keeps its row number, so a finding points at a line
          you can go and find in your own sheet.
        </p>
        <p className="text-secondary" style={{ fontSize: 12.5, margin: '0 0 12px' }}>
          An import that cannot be checked is refused and says why. It will not invent a tag: a check recorded
          against equipment that was never installed is worse than a check that was never imported.
        </p>

        <p style={{ fontSize: 13.5, margin: '0 0 14px' }}>
          <strong>Getting your work out.</strong> The handover pack is generated from the records — the levels, the
          registers, the open items and what the automatic checks found. A pack that hides what is missing gets
          found out; one that names it gets negotiated.
        </p>

        <p style={{ fontSize: 13.5, margin: 0, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
          That is the shape of it. The{' '}
          <Link href="/manual" className="link">
            <strong>full manual</strong>
          </Link>{' '}
          goes through every screen one at a time — what you see, what you can do, what it works out for you and
          what it needs first — with the spreadsheet formats, the five levels, who may do what, and block diagrams
          of how the parts fit together. It needs no account to read.
        </p>
      </Section>

      <Section id="contact" title="Contact">
        <p style={{ fontSize: 13.5, margin: 0 }}>
          No support contact has been set for this installation yet. Rather than print an address that nobody
          answers, this page says so. If you were invited to a project, the person who invited you is the contact.
        </p>
      </Section>

      <p className="text-secondary" style={{ fontSize: 11.5, marginTop: 22, textAlign: 'center' }}>
        <Link href="/login" className="link">
          Log in
        </Link>{' '}
        ·{' '}
        <Link href="/signup" className="link">
          Create an account
        </Link>
      </p>
    </div>
  )
}
