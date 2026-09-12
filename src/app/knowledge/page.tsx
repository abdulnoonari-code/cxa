'use client'

import { useState, useRef, useMemo } from 'react'
import {
  sizeGenerator, REGIMES, regimeById, planSteps, totalMinutes,
  sizeUps, heatAndAir, inletVerdict, ASHRAE,
  KINDS, DIRS, zonesOf, rectOf, roomFindings, nameFor, clampToRoom,
  ALT_DATUM_M, AMB_DATUM_C,
  type RatingUnit, type Phase, type KindId, type Dir, type Item,
} from '@/lib/loadbank'

// Load bank testing — the engineering reference, in the application.
//
// Every number on this screen comes from `src/lib/loadbank.ts`, which is pure
// and carries its own assertion suite. Nothing is calculated in this file:
// it is the form and the drawing, and nothing else. That split is the whole
// reason the maths can be checked against a hand-worked example rather than
// against whatever the screen happened to print.
//
// Public, like the manual — it holds no project data, and an engineer standing
// in a switchroom should not have to sign in to size a load bank.

const STYLES = `
.kb{max-width:1180px;margin:0 auto}
.kb-tabs{position:sticky;top:0;z-index:30;background:var(--color-bg);display:flex;gap:2px;
  flex-wrap:wrap;border-bottom:1.5px solid var(--color-text);padding-top:5px;margin-bottom:20px}
.kb-tab{appearance:none;border:0;background:none;font-family:inherit;font-size:13.5px;font-weight:600;
  color:var(--color-text-secondary);cursor:pointer;padding:9px 14px;border-radius:6px 6px 0 0;
  border-bottom:2.5px solid transparent;margin-bottom:-1.5px}
.kb-tab:hover{color:var(--color-primary);background:var(--color-primary-light)}
.kb-tab.on{color:var(--color-primary-dark);border-bottom-color:var(--color-primary);background:var(--color-surface,#fff)}
.kb-two{display:grid;grid-template-columns:minmax(0,330px) minmax(0,1fr);gap:15px;align-items:start}
@media(max-width:820px){.kb-two{grid-template-columns:1fr}}
.kb-f{display:grid;gap:3px;margin-bottom:11px}
.kb-f label{font-size:10.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--color-text-secondary)}
.kb-f .h{font-size:11.5px;color:var(--color-text-secondary);font-weight:400;letter-spacing:0;text-transform:none}
.kb-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.kb-out{display:grid;gap:10px}
.kb-res{border:1px solid var(--color-border);border-radius:7px;padding:12px 14px;background:var(--color-surface,#fff)}
.kb-res.lead{border-color:var(--color-primary);background:var(--color-primary-light);border-width:1.5px}
.kb-res.warn{border-color:var(--color-warning);background:var(--color-warning-bg)}
.kb-res.stop{border-color:var(--color-danger);background:var(--color-danger-bg)}
.kb-l{font-size:10.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--color-text-secondary);margin-bottom:2px}
.kb-res.lead .kb-l{color:var(--color-primary-dark)}
.kb-res.warn .kb-l{color:var(--color-warning)}
.kb-res.stop .kb-l{color:var(--color-danger)}
.kb-v{font-size:23px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.15}
.kb-res.lead .kb-v{color:var(--color-primary-dark)}
.kb-res.stop .kb-v{font-size:15px;color:var(--color-danger)}
.kb-res.warn .kb-v{font-size:14.5px;font-weight:600}
.kb-fml{font-size:11.5px;color:var(--color-text-secondary);margin-top:5px;padding-top:5px;
  border-top:1px dotted var(--color-border);word-break:break-word}
.kb-n{font-size:12.5px;color:var(--color-text-secondary);margin-top:5px}
.kb-g3{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:10px}
.kb-note{border-left:3px solid var(--color-primary);background:var(--color-primary-light);
  padding:11px 15px;margin:0 0 14px;font-size:13px;line-height:1.6;max-width:72ch;border-radius:0 5px 5px 0}
.kb-note.warn{border-left-color:var(--color-warning);background:var(--color-warning-bg)}
.kb-note.stop{border-left-color:var(--color-danger);background:var(--color-danger-bg)}
.kb-note b{display:block;font-size:10.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
  margin-bottom:3px;color:var(--color-primary-dark)}
.kb-note.warn b{color:var(--color-warning)}.kb-note.stop b{color:var(--color-danger)}
.kb-note p{margin:0}.kb-note p+p{margin-top:7px}
.kb-plan{display:grid;grid-template-columns:200px minmax(0,1fr);gap:14px;align-items:start}
@media(max-width:860px){.kb-plan{grid-template-columns:1fr}}
.kb-pbtn{display:flex;align-items:center;gap:8px;text-align:left;width:100%;appearance:none;
  border:1px solid var(--color-border);background:var(--color-surface,#fff);color:var(--color-text);
  font-family:inherit;font-size:12.5px;font-weight:600;padding:8px 10px;border-radius:6px;cursor:pointer;margin-bottom:6px}
.kb-pbtn:hover{border-color:var(--color-primary);background:var(--color-primary-light)}
.kb-sw{width:14px;height:14px;border-radius:3px;flex:none}
.kb-stage{width:100%;height:auto;background:var(--color-surface,#fff);border:1px solid var(--color-border);
  border-radius:8px;touch-action:none}
.kb-bar{display:flex;flex-wrap:wrap;gap:7px;align-items:center;margin-bottom:10px}
.kb-mini{appearance:none;border:1px solid var(--color-border);background:var(--color-surface,#fff);
  color:var(--color-text);font-family:inherit;font-size:12px;font-weight:600;padding:6px 11px;
  border-radius:5px;cursor:pointer}
.kb-mini:hover{border-color:var(--color-primary);color:var(--color-primary)}
.kb-mini.on{background:var(--color-primary);color:#fff;border-color:var(--color-primary)}
.kb-seg{display:flex;border:1px solid var(--color-border);border-radius:6px;overflow:hidden}
.kb-seg button{flex:1;appearance:none;border:0;background:var(--color-bg);color:var(--color-text-secondary);
  font-family:inherit;font-size:12.5px;font-weight:600;padding:6px 4px;cursor:pointer}
.kb-seg button.on{background:var(--color-primary);color:#fff}
.kb-seg button+button{border-left:1px solid var(--color-border)}
.kb-ref h3{font-size:16px;font-weight:700;margin:24px 0 7px;letter-spacing:-.01em}
.kb-ref h3:first-child{margin-top:0}
.kb-ref p{margin:0 0 12px;max-width:70ch;font-size:13.5px;line-height:1.65}
.kb-ref ul{max-width:70ch;padding-left:20px;margin:0 0 14px;font-size:13.5px;line-height:1.65}
.kb-ref li{margin-bottom:5px}
.kb-pre{font-size:12.5px;background:var(--color-bg);border:1px solid var(--color-border);
  border-radius:6px;padding:11px 14px;margin:0 0 14px;overflow-x:auto;line-height:1.75;white-space:pre}
.kb-src{font-size:11.5px;color:var(--color-text-secondary);margin:-7px 0 14px}
@media print{.kb-tabs,.kb-bar,.kb-pbtn{display:none}.kb-res,.kb-note,.card{break-inside:avoid}}
`

