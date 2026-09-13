'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  sizeGenerator, REGIMES, regimeById, planSteps, totalMinutes, sizeUps,
  heatAndAir, inletVerdict, ASHRAE, ALT_DATUM_M, AMB_DATUM_C,
  type RatingUnit, type Phase,
} from '@/lib/loadbank'
import {
  insulationResistance, VINTAGES, IEC60364_IR, IEEE43_EDITION,
  soilResistivity, fallOfPotential, EARTH_TARGETS,
  voltDrop, VD_GUIDANCE, ctBurden,
  voltageLimitFor, tddLimits, VOLTAGE_LIMITS, IEEE519_WINDOWS, IEEE519_EDITION,
  whiteSpace, rackCoolingIndex, rciVerdict, returnTemperatureIndex,
  chilledWaterFlow, affinity, minimumUsefulSpeed, trimAccuracy, AFFINITY_MODES,
  BALANCE_TOLERANCES,
  type WindingVintage, type CorrectionMethod, type AffinityMode,
} from '@/lib/techdesign'

// Technical Design — the commissioning calculations, as a tool hub.
//
// Every number comes from src/lib/loadbank.ts or src/lib/techdesign.ts, both
// pure and both carrying their own assertion suites. Nothing is calculated in
// this file; it is the form and the drawing. That split is the whole reason
// the maths can be checked against a hand-worked example rather than against
// whatever the screen happened to print.
//
// ── Why a hub rather than a tab strip ────────────────────────────────────
//
// The first version was six tabs and a wall of form fields, and it was hard
// to scan and hard to grow. A grid of tool cards scales to twenty tools
// without a crowded bar, and opening one gives it the whole screen. The
// headline answers pin to the top as you type so you never scroll to see what
// changed — which is the thing you actually do on site.

const STYLES = `
.td{max-width:1180px;margin:0 auto}
.td-hero{display:flex;align-items:flex-start;gap:13px}
.td-mark{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;
  border-radius:9px;background:var(--color-primary);color:#fff;font-weight:700;font-size:12px;flex:none}
.td-grp{font-size:10.5px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;
  color:var(--color-text-secondary);margin:26px 0 9px}
.td-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(232px,1fr));gap:10px}
.td-card{display:block;text-align:left;width:100%;appearance:none;cursor:pointer;
  background:var(--color-surface,#fff);border:1px solid var(--color-border);border-radius:9px;
  padding:14px 15px;font-family:inherit;transition:border-color .12s,transform .12s}
.td-card:hover{border-color:var(--color-primary);transform:translateY(-1px)}
.td-card:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
.td-card-t{font-size:14.5px;font-weight:700;color:var(--color-text);margin:0 0 3px;letter-spacing:-.01em}
.td-card-n{font-size:12px;color:var(--color-text-secondary);margin:0;line-height:1.5}
.td-card-s{font-size:10.5px;font-weight:600;color:var(--color-primary);margin-top:8px;display:block}
.td-back{appearance:none;border:0;background:none;font-family:inherit;font-size:12.5px;font-weight:600;
  color:var(--color-primary);cursor:pointer;padding:5px 0;margin-bottom:4px}
.td-back:hover{text-decoration:underline}
.td-bar{position:sticky;top:0;z-index:30;background:var(--color-bg);
  border-bottom:1.5px solid var(--color-text);padding:11px 0 12px;margin-bottom:16px;
  display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
.td-kpi-l{font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  color:var(--color-text-secondary);margin-bottom:1px}
.td-kpi-v{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1;letter-spacing:-.02em}
.td-kpi-u{font-size:12.5px;font-weight:500;color:var(--color-text-secondary)}
.td-kpi-n{font-size:11px;color:var(--color-text-secondary);margin-top:2px}
.td-kpi.good .td-kpi-v{color:var(--color-success)}
.td-kpi.warn .td-kpi-v{color:var(--color-warning)}
.td-kpi.bad .td-kpi-v{color:var(--color-danger)}
.td-kpi.lead .td-kpi-v{color:var(--color-primary-dark)}
.td-in{display:grid;grid-template-columns:repeat(auto-fit,minmax(146px,1fr));gap:11px;
  background:var(--color-surface,#fff);border:1px solid var(--color-border);
  border-radius:9px;padding:14px 15px;margin-bottom:16px}
.td-f{display:grid;gap:3px;min-width:0}
.td-f label{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  color:var(--color-text-secondary);line-height:1.35}
.td-f .h{font-weight:400;letter-spacing:0;text-transform:none;font-size:11px;display:block}
.td-work{background:var(--color-surface,#fff);border:1px solid var(--color-border);
  border-radius:9px;padding:16px 18px;margin-bottom:14px}
.td-work h3{font-size:14px;font-weight:700;margin:0 0 9px;letter-spacing:-.01em}
.td-work h3:not(:first-child){margin-top:20px}
.td-p{font-size:13px;line-height:1.62;margin:0 0 11px;max-width:72ch;color:var(--color-text)}
.td-fml{font-size:12px;background:var(--color-bg);border:1px solid var(--color-border);
  border-radius:6px;padding:10px 13px;margin:0 0 12px;overflow-x:auto;line-height:1.8;white-space:pre}
.td-note{border-left:3px solid var(--color-primary);background:var(--color-primary-light);
  padding:10px 14px;margin:0 0 13px;font-size:12.5px;line-height:1.6;max-width:74ch;border-radius:0 5px 5px 0}
.td-note.warn{border-left-color:var(--color-warning);background:var(--color-warning-bg)}
.td-note.stop{border-left-color:var(--color-danger);background:var(--color-danger-bg)}
.td-note b{display:block;font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
  margin-bottom:3px;color:var(--color-primary-dark)}
.td-note.warn b{color:var(--color-warning)}.td-note.stop b{color:var(--color-danger)}
.td-note p{margin:0}.td-note p+p{margin-top:6px}
.td-src{font-size:11px;color:var(--color-text-secondary);margin:-5px 0 12px}
.td-plan{display:grid;grid-template-columns:196px minmax(0,1fr);gap:14px;align-items:start}
@media(max-width:860px){.td-plan{grid-template-columns:1fr}}
.td-pbtn{display:flex;align-items:center;gap:8px;text-align:left;width:100%;appearance:none;
  border:1px solid var(--color-border);background:var(--color-surface,#fff);color:var(--color-text);
  font-family:inherit;font-size:12px;font-weight:600;padding:7px 9px;border-radius:6px;
  cursor:pointer;margin-bottom:6px}
.td-pbtn:hover{border-color:var(--color-primary);background:var(--color-primary-light)}
.td-sw{width:13px;height:13px;border-radius:3px;flex:none}
.td-stage{width:100%;height:auto;background:var(--color-surface,#fff);
  border:1px solid var(--color-border);border-radius:8px;touch-action:none}
.td-bar2{display:flex;flex-wrap:wrap;gap:7px;align-items:center;margin-bottom:10px}
.td-mini{appearance:none;border:1px solid var(--color-border);background:var(--color-surface,#fff);
  color:var(--color-text);font-family:inherit;font-size:12px;font-weight:600;padding:6px 11px;
  border-radius:5px;cursor:pointer}
.td-mini:hover{border-color:var(--color-primary);color:var(--color-primary)}
.td-mini.on{background:var(--color-primary);color:#fff;border-color:var(--color-primary)}
.td-seg{display:flex;border:1px solid var(--color-border);border-radius:6px;overflow:hidden}
.td-seg button{flex:1;appearance:none;border:0;background:var(--color-bg);
  color:var(--color-text-secondary);font-family:inherit;font-size:12px;font-weight:600;
  padding:6px 4px;cursor:pointer}
.td-seg button.on{background:var(--color-primary);color:#fff}
.td-seg button+button{border-left:1px solid var(--color-border)}
.td-tbl{min-width:0;table-layout:auto;font-size:12.5px}
.td-hit{background:var(--color-primary-light)}
@media print{.td-cards,.td-back,.td-bar2,.td-pbtn{display:none}
  .td-bar{position:static}.td-work,.td-note,.td-in{break-inside:avoid}}
`

// ── The registry. Adding a tool means adding a row here and a case below. ──
type ToolId =
  | 'loadbank' | 'regime' | 'ups' | 'ir' | 'earth' | 'vd' | 'ct' | 'harmonics'
  | 'whitespace' | 'containment' | 'heat' | 'chw' | 'affinity' | 'room' | 'ref'

type Tool = { id: ToolId; group: string; title: string; note: string; tag: string; href?: string }

