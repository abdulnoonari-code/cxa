import Link from 'next/link'
import { countBy, headline, type SiteFinding } from '@/lib/site-rules'

// The rule findings as a panel, written once and used on both screens that
// want them.
//
// ── Why the words are as long as they are ───────────────────────────────
//
// The first version of this was three big numbers — 4, 1, 0 — over three
// short labels, and the reply to it was "4, 1 is not clear". It was not.
// A number is a score, and a score tells somebody there is a problem without
// telling them whether it is theirs, or whether it is theirs today. The
// sentence under each number is what turns it into something a person can
// act on before lunch, and it is the reason the panel is worth the space.
//
// ── Why it is on the Dashboard ──────────────────────────────────────────
//
// Because a check that finds a defect on a screen nobody opens has not found
// anything. Rule Checks lives under Quality, five items down a menu, and it
// was reached in practice only by being redirected to it. The Dashboard is
// the screen that gets opened, so the findings go there — the full page stays
// where it is, for reading the detail.

const GROUPS = [
  {
    key: 'blocking' as const,
    colour: 'var(--color-danger)',
    heading: 'Would not stand up at handover',
    meaning: 'Somebody receiving this project could point at these and refuse to sign. Fix them before the pack goes out.',
  },
  {
    key: 'warning' as const,
    colour: 'var(--color-warning, #a35700)',
    heading: 'Worth a look',
    meaning: 'Not wrong, but not safe to leave. Somebody should decide whether each one is fine.',
  },
  {
    key: 'note' as const,
    colour: 'var(--color-text-secondary)',
    heading: 'Noted',
    meaning: 'Recorded so it is not a surprise later. Nothing to do today.',
  },
]

function Tally({ n, colour, heading, meaning }: { n: number; colour: string; heading: string; meaning: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderLeft: `4px solid ${n > 0 ? colour : 'var(--color-border)'}`,
        borderRadius: 8,
        padding: '10px 12px',
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: n > 0 ? colour : 'var(--color-text-secondary)' }}>{n}</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{heading}</div>
      </div>
      <p className="text-secondary" style={{ margin: '4px 0 0', fontSize: 12 }}>
        {n === 0 ? 'Nothing in this group.' : meaning}
      </p>
    </div>
  )
}

export type RuleSummaryProps = {
  findings: SiteFinding[]
  counts: { punch: number; checks: number; dated: number }
  /** True on the Dashboard: adds the worst few by name and a way through to the full page. */
  linked?: boolean
}

export default function RuleSummary({ findings, counts, linked = false }: RuleSummaryProps) {
  const n = countBy(findings)
  const worst = findings.filter((f) => f.level === 'blocking').slice(0, 3)

  // Nothing recorded is not the same as nothing wrong, and the two look
  // identical from here: no records means no rule can fire, which produces
  // the same empty result as a project where everything is in order. Rendered
  // side by side, an empty project read "Every rule passed" — a green light
  // over a project that has not started. So the empty case says what it is.
  const nothingToCheck = counts.punch === 0 && counts.checks === 0 && counts.dated === 0

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          {nothingToCheck ? 'Nothing to check yet' : headline(findings)}
        </div>
        {linked && (
          <Link href="/rules" className="btn btn-secondary btn-sm" style={{ fontSize: 11.5 }}>
            All rule checks
          </Link>
        )}
      </div>
      <p className="text-secondary" style={{ margin: '3px 0 14px', fontSize: 12.5 }}>
        {nothingToCheck ? (
          <>
            There are no checks, no punch items and no dated commitments on this project, so every rule has nothing
            to look at. That is not the same as a clean project — it is an empty one. Import a test script or add
            equipment and this fills in by itself.
          </>
        ) : (
          <>
            Worked out from {counts.punch} punch item{counts.punch === 1 ? '' : 's'}, {counts.checks} check
            {counts.checks === 1 ? '' : 's'} and {counts.dated} dated commitment{counts.dated === 1 ? '' : 's'} on
            this project. Free, no AI, and nothing is stored — so it is never out of date.
          </>
        )}
      </p>

      {/* Three boxes of nought, each saying "nothing in this group", is noise
          on a project that has no records. The sentence above has said it. */}
      {!nothingToCheck && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          {GROUPS.map((g) => (
            <Tally key={g.key} n={n[g.key]} colour={g.colour} heading={g.heading} meaning={g.meaning} />
          ))}
        </div>
      )}

      {linked && worst.length > 0 && (
        <ul style={{ margin: '14px 0 0', paddingLeft: 18, fontSize: 12.5 }}>
          {worst.map((f) => (
            <li key={f.rule} style={{ marginBottom: 3 }}>
              <Link href={f.href} style={{ color: 'inherit' }}>
                {f.title}
              </Link>{' '}
              <span className="text-secondary">
                — {f.count} record{f.count === 1 ? '' : 's'}
              </span>
            </li>
          ))}
          {n.blocking > worst.length && (
            <li className="text-secondary">and {n.blocking - worst.length} more on the Rule Checks page</li>
          )}
        </ul>
      )}
    </div>
  )
}
