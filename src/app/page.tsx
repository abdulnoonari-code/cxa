import Link from 'next/link'

export default function Home() {
  return (
    <div className="app-shell" style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center', paddingTop: 96 }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 56,
          height: 56,
          borderRadius: 14,
          background: 'var(--color-primary)',
          color: '#fff',
          fontWeight: 800,
          fontSize: 22,
          marginBottom: 20,
        }}
      >
        CX
      </div>
      <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 10 }}>CxSentinel</h1>
      <p style={{ fontSize: 16, color: 'var(--color-text-secondary)', marginBottom: 36, lineHeight: 1.6 }}>
        AI commissioning copilot for data centers, substations, and power plants — equipment
        registers, checklists with document attachments, and issue tracking, watched over by an
        AI reviewer.
      </p>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
        <Link href="/equipment" className="btn btn-primary">
          Equipment &amp; Tags
        </Link>
        <Link href="/plan" className="btn btn-secondary">
          Project Plan
        </Link>
        <Link href="/milestones" className="btn btn-secondary">
          Milestones
        </Link>
        <Link href="/issues" className="btn btn-secondary">
          Issues &amp; Punchlist
        </Link>
      </div>

      <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
        <Link href="/login" className="link">
          Log in
        </Link>{' '}
        or{' '}
        <Link href="/signup" className="link">
          create an account
        </Link>
      </p>
    </div>
  );
}