const TOOLS: Tool[] = [
  { id: 'loadbank', group: 'Electrical', title: 'Load bank sizing', note: 'Both legs of the bank from a nameplate, with site derating and the resistive-only warning.', tag: 'kW + kVAR' },
  { id: 'regime', group: 'Electrical', title: 'Generator test regime', note: 'The step table for NFPA 110 acceptance, monthly, annual and triennial, or an ISO 8528 ladder.', tag: 'NFPA 110 · ISO 8528' },
  { id: 'ups', group: 'Electrical', title: 'UPS and battery', note: 'Test load at any power factor, end-of-discharge volts, watts per cell, and the IST abort point.', tag: 'IEEE 450 · 1188' },
  { id: 'ir', group: 'Electrical', title: 'Insulation resistance', note: 'Minimum by winding vintage, temperature correction both ways, PI and DAR.', tag: 'IEEE 43 · IEC 60364' },
  { id: 'earth', group: 'Electrical', title: 'Earth and soil resistivity', note: 'Wenner four-pin, the 61.8 % probe position, and whether your current lead is long enough.', tag: 'IEEE 81 · IEEE 80' },
  { id: 'vd', group: 'Electrical', title: 'Cable volt drop', note: 'Resistance and reactance, three-phase or single, against the IEC and NEC guidance figures.', tag: 'IEC 60364-5-52' },
  { id: 'ct', group: 'Electrical', title: 'CT burden and ALF', note: 'Connected burden from leads and relay, and the effective accuracy limit factor it leaves you.', tag: 'IEC 61869-2' },
  { id: 'harmonics', group: 'Electrical', title: 'Harmonics', note: 'Voltage distortion limits by bus voltage and the TDD table from Isc over IL.', tag: 'IEEE 519-2022' },
  { id: 'whitespace', group: 'White space and cooling', title: 'White space cooling', note: 'Airflow per rack, cooling capacity factor, provisioning ratio and bypass.', tag: 'CCF · CFM/kW' },
  { id: 'containment', group: 'White space and cooling', title: 'Containment — RCI and RTI', note: 'Rack Cooling Index against the ASHRAE class, and whether you have bypass or recirculation.', tag: 'ASHRAE TC 9.9' },
  { id: 'heat', group: 'White space and cooling', title: 'Heat rejection and airflow', note: 'kW to BTU and tons, the air volume needed, corrected for altitude.', tag: 'CFM · m³/s' },
  { id: 'chw', group: 'White space and cooling', title: 'Chilled water', note: 'Flow from load and ΔT in both unit systems, and pressure drop against flow.', tag: 'l/s · GPM' },
  { id: 'affinity', group: 'White space and cooling', title: 'Pump and fan laws', note: 'Speed, impeller trim and machine scaling — which are three different laws.', tag: 'Affinity' },
  { id: 'room', group: 'Planning', title: 'Room layout planner', note: 'Place equipment to scale, drag cables between it, and every cable sizes itself from the load below it. Room plan and single line from one model.', tag: 'Drag to connect', href: '/knowledge/planner' },
  { id: 'ref', group: 'Planning', title: 'Reference and tolerances', note: 'Air balance tolerances, the standards behind each tool, and what this page will not do.', tag: 'NEBB · AABC' },
]

function f(v: number, d?: number) {
  if (!isFinite(v)) return '—'
  const p = d === undefined ? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2) : d
  return v.toLocaleString('en-GB', { minimumFractionDigits: p, maximumFractionDigits: p })
}

type KpiTone = 'lead' | 'good' | 'warn' | 'bad' | undefined
function Kpi({ label, value, unit, note, tone }: {
  label: string; value: string; unit?: string; note?: string; tone?: KpiTone
}) {
  return (
    <div className={'td-kpi' + (tone ? ' ' + tone : '')}>
      <div className="td-kpi-l">{label}</div>
      <div className="td-kpi-v mono">{value}{unit ? <span className="td-kpi-u"> {unit}</span> : null}</div>
      {note ? <div className="td-kpi-n">{note}</div> : null}
    </div>
  )
}

function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="td-f">
      <label>{label}{hint ? <span className="h">{hint}</span> : null}</label>
      {children}
    </div>
  )
}

