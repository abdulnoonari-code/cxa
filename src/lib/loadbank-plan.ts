// The load bank plan, as a workbook.
//
// ── What this is modelled on ─────────────────────────────────────────────
//
// A real hyperscale load bank plan workbook, which has three parts and not
// one:
//
//   LB Calc     how big the banks have to be, and why
//   Schedules   what is on the drawing and what each cable carries
//   Test plan   a DAY BY DAY list — day, date, equipment, line-up, phase,
//               busway, test load kW, load bank size kW, rated voltage
//
// The third is the one that makes it a plan rather than a calculation. It is
// also the one the drawing cannot fill in by itself: the drawing knows there
// are two 1 MW banks on a 2500 kVA generator; it does not know the FPT start
// date, the line-up numbers, which phase is tested on which day, or how many
// busways there are.
//
// ── SO THE WORKBOOK COMES OUT HALF-FILLED, AND SAYS WHICH HALF ───────────
//
// Every row the drawing knows is written. Every column it cannot know is
// left EMPTY with its heading and a note saying so. The alternative — making
// up a plausible date and a plausible phase — produces a document that looks
// finished and is fiction, and somebody would plan an outage around it.

import ExcelJS from 'exceljs'
import type {
  LayoutItem, Cable, CableResult, Finding, Summary, ItemKind,
} from '@/lib/layout'
import { ITEMS, describeCable, downstreamKva, suppliesOf, AMPACITY_BASIS, AMPACITY_CAVEAT } from '@/lib/layout'

export type PlanInput = {
  projectName: string
  drawingName: string
  roomW: number
  roomD: number
  ambientC: number
  vdGuidanceLabel: string
  vdGuidancePct: number
  items: LayoutItem[]
  cables: Cable[]
  results: CableResult[]
  findings: Finding[]
  summary: Summary
  generatedAt: Date
}

// ════════════════════════════════════════════════════════════════════════
// LB CALC — the sizing, with its working
// ════════════════════════════════════════════════════════════════════════

export type CalcRow = {
  label: string
  value: number | string | null
  unit: string
  /** The substituted formula, or the reason there is no figure. */
  working: string
}

/**
 * The sizing sheet.
 *
 * ── Why every row carries its working ────────────────────────────────────
 *
 * Because an engineer signs a test sheet, and a number they cannot defend in
 * a meeting is worthless to them however correct it is. The same rule the
 * calculators on screen follow.
 */
