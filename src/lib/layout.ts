// The layout model — equipment, the cables between them, and what each cable
// has to carry.
//
// ── What this is ─────────────────────────────────────────────────────────
//
// Not a drawing with numbers written on it. A calculation whose interface
// happens to be a drawing: move a load bank and the cable lengthens, so its
// volt drop rises, so its colour changes. Everything here is pure — no React,
// no clock, no database — so the arithmetic can be checked against a
// hand-worked example rather than against whatever the screen printed.
//
// ── THE CONSTRAINT THAT GOVERNS THIS WHOLE FILE ──────────────────────────
//
// A SUGGESTED CABLE SIZE IS NOT A SPECIFICATION.
//
// Ampacity is set by how fast heat leaves a cable, and that depends on the
// installation method, grouping, ambient, thermal insulation, whether it is
// buried, soil resistivity, and harmonic loading in the neutral. The same
// 95 mm² copper cable is rated differently clipped to a wall, on a tray, as
// touching single cores, in an insulated wall, or buried — a swing of well
// over thirty per cent. And on any appreciable run, VOLT DROP GOVERNS BEFORE
// AMPACITY DOES.
//
// So this file returns a starting point with its assumptions stated, and the
// screen says INDICATIVE in as many words. It must never present a CSA as a
// design output.

import { voltDrop, RHO_KM } from '@/lib/techdesign'

// ════════════════════════════════════════════════════════════════════════
// AMPACITY
// ════════════════════════════════════════════════════════════════════════

/**
 * BS 7671 Table 4E2A — multicore 90 °C thermosetting (XLPE/EPR), non-armoured,
 * COPPER, three or four core, three-phase a.c., REFERENCE METHOD E (in free
 * air or on a perforated cable tray). Reference conditions: 30 °C ambient,
 * 90 °C conductor, one circuit, no grouping.
 *
 * ── Why only one method ──────────────────────────────────────────────────
 *
 * Method E is the data centre containment case and it is the column two
 * independent sources reproduce identically. The Method C column could only
 * be corroborated from one source, and a second reproduction of the same BS
 * table turned out to have transcribed the TWO-CORE single-phase column under
 * a three-phase heading — values ten to fifteen per cent high. Shipping a
 * second method at lower confidence buys very little and risks exactly the
 * error that matters, so there is one method here and the screen names it.
 *
 * ── Why it stops at 400 ──────────────────────────────────────────────────
 *
 * Table 4E2A ends at 400 mm². 500 and 630 exist only in the single-core
 * tables, which are a different reference method. Interpolating them would be
 * inventing a rating, so they are absent.
 */
export const AMPACITY_METHOD_E: { csa: number; amps: number }[] = [
  { csa: 1.5, amps: 23 },
  { csa: 2.5, amps: 32 },
  { csa: 4, amps: 42 },
  { csa: 6, amps: 54 },
  { csa: 10, amps: 75 },
  { csa: 16, amps: 100 },
  { csa: 25, amps: 127 },
  { csa: 35, amps: 158 },
  { csa: 50, amps: 192 },
  { csa: 70, amps: 246 },
  { csa: 95, amps: 298 },
  { csa: 120, amps: 346 },
  { csa: 150, amps: 399 },
  { csa: 185, amps: 456 },
  { csa: 240, amps: 538 },
  { csa: 300, amps: 621 },
  { csa: 400, amps: 741 },
]

export const AMPACITY_BASIS =
  'BS 7671 Table 4E2A · copper · 90 °C thermosetting · multicore, 3 or 4 core · Reference Method E, free air or perforated tray · 30 °C ambient · one circuit'

export const CSA_OPTIONS = AMPACITY_METHOD_E.map((r) => r.csa)

/** Tabulated rating for a CSA, before any correction. */
export function baseAmpacity(csa: number): number {
  return AMPACITY_METHOD_E.find((r) => r.csa === csa)?.amps ?? 0
}

