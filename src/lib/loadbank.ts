// Load bank sizing, test regimes, heat rejection and room layout.
//
// ── Why this is a library and not code inside the page ───────────────────
//
// Everything here is arithmetic somebody will put on a test sheet and hand to
// a client. A wrong number on a screen is embarrassing; a wrong number on a
// signed commissioning record is a dispute. So the maths lives in one pure
// file with no React, no clock and no database, and every function in it is
// checked against a hand-worked example before it ships.
//
// ── The one thing this file exists to stop ───────────────────────────────
//
// Generators are rated in kVA at 0.8 power factor. Load banks are rated in kW
// at unity. Size the bank from the kVA figure and you overload the engine;
// size it from kW alone and the alternator never reaches its rated current,
// so the windings never get as hot as they will in service and a thermal
// fault stays hidden. Every sizing result here returns BOTH legs.
//
// ── Where this file deliberately stops ───────────────────────────────────
//
// It does not size cables. It returns the design current and the 125 %
// continuous figure and stops there, because cable selection depends on
// installation method, grouping, ambient, run length and the standard being
// worked to — and a function that guesses at those produces a number somebody
// might actually install.

// ── Constants, and what each one assumes ────────────────────────────────

/** IT BTU — the HVAC convention. The thermochemical BTU gives 3414.43. */
export const BTU_PER_KW = 3412.142
/** 1 ton of refrigeration = 12 000 BTU/hr, by definition. */
export const KW_PER_TON = 3.516853
/**
 * CFM = kW × 3159.4 ÷ ΔT(°F). That is 3412.142 ÷ 1.08, where
 * 1.08 = 0.075 lb/ft³ × 0.24 BTU/lb·°F × 60 min/hr — standard air at sea
 * level. Sources give 1.075 to 1.10; 1.08 is the standard-conditions value.
 */
export const CFM_CONST = 3159.4
/** m³/s = kW × 0.8278 ÷ ΔT(°C), from ρ 1.202 kg/m³ and cp 1.005 kJ/kg·K. */
export const M3S_CONST = 0.8278

/**
 * Derating datums.
 *
 * NOT the ISO 8528-1 reference condition (100 kPa, 25 °C), because most sets
 * hold full output well past that: 1000 m and 40 °C is where manufacturers
 * actually start derating, and turbocharged engines often hold to 1500–1800 m.
 * Referencing to 25 °C would derate every set in the tropics on paper while
 * it runs happily on site.
 */
export const ALT_DATUM_M = 1000
export const AMB_DATUM_C = 40

// ── Power triangle ──────────────────────────────────────────────────────

export type RatingUnit = 'kva' | 'kw'
export type Phase = 1 | 3

export type Triangle = { kVA: number; kW: number; kVAR: number }

/**
 * kVA, kW and kVAR from whichever one you have.
 *
 * At 0.8 PF: kW = 0.80 × kVA, kVAR = 0.60 × kVA, so kVAR = 0.75 × kW.
 */
export function powerTriangle(rating: number, unit: RatingUnit, pf: number): Triangle {
  const p = pf > 0 && pf <= 1 ? pf : 0.8
  const kVA = unit === 'kva' ? rating : rating / p
  const kW = unit === 'kva' ? rating * p : rating
  // Clamped at zero: floating point can make kVA² − kW² a very small negative
  // at unity power factor, and √(−1e-13) is NaN, which would propagate into
  // every figure downstream.
  const kVAR = Math.sqrt(Math.max(0, kVA * kVA - kW * kW))
  return { kVA, kW, kVAR }
}

/** √3. JavaScript gives us SQRT2 but not this one. */
const ROOT3 = Math.sqrt(3)

/** Line current. Three-phase divides by √3; single-phase does not. */
export function lineCurrent(kVA: number, volts: number, phase: Phase): number {
  if (volts <= 0) return 0
  return (kVA * 1000) / ((phase === 3 ? ROOT3 : 1) * volts)
}

// ── Derating ────────────────────────────────────────────────────────────

export type Derate = {
  /** Percent lost to altitude. */
  altitude: number
  /** Percent lost to ambient. */
  ambient: number
  /** The one that is applied — the LARGER, never the sum. */
  total: number
  /** Multiply a rating by this. */
  factor: number
}

