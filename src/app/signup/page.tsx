import { signup } from '../login/actions'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="auth-shell">
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'var(--color-primary)',
            color: '#fff',
            fontWeight: 800,
            fontSize: 16,
            marginBottom: 14,
          }}
        >
          CX
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>CxSentinel</h1>
        <p className="text-secondary" style={{ fontSize: 14 }}>
          Create your account
        </p>
      </div>

      <div className="auth-card">
        {error && <p className="alert alert-danger">{error}</p>}

        <form action={signup} style={{ display: 'grid', gap: 14 }}>
          <label className="field">
            Your name
            <input type="text" name="full_name" placeholder="e.g. Abdul Jabbar" className="input" />
          </label>
          <label className="field">
            Email
            <input type="email" name="email" required className="input" />
          </label>
          <label className="field">
            Password
            <input type="password" name="password" required minLength={6} className="input" />
          </label>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 4 }}>
            Create account
          </button>
        </form>

        <p style={{ marginTop: 18, fontSize: 14, textAlign: 'center' }} className="text-secondary">
          Already have an account?{' '}
          <a href="/login" className="link">
            Log in
          </a>
        </p>
      </div>
    </main>
  )
}