export function calcRows(p: PlanInput): CalcRow[] {
  const sources = p.items.filter((i) => ITEMS[i.kind].role === 'source')
  const banks = p.items.filter((i) => i.kind === 'lb' || i.kind === 'lb500' || i.kind === 'lbv')
  const loads = p.items.filter((i) => ITEMS[i.kind].role === 'load')
  const biggest = sources.reduce((m, s) => Math.max(m, s.kva), 0)
  const bankTotal = banks.reduce((t, b) => t + b.kva, 0)
  const loadTotal = loads.reduce((t, l) => t + l.kva, 0)

  const rows: CalcRow[] = [
    { label: 'Sources on the drawing', value: sources.length, unit: '', working: sources.map((s) => s.label).join(', ') || 'none placed' },
    { label: 'Largest single source', value: biggest || null, unit: 'kVA', working: biggest ? 'the one that must carry the block alone' : 'no source has a rating entered' },
    { label: 'Total source rating', value: p.summary.sourceKva, unit: 'kVA', working: sources.map((s) => `${Math.round(s.kva)}`).join(' + ') || '—' },
  ]

  // Under 2N the sum of the ratings is the misleading figure, so the sheet
  // prints the worst single source and says why.
  if (p.summary.dualFed) {
    rows.push({
      label: 'DUAL FED — each source must carry the block alone', value: 'yes', unit: '',
      working: 'At least one item has two supplies. Every feeder is sized for the whole load, so the SUM of the source ratings is not the capacity available.',
    })
  }
  for (const s of p.summary.sources) {
    rows.push({
      label: `  ${s.label} — carrying`, value: Math.round(s.carried), unit: 'kVA',
      working: s.pct === null ? 'no rating entered for this source' : `${Math.round(s.carried)} / ${Math.round(s.kva)} = ${s.pct.toFixed(1)} % of its own rating`,
    })
  }

  rows.push(
    { label: 'Connected load', value: p.summary.connectedKva, unit: 'kVA', working: 'sum of every item whose role is a load. NO DIVERSITY — a load bank test is the one case where everything really does run at once' },
    { label: 'Spare on the worst-loaded source', value: Number(p.summary.sparePct.toFixed(1)), unit: '%', working: p.summary.worstSource ? `on ${p.summary.worstSource.label}` : 'no source placed' },
    { label: 'Load banks on the drawing', value: banks.length, unit: '', working: banks.map((b) => `${b.label} ${Math.round(b.kva)} kVA`).join('; ') || 'none placed' },
    { label: 'Load bank capacity placed', value: bankTotal, unit: 'kVA', working: banks.map((b) => `${Math.round(b.kva)}`).join(' + ') || '—' },
  )

  // The gap between what the source can do and what has been placed to prove
  // it. This is the figure somebody orders a bank against.
  if (biggest > 0) {
    const shortfall = biggest - bankTotal
    rows.push({
      label: shortfall > 0 ? 'SHORT of proving the largest source' : 'Load bank capacity against the largest source',
      value: Math.round(Math.abs(shortfall)),
      unit: 'kVA',
      working: shortfall > 0
        ? `${Math.round(biggest)} − ${Math.round(bankTotal)} = ${Math.round(shortfall)} kVA more is needed to load the largest source to 100 %`
        : `${Math.round(bankTotal)} placed against ${Math.round(biggest)} — enough to reach 100 % of the largest source`,
    })
  }
  if (loadTotal !== bankTotal) {
    rows.push({
      label: 'Other load on the drawing', value: Math.round(loadTotal - bankTotal), unit: 'kVA',
      working: 'loads that are not load banks — racks, cooling plant and anything else drawn as a load',
    })
  }

  rows.push(
    { label: 'Site ambient used', value: p.ambientC, unit: '°C', working: 'the temperature every cable rating on this drawing was derated at' },
    { label: 'Volt drop guidance', value: p.vdGuidancePct, unit: '%', working: p.vdGuidanceLabel },
    { label: 'Worst volt drop', value: p.summary.worstVoltDrop ? Number(p.summary.worstVoltDrop.pct.toFixed(2)) : null, unit: '%', working: p.summary.worstVoltDrop ? p.summary.worstVoltDrop.label : 'no cables drawn' },
    { label: 'Worst loaded cable', value: p.summary.worstLoading ? Math.round(p.summary.worstLoading.pct) : null, unit: '%', working: p.summary.worstLoading ? p.summary.worstLoading.label : 'no cables drawn' },
    { label: 'Findings', value: p.summary.blocking + p.summary.advisory, unit: '', working: `${p.summary.blocking} blocking, ${p.summary.advisory} advisory` },
  )
  return rows
}

// ════════════════════════════════════════════════════════════════════════
// THE TEST PLAN — seeded from the drawing, finished by a person
// ════════════════════════════════════════════════════════════════════════

export type TestRow = {
  /** Blank — the drawing does not know the programme. */
  day: number | null
  date: string
  equipment: string
  lineUp: string
  phase: string
  busway: string
  /** kW the test has to apply. From the drawing. */
  testLoadKw: number | null
  /** kW of bank available. From the drawing. */
  bankKw: number | null
  voltage: number | null
  source: string
  note: string
}

/** The equipment codes a load bank plan uses, so the sheet reads like one. */
export const TEST_CODES: Record<string, string> = {
  gen: 'GEN', grid: 'UTIL', tx: 'TX', tx2: 'TX', mvsw: 'MVSW', swbd: 'MSB',
  panel: 'CDB', ats: 'ATS', ups: 'UPS', batt: 'BATT', busway: 'BW', pdu: 'PDU',
  lb: 'LB', lb500: 'LB', lbv: 'LB', rack: 'RACK', crah: 'CRAH', crac: 'CRAC',
  chiller: 'CHILL', door: '', tray: '', fire: '',
}

/**
 * One row per thing that has to be proved, in the order it is normally
 * proved: the sources first, then what they feed.
 *
 * Day, date, line-up, phase and busway are left EMPTY. The drawing does not
 * know the programme, and a plausible invented date is worse than a blank
 * one because somebody will plan around it.
 */
