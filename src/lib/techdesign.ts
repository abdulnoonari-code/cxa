// Technical design — the test calculations beyond load banks.
//
// ── Why this is a library and not code inside the page ───────────────────
//
// Same reason as loadbank.ts: every number here ends up on a test sheet
// handed to a client. Pure functions, no React, no clock, no database, and
// each one checked against a hand-worked example before it ships.
//
// ── The rule that governs this whole file ────────────────────────────────
//
// WHERE THERE IS NO STANDARD, SAY SO — DO NOT INVENT A PASS MARK.
//
// Three of the things a commissioning engineer is most often asked to "prove"
// have no single limit at all:
//
//   • Earth resistance. IEEE 80 sets no maximum. The 1 Ω, 5 Ω and 25 Ω
//     figures come from three different documents with three different
//     purposes, and compliance is touch and step potential, not a resistance
//     number.
//   • Volt drop. IEC 60364-5-52 Annex G is INFORMATIVE. The NEC 3 % and 5 %
//     are Informational Notes, explicitly unenforceable under NEC 90.5(C).
//   • Harmonics. IEEE 519 compliance is a percentile over a measurement
//     window, never a spot reading.
//
// So these functions return a verdict of 'guidance' rather than 'pass', and
// the screen prints what the figure is and where it came from. A calculator
// that stamps PASS on a number that has no pass mark is worse than no
// calculator: somebody signs it.

// ════════════════════════════════════════════════════════════════════════
// INSULATION RESISTANCE — IEEE 43-2013
// ════════════════════════════════════════════════════════════════════════

/**
 * IEEE 43-2013 is administratively Inactive-Reserved as of March 2024 (no
 * revision within ten years), with P43 in progress. It is still the document
 * everybody cites, so it is what this implements — the screen says so.
 */
export const IEEE43_EDITION = 'IEEE 43-2013 (Inactive-Reserved, P43 in progress)'

export type WindingVintage = 'pre1970' | 'post1970' | 'randomWound'

export const VINTAGES: { id: WindingVintage; label: string; note: string }[] = [
  { id: 'pre1970', label: 'Pre-1970 windings, and all field windings', note: 'Minimum is kV + 1 MΩ' },
  { id: 'post1970', label: 'Post-1970 form-wound AC and DC armature', note: 'Minimum is a flat 100 MΩ' },
  { id: 'randomWound', label: 'Random-wound stators, and form-wound under 1 kV', note: 'Minimum is a flat 5 MΩ' },
]

/**
 * Minimum acceptable IR at one minute, corrected to 40 °C. IEEE 43 Table 3.
 *
 * ── The most common misuse in the industry ───────────────────────────────
 *
 * "One megohm per kV plus one" is NOT the general rule. It is the pre-1970
 * and field-winding row only. Applied to a modern form-wound 6.6 kV stator it
 * gives 7.6 MΩ where the standard wants 100 MΩ — a machine thirteen times
 * worse than the limit would pass.
 *
 * kV is the rated LINE-TO-LINE winding voltage.
 */
export function minimumIR(vintage: WindingVintage, ratedKV: number): number {
  switch (vintage) {
    case 'pre1970':
      return ratedKV + 1
    case 'post1970':
      return 100
    default:
      return 5
  }
}

export type CorrectionMethod = 'ieee' | 'iec-thermoset'

/**
 * Temperature correction factor to the 40 °C reference.
 *
 * ── A genuine disagreement between two live standards ────────────────────
 *
 * IEEE 43 uses the classical rule that insulation resistance halves for every
 * 10 °C rise, so K = 2^((T − 40)/10).
 *
 * IEC 60034-27-4:2018 says that for modern synthetic-resin (thermoset)
 * systems there is NO correction at all between 10 °C and 40 °C — K = 1.
 *
 * They give different answers on the same winding, and the halving rule comes
 * from old asphaltic insulation, so on epoxy-mica it can over-correct badly.
 * Both are offered and the screen names which was used. This is not a thing
 * to resolve quietly on the engineer's behalf.
 */
export function irTempFactor(tempC: number, method: CorrectionMethod = 'ieee'): number {
  if (method === 'iec-thermoset') {
    // No correction in the band the standard covers; outside it, fall back to
    // the IEEE slope rather than pretending the reading needs no adjustment.
    if (tempC >= 10 && tempC <= 40) return 1
  }
  return Math.pow(2, (tempC - 40) / 10)
}

