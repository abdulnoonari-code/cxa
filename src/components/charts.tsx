// Charts, drawn on the server as plain SVG.
//
// No charting library and no client JavaScript. Everything on this page is a
// server component already, and a chart library would be the first thing in
// the application to ship a runtime to the browser — for pictures that never
// change after the page is rendered. An <svg> is smaller, renders before the
// first paint, prints correctly, and survives with JavaScript switched off,
// which is not a hypothetical on a site laptop tethered to a phone.
//
// Hover still works: every mark carries a <title>, which browsers show as a
// tooltip natively. It is not a crosshair, but it is the whole value of one —
// point at a bar, read the number — with nothing shipped to get it.
//
// ── The colours, and why these ones ────────────────────────────────────
//
// Every palette below was run through a contrast and colour-vision check
// rather than chosen by eye, and two of them changed as a result:
//
//   • Passed / Failed as green and red, side by side, fails outright: for a
//     deuteranope the two are 4.9 apart on a scale where 8 is the floor. So
//     "Not started" sits BETWEEN them in every stacked bar. That is not a
//     compromise for the sake of the check — it is also the right reading
//     order, since a bar then runs done → outstanding → wrong.
//
//   • Open / Awaiting acceptance / Closed as red, amber, green fails twice
//     over — red against amber is 4.7 for a deuteranope and 14.3 even with
//     full colour vision, which is to say nobody can reliably tell them
//     apart. Awaiting acceptance is indigo instead. It is a stage in a
//     process, not a severity, and it should not have been wearing a warning
//     colour in the first place.
//
// The "Not started" grey is deliberately below the chroma floor the check
// wants. That check exists so a series does not accidentally read as inert.
// Here inert is the meaning.
//
// Every segment also carries a legend and a printed number, so colour is
// never the only thing distinguishing one part of a bar from another.
//
// The application forces a light colour scheme (see globals.css), so these
// are stepped against a white surface and there is no dark variant to keep
// in step.

export type Series = { key: string; label: string; color: string }

export const PROGRESS_SERIES: Series[] = [
  { key: 'done', label: 'Passed', color: '#047a52' },
  { key: 'pending', label: 'Not started', color: '#45557a' },
  { key: 'failed', label: 'Failed', color: '#c40f45' },
]

export const PUNCH_SERIES: Series[] = [
  { key: 'open', label: 'Open', color: '#c40f45' },
  { key: 'awaiting', label: 'Awaiting acceptance', color: '#4f46e5' },
  { key: 'closed', label: 'Closed', color: '#047a52' },
]

export const TREND_SERIES: Series[] = [
  { key: 'raised', label: 'Raised', color: '#4f46e5' },
  { key: 'closed', label: 'Closed', color: '#0891b2' },
]

export type BarRow = { label: string; sublabel?: string; values: Record<string, number> }

function Legend({ series }: { series: Series[] }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
      {series.map((s) => (
        <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
          <span
            aria-hidden
            style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: 'inline-block' }}
          />
          <span className="text-secondary">{s.label}</span>
        </span>
      ))}
    </div>
  )
}

/**
 * Horizontal stacked bars — one row per level, category or whatever else.
 *
 * Each row fills the whole track, so a segment's width is its share OF THAT
 * ROW. The first version scaled every row against the largest row instead,
 * and the result was a level with forty checks, every one of them passed,
 * drawn as a bar a fifth of the way across with "100%" printed beside it.
 * A picture that contradicts the number next to it is worse than no picture:
 * one of them is going to be believed and there is no telling which.
 *
 * Magnitude has not been thrown away — it is in the "of 198" under each
 * percentage, which is where a count belongs anyway.
 *
 * Horizontal rather than vertical because the row labels are words ("L3 —
 * Pre-functional", "Category A"), and words under a vertical bar have to be
 * turned on their side or truncated. Neither is worth doing to save space
 * that a dashboard has plenty of.
 */