/**
 * Site derating.
 *
 * ── The rule that matters ────────────────────────────────────────────────
 *
 * THE TWO TERMS ARE NOT COMPOUNDED. The engine derates for air density and
 * combustion; the alternator derates for insulation-class temperature rise.
 * They are different machines failing for different reasons, so whichever is
 * limiting governs. Multiplying them together double-counts and produces a
 * set two sizes larger than the job needs.
 *
 * ── And the rule about the rules ─────────────────────────────────────────
 *
 * There is no standard figure. ISO 8528-1 says only that an adjustment
 * "shall be made". Published rules of thumb vary by a factor of two to three,
 * and manufacturers publish a two-dimensional altitude × temperature grid
 * rather than a linear rule. So the rates are arguments, not constants, and
 * the screen says out loud that the answer is indicative.
 */
export function derating(
  altitudeM: number,
  ambientC: number,
  pctPer100m: number,
  pctPer5C: number
): Derate {
  const altitude = altitudeM > ALT_DATUM_M ? ((altitudeM - ALT_DATUM_M) / 100) * pctPer100m : 0
  const ambient = ambientC > AMB_DATUM_C ? ((ambientC - AMB_DATUM_C) / 5) * pctPer5C : 0
  // Past 60 % the honest answer is "ask the manufacturer", not a number.
  const total = Math.min(60, Math.max(0, altitude, ambient))
  return { altitude, ambient, total, factor: 1 - total / 100 }
}

// ── Generator sizing ────────────────────────────────────────────────────

export type SizeInput = {
  rating: number
  unit: RatingUnit
  pf: number
  volts: number
  phase: Phase
  altitudeM: number
  ambientC: number
  pctPer100m: number
  pctPer5C: number
}

export type SizeResult = {
  rated: Triangle
  /** After site derating — this is what you actually load it to. */
  derated: Triangle
  derate: Derate
  /** Current at the rated power factor. */
  current: number
  /** 1.25 × current, for a continuous load. */
  breaker: number
  /** Current a resistive-only bank draws at the same kW. */
  resistiveCurrent: number
  /** Resistive current as a percentage of rated. At 0.8 PF this is 80. */
  resistivePct: number
}

export function sizeGenerator(i: SizeInput): SizeResult {
  const rated = powerTriangle(i.rating, i.unit, i.pf)
  const d = derating(i.altitudeM, i.ambientC, i.pctPer100m, i.pctPer5C)
  const derated: Triangle = {
    kVA: rated.kVA * d.factor,
    kW: rated.kW * d.factor,
    kVAR: rated.kVAR * d.factor,
  }
  const current = lineCurrent(derated.kVA, i.volts, i.phase)
  // A resistive bank runs at unity, so it draws kW/(√3·V) — not kVA/(√3·V).
  // That ratio IS the power factor, which is the whole point: at 0.8 PF a
  // resistive-only test reaches 80 % of rated current and no more.
  const resistiveCurrent = lineCurrent(derated.kW, i.volts, i.phase)
  return {
    rated,
    derated,
    derate: d,
    current,
    breaker: current * 1.25,
    resistiveCurrent,
    resistivePct: current > 0 ? (resistiveCurrent / current) * 100 : 0,
  }
}

// ── Test regimes ────────────────────────────────────────────────────────

export type Step = {
  /** Percent of nameplate. */
  pct: number
  /** Minutes held. */
  minutes: number
  why: string
}

export type Regime = {
  id: string
  title: string
  /** The clause, so it can go on a test sheet. */
  cite: string
  before: string
  steps: Step[]
  after: string
}

/**
 * The step tables, from the standards rather than from habit.
 *
 * Three figures are misquoted almost everywhere online, so they are worth
 * stating plainly here where the code can be checked against them:
 *
 *   • NFPA 110 ACCEPTANCE is 30/50/100 — not 25/50/75/100.
 *   • The ANNUAL supplemental test is 50 % for 30 min then 75 % for 60 min.
 *     The 25/50/75-over-two-hours version is pre-2010 wording.
 *   • The FOUR-HOUR test is TRIENNIAL, on a 36-month cycle. Not annual.
 *
 * The familiar 25/50/75/100 ladder is real and useful, but it is industry
 * commissioning practice, so it is labelled as that and not as compliance.
 */