export type IrInput = {
  /** Reading at 1 minute, MΩ, as measured. */
  ir1min: number
  /** Reading at 10 minutes, MΩ. Zero if not taken. */
  ir10min: number
  /** 30 s and 60 s readings for DAR. Zero if not taken. */
  ir30s: number
  ir60s: number
  windingTempC: number
  method: CorrectionMethod
  vintage: WindingVintage
  ratedKV: number
}

export type IrResult = {
  factor: number
  /** The 1-minute reading corrected to 40 °C. This is what is compared. */
  corrected: number
  minimum: number
  passes: boolean
  pi: number | null
  /** PI is not meaningful above 5000 MΩ — the standard says so. */
  piMeaningful: boolean
  /** A very high PI can mean brittle, thermally aged insulation. */
  piSuspiciouslyHigh: boolean
  dar: number | null
  /** True when the correction spans far enough to be worth doubting. */
  wideCorrection: boolean
}

export function insulationResistance(i: IrInput): IrResult {
  const factor = irTempFactor(i.windingTempC, i.method)
  const corrected = i.ir1min * factor
  const minimum = minimumIR(i.vintage, i.ratedKV)
  const pi = i.ir1min > 0 && i.ir10min > 0 ? i.ir10min / i.ir1min : null
  const dar = i.ir30s > 0 && i.ir60s > 0 ? i.ir60s / i.ir30s : null
  return {
    factor,
    corrected,
    minimum,
    passes: corrected >= minimum,
    pi,
    // IEEE 43: "if the one-minute insulation resistance is above 5000 MΩ, the
    // calculated PI may not be meaningful". At gigohm level the leakage is in
    // nanoamps and instrument noise dominates the ratio.
    piMeaningful: i.ir1min <= 5000,
    piSuspiciouslyHigh: pi !== null && pi > 7,
    // DAR is a quick screen when a ten-minute PI is impractical. It is NOT an
    // IEEE 43 acceptance criterion — it appears as an informative test in
    // IEC 60034-27-4 Annex E — so it is reported and never used to pass or
    // fail a machine.
    dar,
    // A correction stretched over more than 20 °C is doing most of the work,
    // and the two standards disagree most exactly there.
    wideCorrection: Math.abs(i.windingTempC - 40) > 20,
  }
}

/** IEC 60364-6 Table 6.1 — installations and cables, not rotating machines. */
export const IEC60364_IR: { band: string; testV: number; minMohm: number }[] = [
  { band: 'SELV and PELV', testV: 250, minMohm: 0.5 },
  { band: 'Up to and including 500 V, including FELV', testV: 500, minMohm: 1.0 },
  // Not a typo: the table really does stay at 1 MΩ above 500 V, just tested
  // at a higher voltage.
  { band: 'Above 500 V', testV: 1000, minMohm: 1.0 },
]

// ════════════════════════════════════════════════════════════════════════
// EARTH AND SOIL
// ════════════════════════════════════════════════════════════════════════

/**
 * Wenner four-pin soil resistivity.
 *
 * The simplified form ρ = 2πaR is valid when the pin depth is no more than a
 * tenth of the spacing. Below that the full form is needed, so both are
 * returned and the screen says which applies.
 *
 * Depth of investigation is roughly equal to the pin spacing: sweep the
 * spacing to build a layered model rather than trusting one reading.
 */
export function soilResistivity(spacingM: number, depthM: number, resistanceOhm: number) {
  const simple = 2 * Math.PI * spacingM * resistanceOhm
  const a = spacingM, h = depthM
  const denom =
    1 + (2 * a) / Math.sqrt(a * a + 4 * h * h) - a / Math.sqrt(a * a + h * h)
  const full = denom !== 0 ? (4 * Math.PI * a * resistanceOhm) / denom : simple
  return {
    simple,
    full,
    /** True when ρ = 2πaR is good enough. */
    simpleValid: depthM <= 0.1 * spacingM,
    approxDepthM: spacingM,
  }
}

export type EarthTarget = { label: string; range: string; source: string }

/**
 * What people quote as an earth resistance limit, and where each came from.
 *
 * IEEE 80 sets NO maximum. These are design targets from three different
 * documents, and a substation passing at 4 Ω can still fail IEEE 80 touch
 * potential while one at 8 Ω passes. The compliance test is the gradient
 * calculation, not this number.
 */