type Tab = 'size' | 'plan' | 'ups' | 'heat' | 'room' | 'ref'
const TABS: [Tab, string][] = [
  ['size', 'Sizing'], ['plan', 'Test regime'], ['ups', 'UPS & battery'],
  ['heat', 'Heat & air'], ['room', 'Room layout'], ['ref', 'Reference'],
]

const TONE: Record<string, string> = {
  primary: 'var(--color-primary)', neutral: 'var(--color-text-secondary)',
  warning: 'var(--color-warning)', success: 'var(--color-success)',
}
const WASH: Record<string, string> = {
  primary: 'var(--color-primary-light)', neutral: 'var(--color-bg)',
  warning: 'var(--color-warning-bg)', success: 'var(--color-success-bg)',
}

function f(v: number, d?: number) {
  if (!isFinite(v)) return '—'
  const p = d === undefined ? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2) : d
  return v.toLocaleString('en-GB', { minimumFractionDigits: p, maximumFractionDigits: p })
}

function Res({ k, label, value, note, formula }: {
  k?: 'lead' | 'warn' | 'stop'; label: string; value: React.ReactNode
  note?: React.ReactNode; formula?: string
}) {
  return (
    <div className={'kb-res' + (k ? ' ' + k : '')}>
      <div className="kb-l">{label}</div>
      <div className="kb-v mono">{value}</div>
      {note ? <div className="kb-n">{note}</div> : null}
      {formula ? <div className="kb-fml mono">{formula}</div> : null}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="kb-f">
      <label>{label}{hint ? <span className="h"> {hint}</span> : null}</label>
      {children}
    </div>
  )
}

