import { logout } from '@/app/login/actions'

export function TopNav() {
  return (
    <nav
      style={{
        display: 'flex',
        gap: 16,
        alignItems: 'center',
        marginBottom: 24,
        paddingBottom: 12,
        borderBottom: '1px solid #eee',
        fontSize: 14,
        flexWrap: 'wrap',
      }}
    >
      <a href="/equipment">Equipment &amp; Tags</a>
      <a href="/plan">Project Plan</a>
      <a href="/issues">Issues &amp; Punchlist</a>
      <form action={logout} style={{ marginLeft: 'auto' }}>
        <button
          type="submit"
          style={{ background: 'none', border: 'none', color: '#b23a3a', cursor: 'pointer', fontSize: 14, padding: 0 }}
        >
          Log out
        </button>
      </form>
    </nav>
  )
}