export const EARTH_TARGETS: EarthTarget[] = [
  { label: 'Generating plant and large substation', range: '0.5 – 1 Ω', source: 'IEEE 80, as a design target' },
  { label: 'Transmission substation', range: 'under 1 Ω', source: 'Industry practice' },
  { label: 'Distribution substation', range: 'under 5 Ω', source: 'Industry practice' },
  { label: 'Industrial and commercial installation', range: '0.5 – 5 Ω', source: 'IEEE 142 Green Book' },
  { label: 'A single rod, pipe or plate electrode', range: '25 Ω or less', source: 'NEC 250.53(A)(2) exception — above this a second electrode is required' },
]

/**
 * Fall-of-potential: where the potential probe goes, and whether the current
 * lead is long enough for the answer to mean anything.
 *
 * The 61.8 % figure is exact — it is the root of IEEE 81 Annex C equation
 * C.9, not a rounding of 62 %.
 *
 * The spacing check is the important half. A 60 × 60 m grid has an 85 m
 * diagonal and needs a current lead of 425 to 850 m for the 61.8 % point to
 * land in the true resistance plateau. Short leads are the single biggest
 * source of substation earth readings that are simply wrong.
 */
export function fallOfPotential(currentLeadM: number, gridDiagonalM: number) {
  const probeAtM = 0.618 * currentLeadM
  const min = 5 * gridDiagonalM
  const comfortable = 10 * gridDiagonalM
  return {
    probeAtM,
    minimumLeadM: min,
    comfortableLeadM: comfortable,
    longEnough: currentLeadM >= min,
    marginal: currentLeadM >= min && currentLeadM < comfortable,
  }
}

// ════════════════════════════════════════════════════════════════════════
// VOLT DROP
// ════════════════════════════════════════════════════════════════════════

/** Ω/km at operating temperature, per the Schneider installation guide. */
export const RHO_KM = { copper: 23.7, aluminium: 37.6 }

export type VdInput = {
  currentA: number
  /** One-way route length in metres. The formula adds the return itself. */
  lengthM: number
  csaMm2: number
  material: 'copper' | 'aluminium'
  /** Line-to-line for three-phase, line-to-neutral for single. */
  voltage: number
  phase: 1 | 3
  powerFactor: number
  /** Ω/km. About 0.08 for small cables; take it from the cable data. */
  reactancePerKm: number
}

/**
 * Volt drop, IEC form with reactance included.
 *
 * The ×2 on single-phase and ×√3 on three-phase are the go-and-return and
 * line-voltage factors. BOTH use the ONE-WAY length — counting the return
 * path twice is the classic bug in this calculation.
 */
export function voltDrop(i: VdInput) {
  const R = i.csaMm2 > 0 ? RHO_KM[i.material] / i.csaMm2 : 0
  const X = i.reactancePerKm
  const km = i.lengthM / 1000
  const cos = Math.min(1, Math.max(0, i.powerFactor))
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos))
  const k = i.phase === 3 ? Math.sqrt(3) : 2
  const volts = k * i.currentA * (R * cos + X * sin) * km
  return {
    resistancePerKm: R,
    volts,
    percent: i.voltage > 0 ? (volts / i.voltage) * 100 : 0,
  }
}

/**
 * The guidance figures — deliberately NOT called limits.
 *
 * IEC 60364-5-52 Annex G is informative. The NEC figures are Informational
 * Notes and NEC 90.5(C) says informational notes are not enforceable. Both
 * are steady-state: motor starting and other transients are excluded, and
 * greater drop is acceptable then provided the equipment standard is met.
 */
export const VD_GUIDANCE = [
  { id: 'iec-a', label: 'IEC type A — supplied from a public LV network', lighting: 3, other: 5 },
  { id: 'iec-b', label: 'IEC type B — private supply, own transformer or generator', lighting: 6, other: 8 },
  { id: 'nec', label: 'NEC informational note', lighting: 3, other: 5 },
]

// ════════════════════════════════════════════════════════════════════════
// CURRENT TRANSFORMERS
// ════════════════════════════════════════════════════════════════════════

