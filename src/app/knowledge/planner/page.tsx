'use client'

import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ITEMS, DIRS, RUN_OPTIONS, CSA_OPTIONS, AMPACITY_BASIS, AMPACITY_CAVEAT,
  rectOf, centreOf, zonesOf, wouldCycle, downstreamKva,
  cableResult, bandFor, layoutFindings, summarise, nameFor, clampToRoom,
  singleLinePositions, describeCable, suggestCsa,
  type LayoutItem, type Cable, type ItemKind, type Dir, type LayoutOptions,
  type LoadBand, type CableResult,
} from '@/lib/layout'
import { VD_GUIDANCE } from '@/lib/techdesign'

// ════════════════════════════════════════════════════════════════════════
// The room layout planner.
//
// Not a drawing tool with numbers bolted on. A CALCULATION WHOSE INTERFACE
// HAPPENS TO BE A DRAWING. One model — equipment and the cables between them —
// shown two ways. Move a load bank and the cable lengthens, so its volt drop
// rises, so its colour changes. The engineer is not annotating a picture; they
// are building a system and watching it answer back.
//
// ── The split that matters ───────────────────────────────────────────────
//
// Not one number is calculated in this file. Every figure comes from
// src/lib/layout.ts, which is pure and carries 188 assertions checked against
// hand-worked examples. This file is the drawing and the gestures. That is the
// whole reason the arithmetic can be trusted: it is checked against arithmetic,
// not against whatever the screen printed.
//
// ── The constraint that governs the screen ───────────────────────────────
//
// A SUGGESTED CABLE SIZE IS NOT A SPECIFICATION. It says INDICATIVE in as many
// words, it states the installation method and ambient it assumes, and it sends
// the engineer to their own cable schedule. See AMPACITY_CAVEAT.
// ════════════════════════════════════════════════════════════════════════

// The SVG palette. The same values as the CSS tokens in globals.css, repeated
// here as literals for one reason: a var() reference does not survive
// serialising the SVG for PNG export, and the exported drawing would come out
// black. globals.css forces color-scheme: light, so there is no second theme
// for these to drift away from.
const C = {
  ok: '#047a52', okWash: '#e2fbef',
  watch: '#a35700', watchWash: '#fff3de',
  limit: '#c2410c', limitWash: '#ffede2',
  over: '#c40f45', overWash: '#ffecf1',
  info: '#0369a1', infoWash: '#e8f4fd',
  sel: '#6d28d9',
  text: '#0a1428', dim: '#56658a',
  border: '#dbe3f2', soft: '#e9eefa',
  surface: '#ffffff', bg: '#f2f6fd',
  slate: '#45557a', slateWash: '#eaeffa',
}

/**
 * One scale, four steps, used on cables and on equipment alike.
 *
 * Every state carries a WORD as well as a colour. Roughly one man in twelve
 * cannot separate the green from the red, and a drawing that only works in
 * colour is a drawing that does not print either.
 */
const BAND: Record<LoadBand, { c: string; wash: string; word: string }> = {
  comfortable: { c: C.ok, wash: C.okWash, word: 'comfortable' },
  watch: { c: C.watch, wash: C.watchWash, word: 'watch it' },
  limit: { c: C.limit, wash: C.limitWash, word: 'at the limit' },
  over: { c: C.over, wash: C.overWash, word: 'overloaded' },
}

const TONE: Record<string, { c: string; wash: string }> = {
  source: { c: C.info, wash: C.infoWash },
  dist: { c: C.slate, wash: C.slateWash },
  load: { c: C.ok, wash: C.okWash },
  passive: { c: C.dim, wash: '#ffffff' },
}