export const REGIMES: Regime[] = [
  {
    id: 'nfpa-accept',
    title: 'NFPA 110 — installation acceptance',
    cite: 'NFPA 110 (2025) §7.13.4',
    before:
      'Preceded by an operational run of not less than 1.5 hours recording start delay, cranking time, time to rated speed, transfer times, volts, hertz, amps, oil pressure and coolant temperature.',
    steps: [
      { pct: 30, minutes: 30, why: 'Load accepted from a cold start. Readings at first acceptance.' },
      { pct: 50, minutes: 30, why: 'Readings every 15 minutes from here on.' },
      { pct: 100, minutes: 60, why: 'Full nameplate, less applicable site derating.' },
    ],
    after: 'Retransfer delay of at least 5 minutes, then cooldown.',
  },
  {
    id: 'nfpa-month',
    title: 'NFPA 110 — routine monthly exercise',
    cite: 'NFPA 110 (2025) §8.4.2',
    before:
      'Either at the manufacturer’s minimum exhaust gas temperature, or at not less than 30 % of nameplate kW. The 30 minutes is loaded run time — warm-up and the roughly 5-minute unloaded cooldown do not count towards it.',
    steps: [
      { pct: 30, minutes: 30, why: 'Minimum load to keep exhaust temperature up and prevent wet stacking.' },
    ],
    after: '',
  },
  {
    id: 'nfpa-annual',
    title: 'NFPA 110 — annual supplemental load bank test',
    cite: 'NFPA 110 (2025) §8.4.2.4',
    before:
      'Applies only to diesel installations that cannot meet the monthly requirement on available building load. Run in addition to the monthly exercise.',
    steps: [
      { pct: 50, minutes: 30, why: 'Continuous.' },
      { pct: 75, minutes: 60, why: 'Continuous.' },
    ],
    after:
      'Commonly quoted as 25/50/75 over two hours — that is the pre-2010 wording and is no longer current.',
  },
  {
    id: 'nfpa-tri',
    title: 'NFPA 110 — triennial test',
    cite: 'NFPA 110 (2025) §8.4.9',
    before:
      'Level 1 systems, once within every 36 months. Run for the assigned Class duration or 4 hours, whichever is less.',
    steps: [
      {
        pct: 30,
        minutes: 240,
        why: 'Not less than 30 % of nameplate, or the manufacturer’s minimum exhaust gas temperature.',
      },
    ],
    after:
      'Where the annual and triennial fall due together, a common combined profile is 3 hours at ≥30 % then 1 hour at ≥75 %.',
  },
  {
    id: 'fat',
    title: 'Commissioning / factory acceptance profile',
    cite: 'Industry practice — not a code requirement',
    before:
      'The familiar 25/50/75/100 ladder. Useful and widely used, but do not cite it as NFPA 110 compliance: the code acceptance profile is 30/50/100.',
    steps: [
      { pct: 25, minutes: 30, why: 'Warm through, check for leaks and alarms.' },
      { pct: 50, minutes: 30, why: 'Stabilise. Record volts, hertz, current, temperatures.' },
      { pct: 75, minutes: 30, why: 'Approaching rated. Watch exhaust and coolant.' },
      { pct: 100, minutes: 60, why: 'Rated output. Some specifications add 110 % for 10 minutes.' },
    ],
    after: 'Cool down at 25–30 % for 10–15 minutes before shutdown.',
  },
  {
    id: 'iso-step',
    title: 'ISO 8528-5 — step load acceptance',
    cite: 'ISO 8528-5:2025',
    before:
      'ISO does not prescribe fixed percentages. Permissible step size comes from a BMEP-versus-stages curve, and a set typically reaches full load in three to six steps. The four below are an illustrative ladder — take the real step sizes from the engine maker.',
    steps: [
      { pct: 37, minutes: 10, why: 'First step. Higher-BMEP modern engines accept less here, not more.' },
      { pct: 63, minutes: 10, why: 'Check frequency dip and recovery against the G-class.' },
      { pct: 84, minutes: 10, why: 'Check voltage dip and recovery.' },
      { pct: 100, minutes: 10, why: 'Then a 100 % load rejection in one step.' },
    ],
    after:
      'Record transient frequency and voltage deviation and recovery times against the specified performance class — G3 for most data centre and telecoms work.',
  },
]