export type CtInput = {
  /** 1 or 5, normally. */
  secondaryA: number
  /** CT nameplate output, VA. */
  ratedVA: number
  /** CT secondary winding resistance, Ω. */
  rctOhm: number
  /** One-way lead run in metres. */
  leadLengthM: number
  leadCsaMm2: number
  /** Relay or meter burden in VA at rated secondary current. */
  relayVA: number
  /** Nameplate accuracy limit factor — the 10 in 5P10. */
  alf: number
  /**
   * Where the CT secondaries are paralleled. This genuinely changes the lead
   * factor and is why it is an input rather than a baked-in constant.
   */
  connection: 'single' | 'star' | 'delta'
}

/** Copper at 75 °C — the hot value, which is the one protection studies use. */
export const RHO_CU_HOT = 0.0216

export function ctBurden(i: CtInput) {
  const Is = i.secondaryA > 0 ? i.secondaryA : 5
  // VA to ohms: Z = VA / I². This is why a 1 A CT tolerates twenty-five times
  // the lead resistance of a 5 A one for the same VA, and why long runs in a
  // substation should be 1 A secondaries.
  const ratedOhm = i.ratedVA / (Is * Is)
  const relayOhm = i.relayVA / (Is * Is)

  // Go-and-return for a single CT or a residual connection; a star group with
  // a shared neutral carries no return current on a balanced three-phase
  // fault but the full return on an earth fault, so the worst case is still
  // two. Delta secondaries add √3.
  const factor = i.connection === 'delta' ? 2 * Math.sqrt(3) : 2
  const leadOhm =
    i.leadCsaMm2 > 0 ? (factor * RHO_CU_HOT * i.leadLengthM) / i.leadCsaMm2 : 0

  const actualOhm = leadOhm + relayOhm
  const actualVA = actualOhm * Is * Is

  // Under-burdening a CT RAISES its effective accuracy limit factor, which is
  // good for protection reach. Over-burdening collapses it and the CT
  // saturates early — which is the failure that matters.
  const effectiveAlf =
    i.rctOhm + actualOhm > 0
      ? (i.alf * (i.rctOhm + ratedOhm)) / (i.rctOhm + actualOhm)
      : 0

  return {
    ratedOhm,
    relayOhm,
    leadOhm,
    actualOhm,
    actualVA,
    /** Over 100 % means the CT is carrying more than it is rated for. */
    burdenUsedPct: ratedOhm > 0 ? (actualOhm / ratedOhm) * 100 : 0,
    overBurdened: actualOhm > ratedOhm,
    effectiveAlf,
    /** E_s = ALF × Is × (Rct + Rb). */
    secondaryLimitingEmf: i.alf * Is * (i.rctOhm + ratedOhm),
  }
}

// ════════════════════════════════════════════════════════════════════════
// HARMONICS — IEEE 519-2022
// ════════════════════════════════════════════════════════════════════════

export const IEEE519_EDITION = 'IEEE 519-2022'

/** Table 1. Unchanged between the 2014 and 2022 editions. */
export const VOLTAGE_LIMITS: { band: string; maxKV: number; individual: number; thd: number }[] = [
  { band: 'V ≤ 1 kV', maxKV: 1, individual: 5.0, thd: 8.0 },
  { band: '1 kV < V ≤ 69 kV', maxKV: 69, individual: 3.0, thd: 5.0 },
  { band: '69 kV < V ≤ 161 kV', maxKV: 161, individual: 1.5, thd: 2.5 },
  { band: 'V > 161 kV', maxKV: Infinity, individual: 1.0, thd: 1.5 },
]

export function voltageLimitFor(kv: number) {
  return VOLTAGE_LIMITS.find((b) => kv <= b.maxKV) ?? VOLTAGE_LIMITS[VOLTAGE_LIMITS.length - 1]
}

/**
 * Table 2 — current distortion, systems 120 V to 69 kV, as a percentage of
 * the maximum demand current I_L.
 *
 * Above 69 kV there are Tables 3 and 4 with different breakpoints. They could
 * not be verified from an open source and cannot be derived by scaling this
 * one, so this returns null rather than guessing. For a data centre the PCC
 * is almost always at or below 69 kV.
 */