/**
 * IEC 60364-5-52 Table B.52.14 — ambient air correction.
 *
 * ── Clamped at 1.00 on purpose ───────────────────────────────────────────
 *
 * The published table gives factors ABOVE one below 30 °C (1.04 for XLPE at
 * 25 °C), which would up-rate the cable. A plant room or a hot aisle is not
 * guaranteed to stay below 30 °C for the life of the installation, and a tool
 * that silently up-rates a cable on an optimistic ambient is a tool that
 * helps somebody undersize one. So cooler than the reference buys nothing
 * here.
 */
export const AMBIENT_FACTORS: { tempC: number; xlpe: number; pvc: number }[] = [
  { tempC: 25, xlpe: 1.04, pvc: 1.06 },
  { tempC: 30, xlpe: 1.0, pvc: 1.0 },
  { tempC: 35, xlpe: 0.96, pvc: 0.94 },
  { tempC: 40, xlpe: 0.91, pvc: 0.87 },
  { tempC: 45, xlpe: 0.87, pvc: 0.79 },
  { tempC: 50, xlpe: 0.82, pvc: 0.71 },
  { tempC: 55, xlpe: 0.76, pvc: 0.61 },
  { tempC: 60, xlpe: 0.71, pvc: 0.5 },
]

export function ambientFactor(tempC: number): number {
  const rows = AMBIENT_FACTORS
  if (tempC <= 30) return 1
  if (tempC >= 60) return rows[rows.length - 1].xlpe
  // Linear between the tabulated points rather than snapping to the nearest,
  // so 42 °C is not silently treated as 40 °C.
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1]
    if (tempC >= a.tempC && tempC <= b.tempC) {
      const t = (tempC - a.tempC) / (b.tempC - a.tempC)
      return a.xlpe + t * (b.xlpe - a.xlpe)
    }
  }
  return 1
}

/**
 * IEC 60364-5-52 Table B.52.17 — single layer on a perforated tray, the row
 * that pairs with Reference Method E. Index is the number of circuits.
 *
 * Note 2 of the table: no grouping factor is needed where the horizontal
 * clearance between adjacent cables exceeds twice the cable diameter.
 */
export const GROUPING_TRAY = [1, 1, 0.88, 0.82, 0.77, 0.75, 0.73]

export function groupingFactor(circuits: number): number {
  const n = Math.max(1, Math.round(circuits))
  return n < GROUPING_TRAY.length ? GROUPING_TRAY[n] : GROUPING_TRAY[GROUPING_TRAY.length - 1]
}

/** Tabulated rating after ambient and grouping. Both apply, multiplicatively. */
export function deratedCapacity(csa: number, ambientC: number, circuits: number): number {
  return baseAmpacity(csa) * ambientFactor(ambientC) * groupingFactor(circuits)
}

/**
 * How many cables are lying together, for the grouping factor.
 *
 * Parallel runs of ONE circuit still group thermally — four cables on a tray
 * heat each other whether or not they belong to the same circuit. Counting
 * only the circuits would understate the derating on exactly the arrangement
 * this tool is most often used for.
 */
export function groupedCount(circuits: number, runs: number): number {
  return Math.max(1, Math.round(circuits)) * Math.max(1, Math.round(runs))
}

/** Total capacity of a run of parallel conductors, after every correction. */
export function capacityOf(csa: number, ambientC: number, circuits: number, runs: number): number {
  const n = Math.max(1, Math.round(runs))
  return deratedCapacity(csa, ambientC, groupedCount(circuits, n)) * n
}

/**
 * The smallest tabulated size whose DERATED capacity carries the design
 * current. Returns null when nothing in the table is big enough rather than
 * returning the largest and letting somebody think it fits.
 *
 * With more than one run the grouping penalty rises as the runs are added, so
 * this is not simply the single-conductor answer divided by the run count.
 */
export function suggestCsa(
  designCurrent: number, ambientC: number, circuits: number, runs = 1
): number | null {
  for (const row of AMPACITY_METHOD_E)
    if (capacityOf(row.csa, ambientC, circuits, runs) >= designCurrent) return row.csa
  return null
}