export default function KnowledgePage() {
  const [tab, setTab] = useState<Tab>('size')

  // ── generator ──
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
  const d = size.derate

  // ── regime ──
  const [regimeId, setRegimeId] = useState('nfpa-accept')
  const [baseKw, setBaseKw] = useState<number | null>(null)
  const [applyDerate, setApplyDerate] = useState(false)
  const regime = regimeById(regimeId)
  const planKw = baseKw ?? Math.round(size.rated.kW)
  const steps = planSteps(regime, planKw, applyDerate ? d.factor : 1)
  const mins = totalMinutes(steps)

  // ── ups ──
  const [uRating, setURating] = useState(500)
  const [uUnit, setUUnit] = useState<RatingUnit>('kva')
  const [uPf, setUPf] = useState(1)
  const [uLoad, setULoad] = useState(100)
  const [cells, setCells] = useState(240)
  const [vpc, setVpc] = useState(1.75)
  const [autonomy, setAutonomy] = useState(10)
  const [eff, setEff] = useState(95)
  const ups = useMemo(() => sizeUps({
    rating: uRating, unit: uUnit, pf: uPf, loadPct: uLoad,
    cells, voltsPerCell: vpc, autonomyMin: autonomy, efficiencyPct: eff,
  }), [uRating, uUnit, uPf, uLoad, cells, vpc, autonomy, eff])

  // ── heat ──
  const [hKw, setHKw] = useState(500)
  const [hDt, setHDt] = useState(11)
  const [hDtU, setHDtU] = useState<'c' | 'f'>('c')
  const [hAlt, setHAlt] = useState(0)
  const [inlet, setInlet] = useState(24)
  const [cls, setCls] = useState('A2')
  const heat = useMemo(() => heatAndAir({ kW: hKw, deltaT: hDt, deltaUnit: hDtU, altitudeM: hAlt }),
    [hKw, hDt, hDtU, hAlt])
  const verdict = inletVerdict(inlet, cls)
  const band = ASHRAE[cls] ?? ASHRAE.A2

  // ── room ──
  const [roomW, setRoomW] = useState(20)
  const [roomD, setRoomD] = useState(14)
  const [items, setItems] = useState<Item[]>(() => [
    { id: 1, kind: 'lb', x: 2, y: 2, dir: 'E', label: 'Load bank 1 MW' },
    { id: 2, kind: 'lb', x: 2, y: 8.5, dir: 'E', label: 'Load bank 1 MW #2' },
    { id: 3, kind: 'panel', x: 0.2, y: 5.6, dir: 'E', label: 'Distribution panel' },
    { id: 4, kind: 'door', x: 17.5, y: 0, dir: 'E', label: 'Door / opening' },
  ])
  const [sel, setSel] = useState<number | null>(null)
  const [showZones, setShowZones] = useState(true)
  const [showGrid, setShowGrid] = useState(true)
  const nextId = useRef(5)
  const stageRef = useRef<SVGSVGElement>(null)

  const findings = useMemo(() => roomFindings(items, roomW, roomD), [items, roomW, roomD])
  const selected = items.find((i) => i.id === sel) ?? null

  const VW = 1000, VH = 700, PAD = 54
  const sc = Math.min((VW - PAD * 2) / roomW, (VH - PAD * 2) / roomD)
  const ox = (VW - roomW * sc) / 2, oy = (VH - roomD * sc) / 2
  const X = (m: number) => ox + m * sc
  const Y = (m: number) => oy + m * sc

  function addItem(kind: KindId) {
    setItems((prev) => {
      const pos = clampToRoom(1 + ((prev.length * 1.5) % 6), 1 + ((prev.length * 1.2) % 5), kind, roomW, roomD)
      const it: Item = { id: nextId.current++, kind, x: pos.x, y: pos.y, dir: 'E', label: nameFor(kind, prev) }
      setSel(it.id)
      return [...prev, it]
    })
  }

  function onDown(e: React.PointerEvent, id: number) {
    e.preventDefault()
    setSel(id)
    const svg = stageRef.current
    if (!svg) return
    const it = items.find((x) => x.id === id)
    if (!it) return
    const pt = svg.createSVGPoint()
    const toM = (ev: { clientX: number; clientY: number }) => {
      pt.x = ev.clientX; pt.y = ev.clientY
      const m = svg.getScreenCTM()
      if (!m) return { x: 0, y: 0 }
      const p = pt.matrixTransform(m.inverse())
      return { x: (p.x - ox) / sc, y: (p.y - oy) / sc }
    }
    const start = toM(e), ix = it.x, iy = it.y
    const move = (ev: PointerEvent) => {
      const m = toM(ev)
      const p = clampToRoom(ix + (m.x - start.x), iy + (m.y - start.y), it.kind, roomW, roomD)
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, x: p.x, y: p.y } : x)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const num = (v: number, set: (n: number) => void) => ({
    type: 'number' as const, className: 'input mono', value: String(v),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const n = parseFloat(e.target.value)
      set(isFinite(n) ? n : 0)
    },
  })

  return (
    <div className="kb">
      <style>{STYLES}</style>

      <div className="card" style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 5px', letterSpacing: '-0.02em' }}>
          Load Bank Testing
        </h1>
        <p className="text-secondary" style={{ fontSize: 13.5, margin: 0, maxWidth: '64ch' }}>
          Sizing, test regimes, heat rejection and room layout — with the formula and the standard behind
          every number, so you can defend it to a client.
        </p>
      </div>

      <div className="kb-tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={'kb-tab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {/* ── SIZING ─────────────────────────────────────────── */}
      {tab === 'size' && (
        <>
          <div className="kb-note">
            <b>The trap this page exists to avoid</b>
            <p>Generators are rated in <strong>kVA at 0.8 power factor</strong>. Load banks are rated in{' '}
            <strong>kW at unity</strong>. Size the bank against the kVA figure and you overload the set; size
            it against kW alone and the alternator never sees its rated current. Both legs are given below.</p>
          </div>
          <div className="kb-two">
            <div className="card">
              <h2 className="section-title">The generator</h2>
              <Field label="Nameplate rating">
                <div className="kb-row">
                  <input {...num(rating, setRating)} min={1} />
                  <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as RatingUnit)}>
                    <option value="kva">kVA</option><option value="kw">kW</option>
                  </select>
                </div>
              </Field>
              <Field label="Rated power factor" hint="0.8 lagging is the industrial convention">
                <input {...num(pf, setPf)} min={0.1} max={1} step={0.01} />
              </Field>
              <Field label="Voltage, line to line">
                <div className="kb-row">
                  <input {...num(volts, setVolts)} min={1} />
                  <select className="input" value={phase} onChange={(e) => setPhase(Number(e.target.value) as Phase)}>
                    <option value={3}>3-phase</option><option value={1}>1-phase</option>
                  </select>
                </div>
              </Field>
              <Field label="Site conditions" hint="metres · ambient °C">
                <div className="kb-row">
                  <input {...num(altM, setAltM)} aria-label="Altitude in metres" />
                  <input {...num(ambC, setAmbC)} aria-label="Ambient in degrees C" />
                </div>
              </Field>
              <Field label="Derate assumptions" hint="% per 100 m over 1000 m · % per 5 °C over 40 °C">
                <div className="kb-row">
                  <input {...num(rAlt, setRAlt)} step={0.1} aria-label="Percent per 100 m" />
                  <input {...num(rAmb, setRAmb)} step={0.1} aria-label="Percent per 5 C" />
                </div>
              </Field>
            </div>

            <div className="kb-out">
              <Res k="lead" label="Resistive load bank — the kW leg"
                value={<>{f(size.derated.kW, 0)} <span style={{ fontSize: 14, fontWeight: 500 }}>kW</span></>}
                note="This alone loads the engine to its rated output."
                formula={`kW = kVA × PF = ${f(size.rated.kVA, 0)} × ${pf}${d.total > 0 ? `  then × ${f(d.factor, 3)} derate` : ''}`} />
              <Res k="lead" label="Reactive load bank — the kVAR leg"
                value={<>{f(size.derated.kVAR, 0)} <span style={{ fontSize: 14, fontWeight: 500 }}>kVAR</span></>}
                note="Add this and the alternator sees its rated current and the AVR is tested."
                formula={`kVAR = √(kVA² − kW²) = ${f(size.rated.kVAR, 0)}${d.total > 0 ? `  then × ${f(d.factor, 3)}` : ''}`} />
              <div className="kb-g3">
                <Res label="Apparent power" value={`${f(size.derated.kVA, 0)} kVA`} formula="kVA = √(kW² + kVAR²)" />
                <Res label="Full-load current at rated PF" value={`${f(size.current, 0)} A`}
                  formula={phase === 3 ? 'I = kVA×1000 ÷ (√3 × V)' : 'I = kVA×1000 ÷ V'} />
                <Res label="Breaker / feeder design current" value={`${f(size.breaker, 0)} A`}
                  formula="1.25 × I  (continuous load)" />
              </div>
              {size.resistivePct < 99.5 ? (
                <Res k="warn" label="If you use resistive load only"
                  value={`The set reaches ${f(size.resistivePct, 0)} % of rated current, not 100 %`}
                  note={<>At {f(size.derated.kW, 0)} kW resistive the current is {f(size.resistiveCurrent, 0)} A
                    against a rated {f(size.current, 0)} A. The windings, cables and connections never reach
                    service temperature, so a thermal fault stays hidden. Record the test as having been done
                    at unity power factor.</>}
                  formula={`I(resistive) = kW×1000 ÷ (√3 × V) = ${f(size.resistiveCurrent, 0)} A`} />
              ) : (
                <Res label="Resistive load" value="Fully loads this machine"
                  note="A unity-rated machine reaches 100 % of its rated current on resistance alone." />
              )}
              {d.total > 0 ? (
                <Res k="warn" label="Site derating applied" value={`−${f(d.total, 1)} %`}
                  note={<>Altitude term −{f(d.altitude, 1)} % (above {ALT_DATUM_M} m), ambient term −{f(d.ambient, 1)} %
                    (above {AMB_DATUM_C} °C). <strong>The larger of the two is applied, not the sum</strong> — engine
                    and alternator derate for different reasons. Indicative only: sign off against the
                    manufacturer&rsquo;s derate table.</>} />
              ) : (
                <Res label="Site derating" value="None applied"
                  note={`Below ${ALT_DATUM_M} m and ${AMB_DATUM_C} °C most sets hold full output.`} />
              )}
            </div>
          </div>
        </>
      )}

      {/* ── REGIME ─────────────────────────────────────────── */}
      {tab === 'plan' && (
        <div className="kb-two">
          <div className="card">
            <h2 className="section-title">Which test</h2>
            <Field label="Test regime">
              <select className="input" value={regimeId} onChange={(e) => setRegimeId(e.target.value)}>
                {REGIMES.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            </Field>
            <Field label="Nameplate kW" hint="carried over from Sizing">
              <input {...num(planKw, setBaseKw)} min={1} />
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
              <input type="checkbox" checked={applyDerate} onChange={(e) => setApplyDerate(e.target.checked)} />
              Apply the site derating to each step
            </label>
          </div>
          <div className="card">
            <h2 className="section-title">{regime.title}</h2>
            <p className="text-secondary mono" style={{ fontSize: 11.5, margin: '0 0 12px' }}>{regime.cite}</p>
            <div className="kb-note"><p>{regime.before}</p></div>
            <div className="table-wrap">
              <table className="table" style={{ fontSize: 12.5, minWidth: 0, tableLayout: 'auto' }}>
                <thead><tr>
                  <th>#</th><th>Step</th><th>Load</th><th>Hold</th><th>Elapsed</th><th>What it is for</th>
                </tr></thead>
                <tbody>
                  {steps.map((s, i) => (
                    <tr key={i}>
                      <td className="mono">{i + 1}</td>
                      <td className="mono">{s.pct} %</td>
                      <td className="mono"><strong>{f(s.kW, 0)} kW</strong></td>
                      <td className="mono">{s.minutes} min</td>
                      <td className="mono">{s.elapsed} min</td>
                      <td className="text-secondary">{s.why}</td>
                    </tr>
                  ))}
                  <tr><td /><td style={{ fontWeight: 700 }}>Total</td><td /><td className="mono" style={{ fontWeight: 700 }}>{mins} min</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{f(mins / 60, 2)} h</td><td /></tr>
                </tbody>
              </table>
            </div>
            {regime.after ? <div className="kb-note warn" style={{ marginTop: 13 }}><b>Also</b><p>{regime.after}</p></div> : null}
            {applyDerate && d.total > 0 ? (
              <div className="kb-note"><b>Derated</b><p>Each step is {f(d.total, 1)} % below nameplate for the site
                conditions on the Sizing tab. NFPA 110 allows this explicitly — the acceptance load is nameplate
                &ldquo;less applicable derating factors for site conditions&rdquo;.</p></div>
            ) : null}
          </div>
        </div>
      )}

      {/* ── UPS ────────────────────────────────────────────── */}
      {tab === 'ups' && (
        <div className="kb-two">
          <div className="card">
            <h2 className="section-title">UPS and battery</h2>
            <p className="text-secondary" style={{ fontSize: 12.5, margin: '0 0 14px' }}>
              Modern units are rated at unity. Older ones are 0.9 or 0.8, and that changes the bank you need.
            </p>
            <Field label="UPS rating">
              <div className="kb-row">
                <input {...num(uRating, setURating)} min={1} />
                <select className="input" value={uUnit} onChange={(e) => setUUnit(e.target.value as RatingUnit)}>
                  <option value="kva">kVA</option><option value="kw">kW</option>
                </select>
              </div>
            </Field>
            <Field label="Output power factor">
              <select className="input" value={uPf} onChange={(e) => setUPf(Number(e.target.value))}>
                <option value={1}>1.0 — modern, post ~2015</option>
                <option value={0.9}>0.9 — 2000s to 2010s</option>
                <option value={0.8}>0.8 — legacy</option>
              </select>
            </Field>
            <Field label="Test load, % of rating"><input {...num(uLoad, setULoad)} min={1} max={125} /></Field>
            <Field label="Battery string" hint="cells in series · end-of-discharge V/cell">
              <div className="kb-row">
                <input {...num(cells, setCells)} min={1} aria-label="Cells in series" />
                <input {...num(vpc, setVpc)} min={0.5} step={0.01} aria-label="Volts per cell" />
              </div>
            </Field>
            <Field label="Autonomy and efficiency" hint="minutes · inverter %">
              <div className="kb-row">
                <input {...num(autonomy, setAutonomy)} min={1} aria-label="Rated autonomy minutes" />
                <input {...num(eff, setEff)} min={50} max={100} step={0.5} aria-label="Inverter efficiency" />
              </div>
            </Field>
          </div>
          <div className="kb-out">
            <Res k="lead" label="Resistive load bank for the UPS"
              value={<>{f(ups.testKW, 0)} <span style={{ fontSize: 14, fontWeight: 500 }}>kW</span></>}
              note={`At ${f(uLoad, 0)} % of a ${f(ups.rated.kVA, 0)} kVA unit rated at ${uPf} power factor.`}
              formula={`kW = kVA × PF × load% = ${f(ups.rated.kVA, 0)} × ${uPf} × ${f(uLoad, 0)}%`} />
            {ups.needsReactive ? (
              <Res k="warn" label="Resistive alone will not prove the kVA rating"
                value={`You also need ${f(ups.testKVAR, 0)} kVAR`}
                note={`This unit is rated at ${uPf} power factor, so a resistive-only bank tests it at unity and never reaches its apparent-power rating. A resistive-reactive bank is needed.`}
                formula="kVAR = √(kVA² − kW²)" />
            ) : (
              <Res label="Reactive leg" value="Not required"
                note="A unity-rated UPS is fully loaded by resistive load alone — kW and kVA are the same number." />
            )}
            <div className="kb-g3">
              <Res label="End-of-discharge voltage" value={`${f(ups.endVolts, 1)} V`}
                formula={`${cells} cells × ${vpc} V/cell`} />
              <Res label="DC power from the string" value={`${f(ups.dcKW, 1)} kW`}
                formula={`kW(ac) ÷ efficiency = ${f(ups.testKW, 0)} ÷ ${f(eff / 100, 3)}`} />
              <Res label="Per cell" value={`${f(ups.wattsPerCell, 1)} W`}
                formula="DC watts ÷ cells — match to the maker's constant-power table" />
            </div>
            <Res k="stop" label="Battery limit during an integrated systems test"
              value={`Stop at ${f(ups.abortMin, 1)} minutes`}
              note={<>Do not run the batteries below <strong>60 % of rated autonomy</strong> during an IST. If
                generator start, synchronise and transfer has not completed by then, abort and re-evaluate rather
                than pressing on — you are spending the plant&rsquo;s real ride-through to prove a point.</>}
              formula={`0.6 × ${f(autonomy, 0)} min rated autonomy`} />
            <Res label="Discharge test method" value="Constant power"
              note={<>A UPS string is sized in watts per cell because the inverter draws constant kW while string
                voltage sags and current rises. A constant-current test under-stresses the string exactly at end of
                discharge. Temperature-correct to 25 °C using the temperature at the <em>start</em>, and because this
                test is under an hour, use the <strong>rate-adjusted</strong> method, not the time-adjusted one.</>} />
          </div>
        </div>
      )}

      {/* ── HEAT ───────────────────────────────────────────── */}
      {tab === 'heat' && (
        <>
          <div className="kb-note warn">
            <b>The most common error in this calculation</b>
            <p>For an IT or load bank load, heat rejected equals electrical power in — 1 kW electrical is 1 kW
            thermal. A chiller&rsquo;s <em>tons</em> is its <strong>thermal capacity</strong>, not its electrical
            draw. Never convert a chiller&rsquo;s input kW into tons.</p>
          </div>
          <div className="kb-two">
            <div className="card">
              <h2 className="section-title">Heat and airflow</h2>
              <Field label="Load applied, kW"><input {...num(hKw, setHKw)} min={0} /></Field>
              <Field label="Temperature rise across the air path">
                <div className="kb-row">
                  <input {...num(hDt, setHDt)} min={0} />
                  <select className="input" value={hDtU} onChange={(e) => setHDtU(e.target.value as 'c' | 'f')}>
                    <option value="c">°C</option><option value="f">°F</option>
                  </select>
                </div>
              </Field>
              <Field label="Altitude, metres" hint="air density correction"><input {...num(hAlt, setHAlt)} /></Field>
              <Field label="Inlet air temperature, °C"><input {...num(inlet, setInlet)} /></Field>
              <Field label="ASHRAE class">
                <select className="input" value={cls} onChange={(e) => setCls(e.target.value)}>
                  {Object.entries(ASHRAE).map(([k, v]) => (
                    <option key={k} value={k}>{k} — {v[0]} to {v[1]} °C allowable</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="kb-out">
              <div className="kb-g3">
                <Res label="Heat rejected" value={`${f(heat.btuPerHr, 0)} BTU/hr`} formula="kW × 3412.142" />
                <Res label="In tons of refrigeration" value={`${f(heat.tons, 1)} TR`} formula="kW ÷ 3.516853" />
                <Res label="Thermal load" value={`${f(hKw, 0)} kW`} formula="equal to the electrical load, 1:1" />
              </div>
              <Res k="lead" label="Airflow needed, metric"
                value={<>{f(heat.m3s, 2)} <span style={{ fontSize: 14, fontWeight: 500 }}>m³/s</span> · {f(heat.m3h, 0)} <span style={{ fontSize: 14, fontWeight: 500 }}>m³/h</span></>}
                note={`For ${f(hKw, 0)} kW at a ${f(heat.deltaC, 1)} °C rise.`}
                formula={`m³/s = kW × 0.8278 ÷ ΔT(°C)${hAlt > 0 ? ` ÷ density ${f(heat.densityRatio, 3)}` : ''}`} />
              <Res k="lead" label="Airflow needed, imperial"
                value={<>{f(heat.cfm, 0)} <span style={{ fontSize: 14, fontWeight: 500 }}>CFM</span></>}
                note={`That is ${f(heat.cfmPerKw, 0)} CFM per kW at this temperature rise.`}
                formula={`CFM = kW × 3159.4 ÷ ΔT(°F)${hAlt > 0 ? ` ÷ density ${f(heat.densityRatio, 3)}` : ''}`} />
              {hAlt > 0 ? (
                <Res k="warn" label="Altitude correction applied"
                  value={`Air density ${f(heat.densityRatio * 100, 1)} % of sea level`}
                  note={<>The 1.08 and 1.208 constants assume standard air at sea level. At {f(hAlt, 0)} m you need{' '}
                    <strong>{f((1 / heat.densityRatio - 1) * 100, 1)} % more volume</strong> to move the same heat,
                    because each cubic metre carries less mass. Most airflow calculators miss this.</>} />
              ) : null}
              <Res label="Air path temperatures"
                value={`${f(inlet, 1)} °C in → ${f(inlet + heat.deltaC, 1)} °C out`}
                formula="outlet = inlet + ΔT" />
              {verdict === 'outside' ? (
                <Res k="stop" label={`Inlet outside the ASHRAE ${cls} allowable range`}
                  value={`${f(inlet, 1)} °C is outside ${band[0]}–${band[1]} °C`}
                  note="Recommended for all classes is 18–27 °C. This is the inlet to the equipment, not the room average." />
              ) : verdict === 'allowable' ? (
                <Res k="warn" label="Inside allowable but outside recommended"
                  value={`${f(inlet, 1)} °C — recommended is 18–27 °C`}
                  note={`Within the ${cls} allowable band of ${band[0]}–${band[1]} °C, so acceptable, but worth recording why.`} />
              ) : (
                <Res label="ASHRAE check" value="Inlet within recommended 18–27 °C"
                  note={`Class ${cls} allowable is ${band[0]}–${band[1]} °C.`} />
              )}
              <Res k="warn" label="The limit that usually fails"
                value="20 °C per hour, and 5 °C in any 15 minutes"
                note="Rate of change, not absolute temperature, is what fails a thermal ride-through test. Log inlet temperatures at 1-minute intervals through every transition so you can prove the rate as well as the peak." />
            </div>
          </div>
        </>
      )}

      {/* ── ROOM ───────────────────────────────────────────── */}
      {tab === 'room' && (
        <>
          <div className="kb-note">
            <b>What this is for</b>
            <p>Load banks fail their own test when hot discharge air finds its way back to an intake. Place the
            equipment to scale and the plan shades each intake and discharge zone and tells you when one
            overlaps another.</p>
          </div>
          <div className="kb-bar">
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>Room</span>
            <input {...num(roomW, setRoomW)} min={2} max={120} step={0.5} style={{ width: 78 }} aria-label="Room width" />
            <span className="text-secondary">×</span>
            <input {...num(roomD, setRoomD)} min={2} max={120} step={0.5} style={{ width: 78 }} aria-label="Room depth" />
            <span className="text-secondary" style={{ fontSize: 12 }}>m</span>
            <button className={'kb-mini' + (showZones ? ' on' : '')} onClick={() => setShowZones(!showZones)}>Clearance zones</button>
            <button className={'kb-mini' + (showGrid ? ' on' : '')} onClick={() => setShowGrid(!showGrid)}>Grid</button>
            <button className="kb-mini" onClick={() => { setItems([]); setSel(null) }}>Clear all</button>
          </div>

          <div className="kb-plan">
            <div>
              {(Object.keys(KINDS) as KindId[]).map((k) => {
                const K = KINDS[k]
                return (
                  <button key={k} className="kb-pbtn" onClick={() => addItem(k)}>
                    <span className="kb-sw" style={{ background: TONE[K.tone] }} />
                    <span>{K.label}<br />
                      <span className="mono" style={{ fontWeight: 400, color: 'var(--color-text-secondary)', fontSize: 11 }}>
                        {K.w} × {K.h} m
                      </span>
                    </span>
                  </button>
                )
              })}
              <div className="card" style={{ padding: '13px 14px', marginTop: 10 }}>
                <div className="kb-l">Selected</div>
                {selected ? (() => {
                  const K = KINDS[selected.kind]
                  return (
                    <>
                      <div style={{ fontWeight: 700, fontSize: 13, margin: '5px 0 4px' }}>{selected.label}</div>
                      <div className="mono text-secondary" style={{ fontSize: 11.5, marginBottom: 9 }}>
                        {K.w} × {K.h} m{K.discharge ? ` · intake ${K.intake} m · discharge ${K.discharge} m` : ''}
                      </div>
                      {K.note ? <div className="text-secondary" style={{ fontSize: 11.5, marginBottom: 9 }}>{K.note}</div> : null}
                      {K.discharge ? (
                        <>
                          <div className="kb-l" style={{ marginBottom: 5 }}>Discharges towards</div>
                          <div className="kb-seg">
                            {DIRS.map((dir: Dir) => (
                              <button key={dir} className={selected.dir === dir ? 'on' : ''}
                                onClick={() => setItems((p) => p.map((x) => x.id === selected.id ? { ...x, dir } : x))}>
                                {dir}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : null}
                      <button className="kb-mini" style={{ marginTop: 10, borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
                        onClick={() => { setItems((p) => p.filter((x) => x.id !== selected.id)); setSel(null) }}>
                        Remove
                      </button>
                    </>
                  )
                })() : <div className="text-secondary" style={{ fontSize: 12.5, marginTop: 5 }}>Nothing selected. Click an item on the plan.</div>}
              </div>
            </div>

            <div>
              <svg ref={stageRef} className="kb-stage" viewBox={`0 0 ${VW} ${VH}`} role="img"
                aria-label="Room layout plan showing load banks, panels and their clearance zones">
                <rect x={X(0)} y={Y(0)} width={roomW * sc} height={roomD * sc}
                  fill="var(--color-bg)" stroke="var(--color-text)" strokeWidth={2} />
                {showGrid && Array.from({ length: Math.max(0, Math.ceil(roomW) - 1) }, (_, i) => i + 1).map((m) => (
                  <line key={'v' + m} x1={X(m)} y1={Y(0)} x2={X(m)} y2={Y(roomD)}
                    stroke="var(--color-border)" strokeWidth={m % 5 ? 0.5 : 1} opacity={m % 5 ? 0.5 : 0.9} />
                ))}
                {showGrid && Array.from({ length: Math.max(0, Math.ceil(roomD) - 1) }, (_, i) => i + 1).map((m) => (
                  <line key={'h' + m} x1={X(0)} y1={Y(m)} x2={X(roomW)} y2={Y(m)}
                    stroke="var(--color-border)" strokeWidth={m % 5 ? 0.5 : 1} opacity={m % 5 ? 0.5 : 0.9} />
                ))}
                <text x={X(roomW / 2)} y={Y(0) - 16} textAnchor="middle" fontSize={13} fontWeight={600}
                  fill="var(--color-text-secondary)">{roomW} m</text>
                <text x={X(0) - 16} y={Y(roomD / 2)} textAnchor="middle" fontSize={13} fontWeight={600}
                  fill="var(--color-text-secondary)"
                  transform={`rotate(-90 ${X(0) - 16} ${Y(roomD / 2)})`}>{roomD} m</text>

                {showZones && items.map((it) => {
                  const z = zonesOf(it); if (!z) return null
                  const K = KINDS[it.kind]
                  return (
                    <g key={'z' + it.id}>
                      {K.discharge > 0 && (
                        <rect x={X(z.discharge.x)} y={Y(z.discharge.y)} width={z.discharge.w * sc} height={z.discharge.h * sc}
                          fill="var(--color-danger)" opacity={0.1} stroke="var(--color-danger)" strokeWidth={1} strokeDasharray="5 4" />
                      )}
                      {K.intake > 0 && (
                        <rect x={X(z.intake.x)} y={Y(z.intake.y)} width={z.intake.w * sc} height={z.intake.h * sc}
                          fill="var(--color-primary)" opacity={0.1} stroke="var(--color-primary)" strokeWidth={1} strokeDasharray="5 4" />
                      )}
                    </g>
                  )
                })}

                {items.map((it) => {
                  const K = KINDS[it.kind], r = rectOf(it), isSel = it.id === sel
                  const cx = X(r.x + r.w / 2), cy = Y(r.y + r.h / 2)
                  const numSuffix = /#(\d+)$/.exec(it.label)
                  const lbl = K.short + (numSuffix ? ' #' + numSuffix[1] : '')
                  const dx = it.dir === 'E' ? 1 : it.dir === 'W' ? -1 : 0
                  const dy = it.dir === 'S' ? 1 : it.dir === 'N' ? -1 : 0
                  const tipx = cx + dx * (r.w * sc / 2 + 16), tipy = cy + dy * (r.h * sc / 2 + 16)
                  return (
                    <g key={it.id} style={{ cursor: 'grab' }} onPointerDown={(e) => onDown(e, it.id)}>
                      <rect x={X(r.x)} y={Y(r.y)} width={r.w * sc} height={r.h * sc} rx={3}
                        fill={WASH[K.tone]} stroke={isSel ? 'var(--color-text)' : TONE[K.tone]} strokeWidth={isSel ? 3 : 1.8} />
                      {r.w * sc > lbl.length * 6.4 + 10 && r.h * sc > 15 && (
                        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="var(--color-text)">{lbl}</text>
                      )}
                      {K.discharge > 0 && (
                        <>
                          <line x1={cx} y1={cy} x2={tipx} y2={tipy} stroke="var(--color-danger)" strokeWidth={2.5} />
                          <circle cx={tipx} cy={tipy} r={4.5} fill="var(--color-danger)" />
                        </>
                      )}
                    </g>
                  )
                })}
              </svg>

              <div style={{ marginTop: 12 }}>
                {findings.length === 0 && items.length > 0 && (
                  <div className="kb-note"><b>Nothing found</b><p>No discharge zone is feeding an intake and nothing is
                    blocked. Clearances drawn are the conservative end of the manufacturer range — always check the
                    manual for the actual unit.</p></div>
                )}
                {items.length === 0 && (
                  <div className="kb-note"><b>Empty room</b><p>Add equipment from the list on the left, then drag it
                    into place. Click an item to change which way it discharges.</p></div>
                )}
                {findings.map((x, i) => (
                  <div key={i} className={'kb-note ' + (x.severity === 'blocking' ? 'stop' : 'warn')}>
                    <b>{x.severity === 'blocking' ? 'Will fail the test' : 'Worth looking at'}</b>
                    <p><strong>{x.title}.</strong> {x.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── REFERENCE ──────────────────────────────────────── */}
      {tab === 'ref' && (
        <div className="card kb-ref">
          <h3>Power, and why 0.8 matters</h3>
          <p>A generator&rsquo;s nameplate kVA is apparent power — what the windings, cables and breakers actually
          carry. Its kW is real power — what the engine has to produce.</p>
          <div className="kb-pre mono">{`kVA  = √(kW² + kVAR²)
kW   = kVA × PF
kVAR = √(kVA² − kW²)
PF   = kW ÷ kVA

At PF 0.8:   kW = 0.80 × kVA     kVAR = 0.60 × kVA     kVAR = 0.75 × kW`}</div>
          <p>A resistive load bank runs at unity. Load a set to 100 % of its <em>kW</em> rating with resistance alone
          and it draws only <strong>80 % of rated current</strong> — the windings, cabling, breaker and every
          connection never reach the temperature they will see in service. A reactive bank pulls current out of
          phase, forcing the AVR to raise excitation, which tests the exciter, the winding thermal design at full
          rated current, voltage regulation, and reactive load sharing between sets in parallel.</p>

          <h3>NFPA 110 — what it actually requires</h3>
          <p>Current edition 2025. Three figures are widely misquoted, so they are worth stating plainly.</p>
          <ul>
            <li><strong>Installation acceptance</strong> (§7.13.4): an operational run of not less than 1.5 hours,
              then <strong>30 % for 30 min, 50 % for 30 min, 100 % for 60 min</strong> — two hours, less site derating.</li>
            <li><strong>Routine monthly</strong> (§8.4.2): at least 30 minutes at the manufacturer&rsquo;s minimum
              exhaust gas temperature or not less than 30 % of nameplate kW.</li>
            <li><strong>Annual supplemental</strong>: <strong>50 % for 30 min then 75 % for 60 min</strong> — 1.5 hours.</li>
            <li><strong>The four-hour test is triennial</strong> (§8.4.9): once within every 36 months, at not less than 30 %.</li>
          </ul>
          <div className="kb-note warn"><b>Two things the internet gets wrong</b>
            <p>The annual sequence is <strong>50/75</strong>, not 25/50/75 — that was the pre-2010 wording. And the
            4-hour run is on a <strong>36-month</strong> cycle, not yearly.</p></div>

          <h3>Derating</h3>
          <div className="kb-note stop"><b>There is no standard figure</b>
            <p>Published rules of thumb vary by a factor of two to three. ISO 8528-1 says only that an adjustment
            &ldquo;shall be made&rdquo;. Manufacturers publish a two-dimensional altitude × temperature grid, not a
            linear rule. Use this to get an indication, then sign off against the manufacturer&rsquo;s curve.</p></div>
          <p><strong>Engine and alternator derate separately, for different reasons</strong> — the engine for air
          density and combustion, the alternator for insulation-class temperature rise. Whichever is limiting
          governs. This page applies the larger, never the sum.</p>

          <h3>Wet stacking</h3>
          <p>Unburned fuel and carbon accumulating in the exhaust when a diesel runs too lightly to reach proper
          combustion temperature. The risk threshold is <strong>below about 30 % of rated capacity</strong> — which
          is where NFPA 110&rsquo;s 30 % figure comes from. To clear a set that has already wet stacked, run at about
          75 % until exhaust temperature and smoke normalise. Engines with DPF or SCR behave differently: check the
          manufacturer before applying a generic burn-off.</p>

          <h3>Batteries</h3>
          <ul>
            <li><strong>IEEE 450-2020</strong> vented lead-acid · <strong>IEEE 1188-2025</strong> VRLA ·
              IEEE 1106-2015 nickel-cadmium, now Inactive-Reserved — do not cite it as current.</li>
            <li>Replace below <strong>80 %</strong> of rated capacity. A new battery is normally expected to reach 90 % on acceptance.</li>
            <li><strong>Constant power for a UPS string</strong>, not constant current.</li>
            <li>Temperature-correct to 25 °C using the temperature at the <em>start</em>. Use the rate-adjusted
              method below an hour — which means most UPS tests.</li>
          </ul>

          <h3>Heat and air</h3>
          <div className="kb-pre mono">{`1 kW  = 3412.142 BTU/hr        (IT BTU — the HVAC convention)
1 ton = 12 000 BTU/hr = 3.516853 kW

Imperial:  CFM  = kW × 3159.4 ÷ ΔT(°F)      1.08 = 0.075 × 0.24 × 60
Metric:    m³/s = kW × 0.8278 ÷ ΔT(°C)`}</div>
          <p>Those constants assume standard air at sea level. Density is the term that changes with altitude, and
          this page corrects for it automatically. A useful cross-check on site: <strong>measured ΔT × measured
          airflow should reconcile to the applied load bank kW</strong>. A mismatch means bypass air, not a failing
          cooling unit.</p>
          <p>ASHRAE TC 9.9: recommended 18–27 °C; allowable A1 15–32, A2 10–35, A3 5–40, A4 5–45 °C. The limit that
          usually fails is the rate of change — <strong>20 °C in an hour, 5 °C in any 15 minutes</strong>.</p>

          <h3>Siting</h3>
          <p>Manufacturers disagree on clearances — Crestchic asks 2 m on the discharge, Avtron 5 m, probably
          horizontal against vertical discharge. The planner uses the conservative figures. Indoors: intake and
          discharge in the same room; room inlet and outlet free area each at least twice the load bank outlet
          area; inlet velocity under 3 m/s; plant room pressure differential under 10 Pa; inlets low, outlets high.</p>
          <div className="kb-note stop"><b>Do not add your own ductwork</b>
            <p>Added static pressure de-rates the fan and trips the unit. Ducting and attenuation must be engineered
            for the specific load bank by its maker. Never point a discharge at a painted surface, a roof membrane
            or a sprinkler head.</p></div>

          <h3>What this page does not do</h3>
          <p>It does not size cables. It gives the design current and the 125 % continuous figure, because cable
          selection depends on installation method, grouping, ambient, run length and the standard you work to — and
          a calculator that guesses at those produces a number somebody might install. Every derate, clearance and
          load acceptance figure here is indicative. The engineer signing the test sheet is the authority, not this
          page.</p>
        </div>
      )}
    </div>
  )
}