const STYLES = `
/* The app shell lays its content out with flex, so this page is a flex item.
   A flex item will not shrink below its widest child unless min-width says it
   may — and the cable schedule is wider than a phone. Without this line the
   whole page is held open and the right-hand side is cut off. */
.pl{max-width:1500px;margin:0 auto;min-width:0;width:100%}
.pl-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.pl-back{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;
  color:var(--color-primary);text-decoration:none;padding:7px 11px;border-radius:8px;
  border:1px solid var(--color-border);background:var(--color-surface);min-height:36px}
.pl-back:hover{background:var(--color-primary-light);border-color:var(--color-primary)}
.pl-h{font-size:20px;font-weight:700;letter-spacing:-0.02em;margin:0;overflow-wrap:anywhere}
.pl-sub{font-size:11px;color:var(--color-text-secondary);margin:2px 0 0;overflow-wrap:anywhere}
.pl-spacer{flex:1}
/* A flex child will not shrink below its content unless it is told it may.
   Without this the ampacity basis line holds the whole page open on a phone. */
.pl-top>div{min-width:0;flex:1 1 220px}
/* On a phone the basis line is six lines of mono type above the fold. It is
   repeated in full in the cable panel and in the footnote, so it goes. */
@media (max-width:560px){.pl-sub{display:none}}

/* ── Band 2: the summary bar. Pins to the top, updates as you drag. ── */
.pl-bar{position:sticky;top:0;z-index:20;display:grid;gap:1px;background:var(--color-border);
  grid-template-columns:repeat(auto-fit,minmax(126px,1fr));border:1px solid var(--color-border);
  border-radius:11px;overflow:hidden;margin-bottom:9px;
  box-shadow:0 5px 16px -10px rgba(10,20,40,.4)}
.pl-k{background:var(--color-surface);padding:9px 12px 10px}
.pl-k-l{font-size:9.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
  color:var(--color-text-secondary)}
.pl-k-v{font-size:20px;font-weight:700;letter-spacing:-0.03em;line-height:1.15;margin-top:1px;
  font-variant-numeric:tabular-nums}
.pl-k-u{font-size:11.5px;font-weight:600;color:var(--color-text-secondary)}
.pl-k-n{font-size:10.5px;color:var(--color-text-secondary);margin-top:2px;line-height:1.3}
.pl-k.lead{background:var(--color-primary-light)}
.pl-k.lead .pl-k-v{color:var(--color-primary-dark)}
.pl-k.good{background:var(--color-success-bg)} .pl-k.good .pl-k-v{color:var(--color-success)}
.pl-k.warn{background:var(--color-warning-bg)} .pl-k.warn .pl-k-v{color:var(--color-warning)}
.pl-k.bad{background:var(--color-danger-bg)} .pl-k.bad .pl-k-v{color:var(--color-danger)}

/* ── Band 3: the control strip ── */
.pl-strip{display:flex;align-items:center;gap:7px;flex-wrap:wrap;background:var(--color-surface);
  border:1px solid var(--color-border);border-radius:10px;padding:7px 9px;margin-bottom:9px}
.pl-seg{display:inline-flex;background:var(--color-bg);border:1px solid var(--color-border);
  border-radius:8px;padding:2px;gap:2px}
.pl-seg button{border:0;background:transparent;font:inherit;font-size:12px;font-weight:600;
  color:var(--color-text-secondary);padding:6px 12px;border-radius:6px;cursor:pointer;min-height:32px}
.pl-seg button.on{background:var(--color-surface);color:var(--color-primary-dark);
  box-shadow:0 1px 3px rgba(10,20,40,.14)}
.pl-mini{border:1px solid var(--color-border);background:var(--color-surface);border-radius:8px;
  font:inherit;font-size:11.5px;font-weight:600;color:var(--color-text-secondary);padding:6px 10px;
  cursor:pointer;min-height:32px}
.pl-mini:hover{border-color:var(--color-primary);color:var(--color-primary)}
.pl-mini.on{background:var(--color-primary-light);border-color:var(--color-primary);
  color:var(--color-primary-dark)}
.pl-mini:disabled{opacity:.45;cursor:not-allowed}
.pl-lab{font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  color:var(--color-text-secondary)}
.pl-num{width:64px;padding:6px 8px;border:1px solid var(--color-border);border-radius:7px;
  font-family:var(--font-mono,ui-monospace,monospace);font-size:12.5px;
  font-variant-numeric:tabular-nums;background:var(--color-surface);color:var(--color-text);
  min-height:32px}
.pl-sel{padding:6px 8px;border:1px solid var(--color-border);border-radius:7px;font:inherit;
  font-size:12px;background:var(--color-surface);color:var(--color-text);min-height:32px;
  max-width:100%;min-width:0}
.pl-div{width:1px;align-self:stretch;background:var(--color-border);margin:0 2px}

/* ── Band 4: palette · canvas · properties ── */
.pl-stage{display:grid;grid-template-columns:188px minmax(0,1fr) 288px;gap:9px;align-items:start}
@media (max-width:1240px){.pl-stage{grid-template-columns:168px minmax(0,1fr)}
  .pl-props{grid-column:1/-1}}
@media (max-width:820px){.pl-stage{grid-template-columns:1fr}}
.pl-panel{background:var(--color-surface);border:1px solid var(--color-border);border-radius:11px;
  overflow:hidden}
.pl-panel-h{font-size:9.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
  color:var(--color-text-secondary);padding:9px 11px 6px}
.pl-pal{display:flex;flex-direction:column;gap:5px;padding:0 8px 9px}
.pl-item{display:flex;align-items:center;gap:8px;width:100%;text-align:left;cursor:grab;
  border:1px solid var(--color-border);border-radius:9px;background:var(--color-surface);
  padding:7px 8px;font:inherit;min-height:44px}
.pl-item:hover{border-color:var(--color-primary);background:var(--color-primary-light)}
.pl-item:active{cursor:grabbing}
.pl-sw{width:15px;height:15px;border-radius:4px;flex:none;border:2px solid}
.pl-item-t{font-size:12px;font-weight:650;line-height:1.2}
.pl-item-d{font-size:10px;color:var(--color-text-secondary);font-variant-numeric:tabular-nums}
.pl-canvas{display:block;width:100%;height:auto;touch-action:none;background:var(--color-surface);
  border-radius:11px}
.pl-canvas:focus-visible{outline:3px solid var(--color-info);outline-offset:2px}

/* ── The properties panel ── */
.pl-props{padding:0 11px 11px}
.pl-f{margin-bottom:8px}
.pl-f>label{display:block;font-size:9.5px;font-weight:700;letter-spacing:.07em;
  text-transform:uppercase;color:var(--color-text-secondary);margin-bottom:3px}
.pl-f>label .h{text-transform:none;letter-spacing:0;font-weight:500;opacity:.78;margin-left:5px}
.pl-in{width:100%;padding:7px 9px;border:1px solid var(--color-border);border-radius:8px;
  font:inherit;font-size:12.5px;background:var(--color-surface);color:var(--color-text);
  min-height:36px}
.pl-in.mono{font-family:var(--font-mono,ui-monospace,monospace);font-variant-numeric:tabular-nums}
.pl-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.pl-dirs{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}
.pl-dirs button{border:1px solid var(--color-border);background:var(--color-surface);border-radius:7px;
  font:inherit;font-size:12px;font-weight:650;padding:7px 0;cursor:pointer;min-height:36px;
  color:var(--color-text-secondary)}
.pl-dirs button.on{background:var(--color-danger-bg);border-color:var(--color-danger);
  color:var(--color-danger)}
.pl-fact{display:flex;justify-content:space-between;gap:8px;font-size:11.5px;padding:4px 0;
  border-bottom:1px dashed var(--color-border-soft)}
.pl-fact b{font-weight:650;font-variant-numeric:tabular-nums}
.pl-note{font-size:11px;line-height:1.5;color:var(--color-text-secondary);margin:7px 0 0}
.pl-danger{width:100%;margin-top:9px;border:1px solid var(--color-danger);background:var(--color-danger-bg);
  color:var(--color-danger);border-radius:8px;font:inherit;font-size:12px;font-weight:650;
  padding:8px;cursor:pointer;min-height:38px}
.pl-empty{font-size:11.5px;line-height:1.55;color:var(--color-text-secondary)}

/* ── Band 5: findings, schedule, the standard ── */
.pl-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(288px,1fr));gap:8px;
  margin-top:10px}
.pl-card{border:1px solid;border-left-width:4px;border-radius:9px;padding:9px 12px}
.pl-card.stop{border-color:var(--color-danger);background:var(--color-danger-bg)}
.pl-card.warn{border-color:var(--color-warning);background:var(--color-warning-bg)}
.pl-card.clear{border-color:var(--color-success);background:var(--color-success-bg)}
.pl-card b{display:block;font-size:12px;font-weight:750;margin-bottom:3px}
.pl-card.stop b{color:var(--color-danger)} .pl-card.warn b{color:var(--color-warning)}
.pl-card.clear b{color:var(--color-success)}
.pl-card p{font-size:11.5px;line-height:1.55;margin:0;color:var(--color-text)}
.pl-card ul{margin:4px 0 0;padding-left:17px;font-size:11px;line-height:1.6;
  color:var(--color-text-secondary)}
.pl-sec{font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  color:var(--color-text-secondary);margin:16px 0 7px}
.pl-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.pl-tbl th{text-align:left;font-size:9.5px;font-weight:700;letter-spacing:.07em;
  text-transform:uppercase;color:var(--color-text-secondary);padding:6px 9px;
  border-bottom:1px solid var(--color-border);white-space:nowrap}
.pl-tbl td{padding:6px 9px;border-bottom:1px solid var(--color-border-soft);
  font-variant-numeric:tabular-nums}
.pl-tbl tr:last-child td{border-bottom:0}
.pl-pill{display:inline-block;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;
  border:1px solid}
.pl-basis{font-size:10.5px;line-height:1.6;color:var(--color-text-secondary);margin:9px 0 0;
  max-width:96ch}
.pl-legend{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:8px}
.pl-lg{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;
  color:var(--color-text-secondary)}
.pl-lg i{width:13px;height:13px;border-radius:3px;border:2px solid;display:inline-block}

@media print{
  .pl-top,.pl-strip,.pl-panel-h,.pl-pal,.pl-props,.pl-legend{display:none!important}
  .pl-stage{display:block}
  .pl-bar{position:static;box-shadow:none;page-break-inside:avoid}
  .pl-panel{border-color:#999}
  .pl-cards,.pl-tbl{page-break-inside:avoid}
  .pl-sec{page-break-after:avoid}
  .pl-basis{font-size:9.5px}
  .pl{max-width:none}
}
`

// ── Geometry of the drawing surface ─────────────────────────────────────
//
// The viewBox is close to the rendered pixel width on purpose. A viewBox far
// larger than its container scales the text down with it, and 8 px labels on a
// drawing are worse than no labels.
const VW = 900
const VH = 580
const PAD = 52

type Sel = { kind: 'item'; id: number } | { kind: 'cable'; id: number } | null

type Snapshot = { items: LayoutItem[]; cables: Cable[] }

/** The example the page opens with. P5 — an empty form teaches nothing. */
function example(): Snapshot {
  return {
    items: [
      { id: 1, kind: 'gen', x: 2, y: 12, dir: 'N', label: 'Generator', kva: 2500, pf: 0.8, volts: 400 },
      { id: 2, kind: 'panel', x: 11, y: 7, dir: 'E', label: 'Distribution panel', kva: 0, pf: 0.8, volts: 400 },
      { id: 3, kind: 'lb', x: 12.5, y: 2, dir: 'E', label: 'Load bank 1 MW', kva: 1000, pf: 1, volts: 400 },
      { id: 4, kind: 'lb', x: 12.5, y: 11, dir: 'E', label: 'Load bank 1 MW #2', kva: 1000, pf: 1, volts: 400 },
      { id: 5, kind: 'door', x: 21, y: 0, dir: 'E', label: 'Door / louvre', kva: 0, pf: 0.8, volts: 400 },
    ],
    cables: [
      { id: 1, fromId: 1, toId: 2, csa: 400, lengthM: null, circuits: 1, runs: 6 },
      { id: 2, fromId: 2, toId: 3, csa: 240, lengthM: null, circuits: 1, runs: 4 },
      { id: 3, fromId: 2, toId: 4, csa: 400, lengthM: null, circuits: 1, runs: 4 },
    ],
  }
}

function f(v: number, d?: number) {
  if (!isFinite(v)) return '—'
  const p = d === undefined ? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2) : d
  return v.toLocaleString('en-GB', { minimumFractionDigits: p, maximumFractionDigits: p })
}

/** Mid-edge connection points, in metres. One per side. */
function nubs(it: LayoutItem): { dir: Dir; x: number; y: number }[] {
  const r = rectOf(it)
  return [
    { dir: 'N', x: r.x + r.w / 2, y: r.y },
    { dir: 'E', x: r.x + r.w, y: r.y + r.h / 2 },
    { dir: 'S', x: r.x + r.w / 2, y: r.y + r.h },
    { dir: 'W', x: r.x, y: r.y + r.h / 2 },
  ]
}

/**
 * Roughly how wide a string will be, so a label box can be sized to its text.
 *
 * SVG cannot measure text before it is drawn, and getComputedTextLength needs
 * a live DOM. This is deliberately generous — a box slightly too big is
 * invisible; a box too small has the text hanging out of it, which reads as a
 * broken drawing.
 */
function tw(s: string, size: number, bold: boolean): number {
  return s.length * size * (bold ? 0.575 : 0.535)
}

