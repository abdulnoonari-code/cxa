import { readinessBadgeClass, readinessVerdict, type Readiness } from '@/lib/readiness'

// A subject's state, encoded as form as well as number so a tree of forty
// systems can be scanned rather than read. The bar is deliberately not a
// progress bar: it is coloured by verdict, so "82% and blocked" cannot look
// like good news.
export function SubjectMeter({ readiness, width = 120 }: { readiness: Readiness; width?: number }) {
  const colour =
    readiness.requirementsTotal === 0
      ? 'var(--color-neutral-solid)'
      : readiness.blockers.length > 0
        ? 'var(--color-danger-solid)'
        : readiness.ready
          ? 'var(--color-success-solid)'
          : 'var(--color-warning-solid, #d97706)'

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <div
        aria-hidden="true"
        style={{
          width,
          height: 6,
          borderRadius: 3,
          background: 'var(--color-neutral-bg, rgba(0,0,0,.08))',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: `${Math.max(readiness.percent, readiness.requirementsTotal > 0 ? 2 : 0)}%`,
            height: '100%',
            background: colour,
          }}
        />
      </div>
      <span
        className="mono"
        style={{ fontSize: 12, minWidth: 38, textAlign: 'right', color: 'var(--color-text-secondary)' }}
      >
        {readiness.requirementsTotal > 0 ? `${readiness.percent}%` : '—'}
      </span>
    </div>
  )
}

export function VerdictBadge({ readiness }: { readiness: Readiness }) {
  return <span className={readinessBadgeClass(readiness)}>{readinessVerdict(readiness)}</span>
}