export const TDD_TABLE: { maxRatio: number; label: string; h3_11: number; h11_17: number; h17_23: number; h23_35: number; h35_50: number; tdd: number }[] = [
  { maxRatio: 20, label: 'under 20', h3_11: 4.0, h11_17: 2.0, h17_23: 1.5, h23_35: 0.6, h35_50: 0.3, tdd: 5.0 },
  { maxRatio: 50, label: '20 to 50', h3_11: 7.0, h11_17: 3.5, h17_23: 2.5, h23_35: 1.0, h35_50: 0.5, tdd: 8.0 },
  { maxRatio: 100, label: '50 to 100', h3_11: 10.0, h11_17: 4.5, h17_23: 4.0, h23_35: 1.5, h35_50: 0.7, tdd: 12.0 },
  { maxRatio: 1000, label: '100 to 1000', h3_11: 12.0, h11_17: 5.5, h17_23: 5.0, h23_35: 2.0, h35_50: 1.0, tdd: 15.0 },
  { maxRatio: Infinity, label: 'over 1000', h3_11: 15.0, h11_17: 7.0, h17_23: 6.0, h23_35: 2.5, h35_50: 1.4, tdd: 20.0 },
]

export function tddLimits(iscA: number, ilA: number, systemKV: number) {
  if (systemKV > 69) return null
  const ratio = ilA > 0 ? iscA / ilA : 0
  const row = TDD_TABLE.find((r) => ratio < r.maxRatio) ?? TDD_TABLE[TDD_TABLE.length - 1]
  return { ratio, row }
}

/**
 * Compliance is statistical, and this is what a spot reading is worth.
 *
 * A single instrument snapshot over a table limit is NOT a 519 failure. The
 * standard assesses the 99th percentile of 3-second values daily against
 * twice the limit, and weekly 10-minute percentiles against 1.5× and 1.0×.
 * A calculator that stamps FAIL on one reading generates false
 * non-compliances, which is how a real one stops being believed.
 */
export const IEEE519_WINDOWS = [
  { label: 'Very short, 3 s values — 99th percentile, daily', multiple: 2.0 },
  { label: 'Short, 10 min values — 99th percentile, weekly', multiple: 1.5 },
  { label: 'Short, 10 min values — 95th percentile, weekly', multiple: 1.0 },
]

// ════════════════════════════════════════════════════════════════════════
// WHITE SPACE — COOLING AND CONTAINMENT
// ════════════════════════════════════════════════════════════════════════

/** L/s per kW per kelvin. From ρ 1.2 kg/m³ and cp 1.006 kJ/kg·K. */
export const LPS_CONST = 827.8

export type WhiteSpaceInput = {
  racks: number
  kwPerRack: number
  /** Rise across the IT equipment, in kelvin. */
  itDeltaT: number
  /** Total running rated cooling capacity, kW. */
  coolingCapacityKw: number
  /** Total air actually supplied by the cooling units, L/s. */
  suppliedLps: number
}

export function whiteSpace(i: WhiteSpaceInput) {
  const itKw = i.racks * i.kwPerRack
  const requiredLps = i.itDeltaT > 0 ? (LPS_CONST * itKw) / i.itDeltaT : 0
  const perRackLps = i.racks > 0 ? requiredLps / i.racks : 0
  // Cooling Capacity Factor. The 1.10 covers lighting, envelope and people.
  // Target is 1.2. Measured reality across 45 assessed sites averaged 3.9 —
  // most rooms run roughly four times the cooling they need, which is
  // stranded capacity rather than safety.
  const ccf = itKw > 0 ? i.coolingCapacityKw / (1.1 * itKw) : 0
  const provisioning = requiredLps > 0 ? i.suppliedLps / requiredLps : 0
  return {
    itKw,
    requiredLps,
    requiredCfm: requiredLps * 2.118882,
    perRackLps,
    perRackCfm: perRackLps * 2.118882,
    ccf,
    provisioning,
    bypassLps: Math.max(0, i.suppliedLps - requiredLps),
    bypassPct: i.suppliedLps > 0 ? (Math.max(0, i.suppliedLps - requiredLps) / i.suppliedLps) * 100 : 0,
    starved: provisioning > 0 && provisioning < 1,
  }
}

/**
 * Rack Cooling Index.
 *
 * Only readings ABOVE the recommended maximum enter the HI sum, and only
 * those BELOW the recommended minimum enter the LO sum. Dropping that
 * one-sided clamp — which secondary write-ups routinely do — turns the index
 * into nonsense, because a cold rack would then offset a hot one.
 *
 * The reference temperatures must match the declared ASHRAE class. An RCI
 * computed against A1 limits in an A3 room means nothing.
 */
