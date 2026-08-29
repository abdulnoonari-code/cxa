import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const { error, message } = await searchParams

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
          AI commissioning copilot — log in to continue
        </p>
      </div>

      <div className="auth-card">
        {message && <p className="alert alert-info">{message}</p>}
        {error && <p className="alert alert-danger">{error}</p>}

        <form action={login} style={{ display: 'grid', gap: 14 }}>
          <label className="field">
            Email
            <input type="email" name="email" required className="input" />
          </label>
          <label className="field">
            Password
            <input type="password" name="password" required className="input" />
          </label>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 4 }}>
            Log in
          </button>
        </form>

        <p style={{ marginTop: 18, fontSize: 14, textAlign: 'center' }} className="text-secondary">
          No account yet?{' '}
          <a href="/signup" className="link">
            Sign up
          </a>
        </p>
      </div>
    </main>
  )
}