export function testRows(p: PlanInput): TestRow[] {
  const out: TestRow[] = []
  const kw = (it: LayoutItem) => (it.kva > 0 ? Math.round(it.kva * (it.pf > 0 ? it.pf : 1)) : null)

  const banks = p.items.filter((i) => i.kind === 'lb' || i.kind === 'lb500' || i.kind === 'lbv')
  const bankKw = banks.reduce((t, b) => t + (kw(b) ?? 0), 0) || null

  // THE LOAD BANKS ARE NOT ROWS ON THIS SHEET.
  //
  // A load bank is the instrument, not the thing being proved — the same way
  // a megohmmeter is not a row on an insulation resistance sheet. What the
  // bank can deliver appears in the "Bank available kW" column of every row
  // instead, which is the comparison that actually matters: is there enough
  // bank to load this item to its rating.
  //
  // Sources first, then what they feed. A plan in any other order reads
  // backwards to the person executing it.
  const order: ItemKind[] = [
    'grid', 'gen', 'tx', 'tx2', 'mvsw', 'swbd', 'ats', 'ups', 'batt',
    'panel', 'busway', 'pdu', 'crah', 'crac', 'chiller', 'rack',
  ]
  for (const kind of order) {
    for (const it of p.items.filter((i) => i.kind === kind)) {
      // A board has no rating of its own to prove — what it has to pass is
      // whatever hangs below it. Leaving that column blank would look like one
      // of the shaded "fill this in" columns, which is exactly the confusion
      // this sheet is trying to avoid.
      const isDist = ITEMS[it.kind].role === 'distribution'
      const below = downstreamKva(p.items, p.cables, it.id)
      const pf = it.pf > 0 ? it.pf : 0.8
      const load = isDist && it.kva === 0
        ? (below > 0 ? Math.round(below * pf) : null)
        : kw(it)
      out.push({
        day: null, date: '', equipment: TEST_CODES[it.kind] ?? '', lineUp: '', phase: '', busway: '',
        testLoadKw: load,
        bankKw,
        voltage: it.volts || null,
        source: it.label,
        note: ITEMS[it.kind].role === 'source'
          ? 'Load the source to 100 % of its rating. The bank must be able to reach it.'
          : isDist
            ? (below > 0
                ? 'Prove it passes the load below it. The figure is what is actually hung on it on this drawing, not a nameplate.'
                : 'Nothing is drawn below it yet, so there is no load to prove. Draw the cables and export again.')
            : 'Prove it draws what it is rated for.',
      })
    }
  }

  if (!out.length)
    out.push({ day: null, date: '', equipment: '', lineUp: '', phase: '', busway: '',
      testLoadKw: null, bankKw: null, voltage: null, source: '',
      note: 'Nothing on the drawing yet — place the equipment and export again.' })
  return out
}

// ════════════════════════════════════════════════════════════════════════
// THE SCHEDULES
// ════════════════════════════════════════════════════════════════════════

export type EquipRow = {
  tag: string
  type: string
  group: string
  ratingKva: number
  pf: number
  volts: number
  x: number
  y: number
  footprint: string
  clearance: string
  fedFrom: string
  carriesKva: number
}

export function equipRows(p: PlanInput, supplyOf: (id: number) => string, carried: (id: number) => number): EquipRow[] {
  return p.items.map((it) => {
    const s = ITEMS[it.kind]
    return {
      tag: it.label,
      type: s.label,
      group: s.group,
      ratingKva: it.kva,
      pf: it.pf,
      volts: it.volts,
      x: it.x,
      y: it.y,
      footprint: `${s.w} × ${s.h} m`,
      clearance: s.discharge || s.intake ? `discharge ${s.discharge} m · intake ${s.intake} m · faces ${it.dir}` : '',
      fedFrom: supplyOf(it.id),
      carriesKva: carried(it.id),
    }
  })
}

export type CableRow = {
  ref: string
  from: string
  to: string
  size: string
  carriesKva: number
  currentA: number
  lengthM: number
  lengthBasis: string
  voltDropPct: number
  loadingPct: number
  band: string
  indicative: string
}

