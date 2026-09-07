import Link from 'next/link'
import { timelineNote, type Timeline, type TimelineMark } from '@/lib/timeline'

/**
 * The project on one line of time.
 *
 * Milestones are diamonds on the lower lane; gates are flags on the upper
 * one, because a gate is the thing that stops the job and it should be the
 * first thing the eye lands on.
 *
 * Built as HTML rather than an SVG chart, on purpose: the labels have to
 * wrap and be clickable, every mark is a link to the record it came from,
 * and a browser lays out text better than anything hand-positioned in SVG.
 */

/** One row of labels. Two lines of name, a date, and air. */
const ROW_HEIGHT = 46

function stateColour(m: TimelineMark): string {
  if (m.state === 'done') return 'var(--color-success-solid)'
  if (m.state === 'blocked') return 'var(--color-danger-solid)'
  return m.overdue ? 'var(--color-danger-solid)' : 'var(--color-progress)'
}

function Flag({ m }: { m: TimelineMark }) {
  return (
    <Link
      href={m.href}
      className="tl-mark tl-gate"
      // ROW_HEIGHT and the pole together: a mark on row 1 sits a full label
      // above row 0, and its pole is lengthened to reach the axis so the
      // flag is still visibly attached to its date.
      style={{ left: `${m.percent}%`, bottom: m.row * ROW_HEIGHT }}
      title={`${m.label} · ${m.date}${m.overdue ? ' · past its date and not closed' : ''}${m.note ? ` · ${m.note}` : ''}`}
    >
      <span className="tl-flag" style={{ background: stateColour(m) }} />
      <span className="tl-pole" style={{ height: 16 + m.row * ROW_HEIGHT }} />
      <span className="tl-label">
        <span className="tl-label-name">{m.label}</span>
        <span className="tl-label-date mono">{m.date}</span>
      </span>
    </Link>
  )
}

function Diamond({ m }: { m: TimelineMark }) {
  return (
    <Link
      href={m.href}
      className="tl-mark tl-milestone"
      style={{ left: `${m.percent}%`, top: m.row * ROW_HEIGHT }}
      title={`${m.label} · ${m.date}${m.overdue ? ' · overdue' : ''}${m.note ? ` · ${m.note}` : ''}`}
    >
      <span className="tl-label tl-label-below">
        <span className="tl-label-name">{m.label}</span>
        <span className="tl-label-date mono">{m.date}</span>
      </span>
      <span className="tl-diamond" style={{ background: stateColour(m) }} />
    </Link>
  )
}

export default function TimelineChart({ timeline }: { timeline: Timeline }) {
  const gates = timeline.marks.filter((m) => m.kind === 'gate')
  const milestones = timeline.marks.filter((m) => m.kind === 'milestone')

  return (
    <div className="card">
      {timeline.empty ? (
        <p className="text-secondary" style={{ fontSize: 13.5, margin: 0 }}>
          {timelineNote(timeline)}
        </p>
      ) : (
        <>
          <div
            className="tl"
            // The lanes grow with the plan. A crowded month pushes marks onto
            // extra rows, and the lane has to be tall enough to hold them or
            // they overlap the card above.
            style={
              {
                ['--tl-gate-lane' as string]: `${58 + timeline.gateRows * ROW_HEIGHT}px`,
                ['--tl-milestone-lane' as string]: `${34 + timeline.milestoneRows * ROW_HEIGHT}px`,
              } as React.CSSProperties
            }
          >
            <div className="tl-lane tl-lane-gates">
              {gates.map((m) => (
                <Flag key={`${m.kind}:${m.id}`} m={m} />
              ))}
            </div>

            <div className="tl-axis">
              {timeline.ticks.map((t) => (
                <span key={t.at} className="tl-tick" style={{ left: `${t.percent}%` }}>
                  <span className="tl-tick-line" />
                  <span className="tl-tick-label">{t.label}</span>
                </span>
              ))}
              {/* Today. Always on the axis — a timeline that does not contain
                  now cannot say whether the job is ahead or behind. */}
              <span className="tl-today" style={{ left: `${timeline.todayPercent}%` }}>
                <span className="tl-today-line" />
                <span className="tl-today-label mono">today</span>
              </span>
            </div>

            <div className="tl-lane tl-lane-milestones">
              {milestones.map((m) => (
                <Diamond key={`${m.kind}:${m.id}`} m={m} />
              ))}
            </div>
          </div>

          <div className="tl-key">
            <span>
              <span className="tl-key-flag" /> Gate
            </span>
            <span>
              <span className="tl-key-diamond" /> Milestone
            </span>
            <span>
              <span className="tl-key-dot" style={{ background: 'var(--color-success-solid)' }} /> Done
            </span>
            <span>
              <span className="tl-key-dot" style={{ background: 'var(--color-progress)' }} /> Ahead of its date
            </span>
            <span>
              <span className="tl-key-dot" style={{ background: 'var(--color-danger-solid)' }} /> Past its date, or
              blocked
            </span>
          </div>

          <p className="text-secondary" style={{ fontSize: 12.5, margin: '12px 0 0' }}>
            {timelineNote(timeline)}
          </p>
        </>
      )}

      {timeline.undated.length > 0 && (
        <div style={{ marginTop: timeline.empty ? 14 : 18, paddingTop: 14, borderTop: '1px solid var(--color-border-soft)' }}>
          <div className="stat-label" style={{ marginBottom: 8 }}>
            No date — not on the chart
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {timeline.undated.map((u) => (
              <Link
                key={`${u.kind}:${u.id}`}
                href={u.href}
                className="badge badge-neutral"
                style={{ textDecoration: 'none' }}
              >
                {u.kind === 'gate' ? '⚑ ' : '◆ '}
                {u.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