export const AMPACITY_CAVEAT =
  'Indicative only — not a design output. The tabulated figures are for one circuit in isolation at 30 °C on a perforated tray. Installation method alone swings the rating by more than thirty per cent, and grouping, thermal insulation, burial, soil resistivity and harmonic loading in the neutral all reduce it further. On any appreciable run, volt drop governs before ampacity does. Take the current to your own cable schedule.'

// ════════════════════════════════════════════════════════════════════════
// THE MODEL
// ════════════════════════════════════════════════════════════════════════

export type ItemKind = 'gen' | 'tx' | 'ups' | 'panel' | 'lb' | 'lb500' | 'lbv' | 'door'

export type ItemSpec = {
  label: string
  short: string
  w: number
  h: number
  tone: 'source' | 'dist' | 'load' | 'passive'
  /** Metres of clear air the intake needs. Zero means it does not breathe. */
  intake: number
  discharge: number
  /** A source supplies; a load consumes; distribution does neither. */
  role: 'source' | 'distribution' | 'load' | 'passive'
  note: string
}

/**
 * Clearances are the conservative end of the manufacturer range. Crestchic
 * asks two metres on the discharge and Avtron five; a plan that says there is
 * room when there is not gets found out at 40 °C with a client watching.
 */
export const ITEMS: Record<ItemKind, ItemSpec> = {
  gen: { label: 'Generator', short: 'GEN', w: 8, h: 2.5, tone: 'source', intake: 1.5, discharge: 3, role: 'source', note: 'Radiator discharge' },
  tx: { label: 'Transformer', short: 'TX', w: 2.4, h: 1.8, tone: 'source', intake: 1, discharge: 1, role: 'distribution', note: 'Keep ventilation clear' },
  ups: { label: 'UPS', short: 'UPS', w: 2, h: 0.9, tone: 'dist', intake: 0.8, discharge: 0.8, role: 'distribution', note: '' },
  panel: { label: 'Distribution panel', short: 'DB', w: 1.2, h: 0.6, tone: 'dist', intake: 0, discharge: 0, role: 'distribution', note: 'Tap-off point' },
  lb: { label: 'Load bank 1 MW', short: 'LB 1MW', w: 6.1, h: 2.5, tone: 'load', intake: 2, discharge: 5, role: 'load', note: 'Containerised, horizontal discharge' },
  lb500: { label: 'Load bank 500 kW', short: 'LB 500', w: 3, h: 2.2, tone: 'load', intake: 1, discharge: 5, role: 'load', note: 'Portable' },
  lbv: { label: 'Load bank, vertical', short: 'LB ↑', w: 2.4, h: 2.4, tone: 'load', intake: 2, discharge: 5, role: 'load', note: 'Discharges upwards — keep 5 m clear above' },
  door: { label: 'Door / louvre', short: 'Door', w: 2, h: 0.3, tone: 'passive', intake: 0, discharge: 0, role: 'passive', note: '' },
}

export type Dir = 'N' | 'E' | 'S' | 'W'
export const DIRS: Dir[] = ['N', 'E', 'S', 'W']

export type LayoutItem = {
  id: number
  kind: ItemKind
  x: number
  y: number
  dir: Dir
  label: string
  /** Rating in kVA. A load's demand, a source's capability. */
  kva: number
  pf: number
  volts: number
}

export type Cable = {
  id: number
  fromId: number
  toId: number
  csa: number
  /** null means take it off the drawing. A number means somebody typed it. */
  lengthM: number | null
  circuits: number
  /**
   * Conductors per phase, run in parallel.
   *
   * Not a nicety. A 2 MVA load bank feeder at 400 V is 2887 A, and nothing in
   * any tabulated size carries that on one conductor — the real installation
   * is four, five or six cables per phase. Without this the tool would tell an
   * engineer that a perfectly ordinary arrangement is impossible.
   *
   * Capacity multiplies by the number of runs and volt drop divides by it,
   * which assumes the runs are the same length and follow the same route. BS
   * 7671 433.4 and 523.7 both require that; they carry equal current only if
   * they are electrically identical.
   */
  runs: number
}

