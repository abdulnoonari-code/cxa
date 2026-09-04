import Link from 'next/link'
import { resolveLinks, type LinkContext, type ResolvedLink } from '@/lib/check-links'

export type CheckDetailFields = {
  serial_no?: string | null
  section_path?: string | null
  evidence_ref?: string | null
  links_to?: string | null
  answer_type?: string | null
}

const STATE: Record<ResolvedLink['state'], { color: string; border: string }> = {
  ok: { color: 'var(--color-text)', border: 'var(--color-border)' },
  warning: { color: 'var(--color-warning, #a35700)', border: 'var(--color-warning, #a35700)' },
  missing: { color: 'var(--color-danger)', border: 'var(--color-danger)' },
  unverified: { color: 'var(--color-text-secondary)', border: 'var(--color-border)' },
}

const KIND_WORD: Record<string, string> = {
  line: 'line',
  subject: 'tag',
  requirement: 'requirement',
  obligation: 'obligation',
  reference: 'reference',
}

/**
 * The part of a check that came from a script: its number, where in the
 * procedure it sits, what proves it, and what it is connected to.
 *
 * Hidden entirely on a check that was typed in by hand, because four empty
 * labels under every row is how a screen stops being read.
 */
export default function CheckDetail({ check, ctx }: { check: CheckDetailFields; ctx: LinkContext }) {
  const links = resolveLinks(check.links_to, ctx)
  const has = check.section_path || check.evidence_ref || links.length > 0
  if (!has) return null

  return (
    <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
      {check.section_path && (
        <div className="text-secondary" style={{ fontSize: 11.5 }}>
          <span style={{ textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600, fontSize: 10 }}>
            In the script
          </span>{' '}
          {check.serial_no ? `line ${check.serial_no} · ` : ''}
          {check.section_path}
        </div>
      )}

      {check.evidence_ref && (
        <div style={{ fontSize: 12 }}>
          <span
            className="text-secondary"
            style={{ textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600, fontSize: 10 }}
          >
            Evidence named
          </span>{' '}
          {check.evidence_ref}
        </div>
      )}

      {links.length > 0 && (
        <div>
          <div
            className="text-secondary"
            style={{ textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600, fontSize: 10, marginBottom: 4 }}
          >
            Connected to
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {links.map((l, i) => {
              const tone = STATE[l.state]
              const body = (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'baseline',
                    gap: 5,
                    border: `1px solid ${tone.border}`,
                    borderRadius: 6,
                    padding: '2px 7px',
                    fontSize: 11.5,
                    color: tone.color,
                    background: 'var(--color-surface)',
                  }}
                  title={l.note ?? undefined}
                >
                  <span className="text-secondary" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    {KIND_WORD[l.kind]}
                  </span>
                  <span>{l.label}</span>
                  {l.note && <span style={{ fontSize: 10.5 }}>· {l.note}</span>}
                </span>
              )
              return l.href ? (
                <Link key={i} href={l.href} style={{ textDecoration: 'none' }}>
                  {body}
                </Link>
              ) : (
                <span key={i}>{body}</span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