export default function TechnicalDesignPage() {
  const [tool, setTool] = useState<ToolId | null>(null)

  // ── load bank ──
  const [rating, setRating] = useState(1000)
  const [unit, setUnit] = useState<RatingUnit>('kva')
  const [pf, setPf] = useState(0.8)
  const [volts, setVolts] = useState(400)
  const [phase, setPhase] = useState<Phase>(3)
  const [altM, setAltM] = useState(0)
  const [ambC, setAmbC] = useState(30)
  const [rAlt, setRAlt] = useState(1)
  const [rAmb, setRAmb] = useState(3)
  const size = useMemo(() => sizeGenerator({
    rating, unit, pf, volts, phase, altitudeM: altM, ambientC: ambC,
    pctPer100m: rAlt, pctPer5C: rAmb,
  }), [rating, unit, pf, volts, phase, altM, ambC, rAlt, rAmb])

  // ── regime ──
  const [regimeId, setRegimeId] = useState('nfpa-accept')
  const [baseKw, setBaseKw] = useState<number | null>(null)
  const [applyDerate, setApplyDerate] = useState(false)
  const regime = regimeById(regimeId)
  const planKw = baseKw ?? Math.round(size.rated.kW)
  const steps = planSteps(regime, planKw, applyDerate ? size.derate.factor : 1)

  // ── ups ──
  const [uRating, setURating] = useState(500)
  const [uPf, setUPf] = useState(1)
  const [uLoad, setULoad] = useState(100)
  const [cells, setCells] = useState(240)
  const [vpc, setVpc] = useState(1.75)
  const [autonomy, setAutonomy] = useState(10)
  const [eff, setEff] = useState(95)
  const ups = useMemo(() => sizeUps({
    rating: uRating, unit: 'kva', pf: uPf, loadPct: uLoad,
    cells, voltsPerCell: vpc, autonomyMin: autonomy, efficiencyPct: eff,
  }), [uRating, uPf, uLoad, cells, vpc, autonomy, eff])

  // ── insulation resistance ──
  const [ir1, setIr1] = useState(400)
  const [ir10, setIr10] = useState(900)
  const [ir30s, setIr30s] = useState(0)
  const [ir60s, setIr60s] = useState(0)
  const [windT, setWindT] = useState(25)
  const [irMethod, setIrMethod] = useState<CorrectionMethod>('ieee')
  const [vintage, setVintage] = useState<WindingVintage>('post1970')
  const [ratedKV, setRatedKV] = useState(6.6)
  const ir = useMemo(() => insulationResistance({
    ir1min: ir1, ir10min: ir10, ir30s, ir60s,
    windingTempC: windT, method: irMethod, vintage, ratedKV,
  }), [ir1, ir10, ir30s, ir60s, windT, irMethod, vintage, ratedKV])

  // ── earth ──
  const [spacing, setSpacing] = useState(3)
  const [pinDepth, setPinDepth] = useState(0.2)
  const [soilR, setSoilR] = useState(2)
  const [leadM, setLeadM] = useState(500)
  const [diagM, setDiagM] = useState(85)
  const soil = useMemo(() => soilResistivity(spacing, pinDepth, soilR), [spacing, pinDepth, soilR])
  const fop = useMemo(() => fallOfPotential(leadM, diagM), [leadM, diagM])

  // ── volt drop ──
  const [vdI, setVdI] = useState(100)
  const [vdL, setVdL] = useState(50)
  const [vdCsa, setVdCsa] = useState(70)
  const [vdMat, setVdMat] = useState<'copper' | 'aluminium'>('copper')
  const [vdV, setVdV] = useState(400)
  const [vdPh, setVdPh] = useState<1 | 3>(3)
  const [vdPf, setVdPf] = useState(0.85)
  const [vdX, setVdX] = useState(0.08)
  const [vdGuide, setVdGuide] = useState('iec-a')
  const vd = useMemo(() => voltDrop({
    currentA: vdI, lengthM: vdL, csaMm2: vdCsa, material: vdMat,
    voltage: vdV, phase: vdPh, powerFactor: vdPf, reactancePerKm: vdX,
  }), [vdI, vdL, vdCsa, vdMat, vdV, vdPh, vdPf, vdX])
  const guide = VD_GUIDANCE.find((g) => g.id === vdGuide) ?? VD_GUIDANCE[0]

  // ── CT ──
  const [ctIs, setCtIs] = useState(5)
  const [ctVA, setCtVA] = useState(15)
  const [ctRct, setCtRct] = useState(0.3)
  const [ctLen, setCtLen] = useState(60)
  const [ctCsa, setCtCsa] = useState(4)
  const [ctRelay, setCtRelay] = useState(2.5)
  const [ctAlf, setCtAlf] = useState(10)
  const [ctConn, setCtConn] = useState<'single' | 'star' | 'delta'>('single')
  const ct = useMemo(() => ctBurden({
    secondaryA: ctIs, ratedVA: ctVA, rctOhm: ctRct, leadLengthM: ctLen,
    leadCsaMm2: ctCsa, relayVA: ctRelay, alf: ctAlf, connection: ctConn,
  }), [ctIs, ctVA, ctRct, ctLen, ctCsa, ctRelay, ctAlf, ctConn])

  // ── harmonics ──
  const [busKV, setBusKV] = useState(11)
  const [isc, setIsc] = useState(20000)
  const [il, setIl] = useState(500)
  const vLimit = voltageLimitFor(busKV)
  const tdd = tddLimits(isc, il, busKV)

  // ── white space ──
  const [racks, setRacks] = useState(40)
  const [kwRack, setKwRack] = useState(10)
  const [itDt, setItDt] = useState(11)
  const [coolKw, setCoolKw] = useState(528)
  const [suppLps, setSuppLps] = useState(36000)
  const ws = useMemo(() => whiteSpace({
    racks, kwPerRack: kwRack, itDeltaT: itDt,
    coolingCapacityKw: coolKw, suppliedLps: suppLps,
  }), [racks, kwRack, itDt, coolKw, suppLps])

  // ── containment ──
  const [tempsRaw, setTempsRaw] = useState('20, 22, 24, 26, 29, 23')
  const [cls, setCls] = useState('A1')
  const [ahuDt, setAhuDt] = useState(9)
  const [itDt2, setItDt2] = useState(11)
  const temps = useMemo(() =>
    tempsRaw.split(/[,\s]+/).map(Number).filter((n) => isFinite(n) && n !== 0), [tempsRaw])
  const band = ASHRAE[cls] ?? ASHRAE.A2
  const rci = useMemo(() => rackCoolingIndex(temps, [18, 27], band), [temps, band])
  const rti = useMemo(() => returnTemperatureIndex(ahuDt, itDt2), [ahuDt, itDt2])

  // ── heat ──
  const [hKw, setHKw] = useState(500)
  const [hDt, setHDt] = useState(11)
  const [hAlt, setHAlt] = useState(0)
  const [inlet, setInlet] = useState(24)
  const [hCls, setHCls] = useState('A2')
  const heat = useMemo(() => heatAndAir({ kW: hKw, deltaT: hDt, deltaUnit: 'c', altitudeM: hAlt }),
    [hKw, hDt, hAlt])
  const hBand = ASHRAE[hCls] ?? ASHRAE.A2
  const verdict = inletVerdict(inlet, hCls)

  // ── chilled water ──
  const [chwKw, setChwKw] = useState(400)
  const [chwDt, setChwDt] = useState(6)
  const chw = useMemo(() => chilledWaterFlow(chwKw, chwDt), [chwKw, chwDt])

  // ── affinity ──
  const [affMode, setAffMode] = useState<AffinityMode>('speed')
  const [nPct, setNPct] = useState(80)
  const [dPct, setDPct] = useState(100)
  const [rpm, setRpm] = useState(1450)
  const [hStatic, setHStatic] = useState(0)
  const [hBep, setHBep] = useState(100)
  const aff = useMemo(() => affinity(affMode, nPct / 100, dPct / 100), [affMode, nPct, dPct])
  const minSpeed = minimumUsefulSpeed(rpm, hStatic, hBep)

  const num = (v: number, set: (n: number) => void) => ({
    type: 'number' as const, className: 'input mono', value: String(v),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const n = parseFloat(e.target.value); set(isFinite(n) ? n : 0)
    },
  })

  // ── the hub ───────────────────────────────────────────────────────────
  if (tool === null) {
    const groups = [...new Set(TOOLS.map((t) => t.group))]
    return (
      <div className="td">
        <style>{STYLES}</style>
        <div className="td-hero">
          <span className="td-mark">CX</span>
          <div>
            <h1 style={{ fontSize: 23, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
              Technical Design
            </h1>
            <p className="text-secondary" style={{ fontSize: 13.5, margin: 0, maxWidth: '66ch' }}>
              The commissioning calculations, with the formula and the standard behind every number —
              and an honest word where the standard does not actually set a limit.
            </p>
          </div>
        </div>
        {groups.map((g) => (
          <div key={g}>
            <div className="td-grp">{g}</div>
            <div className="td-cards">
              {TOOLS.filter((t) => t.group === g).map((t) => {
                const body = (
                  <>
                    <div className="td-card-t">{t.title}</div>
                    <p className="td-card-n">{t.note}</p>
                    <span className="td-card-s mono">{t.tag}</span>
                  </>
                )
                // The planner is its own route, not a panel on this page. It
                // needs the whole screen, its own print stylesheet and its own
                // URL so a layout can be linked to from a method statement.
                return t.href
                  ? <Link key={t.id} href={t.href} className="td-card">{body}</Link>
                  : <button key={t.id} className="td-card" onClick={() => setTool(t.id)}>{body}</button>
              })}
            </div>
          </div>
        ))}
        <p className="text-secondary" style={{ fontSize: 11.5, marginTop: 26, maxWidth: '70ch' }}>
          Every figure is indicative. Where two standards disagree — and on temperature correction,
          the affinity laws and balance tolerances they do — this page says so rather than picking one
          quietly. The engineer signing the test sheet is the authority.
        </p>
      </div>
    )
  }

  const meta = TOOLS.find((t) => t.id === tool)!

  return (
    <div className="td">
      <style>{STYLES}</style>
      <button className="td-back" onClick={() => setTool(null)}>← All tools</button>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 2px', letterSpacing: '-0.02em' }}>
        {meta.title}
      </h1>
      <p className="text-secondary mono" style={{ fontSize: 11.5, margin: '0 0 4px' }}>{meta.tag}</p>

      {/* ══ LOAD BANK ══ */}
      {tool === 'loadbank' && (<>
        <div className="td-bar">
          <Kpi tone="lead" label="Resistive leg" value={f(size.derated.kW, 0)} unit="kW" note="loads the engine" />
          <Kpi tone="lead" label="Reactive leg" value={f(size.derated.kVAR, 0)} unit="kVAR" note="loads the alternator" />
          <Kpi label="Full-load current" value={f(size.current, 0)} unit="A" note={`breaker ${f(size.breaker, 0)} A`} />
          <Kpi tone={size.resistivePct < 99.5 ? 'warn' : 'good'} label="Resistive only reaches"
            value={f(size.resistivePct, 0)} unit="% of rated current" note={`${f(size.resistiveCurrent, 0)} A`} />
        </div>
        <div className="td-in">
          <F label="Rating"><div style={{ display: 'flex', gap: 6 }}>
            <input {...num(rating, setRating)} />
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as RatingUnit)} style={{ width: 72 }}>
              <option value="kva">kVA</option><option value="kw">kW</option>
            </select></div></F>
          <F label="Power factor" hint="0.8 is the convention"><input {...num(pf, setPf)} step={0.01} /></F>
          <F label="Voltage"><div style={{ display: 'flex', gap: 6 }}>
            <input {...num(volts, setVolts)} />
            <select className="input" value={phase} onChange={(e) => setPhase(Number(e.target.value) as Phase)} style={{ width: 62 }}>
              <option value={3}>3ph</option><option value={1}>1ph</option>
            </select></div></F>
          <F label="Altitude, m"><input {...num(altM, setAltM)} /></F>
          <F label="Ambient, °C"><input {...num(ambC, setAmbC)} /></F>
          <F label="Derate rates" hint="%/100 m · %/5 °C"><div style={{ display: 'flex', gap: 6 }}>
            <input {...num(rAlt, setRAlt)} step={0.1} /><input {...num(rAmb, setRAmb)} step={0.1} /></div></F>
        </div>
        <div className="td-work">
          <h3>The working</h3>
          <div className="td-fml mono">{`kVA  = ${f(size.rated.kVA, 0)}        kW = kVA × PF = ${f(size.rated.kW, 0)}
kVAR = √(kVA² − kW²) = ${f(size.rated.kVAR, 0)}
I    = kVA×1000 ÷ (${phase === 3 ? '√3 × V' : 'V'}) = ${f(size.current, 0)} A
I(resistive) = kW×1000 ÷ (${phase === 3 ? '√3 × V' : 'V'}) = ${f(size.resistiveCurrent, 0)} A${size.derate.total > 0 ? `

derate = max(altitude ${f(size.derate.altitude, 1)} %, ambient ${f(size.derate.ambient, 1)} %) = ${f(size.derate.total, 1)} %` : ''}`}</div>
          {size.resistivePct < 99.5 && (
            <div className="td-note warn"><b>Resistive only</b>
              <p>At {f(size.derated.kW, 0)} kW resistive the machine draws {f(size.resistiveCurrent, 0)} A against a rated {f(size.current, 0)} A.
              The windings, cables and connections never reach service temperature, so a thermal fault stays hidden.
              Record the test as having been done at unity power factor.</p></div>
          )}
          {size.derate.total > 0 && (
            <div className="td-note warn"><b>Derating</b>
              <p><strong>The larger of the two terms is applied, not the sum</strong> — engine and alternator derate
              for different reasons. There is no standard figure; sign off against the manufacturer&rsquo;s table.
              Below {ALT_DATUM_M} m and {AMB_DATUM_C} °C most sets hold full output.</p></div>
          )}
        </div>
      </>)}

      {/* ══ REGIME ══ */}
      {tool === 'regime' && (<>
        <div className="td-bar">
          <Kpi tone="lead" label="Steps" value={String(steps.length)} note={regime.cite} />
          <Kpi label="Total time" value={f(totalMinutes(steps), 0)} unit="min" note={`${f(totalMinutes(steps) / 60, 2)} hours`} />
          <Kpi label="Peak load" value={f(Math.max(...steps.map((s) => s.kW)), 0)} unit="kW" />
        </div>
        <div className="td-in">
          <F label="Test regime"><select className="input" value={regimeId} onChange={(e) => setRegimeId(e.target.value)}>
            {REGIMES.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select></F>
          <F label="Nameplate kW"><input {...num(planKw, setBaseKw)} /></F>
          <F label="Derate"><label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, paddingTop: 6 }}>
            <input type="checkbox" checked={applyDerate} onChange={(e) => setApplyDerate(e.target.checked)} style={{ width: 'auto' }} />
            Apply site derating</label></F>
        </div>
        <div className="td-work">
          <div className="td-note"><p>{regime.before}</p></div>
          <div className="table-wrap"><table className="table td-tbl">
            <thead><tr><th>#</th><th>Step</th><th>Load</th><th>Hold</th><th>Elapsed</th><th>What it is for</th></tr></thead>
            <tbody>{steps.map((s, i) => (
              <tr key={i}><td className="mono">{i + 1}</td><td className="mono">{s.pct} %</td>
                <td className="mono"><strong>{f(s.kW, 0)} kW</strong></td><td className="mono">{s.minutes} min</td>
                <td className="mono">{s.elapsed} min</td><td className="text-secondary">{s.why}</td></tr>))}
            </tbody></table></div>
          {regime.after && <div className="td-note warn" style={{ marginTop: 12 }}><b>Also</b><p>{regime.after}</p></div>}
        </div>
      </>)}

      {/* ══ UPS ══ */}
      {tool === 'ups' && (<>
        <div className="td-bar">
          <Kpi tone="lead" label="Resistive bank" value={f(ups.testKW, 0)} unit="kW" />
          <Kpi tone={ups.needsReactive ? 'warn' : 'good'} label="Reactive leg"
            value={ups.needsReactive ? f(ups.testKVAR, 0) : 'none'} unit={ups.needsReactive ? 'kVAR' : ''}
            note={ups.needsReactive ? 'needed to prove kVA' : 'unity-rated'} />
          <Kpi label="End of discharge" value={f(ups.endVolts, 1)} unit="V" note={`${f(ups.wattsPerCell, 0)} W per cell`} />
          <Kpi tone="bad" label="Abort an IST at" value={f(ups.abortMin, 1)} unit="min" note="60 % of autonomy" />
        </div>
        <div className="td-in">
          <F label="Rating, kVA"><input {...num(uRating, setURating)} /></F>
          <F label="Power factor"><select className="input" value={uPf} onChange={(e) => setUPf(Number(e.target.value))}>
            <option value={1}>1.0 — modern</option><option value={0.9}>0.9</option><option value={0.8}>0.8 — legacy</option></select></F>
          <F label="Test load, %"><input {...num(uLoad, setULoad)} /></F>
          <F label="Cells in series"><input {...num(cells, setCells)} /></F>
          <F label="End V per cell"><input {...num(vpc, setVpc)} step={0.01} /></F>
          <F label="Autonomy, min"><input {...num(autonomy, setAutonomy)} /></F>
          <F label="Inverter eff, %"><input {...num(eff, setEff)} step={0.5} /></F>
        </div>
        <div className="td-work">
          <div className="td-note stop"><b>The battery rule to script</b>
            <p>Do not run the batteries below <strong>60 % of rated autonomy</strong> during an integrated systems test.
            If generator start, synchronise and transfer has not completed by {f(ups.abortMin, 1)} minutes, abort and
            re-evaluate — you are spending the plant&rsquo;s real ride-through to prove a point.</p></div>
          <div className="td-note"><b>Constant power, not constant current</b>
            <p>A UPS string is sized in watts per cell because the inverter draws constant kW while string voltage sags
            and current rises. A constant-current test under-stresses the string exactly at end of discharge.
            Temperature-correct to 25 °C using the temperature at the <em>start</em>, and because this test is under an
            hour use the <strong>rate-adjusted</strong> method, not the time-adjusted one.</p></div>
        </div>
      </>)}

      {/* ══ INSULATION RESISTANCE ══ */}
      {tool === 'ir' && (<>
        <div className="td-bar">
          <Kpi tone={ir.passes ? 'good' : 'bad'} label="Corrected to 40 °C" value={f(ir.corrected, 0)} unit="MΩ"
            note={`minimum ${f(ir.minimum, 1)} MΩ`} />
          <Kpi label="Correction factor" value={f(ir.factor, 3)} note={irMethod === 'ieee' ? 'IEEE halving rule' : 'IEC 60034-27-4'} />
          <Kpi tone={ir.piMeaningful ? undefined : 'warn'} label="Polarisation index"
            value={ir.pi ? f(ir.pi, 2) : '—'} note={ir.piMeaningful ? 'meaningful' : 'not meaningful above 5000 MΩ'} />
          <Kpi label="DAR" value={ir.dar ? f(ir.dar, 2) : '—'} note="60 s ÷ 30 s" />
        </div>
        <div className="td-in">
          <F label="Winding type"><select className="input" value={vintage} onChange={(e) => setVintage(e.target.value as WindingVintage)}>
            {VINTAGES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></F>
          <F label="Rated kV" hint="line to line"><input {...num(ratedKV, setRatedKV)} step={0.1} /></F>
          <F label="IR at 1 min, MΩ"><input {...num(ir1, setIr1)} /></F>
          <F label="IR at 10 min, MΩ"><input {...num(ir10, setIr10)} /></F>
          <F label="Winding °C"><input {...num(windT, setWindT)} /></F>
          <F label="Correction"><select className="input" value={irMethod} onChange={(e) => setIrMethod(e.target.value as CorrectionMethod)}>
            <option value="ieee">IEEE 43 — halve per 10 °C</option>
            <option value="iec-thermoset">IEC 60034-27-4 — none, 10–40 °C</option></select></F>
          <F label="30 s, MΩ" hint="for DAR"><input {...num(ir30s, setIr30s)} /></F>
          <F label="60 s, MΩ"><input {...num(ir60s, setIr60s)} /></F>
        </div>
        <div className="td-work">
          <h3>The working</h3>
          <div className="td-fml mono">{`minimum  = ${VINTAGES.find((v) => v.id === vintage)!.note}  →  ${f(ir.minimum, 1)} MΩ
K        = ${irMethod === 'ieee' ? `2^((${windT} − 40)/10)` : 'IEC: 1 within 10–40 °C'} = ${f(ir.factor, 4)}
R₄₀      = ${f(ir1, 0)} × ${f(ir.factor, 4)} = ${f(ir.corrected, 1)} MΩ
verdict  = ${ir.passes ? 'above minimum' : 'BELOW MINIMUM'}`}</div>
          <div className="td-note stop"><b>The commonest misuse in the industry</b>
            <p>&ldquo;One megohm per kV plus one&rdquo; is <strong>not</strong> the general rule — it is the pre-1970 and
            field-winding row only. Applied to a modern form-wound 6.6 kV stator it gives 7.6 MΩ where IEEE 43 wants
            100 MΩ, so a machine thirteen times worse than the limit would pass.</p></div>
          <div className="td-note warn"><b>Two live standards disagree here</b>
            <p>IEEE 43 halves insulation resistance for every 10 °C rise. <strong>IEC 60034-27-4 applies no correction at
            all</strong> between 10 and 40 °C for modern synthetic-resin systems. They give different answers on the same
            winding, and the halving rule comes from old asphaltic insulation, so on epoxy-mica it can over-correct badly.
            Pick the one that matches the insulation, and record which you used.</p>
            {ir.wideCorrection && <p><strong>Your reading is more than 20 °C from the 40 °C reference</strong>, which is
            exactly where the two diverge most. Measure closer to 40 °C if you can.</p>}</div>
          {!ir.piMeaningful && <div className="td-note warn"><b>PI is not meaningful here</b>
            <p>IEEE 43 says that above 5000 MΩ at one minute the calculated PI may be disregarded. At gigohm level the
            leakage current is in nanoamps and instrument noise dominates the ratio. Judge on the absolute resistance.</p></div>}
          {ir.piSuspiciouslyHigh && <div className="td-note warn"><b>A very high PI is not necessarily good news</b>
            <p>A PI above about 7 on old asphaltic or varnished-cambric windings can indicate thermal ageing and
            brittleness rather than health.</p></div>}
          <h3>Cables and installations — IEC 60364-6</h3>
          <div className="table-wrap"><table className="table td-tbl">
            <thead><tr><th>Circuit</th><th>Test voltage</th><th>Minimum</th></tr></thead>
            <tbody>{IEC60364_IR.map((r) => (
              <tr key={r.band}><td>{r.band}</td><td className="mono">{r.testV} V</td><td className="mono">{r.minMohm} MΩ</td></tr>))}
            </tbody></table></div>
          <p className="td-src">{IEEE43_EDITION} · IEC 60364-6:2016 Table 6.1 · IEC 60034-27-4:2018</p>
        </div>
      </>)}

      {/* ══ EARTH ══ */}
      {tool === 'earth' && (<>
        <div className="td-bar">
          <Kpi tone="lead" label="Soil resistivity" value={f(soil.simpleValid ? soil.simple : soil.full, 1)} unit="Ω·m"
            note={soil.simpleValid ? 'ρ = 2πaR' : 'full form — pins too deep'} />
          <Kpi label="Depth sampled" value={f(soil.approxDepthM, 1)} unit="m" note="about the pin spacing" />
          <Kpi label="Probe goes at" value={f(fop.probeAtM, 0)} unit="m" note="61.8 % of the lead" />
          <Kpi tone={fop.longEnough ? (fop.marginal ? 'warn' : 'good') : 'bad'} label="Current lead"
            value={fop.longEnough ? (fop.marginal ? 'marginal' : 'good') : 'too short'}
            note={`needs ${f(fop.minimumLeadM, 0)}–${f(fop.comfortableLeadM, 0)} m`} />
        </div>
        <div className="td-in">
          <F label="Pin spacing, m"><input {...num(spacing, setSpacing)} step={0.5} /></F>
          <F label="Pin depth, m"><input {...num(pinDepth, setPinDepth)} step={0.1} /></F>
          <F label="Measured Ω"><input {...num(soilR, setSoilR)} step={0.1} /></F>
          <F label="Current lead, m"><input {...num(leadM, setLeadM)} /></F>
          <F label="Grid diagonal, m"><input {...num(diagM, setDiagM)} /></F>
        </div>
        <div className="td-work">
          <div className="td-fml mono">{`ρ (simplified) = 2πaR = 2π × ${f(spacing, 1)} × ${f(soilR, 2)} = ${f(soil.simple, 1)} Ω·m
ρ (full form)  = ${f(soil.full, 1)} Ω·m
  simplified is valid when pin depth ≤ 0.1 × spacing  →  ${soil.simpleValid ? 'valid' : 'NOT valid here'}

probe at 0.618 × ${f(leadM, 0)} = ${f(fop.probeAtM, 0)} m`}</div>
          {!fop.longEnough && <div className="td-note stop"><b>This reading will be wrong</b>
            <p>A {f(diagM, 0)} m grid diagonal needs a current lead of at least {f(fop.minimumLeadM, 0)} m — ideally
            {' '}{f(fop.comfortableLeadM, 0)} m — for the 61.8 % point to land in the true resistance plateau. A short lead
            gives a confident, repeatable and completely wrong answer. This is the single biggest source of bogus
            substation earth readings.</p></div>}
          <div className="td-note warn"><b>There is no maximum earth resistance</b>
            <p>IEEE 80 sets none. Compliance is <strong>touch and step potential</strong>, not a resistance number — a
            substation passing at 4 Ω can still fail the gradient calculation while one at 8 Ω passes. The figures below
            are design targets from three different documents.</p></div>
          <div className="table-wrap"><table className="table td-tbl">
            <thead><tr><th>Application</th><th>Target</th><th>Where it comes from</th></tr></thead>
            <tbody>{EARTH_TARGETS.map((t) => (
              <tr key={t.label}><td>{t.label}</td><td className="mono">{t.range}</td>
                <td className="text-secondary">{t.source}</td></tr>))}</tbody></table></div>
          <p className="td-src">IEEE 81-2012 Annex C · IEEE 80 · IEEE 142 · NEC 250.53(A)(2)</p>
        </div>
      </>)}

      {/* ══ VOLT DROP ══ */}
      {tool === 'vd' && (<>
        <div className="td-bar">
          <Kpi tone="lead" label="Volt drop" value={f(vd.volts, 2)} unit="V" />
          <Kpi tone={vd.percent <= guide.lighting ? 'good' : vd.percent <= guide.other ? 'warn' : 'bad'}
            label="As a percentage" value={f(vd.percent, 2)} unit="%"
            note={`guidance ${guide.lighting} % lighting · ${guide.other} % other`} />
          <Kpi label="Conductor R" value={f(vd.resistancePerKm, 3)} unit="Ω/km" note={`${vdMat} at operating temp`} />
        </div>
        <div className="td-in">
          <F label="Current, A"><input {...num(vdI, setVdI)} /></F>
          <F label="Length, m" hint="one way"><input {...num(vdL, setVdL)} /></F>
          <F label="CSA, mm²"><input {...num(vdCsa, setVdCsa)} /></F>
          <F label="Material"><select className="input" value={vdMat} onChange={(e) => setVdMat(e.target.value as 'copper' | 'aluminium')}>
            <option value="copper">Copper</option><option value="aluminium">Aluminium</option></select></F>
          <F label="Voltage"><div style={{ display: 'flex', gap: 6 }}>
            <input {...num(vdV, setVdV)} />
            <select className="input" value={vdPh} onChange={(e) => setVdPh(Number(e.target.value) as 1 | 3)} style={{ width: 62 }}>
              <option value={3}>3ph</option><option value={1}>1ph</option></select></div></F>
          <F label="Power factor"><input {...num(vdPf, setVdPf)} step={0.01} /></F>
          <F label="Reactance, Ω/km"><input {...num(vdX, setVdX)} step={0.01} /></F>
          <F label="Guidance"><select className="input" value={vdGuide} onChange={(e) => setVdGuide(e.target.value)}>
            {VD_GUIDANCE.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select></F>
        </div>
        <div className="td-work">
          <div className="td-fml mono">{`ΔU = ${vdPh === 3 ? '√3' : '2'} × I × (R cos φ + X sin φ) × L

   R = ${vdMat === 'copper' ? '23.7' : '37.6'} ÷ ${f(vdCsa, 0)} = ${f(vd.resistancePerKm, 4)} Ω/km
   ΔU = ${vdPh === 3 ? '√3' : '2'} × ${f(vdI, 0)} × (${f(vd.resistancePerKm, 4)}×${vdPf} + ${vdX}×${f(Math.sqrt(1 - vdPf * vdPf), 4)}) × ${f(vdL / 1000, 3)} km
      = ${f(vd.volts, 3)} V  =  ${f(vd.percent, 3)} %`}</div>
          <div className="td-note warn"><b>These are guidance, not limits</b>
            <p>IEC 60364-5-52 Annex G is <strong>informative</strong>. The NEC 3 % and 5 % are Informational Notes, and
            NEC 90.5(C) says informational notes are not enforceable. Both are steady-state figures — motor starting and
            other transients are excluded, and a greater drop is acceptable then provided the equipment standard is met.</p>
            <p>The ×2 on single-phase and ×√3 on three-phase are the go-and-return and line-voltage factors. Both use the
            <strong> one-way</strong> length; counting the return twice is the classic error in this calculation.</p></div>
          <p className="td-src">IEC 60364-5-52 ed 3.1 Annex G · NEC 210.19(A), 215.2(A) informational notes</p>
        </div>
      </>)}

      {/* ══ CT ══ */}
      {tool === 'ct' && (<>
        <div className="td-bar">
          <Kpi tone={ct.overBurdened ? 'bad' : 'good'} label="Connected burden" value={f(ct.actualOhm, 3)} unit="Ω"
            note={`rated ${f(ct.ratedOhm, 3)} Ω · ${f(ct.burdenUsedPct, 0)} % used`} />
          <Kpi tone={ct.effectiveAlf < ctAlf ? 'warn' : 'good'} label="Effective ALF" value={f(ct.effectiveAlf, 1)}
            note={`nameplate ${ctAlf}`} />
          <Kpi label="Leads" value={f(ct.leadOhm, 3)} unit="Ω" note={`${f(ct.actualVA, 1)} VA total`} />
          <Kpi label="Secondary limiting emf" value={f(ct.secondaryLimitingEmf, 0)} unit="V" />
        </div>
        <div className="td-in">
          <F label="Secondary, A"><select className="input" value={ctIs} onChange={(e) => setCtIs(Number(e.target.value))}>
            <option value={5}>5 A</option><option value={1}>1 A</option></select></F>
          <F label="Rated VA"><input {...num(ctVA, setCtVA)} step={0.5} /></F>
          <F label="Rct, Ω"><input {...num(ctRct, setCtRct)} step={0.05} /></F>
          <F label="Lead, m" hint="one way"><input {...num(ctLen, setCtLen)} /></F>
          <F label="Lead CSA, mm²"><input {...num(ctCsa, setCtCsa)} step={0.5} /></F>
          <F label="Relay VA"><input {...num(ctRelay, setCtRelay)} step={0.1} /></F>
          <F label="ALF" hint="the 10 in 5P10"><input {...num(ctAlf, setCtAlf)} /></F>
          <F label="Paralleled"><select className="input" value={ctConn} onChange={(e) => setCtConn(e.target.value as 'single' | 'star' | 'delta')}>
            <option value="single">Single / residual</option><option value="star">Star, shared neutral</option>
            <option value="delta">Delta</option></select></F>
        </div>
        <div className="td-work">
          <div className="td-fml mono">{`Z(rated) = VA ÷ Is² = ${f(ctVA, 1)} ÷ ${ctIs}² = ${f(ct.ratedOhm, 4)} Ω
Z(relay) = ${f(ctRelay, 1)} ÷ ${ctIs}² = ${f(ct.relayOhm, 4)} Ω
R(leads) = ${ctConn === 'delta' ? '2√3' : '2'} × 0.0216 × ${f(ctLen, 0)} ÷ ${f(ctCsa, 1)} = ${f(ct.leadOhm, 4)} Ω
Z(actual)= ${f(ct.actualOhm, 4)} Ω

ALF(eff) = ALF × (Rct + Rb) ÷ (Rct + Zactual)
         = ${ctAlf} × ${f(ctRct + ct.ratedOhm, 3)} ÷ ${f(ctRct + ct.actualOhm, 3)} = ${f(ct.effectiveAlf, 2)}`}</div>
          {ct.overBurdened && <div className="td-note stop"><b>Over-burdened</b>
            <p>The connected burden exceeds the CT rating, so the effective accuracy limit factor has collapsed from
            {' '}{ctAlf} to {f(ct.effectiveAlf, 1)}. The CT will saturate earlier than the nameplate suggests and the
            protection will under-reach.</p></div>}
          <div className="td-note"><b>The one-amp lever</b>
            <p>Burden scales with the <strong>square</strong> of secondary current, so a 1 A CT tolerates twenty-five times
            the lead resistance of a 5 A one for the same VA. On long substation or data centre runs, 1 A secondaries are
            usually the right answer. Try switching the secondary above and watch the burden.</p></div>
          <div className="td-note warn"><b>Where the CTs are paralleled changes the lead factor</b>
            <p>A single CT or a residual connection sees go-and-return, so twice the one-way run. A star group with a
            shared neutral carries no return on a balanced three-phase fault but the full return on an earth fault — so the
            worst case is still twice. Delta secondaries add √3. This is an input rather than a baked-in assumption
            because references genuinely differ.</p></div>
          <p className="td-src">IEC 61869-2:2012 · copper taken hot at 75 °C</p>
        </div>
      </>)}

      {/* ══ HARMONICS ══ */}
      {tool === 'harmonics' && (<>
        <div className="td-bar">
          <Kpi tone="lead" label="Voltage THD limit" value={f(vLimit.thd, 1)} unit="%" note={vLimit.band} />
          <Kpi label="Individual harmonic" value={f(vLimit.individual, 1)} unit="%" />
          <Kpi tone="lead" label="TDD limit" value={tdd ? f(tdd.row.tdd, 1) : '—'} unit={tdd ? '%' : ''}
            note={tdd ? `Isc/IL = ${f(tdd.ratio, 0)} — the "${tdd.row.label}" row` : 'above 69 kV — not implemented'} />
        </div>
        <div className="td-in">
          <F label="Bus voltage, kV"><input {...num(busKV, setBusKV)} step={0.1} /></F>
          <F label="Isc, A" hint="short circuit at the PCC"><input {...num(isc, setIsc)} /></F>
          <F label="IL, A" hint="max demand load current"><input {...num(il, setIl)} /></F>
        </div>
        <div className="td-work">
          <h3>Voltage distortion — Table 1</h3>
          <div className="table-wrap"><table className="table td-tbl">
            <thead><tr><th>Bus voltage</th><th>Individual</th><th>THD</th></tr></thead>
            <tbody>{VOLTAGE_LIMITS.map((b) => (
              <tr key={b.band} className={b === vLimit ? 'td-hit' : ''}>
                <td>{b.band}</td><td className="mono">{b.individual} %</td><td className="mono">{b.thd} %</td></tr>))}
            </tbody></table></div>
          {tdd ? (<>
            <h3>Current distortion — Table 2, as a percentage of I<sub>L</sub></h3>
            <div className="td-fml mono">{`Isc ÷ IL = ${f(isc, 0)} ÷ ${f(il, 0)} = ${f(tdd.ratio, 1)}   →   the "${tdd.row.label}" row

3 ≤ h < 11   ${f(tdd.row.h3_11, 1)} %
11 ≤ h < 17  ${f(tdd.row.h11_17, 1)} %
17 ≤ h < 23  ${f(tdd.row.h17_23, 1)} %
23 ≤ h < 35  ${f(tdd.row.h23_35, 1)} %
35 ≤ h ≤ 50  ${f(tdd.row.h35_50, 1)} %
TDD          ${f(tdd.row.tdd, 1)} %`}</div>
          </>) : (
            <div className="td-note warn"><b>Above 69 kV is not implemented</b>
              <p>Tables 3 and 4 use different Isc/IL breakpoints and cannot be derived by scaling Table 2. They could not
              be verified from an open source, so this returns nothing rather than guessing. For a data centre the point
              of common coupling is almost always at or below 69 kV.</p></div>
          )}
          <div className="td-note stop"><b>A single reading is not a failure</b>
            <p>IEEE 519 compliance is a <strong>percentile over a measurement window</strong>, never a spot reading.
            A calculator that stamps FAIL on one instrument snapshot generates false non-compliances — which is how a
            real one stops being believed.</p></div>
          <div className="table-wrap"><table className="table td-tbl">
            <thead><tr><th>Assessment window</th><th>Allowed multiple of the table limit</th></tr></thead>
            <tbody>{IEEE519_WINDOWS.map((w) => (
              <tr key={w.label}><td>{w.label}</td><td className="mono">{w.multiple.toFixed(1)} ×</td></tr>))}</tbody></table></div>
          <div className="td-note"><b>TDD is not THD</b>
            <p>Total demand distortion is a percentage of the <strong>maximum demand current</strong>, not of the measured
            fundamental. That is why a lightly loaded drive can show 80 % THD in current and still pass comfortably.</p></div>
          <p className="td-src">{IEEE519_EDITION}. Even-harmonic treatment changed materially from the 2014 edition.</p>
        </div>
      </>)}

      {/* ══ WHITE SPACE ══ */}
      {tool === 'whitespace' && (<>
        <div className="td-bar">
          <Kpi tone="lead" label="IT load" value={f(ws.itKw, 0)} unit="kW" note={`${racks} racks at ${f(kwRack, 1)} kW`} />
          <Kpi tone="lead" label="Airflow needed" value={f(ws.requiredLps, 0)} unit="L/s"
            note={`${f(ws.requiredCfm, 0)} CFM · ${f(ws.perRackLps, 0)} L/s per rack`} />
          <Kpi tone={ws.ccf < 1.15 ? 'bad' : ws.ccf <= 1.4 ? 'good' : 'warn'} label="Cooling capacity factor"
            value={f(ws.ccf, 2)} note="target 1.2" />
          <Kpi tone={ws.starved ? 'bad' : ws.provisioning <= 1.2 ? 'good' : 'warn'} label="Provisioning"
            value={f(ws.provisioning, 2)} note={ws.starved ? 'starved — recirculation guaranteed' : `${f(ws.bypassPct, 0)} % bypass`} />
        </div>
        <div className="td-in">
          <F label="Racks"><input {...num(racks, setRacks)} /></F>
          <F label="kW per rack"><input {...num(kwRack, setKwRack)} step={0.5} /></F>
          <F label="IT ΔT, K"><input {...num(itDt, setItDt)} step={0.5} /></F>
          <F label="Cooling capacity, kW" hint="running, rated"><input {...num(coolKw, setCoolKw)} /></F>
          <F label="Air supplied, L/s"><input {...num(suppLps, setSuppLps)} /></F>
        </div>
        <div className="td-work">
          <div className="td-fml mono">{`IT load     = ${racks} × ${f(kwRack, 1)} = ${f(ws.itKw, 0)} kW
required    = 827.8 × kW ÷ ΔT = 827.8 × ${f(ws.itKw, 0)} ÷ ${f(itDt, 1)} = ${f(ws.requiredLps, 0)} L/s
per rack    = ${f(ws.perRackLps, 0)} L/s  (${f(ws.perRackCfm, 0)} CFM)
CCF         = capacity ÷ (1.10 × IT) = ${f(coolKw, 0)} ÷ ${f(1.1 * ws.itKw, 0)} = ${f(ws.ccf, 2)}
provisioning= supplied ÷ required = ${f(suppLps, 0)} ÷ ${f(ws.requiredLps, 0)} = ${f(ws.provisioning, 2)}`}</div>
          {ws.ccf > 1.5 && <div className="td-note warn"><b>Stranded capacity</b>
            <p>A CCF of {f(ws.ccf, 2)} means roughly {f(ws.ccf / 1.2, 1)} times more cooling than the target. Across 45
            assessed sites the average was 3.9 — most rooms run about four times the cooling they need. That is not
            safety margin, it is capacity you have paid for and cannot sell.</p></div>}
          {ws.starved && <div className="td-note stop"><b>Under-supplied</b>
            <p>Supplying less air than the equipment draws guarantees recirculation: the shortfall is made up from the
            hot aisle. Expect high inlet temperatures at the top of racks and at row ends.</p></div>}
          <div className="td-note"><b>The 1.10 in the CCF</b>
            <p>It covers the non-IT heat — lighting, envelope, people. The factor uses <em>nameplate</em> capacity, which
            at raised supply-air temperatures understates what the units actually deliver, so treat CCF as a screen
            rather than a measurement.</p></div>
        </div>
      </>)}

      {/* ══ CONTAINMENT ══ */}
      {tool === 'containment' && (<>
        <div className="td-bar">
          <Kpi tone={rciVerdict(rci.hi) === 'good' ? 'good' : rciVerdict(rci.hi) === 'acceptable' ? 'warn' : 'bad'}
            label="RCI high" value={f(rci.hi, 1)} unit="%" note={`${rci.n} readings · worst ${f(rci.worstHigh ?? 0, 1)} °C`} />
          <Kpi tone={rciVerdict(rci.lo) === 'good' ? 'good' : rciVerdict(rci.lo) === 'acceptable' ? 'warn' : 'bad'}
            label="RCI low" value={f(rci.lo, 1)} unit="%" note={`coldest ${f(rci.worstLow ?? 0, 1)} °C`} />
          <Kpi tone={rti.condition === 'balanced' ? 'good' : 'warn'} label="RTI" value={f(rti.rti, 1)} unit="%"
            note={rti.condition} />
        </div>
        <div className="td-in">
          <F label="Rack inlet temps, °C" hint="comma separated">
            <input type="text" className="input mono" value={tempsRaw} onChange={(e) => setTempsRaw(e.target.value)} /></F>
          <F label="ASHRAE class"><select className="input" value={cls} onChange={(e) => setCls(e.target.value)}>
            {Object.entries(ASHRAE).map(([k, v]) => <option key={k} value={k}>{k} — {v[0]} to {v[1]} °C</option>)}</select></F>
          <F label="Air handler ΔT, K"><input {...num(ahuDt, setAhuDt)} step={0.5} /></F>
          <F label="IT equipment ΔT, K"><input {...num(itDt2, setItDt2)} step={0.5} /></F>
        </div>
        <div className="td-work">
          <div className="td-fml mono">{`RCI_HI = [1 − Σ(Tᵢ − 27)⁺ ÷ (n × (${band[1]} − 27))] × 100 = ${f(rci.hi, 1)} %
RCI_LO = [1 − Σ(18 − Tᵢ)⁺ ÷ (n × (18 − ${band[0]}))] × 100 = ${f(rci.lo, 1)} %
   recommended 18–27 °C for every class; allowable ${band[0]}–${band[1]} °C for ${cls}

RTI    = handler ΔT ÷ IT ΔT × 100 = ${f(ahuDt, 1)} ÷ ${f(itDt2, 1)} × 100 = ${f(rti.rti, 1)} %`}</div>
          <div className="td-note"><b>Reading RTI the right way round</b>
            <p><strong>Under 100 % is bypass</strong> — supply air short-circuits to the return without passing a server,
            so the handler sees a smaller rise than the kit does. <strong>Over 100 % is recirculation</strong> — hot
            exhaust is re-entrained at the inlets. A widely mirrored source prints this ratio upside down, which flips
            the two diagnoses entirely.</p></div>
          <div className="td-note warn"><b>Only one side counts</b>
            <p>Readings above the recommended maximum enter the HI sum; those below the minimum enter the LO sum. They
            are two separate indices on purpose — a cold rack must not be allowed to cancel out a hot one, which is what
            happens when the one-sided clamp is dropped.</p>
            <p>The reference band must match the declared class. An RCI computed against A1 limits in an {cls} room means
            nothing, which is why the class is an input.</p></div>
          <div className="td-note stop"><b>The limit that usually fails</b>
            <p>Not the absolute temperature — the rate of change. ASHRAE allows <strong>20 °C in an hour and no more than
            5 °C in any 15 minutes</strong>. Log inlet temperatures at one-minute intervals through every transition so
            you can prove the rate as well as the peak.</p></div>
          <p className="td-src">ASHRAE TC 9.9 Thermal Guidelines 5th ed. · RCI after Herrlin · RTI per LBNL</p>
        </div>
      </>)}

      {/* ══ HEAT ══ */}
      {tool === 'heat' && (<>
        <div className="td-bar">
          <Kpi tone="lead" label="Airflow, metric" value={f(heat.m3s, 2)} unit="m³/s" note={`${f(heat.m3h, 0)} m³/h`} />
          <Kpi tone="lead" label="Airflow, imperial" value={f(heat.cfm, 0)} unit="CFM" note={`${f(heat.cfmPerKw, 0)} CFM per kW`} />
          <Kpi label="Heat rejected" value={f(heat.btuPerHr, 0)} unit="BTU/hr" note={`${f(heat.tons, 1)} tons`} />
          <Kpi tone={verdict === 'recommended' ? 'good' : verdict === 'allowable' ? 'warn' : 'bad'}
            label="Inlet" value={f(inlet, 1)} unit="°C" note={verdict === 'outside' ? `outside ${hBand[0]}–${hBand[1]}` : verdict} />
        </div>
        <div className="td-in">
          <F label="Load, kW"><input {...num(hKw, setHKw)} /></F>
          <F label="ΔT, °C"><input {...num(hDt, setHDt)} step={0.5} /></F>
          <F label="Altitude, m"><input {...num(hAlt, setHAlt)} /></F>
          <F label="Inlet, °C"><input {...num(inlet, setInlet)} /></F>
          <F label="ASHRAE class"><select className="input" value={hCls} onChange={(e) => setHCls(e.target.value)}>
            {Object.entries(ASHRAE).map(([k, v]) => <option key={k} value={k}>{k} — {v[0]} to {v[1]} °C</option>)}</select></F>
        </div>
        <div className="td-work">
          <div className="td-fml mono">{`1 kW  = 3412.142 BTU/hr        1 ton = 3.516853 kW
m³/s  = kW × 0.8278 ÷ ΔT(°C)${hAlt > 0 ? ` ÷ density ${f(heat.densityRatio, 3)}` : ''} = ${f(heat.m3s, 3)}
CFM   = kW × 3159.4 ÷ ΔT(°F)${hAlt > 0 ? ` ÷ density ${f(heat.densityRatio, 3)}` : ''} = ${f(heat.cfm, 0)}
air path: ${f(inlet, 1)} °C in → ${f(inlet + heat.deltaC, 1)} °C out`}</div>
          {hAlt > 0 && <div className="td-note warn"><b>Altitude correction applied</b>
            <p>At {f(hAlt, 0)} m the air is {f(heat.densityRatio * 100, 1)} % as dense as at sea level, so you need{' '}
            <strong>{f((1 / heat.densityRatio - 1) * 100, 1)} % more volume</strong> to move the same heat. The 1.08 and
            1.208 constants assume sea level — most airflow calculators miss this.</p></div>}
          <div className="td-note warn"><b>The commonest error in this calculation</b>
            <p>For an IT or load bank load, heat rejected equals power in — 1 kW electrical is 1 kW thermal. A
            chiller&rsquo;s <em>tons</em> is its <strong>thermal capacity</strong>, not its electrical draw. Never convert
            a chiller&rsquo;s input kW into tons.</p></div>
          <div className="td-note"><b>A cross-check worth doing on site</b>
            <p>Measured ΔT × measured airflow should reconcile to the applied kW. A significant mismatch means bypass air,
            not a failing cooling unit — and that reconciliation is the most valuable number a commissioning engineer can
            produce during a cooling test.</p></div>
        </div>
      </>)}

      {/* ══ CHILLED WATER ══ */}
      {tool === 'chw' && (<>
        <div className="td-bar">
          <Kpi tone="lead" label="Flow" value={f(chw.lps, 2)} unit="L/s" note={`${f(chw.m3h, 1)} m³/h`} />
          <Kpi tone="lead" label="Flow, imperial" value={f(chw.gpm, 1)} unit="GPM" note={`${f(chw.gpmPerTon, 2)} GPM per ton`} />
          <Kpi label="Load" value={f(chw.tons, 1)} unit="tons" note={`${f(chwKw, 0)} kW`} />
        </div>
        <div className="td-in">
          <F label="Load, kW"><input {...num(chwKw, setChwKw)} /></F>
          <F label="ΔT, K"><input {...num(chwDt, setChwDt)} step={0.5} /></F>
        </div>
        <div className="td-work">
          <div className="td-fml mono">{`L/s = kW ÷ (4.19 × ΔT) = ${f(chwKw, 0)} ÷ (4.19 × ${f(chwDt, 1)}) = ${f(chw.lps, 3)}
      4.19 = ρ × cp for water — 997 kg/m³ × 4.187 kJ/kg·K

GPM = 24 × tons ÷ ΔT(°F) = 24 × ${f(chw.tons, 1)} ÷ ${f(chwDt * 9 / 5, 1)} = ${f(chw.gpm, 1)}
      the 500 constant = 8.34 lb/gal × 60 min/hr × 1.0 BTU/lb·°F`}</div>
          <div className="td-note"><b>Raising the chilled water temperature</b>
            <p>Doubling ΔT halves the flow, which is the whole argument. Traditional practice was 7–10 °C supply with a
            5–6 K rise; modern data centre practice is 18–20 °C supply with about a 10 K rise, cited at roughly 40 % of
            cooling operating cost and several degrees more free-cooling ambient.</p></div>
          <div className="td-note stop"><b>Not valid for glycol</b>
            <p>Specific heat falls and density rises, so a 25–40 % mix needs roughly 5–15 % more flow, and more pressure
            drop again. Take cp and ρ from the manufacturer&rsquo;s fluid tables rather than applying a guessed correction
            factor to these numbers.</p></div>
          <div className="td-note warn"><b>Pressure drop follows the square of flow</b>
            <p>Double the flow, four times the drop. True for fully developed turbulent flow, which is most of a chilled
            water circuit — but it breaks down through filters and strainers, at low flow, and in open systems where the
            static lift does not scale at all.</p></div>
        </div>
      </>)}

      {/* ══ AFFINITY ══ */}
      {tool === 'affinity' && (<>
        <div className="td-bar">
          <Kpi tone="lead" label="Flow" value={f(aff.flow * 100, 1)} unit="%" />
          <Kpi tone="lead" label="Head or pressure" value={f(aff.head * 100, 1)} unit="%" />
          <Kpi tone="lead" label="Shaft power" value={f(aff.power * 100, 1)} unit="%"
            note={`saves ${f((1 - aff.power) * 100, 0)} %`} />
          {hStatic > 0 && <Kpi tone="warn" label="Stalls below" value={f(minSpeed, 0)} unit="rpm" note="static head floor" />}
        </div>
        <div className="td-in">
          <F label="What is changing"><select className="input" value={affMode} onChange={(e) => setAffMode(e.target.value as AffinityMode)}>
            {AFFINITY_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></F>
          <F label="Speed, % of rated"><input {...num(nPct, setNPct)} /></F>
          <F label="Diameter, % of original"><input {...num(dPct, setDPct)} /></F>
          <F label="Rated rpm"><input {...num(rpm, setRpm)} /></F>
          <F label="Static head, m"><input {...num(hStatic, setHStatic)} /></F>
          <F label="Head at BEP, m"><input {...num(hBep, setHBep)} /></F>
        </div>
        <div className="td-work">
          <div className="td-fml mono">{`${AFFINITY_MODES.find((m) => m.id === affMode)!.note}

flow  ${f(aff.flow * 100, 1)} %      head  ${f(aff.head * 100, 1)} %      power ${f(aff.power * 100, 1)} %`}</div>
          <div className="td-note stop"><b>There are two different diameter laws</b>
            <p>Trimming an impeller inside its existing casing gives Q∝D and P∝D³. Scaling to a genuinely different
            machine gives Q∝ND³ and P∝N³D⁵. They disagree on flow and power — at 80 % diameter that is 80 % flow against
            51 %. Both are correct in their own domain, which is why this is a choice rather than a constant.</p></div>
          {dPct !== 100 && <div className="td-note warn"><b>Trim accuracy at {f(100 - dPct, 0)} %</b>
            <p><strong>{trimAccuracy(100 - dPct).band}.</strong> {trimAccuracy(100 - dPct).note}</p></div>}
          {hStatic > 0 && <div className="td-note warn"><b>Static head is where the laws stop working</b>
            <p>With {f(hStatic, 0)} m of static head against {f(hBep, 0)} m at best efficiency, below about{' '}
            <strong>{f(minSpeed, 0)} rpm</strong> the pump curve falls entirely under the system curve and you get no flow
            at all. In a friction-dominated closed loop — most chilled water systems — this floor is near zero.</p></div>}
          <div className="td-note"><b>The cube law is shaft power, not wire power</b>
            <p>Motor and drive efficiency both fall at low load, and below roughly 25–30 % speed overall efficiency
            degrades noticeably. Real savings are always less than the cube suggests.</p></div>
        </div>
      </>)}

      {/* ══ REFERENCE ══ */}
      {tool === 'ref' && (
        <div className="td-work">
          <h3>Air balance tolerances</h3>
          <p className="td-p">The &ldquo;plus or minus ten per cent&rdquo; everybody half-remembers is NEBB&rsquo;s. AABC
          is tighter and asymmetric, and data centre specifications routinely tighten further again. So the governing
          standard is a choice on the job, not a constant.</p>
          <div className="table-wrap"><table className="table td-tbl">
            <thead><tr><th>Standard</th><th>Item</th><th>Tolerance</th></tr></thead>
            <tbody>{BALANCE_TOLERANCES.map((t, i) => (
              <tr key={i}><td className="mono">{t.standard}</td><td>{t.item}</td>
                <td className="mono">{t.tolerance}</td></tr>))}</tbody></table></div>

          <h3>Where the standards genuinely disagree</h3>
          <p className="td-p">These are not this page being vague. They are live conflicts between current documents, and
          a tool that resolves them quietly on your behalf is making an engineering decision you did not see.</p>
          <ul style={{ fontSize: 13, lineHeight: 1.65, maxWidth: '72ch', paddingLeft: 20 }}>
            <li><strong>Insulation resistance temperature correction.</strong> IEEE 43 halves per 10 °C; IEC 60034-27-4
              applies none at all between 10 and 40 °C for thermoset systems.</li>
            <li><strong>The affinity laws.</strong> Trimming an impeller and scaling a machine are different laws with
              different exponents for flow and power.</li>
            <li><strong>Balance tolerances.</strong> NEBB and AABC differ materially, and AABC is asymmetric.</li>
            <li><strong>Load bank clearances.</strong> Crestchic asks 2 m on the discharge, Avtron 5 m. The planner uses
              the conservative figure.</li>
            <li><strong>Derating.</strong> Published rules of thumb vary by a factor of two to three, and manufacturers
              publish a grid rather than a linear rule.</li>
          </ul>

          <h3>Where there is no limit at all</h3>
          <ul style={{ fontSize: 13, lineHeight: 1.65, maxWidth: '72ch', paddingLeft: 20 }}>
            <li><strong>Earth resistance.</strong> IEEE 80 sets no maximum. Compliance is touch and step potential.</li>
            <li><strong>Volt drop.</strong> IEC Annex G is informative; the NEC figures are Informational Notes and
              NEC 90.5(C) says those are not enforceable.</li>
            <li><strong>Harmonics from one reading.</strong> IEEE 519 compliance is a percentile over a measurement
              window, never a spot value.</li>
            <li><strong>Bolt torque.</strong> Always manufacturer-first. And NFPA 70B caps a <em>verification</em> torque
              at 90 % of the installation figure — re-checking at 100 % progressively over-stresses aluminium joints.</li>
          </ul>

          <h3>What this page will not do</h3>
          <p className="td-p">The calculators on this page do not size cables. They give the design current and the
          125 % continuous figure and stop there, because cable selection depends on installation method, grouping,
          ambient, run length and the standard you work to — and a calculator that guesses at those produces a number
          somebody might install.</p>
          <p className="td-p">The <strong>room layout planner</strong> does suggest a size, and it is the one place on
          this page that does. It is labelled <em>indicative</em> in as many words, it names the exact table, method
          and ambient it assumes — BS 7671 Table 4E2A, copper, 90 °C thermosetting, Reference Method E on a perforated
          tray at 30 °C — and it says on the same screen that installation method alone swings a rating by more than
          thirty per cent and that on any appreciable run volt drop governs first. It is a starting point for your own
          cable schedule. It is not a specification, and it must never be used as one.</p>
          <p className="td-p">It does not implement IEEE 519 above 69 kV, because Tables 3 and 4 could not be verified
          and cannot be derived by scaling. It does not carry the NETA insulation or torque tables, because open
          transcriptions of those conflict with each other. Where a figure could not be confirmed, it is absent rather
          than guessed.</p>
          <p className="td-p">Every derate, clearance and acceptance figure here is indicative. The engineer signing the
          test sheet is the authority, not this page.</p>
        </div>
      )}
    </div>
  )
}