export function cableRows(p: PlanInput): CableRow[] {
  return p.results.map((r, i) => ({
    ref: `C${String(i + 1).padStart(2, '0')}`,
    from: r.from.label,
    to: r.to.label,
    size: describeCable(r.cable.csa, r.runs),
    carriesKva: Math.round(r.kva),
    currentA: Math.round(r.current),
    lengthM: Number(r.lengthM.toFixed(1)),
    // "measured" and "typed" are different facts and the schedule says which.
    lengthBasis: r.measured ? 'measured off the drawing' : 'typed',
    voltDropPct: Number(r.voltDropPct.toFixed(2)),
    loadingPct: Math.round(r.loadingPct),
    band: r.band,
    indicative: r.suggested ? describeCable(r.suggested, r.runs) : 'nothing tabulated carries it at this run count',
  }))
}

/** The assumptions, printed on the workbook so it can be defended later. */
export function basisLines(p: PlanInput): { label: string; value: string }[] {
  return [
    { label: 'Project', value: p.projectName },
    { label: 'Drawing', value: p.drawingName },
    { label: 'Generated', value: p.generatedAt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' },
    { label: 'Room', value: `${p.roomW} × ${p.roomD} m — ${Math.round(p.roomW * p.roomD)} m²` },
    { label: 'Ambient used', value: `${p.ambientC} °C` },
    { label: 'Volt drop judged against', value: `${p.vdGuidanceLabel} — ${p.vdGuidancePct} %` },
    { label: 'Cable rating basis', value: AMPACITY_BASIS },
    { label: 'Parallel runs', value: 'Capacity multiplies by the number of runs and volt drop divides by it, which assumes the runs are the same length on the same route. BS 7671 433.4 and 523.7 both require that.' },
    { label: 'Diversity', value: 'None applied. A load bank test is the one case where every load really does run at once, and a diversity factor would under-size the very cable being proved.' },
    { label: 'INDICATIVE ONLY', value: AMPACITY_CAVEAT },
    { label: 'This is not an authorisation', value: 'This workbook reports what the drawing and the records support. Releasing anybody to work, or accepting a system, remains a human act with a name against it.' },
  ]
}

// ════════════════════════════════════════════════════════════════════════
// THE WORKBOOK
// ════════════════════════════════════════════════════════════════════════
//
// Built here rather than in the route handler so it can be generated and
// READ BACK by an assertion. A workbook nobody has opened is a workbook with
// a merged cell in the wrong place and a column of #### in it.

const INK = 'FF0A1428'
const DIM = 'FF56658A'
const RULE = 'FFDBE3F2'

function head(sheet: ExcelJS.Worksheet, row: number, cells: string[], widths?: number[]) {
  const r = sheet.getRow(row)
  cells.forEach((c, i) => {
    const cell = r.getCell(i + 1)
    cell.value = c
    cell.font = { bold: true, size: 9, color: { argb: DIM }, name: 'Calibri' }
    cell.alignment = { vertical: 'bottom', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: RULE } } }
    if (widths && widths[i]) sheet.getColumn(i + 1).width = widths[i]
  })
  r.height = 26
  sheet.views = [{ state: 'frozen', ySplit: row }]
}

function title(sheet: ExcelJS.Worksheet, text: string, sub: string) {
  sheet.getCell('A1').value = text
  sheet.getCell('A1').font = { bold: true, size: 15, color: { argb: INK }, name: 'Calibri' }
  sheet.getCell('A2').value = sub
  sheet.getCell('A2').font = { size: 9.5, color: { argb: DIM }, name: 'Calibri' }
  sheet.getRow(1).height = 22
}