export function rackCoolingIndex(
  temps: number[],
  recommended: [number, number],
  allowable: [number, number]
) {
  const n = temps.length
  if (n === 0) return { hi: 100, lo: 100, n: 0, worstHigh: null as number | null, worstLow: null as number | null }
  const [rLo, rHi] = recommended
  const [aLo, aHi] = allowable
  const overSum = temps.reduce((s, t) => s + Math.max(0, t - rHi), 0)
  const underSum = temps.reduce((s, t) => s + Math.max(0, rLo - t), 0)
  const hiSpan = n * (aHi - rHi)
  const loSpan = n * (rLo - aLo)
  return {
    hi: hiSpan > 0 ? Math.max(0, (1 - overSum / hiSpan) * 100) : 100,
    lo: loSpan > 0 ? Math.max(0, (1 - underSum / loSpan) * 100) : 100,
    n,
    worstHigh: Math.max(...temps),
    worstLow: Math.min(...temps),
  }
}

export function rciVerdict(v: number): 'good' | 'acceptable' | 'poor' {
  if (v > 96) return 'good'
  if (v >= 91) return 'acceptable'
  return 'poor'
}

/**
 * Return Temperature Index.
 *
 * RTI = (air handler ΔT ÷ IT equipment ΔT) × 100, which by heat balance is
 * also (IT airflow ÷ air handler airflow) × 100.
 *
 * ── Getting the direction right ──────────────────────────────────────────
 *
 * Under 100 % is BYPASS — supply air short-circuits to the return without
 * passing through a server, so the handler sees a smaller rise than the kit
 * does. Over 100 % is RECIRCULATION — hot exhaust is re-entrained at the
 * inlets. A widely mirrored source prints this ratio upside down, which flips
 * the two diagnoses; the form here is the LBNL one.
 */
export function returnTemperatureIndex(ahuDeltaT: number, itDeltaT: number) {
  const rti = itDeltaT > 0 ? (ahuDeltaT / itDeltaT) * 100 : 0
  return {
    rti,
    condition: rti === 0 ? 'unknown' : rti < 95 ? 'bypass' : rti > 105 ? 'recirculation' : 'balanced',
    /** Outside this band is treated as clear waste or clear thermal risk. */
    withinTarget: rti >= 80 && rti <= 120,
  }
}

// ════════════════════════════════════════════════════════════════════════
// CHILLED WATER
// ════════════════════════════════════════════════════════════════════════

/**
 * Litres per second from kW and ΔT.
 *
 * 4.19 is ρ × cp for water — 997 kg/m³ × 4.187 kJ/kg·K. Treating a litre as a
 * kilogram costs under 0.3 % at chilled water temperatures.
 *
 * NOT valid for glycol: cp falls and density rises, so a 25–40 % mix needs
 * roughly 5–15 % more flow. Take cp and ρ from the fluid tables rather than
 * applying a guessed correction.
 */
export const WATER_RHO_CP = 4.19

export function chilledWaterFlow(kw: number, deltaTK: number) {
  const lps = deltaTK > 0 ? kw / (WATER_RHO_CP * deltaTK) : 0
  const tons = kw / 3.516853
  const deltaF = deltaTK * 9 / 5
  return {
    lps,
    m3h: lps * 3.6,
    // 500 = 8.34 lb/gal × 60 min/hr × 1.0 BTU/lb·°F, water at 60 °F.
    gpm: deltaF > 0 ? (24 * tons) / deltaF : 0,
    tons,
    gpmPerTon: deltaF > 0 ? 24 / deltaF : 0,
  }
}

/**
 * Pressure drop scales with the square of flow.
 *
 * True for fully developed turbulent flow, which is most of a chilled water
 * system. It breaks down through filters and strainers, at low flow, and in
 * open systems where the static lift does not scale at all. The exponent is
 * an argument because Hazen-Williams gives 1.852 and the real figure sits
 * between.
 */
export function pressureDropAtFlow(dp1: number, q1: number, q2: number, exponent = 2) {
  if (q1 <= 0) return 0
  return dp1 * Math.pow(q2 / q1, exponent)
}

// ════════════════════════════════════════════════════════════════════════
// PUMP AND FAN LAWS
// ════════════════════════════════════════════════════════════════════════

export type AffinityMode = 'speed' | 'trim' | 'scale'