export function regimeById(id: string): Regime {
  return REGIMES.find((r) => r.id === id) ?? REGIMES[0]
}

export type PlannedStep = Step & { kW: number; elapsed: number }

/** The steps with a load in kW and a running elapsed time. */
export function planSteps(regime: Regime, baseKw: number, factor = 1): PlannedStep[] {
  let elapsed = 0
  return regime.steps.map((s) => {
    elapsed += s.minutes
    return { ...s, kW: baseKw * (s.pct / 100) * factor, elapsed }
  })
}

export function totalMinutes(steps: PlannedStep[]): number {
  return steps.reduce((t, s) => t + s.minutes, 0)
}

// ── UPS and battery ─────────────────────────────────────────────────────

export type UpsInput = {
  rating: number
  unit: RatingUnit
  pf: number
  loadPct: number
  cells: number
  voltsPerCell: number
  autonomyMin: number
  efficiencyPct: number
}

export type UpsResult = {
  rated: Triangle
  testKW: number
  testKVAR: number
  /** True when a resistive-only bank cannot prove the kVA rating. */
  needsReactive: boolean
  endVolts: number
  dcKW: number
  wattsPerCell: number
  /** 60 % of rated autonomy — the point to abort an IST. */
  abortMin: number
}

export function sizeUps(i: UpsInput): UpsResult {
  const rated = powerTriangle(i.rating, i.unit, i.pf)
  const frac = i.loadPct / 100
  const testKW = rated.kW * frac
  const testKVA = rated.kVA * frac
  const testKVAR = Math.sqrt(Math.max(0, testKVA * testKVA - testKW * testKW))
  const eff = i.efficiencyPct > 0 ? i.efficiencyPct / 100 : 1
  const dcKW = testKW / eff
  return {
    rated,
    testKW,
    testKVAR,
    // A unity-rated UPS has kW = kVA, so resistance alone fully loads it.
    // Anything below unity cannot be proven to its apparent-power rating
    // without a reactive leg, which is why legacy units are harder to test.
    needsReactive: i.pf < 1,
    endVolts: i.cells * i.voltsPerCell,
    dcKW,
    wattsPerCell: i.cells > 0 ? (dcKW * 1000) / i.cells : 0,
    // Do not spend more than 60 % of the plant's real ride-through proving a
    // point. If the generator has not picked up by then, the test has already
    // told you what you needed to know.
    abortMin: i.autonomyMin * 0.6,
  }
}

// ── Heat and air ────────────────────────────────────────────────────────

/**
 * Air density as a fraction of sea level, ISA.
 *
 * The exponent is 4.25588 for DENSITY (it is 5.25588 for pressure — using the
 * pressure exponent here would under-state the airflow needed). This is the
 * term the 1.08 and 1.208 constants assume is 1.0, and the one most airflow
 * calculators quietly leave out.
 */
export function airDensityRatio(altitudeM: number): number {
  if (altitudeM <= 0) return 1
  return Math.pow(1 - 2.25577e-5 * altitudeM, 4.25588)
}

export const ASHRAE: Record<string, [number, number]> = {
  A1: [15, 32],
  A2: [10, 35],
  A3: [5, 40],
  A4: [5, 45],
}
/** Recommended for every class, not just the allowable band. */
export const ASHRAE_RECOMMENDED: [number, number] = [18, 27]

export type HeatInput = {
  kW: number
  deltaT: number
  deltaUnit: 'c' | 'f'
  altitudeM: number
}

export type HeatResult = {
  btuPerHr: number
  tons: number
  deltaC: number
  deltaF: number
  densityRatio: number
  cfm: number
  m3s: number
  m3h: number
  cfmPerKw: number
}