/** Runs offered in the interface. Beyond about six, a busbar is the answer. */
export const RUN_OPTIONS = [1, 2, 3, 4, 5, 6, 8]

export type Rect = { x: number; y: number; w: number; h: number }

export function rectOf(it: LayoutItem): Rect {
  const s = ITEMS[it.kind]
  return { x: it.x, y: it.y, w: s.w, h: s.h }
}

export function centreOf(it: LayoutItem): { x: number; y: number } {
  const r = rectOf(it)
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

// ── The feed tree ───────────────────────────────────────────────────────

/**
 * Would connecting these two close a loop?
 *
 * A cycle makes downstream load undefined — walking the tree would never
 * terminate and every figure on the drawing would be meaningless. Refused at
 * the point of drawing rather than detected afterwards.
 */
export function wouldCycle(cables: Cable[], fromId: number, toId: number): boolean {
  if (fromId === toId) return true
  // Walk upstream from the proposed supply. If the proposed load is already
  // above it, this cable closes a ring.
  const supplyOf = new Map<number, number>()
  for (const c of cables) supplyOf.set(c.toId, c.fromId)
  let node: number | undefined = fromId
  const seen = new Set<number>()
  while (node !== undefined) {
    if (node === toId) return true
    if (seen.has(node)) return true // already a cycle in the existing data
    seen.add(node)
    node = supplyOf.get(node)
  }
  return false
}

/** Everything fed directly by this item. */
export function childrenOf(cables: Cable[], id: number): number[] {
  return cables.filter((c) => c.fromId === id).map((c) => c.toId)
}

/**
 * The kVA a cable has to carry: everything downstream of it, summed.
 *
 * Only items whose ROLE is 'load' contribute. A panel does not consume
 * anything itself — counting its rating as well as the loads beneath it would
 * double the figure, which is the classic error in this calculation.
 *
 * No diversity is applied. A commissioning load bank test is the one case
 * where every load really does run at once, and applying a diversity factor
 * would under-size the very cable being proved.
 */
export function downstreamKva(items: LayoutItem[], cables: Cable[], rootId: number): number {
  const byId = new Map(items.map((i) => [i.id, i]))
  const seen = new Set<number>()
  let total = 0
  const walk = (id: number) => {
    if (seen.has(id)) return
    seen.add(id)
    const it = byId.get(id)
    if (it && ITEMS[it.kind].role === 'load') total += it.kva
    for (const child of childrenOf(cables, id)) walk(child)
  }
  walk(rootId)
  return total
}

/** How many cables deep an item sits. Sources are zero. Used by the single line. */
export function depthOf(cables: Cable[], id: number): number {
  const supplyOf = new Map<number, number>()
  for (const c of cables) supplyOf.set(c.toId, c.fromId)
  let d = 0
  let node = supplyOf.get(id)
  const seen = new Set<number>([id])
  while (node !== undefined && !seen.has(node)) {
    seen.add(node)
    d += 1
    node = supplyOf.get(node)
  }
  return d
}

// ── Route length ────────────────────────────────────────────────────────

/**
 * Cable length measured off the drawing, routed ORTHOGONALLY.
 *
 * Cables run along the floor at right angles, not diagonally across it, so a
 * straight-line distance under-states every run. Measured centre to centre
 * because that is where the gland plate ends up, near enough, and it is
 * defensible — a straight line between nearest edges is not.
 */
export function routeLength(a: LayoutItem, b: LayoutItem): number {
  const ca = centreOf(a), cb = centreOf(b)
  return Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y)
}

// ── The per-cable result ────────────────────────────────────────────────