/** Stroke width reads the size of the feeder — a big cable looks like one. */
function strokeFor(csa: number, runs: number): number {
  const mm = csa * Math.max(1, runs)
  return Math.max(1.8, Math.min(7, 1.6 + Math.log10(Math.max(1, mm)) * 1.35))
}

export default function PlannerPage() {
  const start = useMemo(() => example(), [])
  const [items, setItems] = useState<LayoutItem[]>(start.items)
  const [cables, setCables] = useState<Cable[]>(start.cables)
  const [roomW, setRoomW] = useState(24)
  const [roomD, setRoomD] = useState(16)
  const [view, setView] = useState<'plan' | 'single'>('plan')
  const [sel, setSel] = useState<Sel>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [showZones, setShowZones] = useState(true)
  const [showGrid, setShowGrid] = useState(true)
  const [ambientC, setAmbientC] = useState(35)
  const [vdId, setVdId] = useState('iec-b')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [touched, setTouched] = useState(false)
  const [png, setPng] = useState<string | null>(null)

  const nextItem = useRef(6)
  const nextCable = useRef(4)
  const svgRef = useRef<SVGSVGElement>(null)
  const worldRef = useRef<SVGGElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  // Undo is state rather than a ref, so the button can be disabled when there
  // is nothing to undo. A ref read during render would not re-render with it.
  const [history, setHistory] = useState<Snapshot[]>([])

  // Dragging an item, and drawing a cable, are the two live gestures.
  const [drawing, setDrawing] = useState<{ fromId: number; x: number; y: number } | null>(null)

  const guidance = VD_GUIDANCE.find((g) => g.id === vdId) ?? VD_GUIDANCE[1]
  const opts: LayoutOptions = useMemo(
    () => ({ ambientC, voltDropGuidance: guidance.other }),
    [ambientC, guidance.other]
  )

  // ── Derived, on every keystroke and every pixel of every drag ──────────
  const results = useMemo(
    () => cables.map((c) => cableResult(items, cables, c, opts)).filter((r): r is CableResult => r !== null),
    [items, cables, opts]
  )
  const findings = useMemo(
    () => layoutFindings(items, cables, roomW, roomD, opts),
    [items, cables, roomW, roomD, opts]
  )
  const sum = useMemo(
    () => summarise(items, cables, roomW, roomD, opts),
    [items, cables, roomW, roomD, opts]
  )
  const feederOf = useMemo(() => {
    const m = new Map<number, CableResult>()
    for (const r of results) m.set(r.to.id, r)
    return m
  }, [results])
  /** Which items a finding names, so the box can carry a glyph. */
  const flagged = useMemo(() => {
    const s = new Set<number>()
    for (const fd of findings)
      for (const it of items)
        if (fd.title.includes(it.label)) s.add(it.id)
    return s
  }, [findings, items])

  const selItem = sel?.kind === 'item' ? items.find((i) => i.id === sel.id) ?? null : null
  const selCable = sel?.kind === 'cable' ? cables.find((c) => c.id === sel.id) ?? null : null
  const selResult = selCable ? results.find((r) => r.cable.id === selCable.id) ?? null : null

  // ── Undo ───────────────────────────────────────────────────────────────
  const remember = useCallback(() => {
    setHistory((h) => [...h.slice(-29), { items, cables }])
    setTouched(true)
  }, [items, cables])

  /** Drop the snapshot a gesture took when the gesture turned out to be a no-op. */
  const forget = useCallback(() => setHistory((h) => h.slice(0, -1)), [])

  function undo() {
    setHistory((h) => {
      const prev = h[h.length - 1]
      if (!prev) return h
      setItems(prev.items)
      setCables(prev.cables)
      setSel(null)
      return h.slice(0, -1)
    })
  }

  // ── Scale. Computed to fit the room with a margin. ──────────────────────
  const sc = Math.min((VW - PAD * 2) / roomW, (VH - PAD * 2) / roomD)
  const ox = (VW - roomW * sc) / 2
  const oy = (VH - roomD * sc) / 2
  const X = (m: number) => ox + m * sc
  const Y = (m: number) => oy + m * sc

  /** Client coordinates to metres, through whatever transform is on the world. */
  const toM = useCallback((ev: { clientX: number; clientY: number }) => {
    const svg = svgRef.current
    const world = worldRef.current
    if (!svg || !world) return { x: 0, y: 0 }
    const m = world.getScreenCTM()
    if (!m) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = ev.clientX
    pt.y = ev.clientY
    const p = pt.matrixTransform(m.inverse())
    return { x: (p.x - ox) / sc, y: (p.y - oy) / sc }
  }, [ox, oy, sc])

  // ── Placing ────────────────────────────────────────────────────────────
  function place(kind: ItemKind, at?: { x: number; y: number }) {
    remember()
    setItems((prev) => {
      // Click to add walks along a diagonal so a second item does not land on
      // the first. Drag from the palette uses where it was dropped.
      const raw = at ?? { x: 1 + ((prev.length * 1.6) % Math.max(1, roomW - 8)), y: 1 + ((prev.length * 1.3) % Math.max(1, roomD - 4)) }
      const p = clampToRoom(raw.x, raw.y, kind, roomW, roomD)
      const it: LayoutItem = {
        id: nextItem.current++, kind, x: p.x, y: p.y, dir: 'E',
        label: nameFor(kind, prev),
        kva: kind === 'gen' ? 2000 : kind === 'lb' ? 1000 : kind === 'lb500' ? 500 : kind === 'lbv' ? 500 : 0,
        pf: ITEMS[kind].role === 'load' ? 1 : 0.8,
        volts: 400,
      }
      setSel({ kind: 'item', id: it.id })
      return [...prev, it]
    })
  }

  function removeItem(id: number) {
    remember()
    setItems((prev) => prev.filter((i) => i.id !== id))
    // Deleting an item deletes its cables — a cable to nothing is not a cable.
    setCables((prev) => prev.filter((c) => c.fromId !== id && c.toId !== id))
    setSel(null)
  }

  function patchItem(id: number, p: Partial<LayoutItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)))
    setTouched(true)
  }
  function patchCable(id: number, p: Partial<Cable>) {
    setCables((prev) => prev.map((c) => (c.id === id ? { ...c, ...p } : c)))
    setTouched(true)
  }

  // ── Dragging an item ───────────────────────────────────────────────────
  function onItemDown(e: React.PointerEvent, id: number) {
    if (view !== 'plan') { setSel({ kind: 'item', id }); return }
    e.preventDefault()
    e.stopPropagation()
    setSel({ kind: 'item', id })
    const it = items.find((x) => x.id === id)
    if (!it) return
    remember()
    const s = toM(e)
    const ix = it.x, iy = it.y
    let moved = false
    const move = (ev: PointerEvent) => {
      const m = toM(ev)
      if (!moved && Math.abs(m.x - s.x) < 0.05 && Math.abs(m.y - s.y) < 0.05) return
      moved = true
      // A held modifier drops the snap for a fine placement.
      const fine = ev.shiftKey || ev.altKey
      const nx = ix + (m.x - s.x), ny = iy + (m.y - s.y)
      const p = fine
        ? { x: Math.max(0, Math.min(roomW - ITEMS[it.kind].w, nx)), y: Math.max(0, Math.min(roomD - ITEMS[it.kind].h, ny)) }
        : clampToRoom(nx, ny, it.kind, roomW, roomD)
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, x: p.x, y: p.y } : x)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (!moved) forget()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ── Drawing a cable ────────────────────────────────────────────────────
  //
  // The gesture that turns a floor plan into a calculation.
  function onNubDown(e: React.PointerEvent, fromId: number) {
    e.preventDefault()
    e.stopPropagation()
    const s = toM(e)
    setDrawing({ fromId, x: s.x, y: s.y })
    const move = (ev: PointerEvent) => {
      const m = toM(ev)
      setDrawing({ fromId, x: m.x, y: m.y })
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const m = toM(ev)
      const hit = items.find((it) => {
        const r = rectOf(it)
        return m.x >= r.x - 0.4 && m.x <= r.x + r.w + 0.4 && m.y >= r.y - 0.4 && m.y <= r.y + r.h + 0.4
      })
      setDrawing(null)
      if (hit && validTarget(fromId, hit.id)) connect(fromId, hit.id)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /**
   * Why a target may be refused.
   *
   * A loop is refused because downstream load would be undefined and every
   * figure on the drawing would be meaningless. A second supply into one item
   * is refused in version one because the tool has no way to say how the two
   * share, and guessing would be worse than saying no.
   */
  function refusal(fromId: number, toId: number): string | null {
    if (fromId === toId) return 'Nothing feeds itself.'
    const to = items.find((i) => i.id === toId)
    if (!to) return 'No such item.'
    if (ITEMS[to.kind].role === 'passive') return 'A door is not an electrical item.'
    if (ITEMS[to.kind].role === 'source') return 'A source is fed by its prime mover, not by a cable on this drawing.'
    if (cables.some((c) => c.toId === toId)) return 'It already has a supply. Dual-fed distribution is planned, not built — the tool cannot say how two supplies would share, so it will not pretend.'
    if (cables.some((c) => c.fromId === fromId && c.toId === toId)) return 'That cable already exists.'
    if (wouldCycle(cables, fromId, toId)) return 'That would close a ring, and downstream load would then be undefined.'
    return null
  }
  const validTarget = (a: number, b: number) => refusal(a, b) === null

  function connect(fromId: number, toId: number) {
    remember()
    const id = nextCable.current++
    // The size is suggested from what the cable will actually carry once it
    // exists, not from nothing. Runs come first: a 400 V load bank feeder is
    // several conductors per phase in any real installation.
    const trial: Cable = { id, fromId, toId, csa: 240, lengthM: null, circuits: 1, runs: 1 }
    const next = [...cables, trial]
    const from = items.find((i) => i.id === fromId)
    const kva = downstreamKva(items, next, toId)
    const volts = from && from.volts > 0 ? from.volts : 400
    const current = (kva * 1000) / (Math.sqrt(3) * volts)
    let runs = 1
    let csa = suggestCsa(current, ambientC, 1, runs)
    while (csa === null && runs < 8) {
      runs += 1
      csa = suggestCsa(current, ambientC, 1, runs)
    }
    setCables([...cables, { ...trial, runs, csa: csa ?? CSA_OPTIONS[CSA_OPTIONS.length - 1] }])
    setSel({ kind: 'cable', id })
  }

  function removeCable(id: number) {
    remember()
    setCables((prev) => prev.filter((c) => c.id !== id))
    setSel(null)
  }

  // ── Keyboard ───────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return
      if (sel?.kind === 'cable' && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault(); removeCable(sel.id); return
      }
      if (sel?.kind !== 'item') return
      const it = items.find((i) => i.id === sel.id)
      if (!it) return
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeItem(it.id); return }
      if (e.key === 'Enter') { e.preventDefault(); nameRef.current?.focus(); return }
      const step = e.shiftKey ? 1 : 0.25
      const d: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      }
      const v = d[e.key]
      if (!v) return
      e.preventDefault()
      const p = clampToRoom(it.x + v[0], it.y + v[1], it.kind, roomW, roomD)
      patchItem(it.id, p)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── Panning on empty canvas ────────────────────────────────────────────
  function onStageDown(e: React.PointerEvent) {
    setSel(null)
    if (zoom === 1) return
    const sx = e.clientX, sy = e.clientY
    const p0 = { ...pan }
    const move = (ev: PointerEvent) => setPan({ x: p0.x + (ev.clientX - sx), y: p0.y + (ev.clientY - sy) })
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ── PNG export ─────────────────────────────────────────────────────────
  //
  // Serialised from the live SVG, so the picture in the report is the picture
  // on the screen. The palette is literal hex for exactly this reason.
  function exportPng() {
    const svg = svgRef.current
    if (!svg) return
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('width', String(VW * 2))
    clone.setAttribute('height', String(VH * 2))
    const xml = new XMLSerializer().serializeToString(clone)
    const img = new Image()
    img.onload = () => {
      const cv = document.createElement('canvas')
      cv.width = VW * 2
      cv.height = VH * 2
      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, cv.width, cv.height)
      ctx.drawImage(img, 0, 0)
      setPng(cv.toDataURL('image/png'))
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
  }

  const worst = sum.blocking > 0 ? 'bad' : sum.advisory > 0 ? 'warn' : 'good'

  // ══════════════════════════════════════════════════════════════════════
  // THE DRAWING — room plan
  // ══════════════════════════════════════════════════════════════════════
  /**
   * The geometry of one cable on the plan, worked out once and used by both
   * the line and its label. Labels are drawn in a SEPARATE PASS after the
   * equipment, so a label is never half-hidden behind a box it happens to run
   * past — an annotation belongs on top of the thing it annotates.
   */
  function geom(r: CableResult) {
    const a = centreOf(r.from), b = centreOf(r.to)
    const ax = X(a.x), ay = Y(a.y), bx = X(b.x), by = Y(b.y)
    // Orthogonal, along the floor: horizontal then vertical. The drawn route
    // and the measured length are the same route — |dx| + |dy|.
    const d = `M ${ax} ${ay} L ${bx} ${ay} L ${bx} ${by}`
    // The route is two legs. Which one carries the label is decided by how
    // much of each is actually VISIBLE — the horizontal leg starts underneath
    // the box it leaves, the vertical one ends underneath the box it arrives
    // at, and a label written across a load bank is not a label.
    const legH = Math.abs(bx - ax), legV = Math.abs(by - ay)
    const fr = rectOf(r.from), tr = rectOf(r.to)
    const buriedH = (fr.w / 2) * sc
    const buriedV = (tr.h / 2) * sc
    const usableH = legH - buriedH - 8
    const usableV = legV - buriedV - 8
    const vertical = usableV >= usableH
    const usable = vertical ? usableV : usableH

    const l1 = `${describeCable(r.cable.csa, r.runs)} · ${f(r.current, 0)} A`
    const l2 = `${f(r.lengthM, 1)} m${r.measured ? '' : ' typed'} · ${f(r.voltDropPct, 2)} % · ${f(r.loadingPct, 0)} %`
    const ls = `${r.runs > 1 ? r.runs + '×' : ''}${r.cable.csa} · ${f(r.loadingPct, 0)} %`
    const fullW = Math.max(tw(l1, 10, true), tw(l2, 9, false)) + 13
    const shortW = tw(ls, 10, true) + 12
    // A label that does not fit is not drawn. One spilling across the room
    // wall, or out from under a load bank, reads as a drawing error and
    // undermines everything else on the page.
    const detail: 'full' | 'short' | 'none' =
      fullW < usable ? 'full' : shortW < usable ? 'short' : 'none'
    const lw = detail === 'full' ? fullW : shortW
    const lh = detail === 'full' ? 27 : 16
    // Beside the cable, never on top of it. After rotate(-90) a positive local
    // y lands to the RIGHT of a vertical run; with no rotation a negative one
    // sits ABOVE a horizontal one.
    const ty = vertical ? 7 : -(7 + lh)
    // Centred on the VISIBLE part of the leg, which means backing away from
    // the box the cable lands on.
    const lx = vertical ? bx : (ax + bx) / 2 + Math.sign(bx - ax) * buriedH / 2
    const ly = vertical ? (ay + by) / 2 - Math.sign(by - ay) * buriedV / 2 : ay
    const head = legV > 0.5
      ? { x: bx, y: by - Math.sign(by - ay) * 9, r: by > ay ? 90 : 270 }
      : { x: bx - Math.sign(bx - ax) * 9, y: by, r: bx > ax ? 0 : 180 }
    return { d, vertical, detail, lw, lh, ty, lx, ly, head, l1, l2, ls }
  }

  function planCables() {
    return results.map((r) => {
      const g = geom(r)
      const band = BAND[r.band]
      const on = sel?.kind === 'cable' && sel.id === r.cable.id
      return (
        <g key={r.cable.id} onPointerDown={(e) => { e.stopPropagation(); setSel({ kind: 'cable', id: r.cable.id }) }}
          style={{ cursor: 'pointer' }}>
          <path d={g.d} fill="none" stroke="transparent" strokeWidth={16} />
          {on && <path d={g.d} fill="none" stroke={C.sel} strokeWidth={strokeFor(r.cable.csa, r.runs) + 5}
            strokeLinejoin="round" opacity={0.28} />}
          <path d={g.d} fill="none" stroke={band.c} strokeWidth={strokeFor(r.cable.csa, r.runs)}
            strokeLinejoin="round" strokeLinecap="round" />
          {/* The arrowhead sits at the load end: the direction is meaningful. */}
          <polygon points="0,-5 10,0 0,5" fill={band.c}
            transform={`translate(${g.head.x} ${g.head.y}) rotate(${g.head.r})`} />
        </g>
      )
    })
  }

  function planCableLabels() {
    return results.map((r) => {
      const g = geom(r)
      const on = sel?.kind === 'cable' && sel.id === r.cable.id
      const detail = g.detail === 'none' && on ? 'short' : g.detail
      if (detail === 'none') return null
      const band = BAND[r.band]
      const lw = detail === 'full' ? g.lw : tw(g.ls, 10, true) + 12
      const lh = detail === 'full' ? 27 : 16
      const ty = g.vertical ? 7 : -(7 + lh)
      return (
        <g key={r.cable.id} style={{ cursor: 'pointer' }}
          onPointerDown={(e) => { e.stopPropagation(); setSel({ kind: 'cable', id: r.cable.id }) }}
          transform={g.vertical ? `translate(${g.lx} ${g.ly}) rotate(-90)` : `translate(${g.lx} ${g.ly})`}>
          <rect x={-lw / 2} y={ty} width={lw} height={lh} rx={4}
            fill={C.surface} stroke={band.c} strokeWidth={1} opacity={0.97} />
          <text x={0} y={ty + 11.5} textAnchor="middle" fontSize={10} fontWeight={700} fill={band.c}>
            {detail === 'full' ? g.l1 : g.ls}
          </text>
          {detail === 'full' && (
            <text x={0} y={ty + 22} textAnchor="middle" fontSize={9} fill={C.dim}>{g.l2}</text>
          )}
        </g>
      )
    })
  }

  function planItems() {
    return items.map((it) => {
      const s = ITEMS[it.kind]
      const r = rectOf(it)
      const px = X(r.x), py = Y(r.y), pw = r.w * sc, ph = r.h * sc
      const on = sel?.kind === 'item' && sel.id === it.id
      const feeder = feederOf.get(it.id)
      const carried = downstreamKva(items, cables, it.id)
      let tone = TONE[s.tone]
      let pct: number | null = null
      let pctLabel = ''
      if (s.role === 'source' && it.kva > 0) {
        pct = (carried / it.kva) * 100
        pctLabel = `${f(pct, 0)} % of ${f(it.kva, 0)} kVA`
        tone = { c: BAND[bandFor(pct)].c, wash: BAND[bandFor(pct)].wash }
      } else if (feeder) {
        pct = feeder.loadingPct
        pctLabel = `feeder ${f(pct, 0)} %`
        tone = { c: BAND[feeder.band].c, wash: BAND[feeder.band].wash }
      }
      const showName = pw > 44 && ph > 15
      const showMore = pw > 78 && ph > 30
      const valid = drawing ? validTarget(drawing.fromId, it.id) : null
      return (
        <g key={it.id} tabIndex={0} role="button"
          aria-label={`${it.label}, ${f(r.w, 1)} by ${f(r.h, 1)} metres at ${f(it.x, 1)}, ${f(it.y, 1)}${pctLabel ? ', ' + pctLabel : ''}`}
          onFocus={() => setSel({ kind: 'item', id: it.id })}
          onPointerDown={(e) => onItemDown(e, it.id)}
          onPointerEnter={() => setHover(it.id)}
          onPointerLeave={() => setHover((h) => (h === it.id ? null : h))}
          style={{ cursor: 'grab' }}>
          {drawing && drawing.fromId !== it.id && (
            <rect x={px - 5} y={py - 5} width={pw + 10} height={ph + 10} rx={7} fill="none"
              stroke={valid ? C.ok : C.border} strokeWidth={valid ? 3 : 2}
              strokeDasharray={valid ? '7 4' : '3 4'} opacity={valid ? 0.95 : 0.5} />
          )}
          {on && <rect x={px - 4} y={py - 4} width={pw + 8} height={ph + 8} rx={6} fill="none"
            stroke={C.sel} strokeWidth={2.5} />}
          <rect x={px} y={py} width={pw} height={ph} rx={3} fill={tone.wash} stroke={tone.c} strokeWidth={2} />
          {showName && (
            <text x={px + pw / 2} y={py + (showMore ? 15 : ph / 2 + 3.5)} textAnchor="middle"
              fontSize={showMore ? 11 : 9.5} fontWeight={700} fill={tone.c}>
              {pw > 120 ? it.label : s.short}
            </text>
          )}
          {showMore && (
            <>
              <text x={px + pw / 2} y={py + 28} textAnchor="middle" fontSize={9.5} fill={C.text}>
                {s.role === 'load' ? `${f(it.kva, 0)} kVA` : s.role === 'source' ? `${f(it.kva, 0)} kVA · ${f(it.pf, 2)} pf` : `carries ${f(carried, 0)} kVA`}
              </text>
              {pctLabel && (
                <text x={px + pw / 2} y={py + 40} textAnchor="middle" fontSize={9} fontWeight={700} fill={tone.c}>
                  {pctLabel}
                </text>
              )}
            </>
          )}
          {/* A distribution panel is 1.2 × 0.6 m — at any sane scale it is far
              too small to hold its own name. An unlabelled box on a drawing is
              a question mark, so the label goes outside it on a leader. */}
          {!showName && (() => {
            const txt = `${it.label}${s.role === 'distribution' ? ` · ${f(carried, 0)} kVA` : ''}`
            // Above the box, not beside it. A cable leaves an item from its
            // centre height, so a label at centre height sits on the cable.
            // Clear of the box by more than a cable label is tall, because a
            // cable leaving sideways puts its own label immediately above the
            // centre line and the two would sit on each other.
            const above = py - 32 > 2
            const ly2 = above ? py - 22 : py + ph + 30
            const w = tw(txt, 9.5, true)
            const cx = Math.max(w / 2 + 2, Math.min(VW - w / 2 - 2, px + pw / 2))
            return (
              <>
                <rect x={cx - w / 2 - 3} y={ly2 - 9} width={w + 6} height={12} rx={3}
                  fill={C.surface} opacity={0.9} />
                <text x={cx} y={ly2} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={tone.c}>
                  {txt}
                </text>
              </>
            )
          })()}
          {flagged.has(it.id) && (
            <g transform={`translate(${px + pw - 9} ${py + 9})`}>
              <circle r={7.5} fill={C.over} />
              <text y={3.4} textAnchor="middle" fontSize={11} fontWeight={800} fill="#fff">!</text>
            </g>
          )}
          {(hover === it.id || on) && !drawing && ITEMS[it.kind].role !== 'passive' && nubs(it).map((n) => (
            <g key={n.dir} onPointerDown={(e) => onNubDown(e, it.id)} style={{ cursor: 'crosshair' }}>
              <circle cx={X(n.x)} cy={Y(n.y)} r={13} fill="transparent" />
              <circle cx={X(n.x)} cy={Y(n.y)} r={5} fill={C.surface} stroke={C.info} strokeWidth={2.4} />
            </g>
          ))}
        </g>
      )
    })
  }

  function planZones() {
    if (!showZones) return null
    return items.map((it) => {
      const z = zonesOf(it)
      if (!z) return null
      const s = ITEMS[it.kind]
      return (
        <g key={it.id} pointerEvents="none">
          {s.discharge > 0 && (
            <rect x={X(z.discharge.x)} y={Y(z.discharge.y)} width={z.discharge.w * sc} height={z.discharge.h * sc}
              fill="url(#pl-hot)" stroke={C.over} strokeWidth={1} strokeDasharray="4 3" opacity={0.85} />
          )}
          {s.intake > 0 && (
            <rect x={X(z.intake.x)} y={Y(z.intake.y)} width={z.intake.w * sc} height={z.intake.h * sc}
              fill="url(#pl-cool)" stroke={C.info} strokeWidth={1} strokeDasharray="4 3" opacity={0.8} />
          )}
        </g>
      )
    })
  }

  function grid() {
    if (!showGrid) return null
    const lines = []
    for (let m = 0; m <= Math.floor(roomW); m++)
      lines.push(<line key={'v' + m} x1={X(m)} y1={Y(0)} x2={X(m)} y2={Y(roomD)}
        stroke={m % 5 === 0 ? C.border : C.soft} strokeWidth={m % 5 === 0 ? 1.2 : 0.7} />)
    for (let m = 0; m <= Math.floor(roomD); m++)
      lines.push(<line key={'h' + m} x1={X(0)} y1={Y(m)} x2={X(roomW)} y2={Y(m)}
        stroke={m % 5 === 0 ? C.border : C.soft} strokeWidth={m % 5 === 0 ? 1.2 : 0.7} />)
    return <g pointerEvents="none">{lines}</g>
  }

  // ══════════════════════════════════════════════════════════════════════
  // THE DRAWING — single line, from the same model
  // ══════════════════════════════════════════════════════════════════════
  function single() {
    const pos = singleLinePositions(items, cables)
    const BW = 128, BH = 44, ROW = 132
    const at = new Map<number, { x: number; y: number }>()
    for (const p of pos) {
      const span = (VW - PAD * 2) / p.of
      at.set(p.id, { x: PAD + span * (p.col + 0.5), y: PAD + 22 + p.row * ROW })
    }
    return (
      <g>
        {results.map((r) => {
          const a = at.get(r.from.id), b = at.get(r.to.id)
          if (!a || !b) return null
          const band = BAND[r.band]
          const busY = a.y + BH / 2 + 44
          const d = `M ${a.x} ${a.y + BH / 2} L ${a.x} ${busY} L ${b.x} ${busY} L ${b.x} ${b.y - BH / 2}`
          const on = sel?.kind === 'cable' && sel.id === r.cable.id
          return (
            <g key={r.cable.id} style={{ cursor: 'pointer' }}
              onPointerDown={(e) => { e.stopPropagation(); setSel({ kind: 'cable', id: r.cable.id }) }}>
              <path d={d} fill="none" stroke="transparent" strokeWidth={16} />
              {on && <path d={d} fill="none" stroke={C.sel} strokeWidth={strokeFor(r.cable.csa, r.runs) + 5} opacity={0.28} />}
              <path d={d} fill="none" stroke={band.c} strokeWidth={strokeFor(r.cable.csa, r.runs)} strokeLinejoin="round" />
              <polygon points="0,-5 10,0 0,5" fill={band.c}
                transform={`translate(${b.x} ${b.y - BH / 2 - 9}) rotate(90)`} />
              <text x={b.x + 9} y={b.y - BH / 2 - 26} fontSize={10} fontWeight={700} fill={band.c}>
                {describeCable(r.cable.csa, r.runs)}
              </text>
              <text x={b.x + 9} y={b.y - BH / 2 - 15} fontSize={9} fill={C.dim}>
                {`${f(r.current, 0)} A · ${f(r.voltDropPct, 2)} % · ${f(r.loadingPct, 0)} %`}
              </text>
            </g>
          )
        })}
        {items.map((it) => {
          const p = at.get(it.id)
          if (!p) return null
          const s = ITEMS[it.kind]
          const on = sel?.kind === 'item' && sel.id === it.id
          const feeder = feederOf.get(it.id)
          const carried = downstreamKva(items, cables, it.id)
          let tone = TONE[s.tone]
          let pctLabel = ''
          if (s.role === 'source' && it.kva > 0) {
            const pct = (carried / it.kva) * 100
            tone = { c: BAND[bandFor(pct)].c, wash: BAND[bandFor(pct)].wash }
            pctLabel = `${f(pct, 0)} % of rating`
          } else if (feeder) {
            tone = { c: BAND[feeder.band].c, wash: BAND[feeder.band].wash }
            pctLabel = `feeder ${f(feeder.loadingPct, 0)} %`
          }
          return (
            <g key={it.id} tabIndex={0} role="button" aria-label={`${it.label}${pctLabel ? ', ' + pctLabel : ''}`}
              onFocus={() => setSel({ kind: 'item', id: it.id })}
              onPointerDown={(e) => { e.stopPropagation(); setSel({ kind: 'item', id: it.id }) }}
              style={{ cursor: 'pointer' }}>
              {on && <rect x={p.x - BW / 2 - 4} y={p.y - BH / 2 - 4} width={BW + 8} height={BH + 8} rx={7}
                fill="none" stroke={C.sel} strokeWidth={2.5} />}
              <rect x={p.x - BW / 2} y={p.y - BH / 2} width={BW} height={BH} rx={4}
                fill={tone.wash} stroke={tone.c} strokeWidth={2} />
              <text x={p.x} y={p.y - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill={tone.c}>
                {it.label.length > 20 ? s.short : it.label}
              </text>
              <text x={p.x} y={p.y + 7} textAnchor="middle" fontSize={9.5} fill={C.text}>
                {s.role === 'distribution' ? `carries ${f(carried, 0)} kVA` : `${f(it.kva, 0)} kVA${s.role === 'source' ? ` · ${f(it.pf, 2)} pf` : ''}`}
              </text>
              {pctLabel && (
                <text x={p.x} y={p.y + 18} textAnchor="middle" fontSize={9} fontWeight={700} fill={tone.c}>{pctLabel}</text>
              )}
            </g>
          )
        })}
        <text x={PAD} y={26} fontSize={10} fontWeight={700} fill={C.dim}>
          SINGLE LINE — SAME MODEL · lengths inherited from the room plan
        </text>
      </g>
    )
  }

  // ══════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════
  const num = (v: number, set: (n: number) => void, step = 1) => ({
    type: 'number' as const, value: String(v), step,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const n = parseFloat(e.target.value)
      set(isFinite(n) ? n : 0)
      setTouched(true)
    },
  })

  return (
    <div className="pl">
      <style>{STYLES}</style>

      {/* ── 1 · where you are ── */}
      <div className="pl-top">
        <Link href="/knowledge" className="pl-back">← All tools</Link>
        <div>
          <h1 className="pl-h">Room layout planner</h1>
          <p className="pl-sub mono">{AMPACITY_BASIS}</p>
        </div>
        <span className="pl-spacer" />
        <button className="pl-mini" onClick={() => window.print()}>Print</button>
        <button className="pl-mini" onClick={exportPng}>PNG</button>
      </div>

      {/* ── 2 · the summary bar. Sticky, live. ── */}
      <div className="pl-bar">
        <div className="pl-k lead">
          <div className="pl-k-l">Source rating</div>
          <div className="pl-k-v mono">{f(sum.sourceKva, 0)}<span className="pl-k-u"> kVA</span></div>
          <div className="pl-k-n">{(() => { const n = items.filter((i) => ITEMS[i.kind].role === 'source').length
            return n === 0 ? 'no source placed' : n === 1 ? 'one source on the drawing' : `${n} sources on the drawing` })()}</div>
        </div>
        <div className="pl-k">
          <div className="pl-k-l">Connected load</div>
          <div className="pl-k-v mono">{f(sum.connectedKva, 0)}<span className="pl-k-u"> kVA</span></div>
          <div className="pl-k-n">no diversity — a load bank test runs everything at once</div>
        </div>
        <div className={'pl-k ' + (sum.sparePct < 0 ? 'bad' : sum.sparePct < 10 ? 'warn' : 'good')}>
          <div className="pl-k-l">Spare</div>
          <div className="pl-k-v mono">{f(sum.sparePct, 0)}<span className="pl-k-u"> %</span></div>
          <div className="pl-k-n">{sum.sparePct < 0 ? 'more load than source' : 'of the source rating'}</div>
        </div>
        <div className={'pl-k ' + (sum.worstVoltDrop && sum.worstVoltDrop.pct > guidance.other ? 'warn' : '')}>
          <div className="pl-k-l">Worst volt drop</div>
          <div className="pl-k-v mono">{sum.worstVoltDrop ? f(sum.worstVoltDrop.pct, 2) : '—'}<span className="pl-k-u"> %</span></div>
          <div className="pl-k-n">{sum.worstVoltDrop ? sum.worstVoltDrop.label : 'no cables drawn'}</div>
        </div>
        <div className={'pl-k ' + (sum.worstLoading ? (sum.worstLoading.pct > 100 ? 'bad' : sum.worstLoading.pct >= 75 ? 'warn' : 'good') : '')}>
          <div className="pl-k-l">Worst loaded cable</div>
          <div className="pl-k-v mono">{sum.worstLoading ? f(sum.worstLoading.pct, 0) : '—'}<span className="pl-k-u"> %</span></div>
          <div className="pl-k-n">{sum.worstLoading ? sum.worstLoading.label : 'no cables drawn'}</div>
        </div>
        <div className={'pl-k ' + worst}>
          <div className="pl-k-l">Findings</div>
          <div className="pl-k-v mono">{sum.blocking + sum.advisory}</div>
          <div className="pl-k-n">{sum.blocking ? `${sum.blocking} will fail the test` : sum.advisory ? `${sum.advisory} worth looking at` : 'nothing found'}</div>
        </div>
      </div>

      {/* ── 3 · the control strip ── */}
      <div className="pl-strip">
        <div className="pl-seg" role="group" aria-label="View">
          <button className={view === 'plan' ? 'on' : ''} onClick={() => setView('plan')}>Room plan</button>
          <button className={view === 'single' ? 'on' : ''} onClick={() => setView('single')}>Single line</button>
        </div>
        <span className="pl-div" />
        <span className="pl-lab">Room</span>
        <input className="pl-num" {...num(roomW, setRoomW, 0.5)} aria-label="Room width in metres" />
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>×</span>
        <input className="pl-num" {...num(roomD, setRoomD, 0.5)} aria-label="Room depth in metres" />
        <span className="pl-lab">m</span>
        <span className="pl-div" />
        <span className="pl-lab">Ambient</span>
        <input className="pl-num" {...num(ambientC, setAmbientC)} aria-label="Ambient temperature" />
        <span className="pl-lab">°C</span>
        <span className="pl-div" />
        <span className="pl-lab">Volt drop guidance</span>
        <select className="pl-sel" value={vdId} onChange={(e) => setVdId(e.target.value)} aria-label="Volt drop guidance">
          {VD_GUIDANCE.map((g) => <option key={g.id} value={g.id}>{g.label} — {g.other} %</option>)}
        </select>
        <span className="pl-spacer" />
        <button className={'pl-mini' + (showZones ? ' on' : '')} onClick={() => setShowZones(!showZones)}>Clearance zones</button>
        <button className={'pl-mini' + (showGrid ? ' on' : '')} onClick={() => setShowGrid(!showGrid)}>Grid</button>
        <button className="pl-mini" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="Zoom in">+</button>
        <button className="pl-mini" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out">−</button>
        <button className="pl-mini" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}>Fit</button>
        <button className="pl-mini" onClick={undo} disabled={history.length === 0}>Undo</button>
        <button className="pl-mini" onClick={() => { remember(); const e = example(); setItems(e.items); setCables(e.cables); setRoomW(24); setRoomD(16); setSel(null); nextItem.current = 6; nextCable.current = 4 }}>Example</button>
        <button className="pl-mini" onClick={() => { remember(); setItems([]); setCables([]); setSel(null) }}>Clear</button>
      </div>

      {/* Why a target is refused, said in words while the cable is still in the
          air. A greyed-out box on its own teaches nothing. */}
      {drawing && hover !== null && hover !== drawing.fromId && (() => {
        const why = refusal(drawing.fromId, hover)
        const to = items.find((i) => i.id === hover)
        return (
          <div className={'pl-card ' + (why ? 'warn' : 'clear')} style={{ marginBottom: 9 }}>
            <b>{why ? `Cannot feed ${to?.label ?? 'that'}` : `Release to feed ${to?.label ?? ''}`}</b>
            <p>{why ?? 'The cable will size itself from everything downstream of it.'}</p>
          </div>
        )
      })()}

      {/* ── 4 · palette · canvas · properties ── */}
      <div className="pl-stage">
        <div className="pl-panel">
          <div className="pl-panel-h">Equipment</div>
          <div className="pl-pal">
            {(Object.keys(ITEMS) as ItemKind[]).map((k) => {
              const s = ITEMS[k]
              const t = TONE[s.tone]
              return (
                <button key={k} className="pl-item" draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', k)}
                  onClick={() => place(k)}
                  title={`${s.label} — ${s.w} × ${s.h} m${s.discharge ? `, ${s.discharge} m discharge clearance` : ''}`}>
                  <span className="pl-sw" style={{ background: t.wash, borderColor: t.c }} />
                  <span>
                    <span className="pl-item-t">{s.label}</span><br />
                    <span className="pl-item-d mono">{s.w} × {s.h} m{s.discharge ? ` · ${s.discharge} m clear` : ''}</span>
                  </span>
                </button>
              )
            })}
            <p className="pl-note">Click to add, or drag onto the drawing. Arrow keys nudge the
            selection by 0.25 m, Shift by a metre. Hold Shift while dragging to place off the grid.</p>
          </div>
        </div>

        <div className="pl-panel"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const k = e.dataTransfer.getData('text/plain') as ItemKind
            if (!ITEMS[k]) return
            const m = toM(e)
            place(k, { x: m.x - ITEMS[k].w / 2, y: m.y - ITEMS[k].h / 2 })
          }}>
          <svg ref={svgRef} className="pl-canvas" viewBox={`0 0 ${VW} ${VH}`} role="img"
            tabIndex={0}
            aria-label={`${view === 'plan' ? 'Room plan' : 'Single line diagram'}. Room ${f(roomW, 1)} by ${f(roomD, 1)} metres. ${items.length} items, ${cables.length} cables. ${sum.blocking} blocking findings, ${sum.advisory} advisory. The cable schedule below this drawing carries the same information as a table.`}
            onPointerDown={onStageDown}>
            <defs>
              <pattern id="pl-hot" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <rect width="7" height="7" fill={C.overWash} />
                <line x1="0" y1="0" x2="0" y2="7" stroke={C.over} strokeWidth="1.4" opacity="0.5" />
              </pattern>
              <pattern id="pl-cool" width="7" height="7" patternTransform="rotate(-45)" patternUnits="userSpaceOnUse">
                <rect width="7" height="7" fill={C.infoWash} />
                <line x1="0" y1="0" x2="0" y2="7" stroke={C.info} strokeWidth="1.4" opacity="0.45" />
              </pattern>
            </defs>
            <rect width={VW} height={VH} fill={C.surface} />
            <g ref={worldRef} transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              {view === 'plan' ? (
                <>
                  <rect x={X(0)} y={Y(0)} width={roomW * sc} height={roomD * sc} fill={C.bg}
                    stroke={C.text} strokeWidth={2} />
                  {grid()}
                  {/* Dimensions on two edges, stating the real size. */}
                  <text x={X(roomW / 2)} y={Y(0) - 12} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.dim}>
                    {f(roomW, 1)} m
                  </text>
                  <text transform={`translate(${X(0) - 14} ${Y(roomD / 2)}) rotate(-90)`} textAnchor="middle"
                    fontSize={11} fontWeight={700} fill={C.dim}>{f(roomD, 1)} m</text>
                  <text x={X(0)} y={Y(roomD) + 18} fontSize={10} fontWeight={700} fill={C.dim}>
                    ROOM PLAN — TO SCALE · 1 m grid · {f(roomW * roomD, 0)} m²
                  </text>
                  {planZones()}
                  {planCables()}
                  {planItems()}
                  {planCableLabels()}
                  {drawing && (() => {
                    const from = items.find((i) => i.id === drawing.fromId)
                    if (!from) return null
                    const a = centreOf(from)
                    return <line x1={X(a.x)} y1={Y(a.y)} x2={X(drawing.x)} y2={Y(drawing.y)}
                      stroke={C.sel} strokeWidth={2.5} strokeDasharray="7 5" pointerEvents="none" />
                  })()}
                </>
              ) : single()}
            </g>
            {items.length === 0 && (
              <text x={VW / 2} y={VH / 2} textAnchor="middle" fontSize={13} fill={C.dim}>
                Nothing placed. Click an item in the palette to start.
              </text>
            )}
          </svg>
        </div>

        {/* ── The properties panel ── */}
        <div className="pl-panel">
          <div className="pl-panel-h">{selItem ? 'Equipment' : selCable ? 'Cable' : 'Properties'}</div>
          <div className="pl-props">
            {!selItem && !selCable && (
              <p className="pl-empty">Nothing selected. Click an item or a cable on the drawing.
              <br /><br />To draw a cable, hover an item, press one of the four blue nubs on its edges
              and drag to the item it feeds. The direction matters — <b>from</b> is the supply.</p>
            )}

            {selItem && (() => {
              const s = ITEMS[selItem.kind]
              const carried = downstreamKva(items, cables, selItem.id)
              return (
                <>
                  <div className="pl-f">
                    <label htmlFor="pl-name">Name</label>
                    <input id="pl-name" ref={nameRef} className="pl-in" value={selItem.label}
                      onChange={(e) => patchItem(selItem.id, { label: e.target.value })} />
                  </div>
                  {s.role !== 'passive' && (
                    <>
                      <div className="pl-row">
                        <div className="pl-f">
                          <label>Rating <span className="h">kVA</span></label>
                          <input className="pl-in mono" {...num(selItem.kva, (v) => patchItem(selItem.id, { kva: v }), 50)} />
                        </div>
                        <div className="pl-f">
                          <label>Voltage <span className="h">line to line</span></label>
                          <input className="pl-in mono" {...num(selItem.volts, (v) => patchItem(selItem.id, { volts: v }), 10)} />
                        </div>
                      </div>
                      <div className="pl-f">
                        <label>Power factor <span className="h">0.8 is the industrial convention</span></label>
                        <input className="pl-in mono" {...num(selItem.pf, (v) => patchItem(selItem.id, { pf: v }), 0.05)} />
                      </div>
                    </>
                  )}
                  {(s.discharge > 0 || s.intake > 0) && (
                    <div className="pl-f">
                      <label>Discharge faces</label>
                      <div className="pl-dirs">
                        {DIRS.map((d) => (
                          <button key={d} className={selItem.dir === d ? 'on' : ''}
                            onClick={() => { remember(); patchItem(selItem.id, { dir: d }) }}>{d}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: 10 }}>
                    <div className="pl-fact"><span>Footprint</span><b>{s.w} × {s.h} m</b></div>
                    {s.discharge > 0 && <div className="pl-fact"><span>Discharge clearance</span><b>{s.discharge} m</b></div>}
                    {s.intake > 0 && <div className="pl-fact"><span>Intake clearance</span><b>{s.intake} m</b></div>}
                    <div className="pl-fact"><span>Position</span><b className="mono">{f(selItem.x, 2)}, {f(selItem.y, 2)} m</b></div>
                    {s.role !== 'load' && s.role !== 'passive' && (
                      <div className="pl-fact"><span>Downstream load</span><b>{f(carried, 0)} kVA</b></div>
                    )}
                  </div>
                  {s.note && <p className="pl-note">{s.note}. Clearances are the conservative end of the
                  manufacturer range — Crestchic asks 2 m on a discharge and Avtron 5 m, and a plan that
                  says there is room when there is not gets found out at 40 °C with a client watching.</p>}
                  <button className="pl-danger" onClick={() => removeItem(selItem.id)}>Remove {selItem.label}</button>
                </>
              )
            })()}

            {selCable && selResult && (
              <>
                <div className="pl-fact"><span>From</span><b>{selResult.from.label}</b></div>
                <div className="pl-fact"><span>To</span><b>{selResult.to.label}</b></div>
                <div className="pl-fact"><span>Carries</span><b>{f(selResult.kva, 0)} kVA</b></div>
                <div className="pl-fact"><span>Design current</span><b>{f(selResult.current, 0)} A</b></div>
                <div className="pl-row" style={{ marginTop: 9 }}>
                  <div className="pl-f">
                    <label>Size <span className="h">mm²</span></label>
                    <select className="pl-in mono" value={String(selCable.csa)}
                      onChange={(e) => { remember(); patchCable(selCable.id, { csa: parseFloat(e.target.value) }) }}>
                      {CSA_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="pl-f">
                    <label>Runs <span className="h">per phase</span></label>
                    <select className="pl-in mono" value={String(selCable.runs)}
                      onChange={(e) => { remember(); patchCable(selCable.id, { runs: parseInt(e.target.value, 10) }) }}>
                      {RUN_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <div className="pl-row">
                  <div className="pl-f">
                    <label>Other circuits <span className="h">grouped with it</span></label>
                    <input className="pl-in mono" {...num(selCable.circuits, (v) => patchCable(selCable.id, { circuits: Math.max(1, Math.round(v)) }))} />
                  </div>
                  <div className="pl-f">
                    <label>Length <span className="h">blank = measured</span></label>
                    <input className="pl-in mono" type="number" value={selCable.lengthM === null ? '' : String(selCable.lengthM)}
                      placeholder={f(selResult.lengthM, 1)}
                      onChange={(e) => {
                        const v = e.target.value.trim()
                        patchCable(selCable.id, { lengthM: v === '' ? null : parseFloat(v) })
                      }} />
                  </div>
                </div>
                <div style={{ marginTop: 6 }}>
                  <div className="pl-fact"><span>Length used</span>
                    <b>{f(selResult.lengthM, 1)} m · {selResult.measured ? 'measured off the drawing' : 'typed'}</b></div>
                  <div className="pl-fact"><span>Derated capacity</span><b>{f(selResult.capacity, 0)} A</b></div>
                  <div className="pl-fact"><span>Loading</span>
                    <b style={{ color: BAND[selResult.band].c }}>{f(selResult.loadingPct, 0)} % — {BAND[selResult.band].word}</b></div>
                  <div className="pl-fact"><span>Volt drop</span>
                    <b style={{ color: selResult.voltDropPct > guidance.other ? C.watch : C.text }}>
                      {f(selResult.voltDropV, 1)} V · {f(selResult.voltDropPct, 2)} %</b></div>
                  <div className="pl-fact"><span>Indicative size</span>
                    <b>{selResult.suggested ? describeCable(selResult.suggested, selResult.runs) : 'nothing at this run count'}</b></div>
                </div>
                <p className="pl-note">
                  <b>Indicative only.</b> {AMPACITY_BASIS}. Real ampacity depends on the installation
                  method, grouping, thermal insulation, burial and harmonic content, and on a run of
                  any length volt drop governs before ampacity does. Take the current to your own
                  cable schedule.
                </p>
                <button className="pl-danger" onClick={() => removeCable(selCable.id)}>Remove this cable</button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="pl-legend">
        {(['comfortable', 'watch', 'limit', 'over'] as LoadBand[]).map((b) => (
          <span key={b} className="pl-lg">
            <i style={{ background: BAND[b].wash, borderColor: BAND[b].c }} />
            {b === 'comfortable' ? 'under 75 %' : b === 'watch' ? '75 – 90 %' : b === 'limit' ? '90 – 100 %' : 'over 100 %'} — {BAND[b].word}
          </span>
        ))}
        <span className="pl-lg"><i style={{ background: C.overWash, borderColor: C.over }} />red hatch — hot discharge</span>
        <span className="pl-lg"><i style={{ background: C.infoWash, borderColor: C.info }} />blue hatch — air intake</span>
        <span className="pl-lg"><i style={{ background: '#fff', borderColor: C.sel }} />violet — selected</span>
      </div>

      {/* ── 5 · findings ── */}
      <div className="pl-sec">What this drawing says</div>
      <div className="pl-cards">
        {findings.map((fd, i) => (
          <div key={i} className={'pl-card ' + (fd.severity === 'blocking' ? 'stop' : 'warn')}>
            <b>{fd.severity === 'blocking' ? 'Will fail the test' : 'Worth looking at'}</b>
            <p><strong>{fd.title}.</strong> {fd.detail}</p>
          </div>
        ))}
        {findings.length === 0 && (
          <div className="pl-card clear">
            <b>Nothing found — and here is what was checked</b>
            <p>Silence is indistinguishable from a broken check, so:</p>
            <ul>
              <li>Hot discharge landing in another unit&rsquo;s air intake</li>
              <li>Discharge onto equipment, or past the room boundary</li>
              <li>An intake blocked by something standing in front of it</li>
              <li>Any cable over 100 % of its derated capacity</li>
              <li>Volt drop past the {guidance.other} % guidance figure you chose</li>
              <li>Connected load exceeding a source&rsquo;s rating</li>
              <li>Anything on the drawing with no supply</li>
            </ul>
          </div>
        )}
      </div>

      {/* ── the cable schedule — the artefact that goes in the method statement ── */}
      <div className="pl-sec">Cable schedule</div>
      <div className="pl-panel">
        {results.length === 0 ? (
          <p className="pl-empty" style={{ padding: 12 }}>No cables drawn yet. Hover an item, press a
          blue nub on its edge and drag to the item it feeds.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="pl-tbl">
              <thead>
                <tr>
                  <th>From</th><th>To</th><th>Size</th><th>Carries</th><th>Current</th>
                  <th>Length</th><th>Volt drop</th><th>Loading</th><th>Indicative</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.cable.id}>
                    <td>{r.from.label}</td>
                    <td>{r.to.label}</td>
                    <td className="mono">{describeCable(r.cable.csa, r.runs)}</td>
                    <td className="mono">{f(r.kva, 0)} kVA</td>
                    <td className="mono">{f(r.current, 0)} A</td>
                    <td className="mono">{f(r.lengthM, 1)} m{r.measured ? '' : ' *'}</td>
                    <td className="mono" style={{ color: r.voltDropPct > guidance.other ? C.watch : undefined }}>
                      {f(r.voltDropPct, 2)} %</td>
                    <td>
                      <span className="pl-pill" style={{ color: BAND[r.band].c, borderColor: BAND[r.band].c, background: BAND[r.band].wash }}>
                        {f(r.loadingPct, 0)} % {BAND[r.band].word}
                      </span>
                    </td>
                    <td className="mono">{r.suggested ? describeCable(r.suggested, r.runs) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="pl-basis">
        <b>* typed length.</b> Everything else is measured off the drawing along the orthogonal
        route, centre to centre. <b>{AMPACITY_CAVEAT}</b> Basis: {AMPACITY_BASIS}. Parallel runs
        assume equal lengths on the same route — BS 7671 433.4 and 523.7 both require that, and runs
        that are not electrically identical do not share equally. Ambient {ambientC} °C, volt drop
        judged against {guidance.label} at {guidance.other} %.
      </p>
      <p className="pl-basis">
        Saving a layout against a project is not built yet — print it or export the PNG to put it in
        a method statement. {touched ? 'This drawing has been edited; it is not the example any more.' : 'This is the worked example the page opens with, not your job.'}
      </p>

      {png && (
        <p className="pl-basis">
          <a href={png} download="room-layout.png" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
            Download the drawing as a PNG
          </a> — right-click and save if the link does nothing.
        </p>
      )}
    </div>
  )
}
