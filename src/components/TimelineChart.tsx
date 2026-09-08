import Link from 'next/link'
import { timelineNote, LABEL_PERCENT, type Timeline, type TimelineMark } from '@/lib/timeline'

/**
 * The project on one line of time.
 *
 * Milestones are diamonds below the axis; gates are flags above it, because
 * a gate is the thing that stops the job and it should be the first thing
 * the eye lands on.
 *
 * ── How it is put together ─────────────────────────────────────────────
 *
 * Every glyph sits on its own date, on a short stem off the axis, and every
 * glyph is at the SAME height — so the flags read as one row and the
 * diamonds as another, and a crowded month is obvious because the glyphs
 * bunch up rather than because the labels do.
 *
 * Labels are separate. They stack into rows when they would collide and
 * they stop at the edges of the chart instead of hanging off it, and a
 * faint leader line joins a raised label back to its glyph. That
 * separation is the whole fix: the first version made each mark one
 * centred column, so moving a label to make room dragged its flag off its
 * date, and a label near either end was simply cut off by the card.
 *
 * Built as HTML rather than an SVG chart, on purpose: the labels have to
 * wrap and be clickable, every mark is a link to the record it came from,
 * and a browser lays out text better than anything hand-positioned in SVG.
 */

/** Axis to glyph. */
const STEM = 15
/** Glyph to the first row of labels. */
const LABEL_GAP = 5
/** Two clamped lines of name plus the date under it. Measured, not guessed:
 *  two 13px lines and a 13px date is 39, so 40 with nothing to spare would
 *  clip the date off a two-line name. */
const LABEL_H = 41
/** One row of labels to the next. More than LABEL_H, so rows breathe. */
const ROW_HEIGHT = 49

const laneHeight = (rows: number) => STEM + LABEL_GAP + LABEL_H + Math.max(0, rows - 1) * ROW_HEIGHT + 4
const labelOffset = (row: number) => STEM + LABEL_GAP + row * ROW_HEIGHT

function stateColour(m: TimelineMark): string {
  if (m.state === 'done') return 'var(--color-success-solid)'
  if (m.state === 'blocked') return 'var(--color-danger-solid)'
  return m.overdue ? 'var(--color-danger-solid)' : 'var(--color-progress)'
}

function hoverText(m: TimelineMark): string {
  const bits = [m.label, m.date]
  if (m.overdue) bits.push('past its date and not closed')
  if (m.note) bits.push(m.note)
  return bits.join(' · ')
}

/**
 * One label plus its glyph. `side` decides which way everything grows: up
 * from the axis for gates, down for milestones. Both use `offset`, so the
 * two lanes are mirror images and cannot drift apart the way two separate
 * copies of this would.
 */
function Mark({ m, side }: { m: TimelineMark; side: 'up' | 'down' }) {
  const colour = stateColour(m)
  const grow = side === 'up' ? 'bottom' : 'top'
  const raised = m.row > 0

  return (
    // No `tl-mark-up` / `tl-mark-down` modifier: which way a mark grows is
    // already carried by `grow`, and a class that no stylesheet reads is a
    // class that quietly rots.
    <Link href={m.href} className="tl-mark" title={hoverText(m)}>
      {/* The stem, from the axis to the glyph. Always the same length, so
          the glyphs line up whatever row their label ended on. */}
      <span className="tl-stem" style={{ left: `${m.percent}%`, [grow]: 0, height: STEM, background: colour }} />

      {/* The leader, only when the label has been pushed up a row.
          
          In the mark's OWN colour, not grey. On a crowded month the flags
          bunch into a row of coloured slivers and the labels fan out above
          them, and a grey leader gives you no way to tell which label
          belongs to which flag. Colour makes it followable: the red label
          is the one on the end of the red line. */}
      {raised && (
        <span
          className="tl-leader"
          style={{
            left: `${m.percent}%`,
            [grow]: STEM,
            height: labelOffset(m.row) - STEM,
            backgroundImage: `repeating-linear-gradient(180deg, ${colour} 0 3px, transparent 3px 6px)`,
          }}
        />
      )}

      {side === 'up' ? (
        <span className="tl-flag" style={{ left: `${m.percent}%`, bottom: STEM - 11, background: colour }} />
      ) : (
        <span className="tl-diamond" style={{ left: `${m.percent}%`, top: STEM - 6, background: colour }} />
      )}

      {/* The box is a fixed height so the rows line up, but the TEXT is
          pushed to the edge nearest the axis — a one-line name in a
          two-line box otherwise floats away from its own flag. */}
      <span
        // Written out rather than interpolated, so that a search for the
        // class finds it and the assertion that every class used here is
        // styled can actually see it.
        className={side === 'up' ? 'tl-label tl-label-up' : 'tl-label tl-label-down'}
        style={{ left: `${m.labelLeft}%`, width: `${LABEL_PERCENT}%`, [grow]: labelOffset(m.row) }}
      >
        <span className="tl-label-name">{m.label}</span>
        <span className="tl-label-date mono">{m.date}</span>
      </span>
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
          <div className="tl-scroll">
            <div
              className="tl"
              // The lanes grow with the plan. A crowded month pushes labels
              // onto extra rows, and the lane has to be tall enough to hold
              // them or they spill over the card above.
              style={
                {
                  ['--tl-gate-lane' as string]: `${laneHeight(timeline.gateRows)}px`,
                  ['--tl-milestone-lane' as string]: `${laneHeight(timeline.milestoneRows)}px`,
                } as React.CSSProperties
              }
            >
              {/* Alternate months, tinted. This is what lets you see WHICH
                  month a flag is in without reading a single label. */}
              <div className="tl-bands" aria-hidden="true">
                {timeline.bands.map((b) => (
                  <span
                    key={b.key}
                    className={b.shade ? 'tl-band tl-band-shade' : 'tl-band'}
                    style={{ left: `${b.left}%`, width: `${b.width}%` }}
                  />
                ))}
              </div>

              {/* Today. Always on the axis — a timeline that does not contain
                  now cannot say whether the job is ahead or behind. */}
              <div className="tl-now" style={{ left: `${timeline.todayPercent}%` }}>
                <span className="tl-now-pill mono">TODAY</span>
                <span className="tl-now-line" />
              </div>

              <div className="tl-lane tl-lane-gates">
                {gates.map((m) => (
                  <Mark key={`gate:${m.id}`} m={m} side="up" />
                ))}
              </div>

              {/* The ruler. Both lanes sit hard against it, so a flag and a
                  diamond are the same short stem from the same line — an
                  earlier version put the month names in a strip BETWEEN the
                  axis and the milestones, which pushed the diamonds 30px
                  away from the line they are supposed to be measured
                  against and left the stems hanging in mid-air. */}
              <div className="tl-axis">
                {timeline.bands.map((b) =>
                  // A sliver of a month has no room for its name. Printing it
                  // anyway is how an axis turns into a grey smear.
                  b.width < 4.5 ? null : (
                    <span
                      key={b.key}
                      className="tl-axis-label"
                      style={{ left: `${b.left}%`, width: `${b.width}%` }}
                    >
                      {b.label}
                      {b.year && <span className="tl-axis-year mono"> {b.year}</span>}
                    </span>
                  )
                )}
              </div>

              <div className="tl-lane tl-lane-milestones">
                {milestones.map((m) => (
                  <Mark key={`milestone:${m.id}`} m={m} side="down" />
                ))}
              </div>
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

          <p className="text-secondary" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
            {timelineNote(timeline)}
          </p>
        </>
      )}

      {timeline.undated.length > 0 && (
        <div className="tl-undated">
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