export type CableResult = {
  cable: Cable
  from: LayoutItem
  to: LayoutItem
  kva: number
  current: number
  lengthM: number
  /** True when the length came off the drawing rather than being typed. */
  measured: boolean
  /** Conductors per phase, as applied. */
  runs: number
  capacity: number
  loadingPct: number
  band: LoadBand
  suggested: number | null
  /** True when the chosen size is below what the current needs. */
  undersized: boolean
  voltDropV: number
  voltDropPct: number
}

export type LoadBand = 'comfortable' | 'watch' | 'limit' | 'over'

/** How a cable is written on a drawing: "4 × 240 mm²", or "240 mm²" for one. */
export function describeCable(csa: number, runs: number): string {
  const n = Math.max(1, Math.round(runs))
  return n > 1 ? `${n} × ${csa} mm²` : `${csa} mm²`
}

/** One scale, used on cables and on equipment alike. */
export function bandFor(pct: number): LoadBand {
  if (pct > 100) return 'over'
  if (pct >= 90) return 'limit'
  if (pct >= 75) return 'watch'
  return 'comfortable'
}

export type LayoutOptions = {
  ambientC: number
  /** Guidance percentage the volt drop is judged against. */
  voltDropGuidance: number
}

export function cableResult(
  items: LayoutItem[],
  cables: Cable[],
  cable: Cable,
  opts: LayoutOptions
): CableResult | null {
  const from = items.find((i) => i.id === cable.fromId)
  const to = items.find((i) => i.id === cable.toId)
  if (!from || !to) return null

  const kva = downstreamKva(items, cables, cable.toId)
  // Voltage is the supply's. A cable is at the voltage of the thing feeding it.
  const volts = from.volts > 0 ? from.volts : to.volts
  const current = volts > 0 ? (kva * 1000) / (Math.sqrt(3) * volts) : 0

  const measured = cable.lengthM === null
  const lengthM = measured ? routeLength(from, to) : (cable.lengthM as number)

  const runs = Math.max(1, Math.round(cable.runs || 1))
  const capacity = capacityOf(cable.csa, opts.ambientC, cable.circuits, runs)
  const loadingPct = capacity > 0 ? (current / capacity) * 100 : 0
  const suggested = suggestCsa(current, opts.ambientC, cable.circuits, runs)

  const vd = voltDrop({
    // Per-conductor current against a per-conductor cross-section. Volt drop
    // goes as I·L/A, so this is the same as computing the whole current and
    // dividing the drop by the number of runs — and it keeps the assumption
    // visible: the runs are the same length or they do not share equally.
    currentA: current / runs,
    lengthM,
    csaMm2: cable.csa,
    material: 'copper',
    voltage: volts,
    phase: 3,
    powerFactor: from.pf > 0 ? from.pf : 0.8,
    // Indicative for a multicore cable of this size. Real reactance comes from
    // the cable data sheet, which is another reason the size is a starting
    // point rather than an answer.
    reactancePerKm: 0.08,
  })

  return {
    cable, from, to, kva, current, lengthM, measured,
    runs,
    capacity,
    loadingPct,
    band: bandFor(loadingPct),
    suggested,
    undersized: suggested !== null && cable.csa < suggested,
    voltDropV: vd.volts,
    voltDropPct: vd.percent,
  }
}

// ── Findings ────────────────────────────────────────────────────────────

export type Finding = {
  severity: 'blocking' | 'advisory'
  title: string
  detail: string
}

export function zonesOf(it: LayoutItem): { intake: Rect; discharge: Rect } | null {
  const s = ITEMS[it.kind]
  if (!s.discharge && !s.intake) return null
  const r = rectOf(it)
  switch (it.dir) {
    case 'E':
      return { discharge: { x: r.x + r.w, y: r.y, w: s.discharge, h: r.h },
               intake: { x: r.x - s.intake, y: r.y, w: s.intake, h: r.h } }
    case 'W':
      return { discharge: { x: r.x - s.discharge, y: r.y, w: s.discharge, h: r.h },
               intake: { x: r.x + r.w, y: r.y, w: s.intake, h: r.h } }
    case 'S':
      return { discharge: { x: r.x, y: r.y + r.h, w: r.w, h: s.discharge },
               intake: { x: r.x, y: r.y - s.intake, w: r.w, h: s.intake } }
    default:
      return { discharge: { x: r.x, y: r.y - s.discharge, w: r.w, h: s.discharge },
               intake: { x: r.x, y: r.y + r.h, w: r.w, h: s.intake } }
  }
}