export function heatAndAir(i: HeatInput): HeatResult {
  const deltaC = i.deltaUnit === 'c' ? i.deltaT : (i.deltaT * 5) / 9
  const deltaF = i.deltaUnit === 'f' ? i.deltaT : (i.deltaT * 9) / 5
  const densityRatio = airDensityRatio(i.altitudeM)
  // Thinner air carries less mass per cubic metre, so the same heat needs
  // MORE volume — hence dividing by the ratio, not multiplying.
  const cfm = deltaF > 0 ? (i.kW * CFM_CONST) / (deltaF * densityRatio) : 0
  const m3s = deltaC > 0 ? (i.kW * M3S_CONST) / (deltaC * densityRatio) : 0
  return {
    btuPerHr: i.kW * BTU_PER_KW,
    // For a load bank or an IT load, heat rejected equals power in, 1:1.
    // A chiller's tons is its THERMAL capacity — never convert a chiller's
    // electrical input kW into tons. That is the commonest error in this
    // calculation and it under-sizes cooling by roughly the chiller's COP.
    tons: i.kW / KW_PER_TON,
    deltaC,
    deltaF,
    densityRatio,
    cfm,
    m3s,
    m3h: m3s * 3600,
    cfmPerKw: i.kW > 0 ? cfm / i.kW : 0,
  }
}

export type InletVerdict = 'recommended' | 'allowable' | 'outside'

export function inletVerdict(inletC: number, cls: string): InletVerdict {
  const band = ASHRAE[cls] ?? ASHRAE.A2
  if (inletC < band[0] || inletC > band[1]) return 'outside'
  if (inletC < ASHRAE_RECOMMENDED[0] || inletC > ASHRAE_RECOMMENDED[1]) return 'allowable'
  return 'recommended'
}

// ── Room layout ─────────────────────────────────────────────────────────

export type KindId = 'lb' | 'lb500' | 'lbv' | 'panel' | 'gen' | 'ups' | 'door'

export type Kind = {
  label: string
  /** Short form for the plan, where the box is only so wide. */
  short: string
  w: number
  h: number
  tone: 'primary' | 'neutral' | 'warning' | 'success'
  /** Metres of clear air the intake needs. 0 means it does not breathe. */
  intake: number
  /** Metres of clear air in front of the discharge. */
  discharge: number
  note: string
}

/**
 * Clearances.
 *
 * Manufacturers disagree materially — Crestchic asks 2 m on the discharge,
 * Avtron asks 5 m — probably because one is horizontal-discharge
 * containerised and the other vertical. The conservative figure is used here
 * on purpose: a plan that says there is room when there is not will be found
 * out at 40 °C with a client watching.
 */
export const KINDS: Record<KindId, Kind> = {
  lb: { label: 'Load bank 1 MW', short: 'LB 1 MW', w: 6.1, h: 2.5, tone: 'primary', intake: 2, discharge: 5, note: 'Containerised, horizontal discharge' },
  lb500: { label: 'Load bank 500 kW', short: 'LB 500', w: 3.0, h: 2.2, tone: 'primary', intake: 1, discharge: 5, note: 'Portable' },
  lbv: { label: 'Load bank, vertical', short: 'LB ↑', w: 2.4, h: 2.4, tone: 'primary', intake: 2, discharge: 5, note: 'Discharges upwards — keep 5 m clear above' },
  panel: { label: 'Distribution panel', short: 'DB', w: 1.2, h: 0.6, tone: 'neutral', intake: 0, discharge: 0, note: 'Tap-off point' },
  gen: { label: 'Generator', short: 'GEN', w: 8.0, h: 2.5, tone: 'warning', intake: 1.5, discharge: 3, note: 'Radiator discharge' },
  ups: { label: 'UPS', short: 'UPS', w: 2.0, h: 0.9, tone: 'success', intake: 0.8, discharge: 0.8, note: '' },
  door: { label: 'Door / opening', short: 'Door', w: 2.0, h: 0.3, tone: 'neutral', intake: 0, discharge: 0, note: '' },
}

export type Dir = 'N' | 'E' | 'S' | 'W'
export const DIRS: Dir[] = ['N', 'E', 'S', 'W']

export type Item = {
  id: number
  kind: KindId
  x: number
  y: number
  dir: Dir
  label: string
}

export type Rect = { x: number; y: number; w: number; h: number }

export function rectOf(it: Item): Rect {
  const K = KINDS[it.kind]
  return { x: it.x, y: it.y, w: K.w, h: K.h }
}