export function buildWorkbook(
  input: PlanInput,
  pictures: { planPng?: string | null; singlePng?: string | null } = {}
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CxSentinel'
  wb.created = input.generatedAt

  // ── 1 · BASIS ────────────────────────────────────────────────────────
  //
  // First sheet, because the assumptions are what make every other sheet
  // defensible six months later.
  {
    const s = wb.addWorksheet('Basis')
    title(s, 'Load bank plan — basis and assumptions',
      'Everything in this workbook was computed under the conditions below. Change any of them and the figures change.')
    s.getColumn(1).width = 32
    s.getColumn(2).width = 108
    let r = 4
    for (const line of basisLines(input)) {
      const row = s.getRow(r++)
      row.getCell(1).value = line.label
      row.getCell(1).font = { bold: true, size: 10, color: { argb: INK } }
      row.getCell(1).alignment = { vertical: 'top' }
      row.getCell(2).value = line.value
      row.getCell(2).font = { size: 10 }
      row.getCell(2).alignment = { wrapText: true, vertical: 'top' }
      row.height = line.value.length > 110 ? 46 : line.value.length > 60 ? 30 : 16
    }
  }

  // ── 2 · LB CALC ──────────────────────────────────────────────────────
  {
    const s = wb.addWorksheet('LB Calc')
    title(s, 'Load bank sizing', 'Every row carries the working that produced it.')
    head(s, 4, ['Item', 'Value', 'Unit', 'Working'], [46, 13, 9, 92])
    let r = 5
    for (const row of calcRows(input)) {
      const x = s.getRow(r++)
      x.getCell(1).value = row.label
      x.getCell(1).font = { bold: !row.label.startsWith('  '), size: 10 }
      x.getCell(2).value = row.value
      x.getCell(2).font = { bold: true, size: 10 }
      x.getCell(2).alignment = { horizontal: 'right' }
      x.getCell(3).value = row.unit
      x.getCell(3).font = { size: 9, color: { argb: DIM } }
      x.getCell(4).value = row.working
      x.getCell(4).font = { size: 9, color: { argb: DIM } }
      x.getCell(4).alignment = { wrapText: true, vertical: 'top' }
      if (row.working.length > 90) x.height = 28
      if (/SHORT|DUAL FED/.test(row.label)) {
        for (let c = 1; c <= 4; c++) x.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3DE' } }
      }
    }
  }

  // ── 3 · EQUIPMENT ────────────────────────────────────────────────────
  {
    const s = wb.addWorksheet('Equipment')
    title(s, 'Equipment schedule', 'Everything on the drawing, with where it is and what feeds it.')
    head(s, 4, ['Tag', 'Type', 'Group', 'Rating kVA', 'PF', 'Voltage V', 'X m', 'Y m',
                'Footprint', 'Clearance', 'Fed from', 'Carries kVA'],
               [26, 22, 16, 12, 7, 11, 9, 9, 15, 40, 26, 12])
    const supplyOf = (id: number) =>
      suppliesOf(input.cables, id).map((sid) => input.items.find((x) => x.id === sid)?.label ?? '?').join(' + ')
    const carried = (id: number) => Math.round(downstreamKva(input.items, input.cables, id))
    let r = 5
    for (const row of equipRows(input, supplyOf, carried)) {
      s.getRow(r++).values = [row.tag, row.type, row.group, row.ratingKva, row.pf, row.volts,
        row.x, row.y, row.footprint, row.clearance, row.fedFrom, row.carriesKva]
    }
  }

  // ── 4 · CABLE SCHEDULE ───────────────────────────────────────────────
  {
    const s = wb.addWorksheet('Cable schedule')
    title(s, 'Cable schedule', 'INDICATIVE sizes. Take the current to your own cable schedule — see the Basis sheet.')
    head(s, 4, ['Ref', 'From', 'To', 'Size', 'Carries kVA', 'Current A', 'Length m',
                'Length basis', 'Volt drop %', 'Loading %', 'Band', 'Indicative size'],
               [8, 26, 26, 16, 12, 11, 10, 24, 12, 11, 14, 22])
    let r = 5
    for (const row of cableRows(input)) {
      const x = s.getRow(r++)
      x.values = [row.ref, row.from, row.to, row.size, row.carriesKva, row.currentA,
        row.lengthM, row.lengthBasis, row.voltDropPct, row.loadingPct, row.band, row.indicative]
      // The loading band is a word AND a colour, never a colour alone.
      const argb = row.band === 'over' ? 'FFFFECF1' : row.band === 'limit' ? 'FFFFEDE2'
                 : row.band === 'watch' ? 'FFFFF3DE' : 'FFE2FBEF'
      x.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
      x.getCell(11).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
    }
    const note = s.getRow(r + 1)
    note.getCell(1).value = AMPACITY_CAVEAT
    note.getCell(1).font = { size: 9, italic: true, color: { argb: DIM } }
    s.mergeCells(r + 1, 1, r + 1, 12)
    note.getCell(1).alignment = { wrapText: true, vertical: 'top' }
    note.height = 54
  }

  // ── 5 · TEST PLAN ────────────────────────────────────────────────────
  {
    const s = wb.addWorksheet('Test plan')
    title(s, 'Load bank test plan',
      'Seeded from the drawing. The shaded columns are the ones the drawing cannot know — fill them in.')
    head(s, 4, ['Day', 'Date', 'Equipment', 'Line-up', 'Phase', 'Busway',
                'Test load kW', 'Bank available kW', 'Voltage V', 'From the drawing', 'What it proves'],
               [7, 12, 12, 10, 8, 9, 13, 17, 11, 28, 60])
    let r = 5
    for (const row of testRows(input)) {
      const x = s.getRow(r++)
      x.values = [row.day, row.date, row.equipment, row.lineUp, row.phase, row.busway,
        row.testLoadKw, row.bankKw, row.voltage, row.source, row.note]
      // Shade what a person still has to supply, so a half-finished plan
      // cannot be mistaken for a finished one.
      for (const c of [1, 2, 4, 5, 6])
        x.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3DE' } }
      x.getCell(11).alignment = { wrapText: true, vertical: 'top' }
      x.height = 26
    }
    const note = s.getRow(r + 1)
    note.getCell(1).value =
      'The shaded columns are blank on purpose. The drawing knows what equipment there is and what load each item needs; it does not know your programme — the FPT start date, the line-up numbers, which phase is tested on which day, or how many busways there are. A plausible invented date is worse than a blank one, because somebody will plan an outage around it.'
    note.getCell(1).font = { size: 9, italic: true, color: { argb: DIM } }
    s.mergeCells(r + 1, 1, r + 1, 11)
    note.getCell(1).alignment = { wrapText: true, vertical: 'top' }
    note.height = 56
  }

  // ── 6 · FINDINGS ─────────────────────────────────────────────────────
  {
    const s = wb.addWorksheet('Findings')
    title(s, 'What the drawing says', 'Recomputed from the layout every time. Nothing here can be dismissed.')
    head(s, 4, ['Severity', 'Finding', 'Why it matters'], [16, 62, 92])
    let r = 5
    if (input.findings.length === 0) {
      const x = s.getRow(r++)
      x.getCell(1).value = 'Nothing found'
      x.getCell(2).value = 'and here is what was checked'
      x.getCell(3).value =
        'Hot discharge landing in another unit’s intake; discharge onto equipment or past the room boundary; a blocked intake; any cable over 100 % of its derated capacity; volt drop past the guidance figure; connected load exceeding a source’s rating; anything with no supply. Silence is indistinguishable from a broken check, which is why this row exists.'
      x.getCell(3).alignment = { wrapText: true, vertical: 'top' }
      x.height = 56
    }
    for (const f of input.findings) {
      const x = s.getRow(r++)
      x.getCell(1).value = f.severity === 'blocking' ? 'WILL FAIL THE TEST' : 'Worth looking at'
      x.getCell(1).font = { bold: true, size: 9.5, color: { argb: f.severity === 'blocking' ? 'FFC40F45' : 'FFA35700' } }
      x.getCell(2).value = f.title
      x.getCell(2).alignment = { wrapText: true, vertical: 'top' }
      x.getCell(3).value = f.detail
      x.getCell(3).font = { size: 9, color: { argb: DIM } }
      x.getCell(3).alignment = { wrapText: true, vertical: 'top' }
      x.height = 44
    }
  }

  // ── 7 · THE DRAWINGS ─────────────────────────────────────────────────
  //
  // Sent by the browser, which already knows how to turn its own SVG into a
  // PNG. A picture with no scale on it is decoration, so the sheet prints the
  // room size and the basis beside it.
  for (const [name, key, caption] of [
    ['Room plan', 'planPng', `Room plan to scale — ${input.roomW} × ${input.roomD} m, 1 m grid. Red hatching is hot discharge clearance, blue is air intake.`],
    ['Single line', 'singlePng', 'Single line — the same equipment and the same cables as the room plan, arranged by feed depth.'],
  ] as const) {
    const data = pictures[key]
    if (typeof data !== 'string' || !data.startsWith('data:image/png;base64,')) continue
    const s = wb.addWorksheet(name)
    title(s, name, caption)
    try {
      const id = wb.addImage({ base64: data.split(',')[1], extension: 'png' })
      // Sized in cells rather than pixels so it stays put when the sheet is
      // opened at a different zoom.
      s.addImage(id, { tl: { col: 0, row: 3 }, ext: { width: 1100, height: 710 } })
    } catch {
      s.getCell('A4').value = 'The drawing could not be embedded. Use the PNG button on the planner instead.'
    }
  }

  return wb
}
