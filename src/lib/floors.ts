// Which floor a piece of equipment is on, and — the whole reason this file
// exists — what order the floors go in.
//
// ── Why not just store the text ─────────────────────────────────────────
//
// Because sorting it alphabetically is wrong in three separate ways, and all
// three are wrong on a real building:
//
//     text order:   B, G, L1, L10, L11, L2, L3, M, R
//     the building: B, G, M, L1, L2, L3, L10, L11, R
//
//   1. L10 sorts before L2, because "1" is before "2". Any site with ten or
//      more floors reads out of order on every screen.
//   2. B sorts to the top by luck, not by meaning. B2 and B1 sort the wrong
//      way round — the deeper basement should be lower, and "B1, B2" puts it
//      higher.
//   3. Mezzanine lands between L11 and R, which is nowhere near the ground
//      floor where it belongs.
//
// So each floor gets a NUMBER, and the number is what orders it. The text is
// kept exactly as the person typed it, because a floor called "L2A" or
// "Podium" is a real thing on a real drawing and this must not refuse it.
//
// ── Why not make floors part of the asset tree ──────────────────────────
//
// They already can be — a floor is a perfectly good Area, and on many jobs
// that is the right answer. But an area is one place in a hierarchy, and a
// switchboard on level 3 feeding a plant room on the roof belongs to one
// system across two floors. The floor is a PROPERTY of the equipment, not
// its position in the tree, and forcing it into the tree makes that case
// impossible to record.

/** The number a floor sorts by. Ground is zero; up is positive, down is negative. */
export type FloorOrder = number

const SPECIAL: { match: RegExp; order: number }[] = [
  // Roof and plant level, above everything.
  { match: /^(r|rf|roof|roof\s*level|rl)$/i, order: 9000 },
  { match: /^(plant|plant\s*room|ppl|penthouse|ph)$/i, order: 8000 },
  // Around the ground, in the order a lift panel has them.
  { match: /^(m|mez|mezz|mezzanine)$/i, order: 5 },
  // "LG" is deliberately NOT in the ground rule. It was, and because the
  // rules are tried in order that made the lower-ground rule below
  // unreachable — a lower ground floor was silently filed as the ground
  // floor, one storey out, on every screen. A dead rule looks exactly like a
  // live one in a list.
  { match: /^(g|gf|ground|ground\s*floor|0|l0)$/i, order: 0 },
  { match: /^(ug|upper\s*ground)$/i, order: 3 },
  { match: /^(lg|lower\s*ground)$/i, order: -3 },
  // Below ground.
  { match: /^(b|bf|basement|bsmt)$/i, order: -100 },
  { match: /^(sb|sub\s*basement)$/i, order: -300 },
]

/**
 * The sort order for a floor label, or null when it cannot be read.
 *
 * Null is not a failure — it is a floor whose name this does not recognise,
 * like "Podium" or "Tank deck". Those keep their text and sort together at
 * the end, which is far better than guessing a number for them and putting
 * a tank deck in the middle of the office floors.
 */
export function floorOrder(label: string | null | undefined): FloorOrder | null {
  const raw = (label ?? '').trim()
  if (raw === '') return null

  for (const s of SPECIAL) if (s.match.test(raw)) return s.order

  // L3, LVL 3, Level 3, F3, 3F, 3 — all the same floor.
  const up = raw.match(/^(?:l|lvl|level|f|fl|floor)\s*[-.]?\s*(\d{1,3})([a-z]?)$/i)
  if (up) return 10 + Number(up[1]) * 10 + suffixNudge(up[2])

  const upTrailing = raw.match(/^(\d{1,3})([a-z]?)\s*(?:f|fl|floor|l|lvl|level)$/i)
  if (upTrailing) return 10 + Number(upTrailing[1]) * 10 + suffixNudge(upTrailing[2])

  // B1, B2, BF2 — the bigger the number the deeper it goes, so it sorts lower.
  const down = raw.match(/^(?:b|bf|bsmt|basement)\s*[-.]?\s*(\d{1,2})$/i)
  if (down) return -100 - Number(down[1]) * 10

  // A bare number is a floor number. "0" is caught by the ground rule above.
  const bare = raw.match(/^(\d{1,3})$/)
  if (bare) return 10 + Number(bare[1]) * 10

  return null
}

/** "L2A" sits just above "L2" and well below "L3". */
function suffixNudge(letter: string): number {
  if (!letter) return 0
  return Math.min(9, letter.toLowerCase().charCodeAt(0) - 96)
}

/**
 * Floors in building order, lowest first.
 *
 * Unrecognised labels go last, alphabetically among themselves. They are
 * never dropped: a floor nobody can parse is still a floor somebody wrote
 * down, and losing it from a register is worse than showing it at the end.
 */
export function sortFloors(labels: (string | null)[]): string[] {
  const seen = new Map<string, string>()
  for (const l of labels) {
    const t = (l ?? '').trim()
    if (t === '') continue
    // Same floor written two ways — "L2" and "l2" — is one floor.
    const key = t.toLowerCase()
    if (!seen.has(key)) seen.set(key, t)
  }

  return [...seen.values()].sort((a, b) => {
    const oa = floorOrder(a)
    const ob = floorOrder(b)
    if (oa === null && ob === null) return a.localeCompare(b, undefined, { numeric: true })
    if (oa === null) return 1
    if (ob === null) return -1
    if (oa !== ob) return oa - ob
    return a.localeCompare(b, undefined, { numeric: true })
  })
}

/** What to show beside a floor that cannot be ordered, so it is not a mystery. */
export const UNKNOWN_FLOOR_NOTE =
  'Floors this does not recognise keep their name exactly as written and are listed at the end. Nothing is renamed and nothing is dropped.'

export const FLOOR_HELP =
  'The floor the equipment is on: B, B2, G, M, L1, L2, L10, R and so on. Written as you write it — L3, Level 3, 3F and 3 are all read as the third floor, and the text you typed is what is stored. This is NOT the commissioning level: L1 to L5 elsewhere in CxSentinel mean factory acceptance through to integrated testing, which is a different thing entirely.'