/** Touching edges is not overlapping, so a flush fit is allowed. */
export function overlaps(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return false
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function layoutFindings(
  items: LayoutItem[],
  cables: Cable[],
  roomW: number,
  roomD: number,
  opts: LayoutOptions
): Finding[] {
  const out: Finding[] = []
  const seen = new Set<string>()
  const push = (f: Finding) => {
    const k = f.severity + f.title
    if (!seen.has(k)) { seen.add(k); out.push(f) }
  }

  // ── physical ──
  for (const a of items) {
    const za = zonesOf(a)
    if (!za || !ITEMS[a.kind].discharge) continue
    const d = za.discharge
    if (d.x < 0 || d.y < 0 || d.x + d.w > roomW || d.y + d.h > roomD)
      push({ severity: 'advisory', title: `${a.label} discharges into a wall`,
        detail: 'Its hot-air zone runs past the room boundary. Either it must face an opening, or the room is smaller than the clearance the maker asks for.' })
    for (const b of items) {
      if (a.id === b.id) continue
      const zb = zonesOf(b)
      if (zb && ITEMS[b.kind].intake && overlaps(d, zb.intake))
        push({ severity: 'blocking', title: `${a.label} discharges into the intake of ${b.label}`,
          detail: 'Hot exhaust feeding another unit’s intake is the classic load bank failure — it overheats and trips, usually an hour into a test somebody has booked an outage for.' })
      if (overlaps(d, rectOf(b)))
        push({ severity: 'advisory', title: `${a.label} discharges onto ${b.label}`,
          detail: 'Exhaust runs 140 to 200 °C above ambient. Never point a discharge at equipment, a painted surface, a roof membrane or a sprinkler head.' })
    }
    if (ITEMS[a.kind].intake)
      for (const b of items) {
        if (a.id === b.id) continue
        if (overlaps(za.intake, rectOf(b)))
          push({ severity: 'advisory', title: `${b.label} is blocking the intake of ${a.label}`,
            detail: 'The intake needs its full clearance to breathe. A starved fan overheats the elements.' })
      }
  }

  // ── electrical ──
  for (const c of cables) {
    const r = cableResult(items, cables, c, opts)
    if (!r) continue
    if (r.loadingPct > 100)
      push({ severity: 'blocking', title: `The cable from ${r.from.label} to ${r.to.label} is overloaded`,
        detail: `It carries ${Math.round(r.current)} A against a derated capacity of ${Math.round(r.capacity)} A. ${r.suggested ? `Indicatively this run wants ${describeCable(r.suggested, r.runs)}.` : 'No tabulated size carries it at this many runs — add a conductor per phase, or go to busbar.'}` })
    else if (r.undersized)
      push({ severity: 'advisory', title: `The cable from ${r.from.label} to ${r.to.label} is below the indicative size`,
        detail: `${describeCable(r.cable.csa, r.runs)} is inside its rating at ${Math.round(r.loadingPct)} %, but the indicative selection for ${Math.round(r.current)} A is ${describeCable(r.suggested ?? 0, r.runs)}. Check it against your own schedule.` })
    if (r.voltDropPct > opts.voltDropGuidance)
      push({ severity: 'advisory', title: `Volt drop from ${r.from.label} to ${r.to.label} is ${r.voltDropPct.toFixed(2)} %`,
        detail: `Past the ${opts.voltDropGuidance} % guidance figure over ${r.lengthM.toFixed(1)} m. Guidance, not a limit — IEC Annex G is informative and the NEC figures are informational notes — but on a run this length volt drop is usually what decides the cable, not its current rating.` })
  }

  // ── structure ──
  for (const it of items) {
    const spec = ITEMS[it.kind]
    if (spec.role === 'passive') continue
    const fed = cables.some((c) => c.toId === it.id)
    if (!fed && spec.role !== 'source')
      push({ severity: 'advisory', title: `${it.label} has no supply`,
        detail: 'Nothing feeds it, so it contributes nothing to any cable calculation. Usually an unfinished drawing rather than a fault.' })
    if (spec.role === 'source') {
      const carried = downstreamKva(items, cables, it.id)
      if (it.kva > 0 && carried > it.kva)
        push({ severity: 'blocking', title: `${it.label} is carrying more than its rating`,
          detail: `${Math.round(carried)} kVA of load hung on a ${Math.round(it.kva)} kVA source.` })
    }
  }

  return out
}

export type Summary = {
  sourceKva: number
  connectedKva: number
  sparePct: number
  worstVoltDrop: { pct: number; label: string } | null
  worstLoading: { pct: number; label: string } | null
  blocking: number
  advisory: number
}

export function summarise(
  items: LayoutItem[], cables: Cable[], roomW: number, roomD: number, opts: LayoutOptions
): Summary {
  const sources = items.filter((i) => ITEMS[i.kind].role === 'source')
  const sourceKva = sources.reduce((t, s) => t + s.kva, 0)
  const connectedKva = items
    .filter((i) => ITEMS[i.kind].role === 'load')
    .reduce((t, i) => t + i.kva, 0)

  let worstVd: { pct: number; label: string } | null = null
  let worstLd: { pct: number; label: string } | null = null
  for (const c of cables) {
    const r = cableResult(items, cables, c, opts)
    if (!r) continue
    const label = `${r.from.label} → ${r.to.label}`
    if (!worstVd || r.voltDropPct > worstVd.pct) worstVd = { pct: r.voltDropPct, label }
    if (!worstLd || r.loadingPct > worstLd.pct) worstLd = { pct: r.loadingPct, label }
  }

  const f = layoutFindings(items, cables, roomW, roomD, opts)
  return {
    sourceKva,
    connectedKva,
    sparePct: sourceKva > 0 ? ((sourceKva - connectedKva) / sourceKva) * 100 : 0,
    worstVoltDrop: worstVd,
    worstLoading: worstLd,
    blocking: f.filter((x) => x.severity === 'blocking').length,
    advisory: f.filter((x) => x.severity === 'advisory').length,
  }
}

// ── Placement helpers ───────────────────────────────────────────────────

export function nameFor(kind: ItemKind, existing: LayoutItem[]): string {
  const s = ITEMS[kind]
  const same = existing.filter((x) => x.kind === kind).length
  return same === 0 ? s.label : `${s.label} #${same + 1}`
}

export function clampToRoom(x: number, y: number, kind: ItemKind, roomW: number, roomD: number) {
  const s = ITEMS[kind]
  const snap = (v: number) => Math.round(v * 4) / 4
  return {
    x: Math.max(0, Math.min(roomW - s.w, snap(x))),
    y: Math.max(0, Math.min(roomD - s.h, snap(y))),
  }
}

/**
 * Single-line positions, arranged by feed depth: sources at the top, loads at
 * the bottom. Returns a column and row per item so the view can lay them out
 * without the engineer arranging anything twice.
 */
export function singleLinePositions(items: LayoutItem[], cables: Cable[]) {
  const rows = new Map<number, LayoutItem[]>()
  for (const it of items) {
    if (ITEMS[it.kind].role === 'passive') continue
    const d = depthOf(cables, it.id)
    const row = rows.get(d) ?? []
    row.push(it)
    rows.set(d, row)
  }
  const out: { id: number; row: number; col: number; of: number }[] = []
  for (const [row, list] of [...rows.entries()].sort((a, b) => a[0] - b[0]))
    list.forEach((it, i) => out.push({ id: it.id, row, col: i, of: list.length }))
  return out
}

export { RHO_KM }