export const AFFINITY_MODES: { id: AffinityMode; label: string; note: string }[] = [
  { id: 'speed', label: 'Change the speed', note: 'Same machine on a drive. Q∝N, H∝N², P∝N³' },
  { id: 'trim', label: 'Trim the impeller in the same casing', note: 'Q∝D, H∝D², P∝D³' },
  { id: 'scale', label: 'A different-sized machine', note: 'Full geometric similarity. Q∝ND³, H∝N²D², P∝N³D⁵' },
]

/**
 * The affinity laws.
 *
 * ── The trap ─────────────────────────────────────────────────────────────
 *
 * THERE ARE TWO DIFFERENT DIAMETER LAWS and they disagree on the flow and
 * power exponents. Trimming an impeller inside its existing casing gives
 * Q∝D and P∝D³. Scaling to a genuinely different machine gives Q∝ND³ and
 * P∝N³D⁵. Both are correct in their own domain, so the mode is an input —
 * a calculator that just offers "diameter" is wrong for half its users.
 */
export function affinity(mode: AffinityMode, ratioN: number, ratioD: number) {
  switch (mode) {
    case 'speed':
      return { flow: ratioN, head: ratioN ** 2, power: ratioN ** 3 }
    case 'trim':
      return { flow: ratioD, head: ratioD ** 2, power: ratioD ** 3 }
    default:
      return {
        flow: ratioN * ratioD ** 3,
        head: ratioN ** 2 * ratioD ** 2,
        power: ratioN ** 3 * ratioD ** 5,
      }
  }
}

/**
 * The speed below which a pump stops delivering anything.
 *
 * With significant static head the pump curve can fall entirely below the
 * system curve at reduced speed and give zero flow. This is the caveat that
 * matters most on open circuits — cooling towers especially. In a friction-
 * dominated closed loop, which most chilled water systems are, the static
 * head is near zero and the affinity parabola holds.
 */
export function minimumUsefulSpeed(ratedRpm: number, staticHead: number, headAtBep: number) {
  if (headAtBep <= 0 || staticHead <= 0) return 0
  return ratedRpm * Math.sqrt(Math.min(1, staticHead / headAtBep))
}

/** Trim depth against how far the published curve can be trusted. */
export function trimAccuracy(pct: number): { band: string; note: string } {
  const t = Math.abs(pct)
  if (t <= 10) return { band: '±2 – 3 % of the tested curve', note: 'Reliable.' }
  if (t <= 20) return { band: '±4 – 7 % of the tested curve', note: 'Getting loose. Beyond about 15 % the vane exit angle changes and the law stops holding.' }
  return { band: 'The affinity law no longer applies', note: 'Past roughly 20 % the impeller-to-volute clearance and diffusion losses dominate. Ask the manufacturer for a tested curve.' }
}

// ════════════════════════════════════════════════════════════════════════
// AIR BALANCE TOLERANCES
// ════════════════════════════════════════════════════════════════════════

/**
 * NEBB and AABC are NOT the same, and the "plus or minus ten per cent"
 * everybody half-remembers is NEBB's. AABC holds air handlers to −5/+10 and
 * water to ±5, which is materially tighter, and data centre specifications
 * routinely tighten further again. So the governing standard is a choice, not
 * a constant.
 */
export const BALANCE_TOLERANCES: {
  standard: 'NEBB' | 'AABC'
  item: string
  tolerance: string
}[] = [
  { standard: 'NEBB', item: 'Supply, return and exhaust fans', tolerance: '−10 % to +10 %' },
  { standard: 'NEBB', item: 'Supply to an individual room', tolerance: '−10 % to +10 %' },
  { standard: 'NEBB', item: 'Individual outlets, three or more per room', tolerance: '−15 % to +15 %' },
  { standard: 'NEBB', item: 'Hydronic equipment', tolerance: '−10 % to +10 %' },
  { standard: 'AABC', item: 'Air handlers and fans', tolerance: '−5 % to +10 %' },
  { standard: 'AABC', item: 'Outdoor air', tolerance: '100 % to +110 %' },
  { standard: 'AABC', item: 'Terminal boxes', tolerance: '±5 %' },
  { standard: 'AABC', item: 'Diffusers and grilles', tolerance: '±10 %, or ±10 CFM below 100 CFM' },
  { standard: 'AABC', item: 'Water — coils, pumps, heat exchangers', tolerance: '±5 %, or ±10 % below 10 GPM' },
  { standard: 'AABC', item: 'Air, water and space temperature', tolerance: '±0.5 °F (±0.3 °C)' },
]