/** The intake and discharge zones, in metres, for a given orientation. */
export function zonesOf(it: Item): { intake: Rect; discharge: Rect } | null {
  const K = KINDS[it.kind]
  if (!K.discharge && !K.intake) return null
  const r = rectOf(it)
  // Discharge leaves the face the unit points at; the intake is the opposite
  // face. That is the layout of every forced-air load bank: fan one end,
  // elements and outlet the other.
  switch (it.dir) {
    case 'E':
      return {
        discharge: { x: r.x + r.w, y: r.y, w: K.discharge, h: r.h },
        intake: { x: r.x - K.intake, y: r.y, w: K.intake, h: r.h },
      }
    case 'W':
      return {
        discharge: { x: r.x - K.discharge, y: r.y, w: K.discharge, h: r.h },
        intake: { x: r.x + r.w, y: r.y, w: K.intake, h: r.h },
      }
    case 'S':
      return {
        discharge: { x: r.x, y: r.y + r.h, w: r.w, h: K.discharge },
        intake: { x: r.x, y: r.y - K.intake, w: r.w, h: K.intake },
      }
    default:
      return {
        discharge: { x: r.x, y: r.y - K.discharge, w: r.w, h: K.discharge },
        intake: { x: r.x, y: r.y + r.h, w: r.w, h: K.intake },
      }
  }
}

/** Touching edges is not overlapping — strict, so a flush fit is allowed. */
export function overlaps(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return false
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export type Finding = {
  severity: 'blocking' | 'look'
  title: string
  detail: string
}

/**
 * What is wrong with this arrangement.
 *
 * The first one is the whole reason the planner exists: hot discharge finding
 * its way back to an intake is the classic load bank failure, and it does not
 * announce itself at setup — it trips an hour into a test somebody booked an
 * outage for.
 */
export function roomFindings(items: Item[], roomW: number, roomD: number): Finding[] {
  const out: Finding[] = []
  const seen = new Set<string>()
  const push = (f: Finding) => {
    const key = f.severity + f.title
    if (seen.has(key)) return
    seen.add(key)
    out.push(f)
  }

  for (const a of items) {
    const za = zonesOf(a)
    if (!za || !KINDS[a.kind].discharge) continue

    const d = za.discharge
    if (d.x < 0 || d.y < 0 || d.x + d.w > roomW || d.y + d.h > roomD)
      push({
        severity: 'look',
        title: `${a.label} discharges into a wall`,
        detail:
          'Its hot-air zone runs past the room boundary. Either it needs to face an opening, or the room is smaller than the clearance the maker asks for.',
      })

    for (const b of items) {
      if (a.id === b.id) continue
      const zb = zonesOf(b)
      if (zb && KINDS[b.kind].intake && overlaps(d, zb.intake))
        push({
          severity: 'blocking',
          title: `${a.label} discharges into the intake of ${b.label}`,
          detail:
            'Hot exhaust feeding another unit’s intake is the classic load bank failure — it overheats and trips, usually an hour into a test somebody has scheduled an outage for.',
        })
      if (overlaps(d, rectOf(b)))
        push({
          severity: 'look',
          title: `${a.label} discharges onto ${b.label}`,
          detail:
            'Exhaust at 140–200 °C above ambient is landing on equipment. Never point a discharge at a painted surface, a roof membrane or a sprinkler head either.',
        })
    }

    if (KINDS[a.kind].intake)
      for (const b of items) {
        if (a.id === b.id) continue
        if (overlaps(za.intake, rectOf(b)))
          push({
            severity: 'look',
            title: `${b.label} is blocking the intake of ${a.label}`,
            detail: 'The intake needs its full clearance to breathe. A starved fan overheats the elements.',
          })
      }
  }
  return out
}

/**
 * A name that tells two of the same thing apart.
 *
 * A lone generator is "Generator", not "Generator #1" — but two load banks
 * have to be distinguishable, or a finding says "LB discharges into the
 * intake of LB" and names the fault without saying which one to move.
 */
export function nameFor(kind: KindId, existing: Item[]): string {
  const K = KINDS[kind]
  const same = existing.filter((x) => x.kind === kind).length
  return same === 0 ? K.label : `${K.label} #${same + 1}`
}

/** Keep an item inside the room, snapped to a quarter metre. */
export function clampToRoom(x: number, y: number, kind: KindId, roomW: number, roomD: number) {
  const K = KINDS[kind]
  const snap = (v: number) => Math.round(v * 4) / 4
  return {
    x: Math.max(0, Math.min(roomW - K.w, snap(x))),
    y: Math.max(0, Math.min(roomD - K.h, snap(y))),
  }
}