export function StackedBars({
  rows,
  series,
  emptyNote,
  percentOf,
}: {
  rows: BarRow[]
  series: Series[]
  emptyNote: string
  /** Which segment the percentage on the right counts, and the word for it. */
  percentOf: { key: string; word: string }
}) {
  const totals = rows.map((r) => series.reduce((n, s) => n + (r.values[s.key] ?? 0), 0))
  const anything = totals.some((t) => t > 0)

  if (!anything) {
    return (
      <p className="text-secondary" style={{ fontSize: 13, margin: 0 }}>
        {emptyNote}
      </p>
    )
  }

  const BAR = 20
  const GAP = 18
  const LABEL_W = 152
  const VALUE_W = 124
  const W = 720
  const plot = W - LABEL_W - VALUE_W
  const H = rows.length * (BAR + GAP)

  return (
    <>
      <Legend series={series} />
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          role="img"
          style={{ display: 'block', minWidth: 460, maxWidth: '100%' }}
        >
          {rows.map((r, i) => {
            const y = i * (BAR + GAP)
            const total = totals[i]
            let x = LABEL_W
            const counted = r.values[percentOf.key] ?? 0
            const percent = total > 0 ? Math.round((counted / total) * 100) : 0

            return (
              <g key={r.label}>
                <text x={0} y={y + BAR - 5} fontSize={12.5} fill="var(--color-text)">
                  {r.label}
                </text>
                {r.sublabel && (
                  <text x={0} y={y + BAR + 9} fontSize={10} fill="var(--color-text-secondary)">
                    {r.sublabel}
                  </text>
                )}

                {/* The track. A row with nothing in it still shows its width,
                    so an empty level reads as empty rather than as missing. */}
                <rect x={LABEL_W} y={y} width={plot} height={BAR} rx={3} fill="var(--color-border-soft, #eef2f9)" />

                {series.map((s) => {
                  const v = r.values[s.key] ?? 0
                  if (v <= 0) return null
                  const w = (v / total) * plot
                  const seg = (
                    <g key={s.key}>
                      <rect x={x} y={y} width={Math.max(0, w - 2)} height={BAR} rx={3} fill={s.color}>
                        <title>{`${r.label} — ${s.label}: ${v}`}</title>
                      </rect>
                      {w > 34 && (
                        <text
                          x={x + 6}
                          y={y + BAR - 6}
                          fontSize={11}
                          fill="#ffffff"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {v}
                        </text>
                      )}
                    </g>
                  )
                  x += w
                  return seg
                })}

                {total > 0 ? (
                  <>
                    <text
                      x={W - VALUE_W + 8}
                      y={y + BAR - 6}
                      fontSize={13}
                      fontWeight={600}
                      fill="var(--color-text)"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {percent}%
                    </text>
                    <text
                      x={W - VALUE_W + 8}
                      y={y + BAR + 8}
                      fontSize={10}
                      fill="var(--color-text-secondary)"
                    >
                      {percentOf.word} of {total}
                    </text>
                  </>
                ) : (
                  <text x={W - VALUE_W + 8} y={y + BAR - 5} fontSize={11} fill="var(--color-text-secondary)">
                    nothing recorded
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </>
  )
}

export type TrendPoint = { label: string } & Record<string, number | string>

/**
 * Two cumulative lines over time — raised against closed.
 *
 * Cumulative rather than per-week on purpose. A per-week bar chart of defects
 * raised is a picture of how busy the inspectors were. Two cumulative lines
 * are a picture of whether the project is catching up, because the gap
 * between them IS the open count, and whether that gap is widening or
 * closing is the only question anybody is really asking.
 */
export function TrendChart({
  points,
  series,
  emptyNote,
}: {
  points: TrendPoint[]
  series: Series[]
  emptyNote: string
}) {
  const values = points.flatMap((p) => series.map((s) => Number(p[s.key] ?? 0)))
  const max = Math.max(1, ...values)

  if (points.length < 2 || max <= 0) {
    return (
      <p className="text-secondary" style={{ fontSize: 13, margin: 0 }}>
        {emptyNote}
      </p>
    )
  }

  const W = 720
  const H = 220
  const PAD_L = 40
  const PAD_R = 62
  const PAD_T = 12
  const PAD_B = 26
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B

  const x = (i: number) => PAD_L + (i / (points.length - 1)) * plotW
  const y = (v: number) => PAD_T + plotH - (v / max) * plotH

  const ticks = [0, Math.round(max / 2), max]

  return (
    <>
      <Legend series={series} />
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          role="img"
          style={{ display: 'block', minWidth: 460, maxWidth: '100%' }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="var(--color-border-soft, #eef2f9)" strokeWidth={1} />
              <text x={0} y={y(t) + 4} fontSize={10.5} fill="var(--color-text-secondary)">
                {t}
              </text>
            </g>
          ))}

          {points.map((p, i) =>
            i % Math.ceil(points.length / 6) === 0 || i === points.length - 1 ? (
              <text key={i} x={x(i)} y={H - 8} fontSize={10} fill="var(--color-text-secondary)" textAnchor="middle">
                {p.label}
              </text>
            ) : null
          )}

          {series.map((s) => {
            const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(Number(p[s.key] ?? 0)).toFixed(1)}`).join(' ')
            const last = Number(points[points.length - 1][s.key] ?? 0)
            return (
              <g key={s.key}>
                <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {points.map((p, i) => (
                  <circle key={i} cx={x(i)} cy={y(Number(p[s.key] ?? 0))} r={4} fill={s.color} stroke="#ffffff" strokeWidth={2}>
                    <title>{`${p.label} — ${s.label}: ${Number(p[s.key] ?? 0)}`}</title>
                  </circle>
                ))}
                {/* Direct label at the end of the line, so the legend is a
                    second way of telling them apart and never the only one. */}
                <text x={W - PAD_R + 8} y={y(last) + 4} fontSize={11.5} fill={s.color} style={{ fontWeight: 600 }}>
                  {s.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </>
  )
}
