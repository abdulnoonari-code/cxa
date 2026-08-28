import { login } from './actions'
import { inputStyle, buttonStyle, labelStyle } from '../equipment/styles'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const { error, message } = await searchParams

  return (
    <main style={{ maxWidth: 420, margin: '80px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>CXA — Log in</h1>
      <p style={{ color: '#555', marginBottom: 24 }}>Commissioning platform</p>

      {message && (
        <p style={{ padding: 10, background: '#f3f6fb', borderRadius: 6, marginBottom: 16, fontSize: 14 }}>
          {message}
        </p>
      )}
      {error && (
        <p style={{ padding: 10, background: '#fbeeee', color: '#b23a3a', borderRadius: 6, marginBottom: 16, fontSize: 14 }}>
          {error}
        </p>
      )}

      <form action={login} style={{ display: 'grid', gap: 14 }}>
        <label style={labelStyle}>
          Email
          <input type="email" name="email" required style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Password
          <input type="password" name="password" required style={inputStyle} />
        </label>
        <button type="submit" style={buttonStyle}>
          Log in
        </button>
      </form>

      <p style={{ marginTop: 16, fontSize: 14 }}>
        No account yet? <a href="/signup">Sign up</a>
      </p>
    </main>
  )
}
