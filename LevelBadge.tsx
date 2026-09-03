import { levelTone, levelCode, levelName, levelLabel } from '@/lib/levels'

/**
 * A commissioning level, wearing its colour.
 *
 * One component rather than a badge hand-rolled on each screen, because the
 * level appears on checklists, tests, punch items, gates, the ITP and the
 * handover pack, and five slightly different grey pills is exactly the kind of
 * repetition this restructure is for.
 *
 * The dot carries the colour and the text carries the level. Colour is always
 * the second signal — these get printed, photocopied and read by people who
 * cannot separate violet from fuchsia, and a badge that only says "L4" in a
 * colour is a badge that says nothing to them.
 */
export function LevelBadge({
  level,
  format = 'code',
  dot = true,
  style,
}: {
  level: string | null | undefined
  /** 'code' → L3 · 'name' → Pre-functional / Static · 'full' → L3 — Pre-functional / Static */
  format?: 'code' | 'name' | 'full'
  dot?: boolean
  style?: React.CSSProperties
}) {
  const tone = levelTone(level)
  const text = format === 'code' ? levelCode(level) : format === 'name' ? levelName(level) : levelLabel(level)

  return (
    <span
      className="level-badge"
      title={levelLabel(level)}
      style={{ background: tone.bg, border: `1px solid ${tone.border}`, color: tone.text, ...style }}
    >
      {dot && <span className="level-dot" aria-hidden="true" style={{ background: tone.solid }} />}
      {text}
    </span>
  )
}

/** The five levels in order, as a key. Worth printing once per screen that colours by level. */
export function LevelLegend({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="level-legend" style={style}>
      {['L1_fat', 'L2_iv', 'L3_prefunctional', 'L4_fpt', 'L5_ist'].map((l) => (
        <LevelBadge key={l} level={l} format="full" />
      ))}
    </div>
  )
}
