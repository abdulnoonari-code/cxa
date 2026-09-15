// Word and PDF out.
//
// Everything CxSentinel produces has, until now, gone out as Excel — right for
// a register somebody is going to edit and send back, wrong for a document
// somebody is going to sign, file or attach to a claim. A contract obligation
// register that reaches the client as an .xlsx says "here is a spreadsheet";
// the same register as a PDF with a header, a date and a page count says
// "here is a document".
//
// So this file describes a report once — a title, some figures, some tables —
// and renders it two ways. Every register in the app can then offer Word and
// PDF without either format's mechanics leaking into the page that builds it.

import { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun } from 'docx'
import PDFDocument from 'pdfkit'

export type ReportTable = {
  title?: string
  /** column headings */
  columns: string[]
  /** relative column widths; defaults to equal */
  widths?: number[]
  rows: (string | number | null)[][]
  /** rows to render in the danger colour — by row index */
  emphasise?: Set<number>
}

export type ReportFigure = { label: string; value: string | number; note?: string }

export type ReportImage = {
  bytes: Buffer
  contentType: string
  caption: string
  /** A line under the caption — who took it, when, what the AI made of it. */
  note?: string
}

/**
 * A block of photographs.
 *
 * `missing` is not decoration: a photograph that exists but could not be
 * fetched is printed by name, because a blank space in a handover pack is
 * indistinguishable from an item that never had one.
 */
export type ReportGallery = {
  title?: string
  images: ReportImage[]
  /** Photographs that exist but could not be shown, named rather than dropped. */
  missing?: { caption: string; reason: string }[]
  /** What was left out and why. Printed under the block. */
  note?: string
  /** What to say when there is nothing at all. */
  emptyNote?: string
}

/**
 * One item, printed as a block of its own with its photographs beside it.
 *
 * ── Why this is not a table ─────────────────────────────────────────────
 *
 * A punch list is a table: forty rows, eight columns, read down the page by
 * somebody who already knows the site. A DEFECT REPORT is not. It goes to a
 * contractor who was not there, and for each defect it has to answer three
 * questions in one place — what is wrong, what it looks like, and what must
 * be done — or the reader has to hold a row number in their head while they
 * page to a gallery at the back to find the photograph.
 *
 * That gallery-at-the-back is exactly what the punch list PDF does, and it
 * is right for that document. It is wrong for this one. So a card keeps the
 * photograph, the words and the instruction together, and the whole block
 * moves to the next page rather than splitting a defect across a fold.
 *
 * `paragraphs` carries its own `note` per block, because the sentence that
 * has to follow "what must be done" is not the same sentence every time:
 * an agreed action is signed by somebody, and an AI suggestion has to say
 * out loud that nobody has agreed it. See lib/remedy.ts.
 */
export type ReportCard = {
  /** "P-014 — Earth bond missing on the transformer neutral" */
  heading: string
  /** The line under it: what it is against, its category, its state. */
  strapline?: string
  /** Short label/value pairs — responsible, due, level, raised by. */
  facts?: { label: string; value: string }[]
  /** Labelled blocks of prose, printed in the order given. */
  paragraphs?: { label: string; text: string; note?: string }[]
  /** This item's own photographs. */
  images?: ReportImage[]
  /** Photographs that exist and could not be carried — named, never dropped. */
  missing?: { caption: string; reason: string }[]
  /** What to say when this item has no photograph at all. */
  noImagesNote?: string
}

export type ReportCardSet = {
  title?: string
  /** A paragraph under the title, before the first card. */
  intro?: string
  cards: ReportCard[]
  /** What to say when there are no cards at all. */
  emptyNote?: string
}

export type Report = {
  title: string
  subtitle?: string
  project: string
  /** a short paragraph under the title — the verdict, usually */
  standfirst?: string
  figures?: ReportFigure[]
  tables?: ReportTable[]
  /** one block per item, each with its own photographs — printed after the tables */
  cards?: ReportCardSet[]
  /** photographs gathered together, printed after the cards */
  galleries?: ReportGallery[]
  /** small print at the end: what this document is and is not */
  footnotes?: string[]
  generatedAt?: Date
}

function when(date: Date): string {
  return date.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

// ── Word ─────────────────────────────────────────────────────────────────

const HEADER_FILL = 'EAF1FF'

/** Printed width of a photograph in Word, in DXA-ish points docx expects. */
const WORD_IMAGE_W = 340

function docxTable(table: ReportTable): (Paragraph | Table)[] {
  const widths = table.widths ?? table.columns.map(() => 1)
  const total = widths.reduce((a, b) => a + b, 0)
  const pct = widths.map((w) => Math.round((w / total) * 100))

  const header = new TableRow({
    tableHeader: true,
    children: table.columns.map((column, i) => new TableCell({
      width: { size: pct[i], type: WidthType.PERCENTAGE },
      shading: { fill: HEADER_FILL },
      children: [new Paragraph({ children: [new TextRun({ text: column, bold: true, size: 18 })] })],
    })),
  })

  const body = table.rows.map((row, r) => new TableRow({
    children: row.map((value, i) => new TableCell({
      width: { size: pct[i], type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: cell(value),
              size: 18,
              color: table.emphasise?.has(r) ? 'B42318' : undefined,
            }),
          ],
        }),
      ],
    })),
  }))

  const out: (Paragraph | Table)[] = []
  if (table.title) {
    out.push(new Paragraph({ text: table.title, heading: HeadingLevel.HEADING_2, spacing: { before: 320, after: 120 } }))
  }
  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [header, ...body],
      borders: {
        top: { style: BorderStyle.SINGLE, size: 2, color: 'D5DEEF' },
        bottom: { style: BorderStyle.SINGLE, size: 2, color: 'D5DEEF' },
        left: { style: BorderStyle.SINGLE, size: 2, color: 'D5DEEF' },
        right: { style: BorderStyle.SINGLE, size: 2, color: 'D5DEEF' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E8EDF7' },
        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'E8EDF7' },
      },
    })
  )
  return out
}

export async function toWord(report: Report): Promise<Buffer> {
  const at = report.generatedAt ?? new Date()
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: report.title, heading: HeadingLevel.TITLE }),
  ]

  if (report.subtitle) {
    children.push(new Paragraph({ children: [new TextRun({ text: report.subtitle, size: 22, color: '5B6B85' })] }))
  }

  children.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: `${report.project} · generated ${when(at)} by CxSentinel`, size: 18, color: '5B6B85' })],
    })
  )

  if (report.standfirst) {
    children.push(new Paragraph({ children: [new TextRun({ text: report.standfirst, size: 21 })], spacing: { after: 240 } }))
  }

  if (report.figures?.length) {
    children.push(
      ...docxTable({
        columns: ['Figure', 'Value', 'Note'],
        widths: [3, 1, 4],
        rows: report.figures.map((f) => [f.label, f.value, f.note ?? '']),
      })
    )
  }

  for (const table of report.tables ?? []) children.push(...docxTable(table))

  // ── Cards ───────────────────────────────────────────────────────────
  //
  // `keepNext` on everything down to the first photograph is what stops Word
  // breaking a defect in half: the heading, the strapline and the facts stay
  // with the block they introduce. Word has no "keep this whole thing
  // together" — it only has "keep this paragraph with the next" — so it is
  // set paragraph by paragraph rather than once.
  for (const set of report.cards ?? []) {
    if (set.title) {
      children.push(new Paragraph({ text: set.title, heading: HeadingLevel.HEADING_2, spacing: { before: 320, after: 100 } }))
    }
    if (set.intro) {
      children.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: set.intro, size: 19, color: '5B6B85' })] }))
    }
    if (set.cards.length === 0) {
      children.push(
        new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: set.emptyNote ?? 'Nothing to report.', size: 18, color: '5B6B85' })] })
      )
    }

    for (const card of set.cards) {
      children.push(
        new Paragraph({
          keepNext: true,
          spacing: { before: 360, after: 40 },
          border: { top: { style: BorderStyle.SINGLE, size: 6, color: 'D5DEEF' } },
          children: [new TextRun({ text: card.heading, bold: true, size: 23 })],
        })
      )
      if (card.strapline) {
        children.push(
          new Paragraph({ keepNext: true, spacing: { after: 100 }, children: [new TextRun({ text: card.strapline, size: 18, color: '5B6B85' })] })
        )
      }
      if (card.facts?.length) {
        children.push(
          new Paragraph({
            keepNext: true,
            spacing: { after: 140 },
            children: card.facts.flatMap((f, i) => [
              ...(i > 0 ? [new TextRun({ text: '   ·   ', size: 18, color: '9AA7BC' })] : []),
              new TextRun({ text: `${f.label}: `, size: 18, color: '5B6B85' }),
              new TextRun({ text: f.value, size: 18, bold: true }),
            ]),
          })
        )
      }
      for (const block of card.paragraphs ?? []) {
        children.push(
          new Paragraph({
            keepNext: true,
            spacing: { before: 120, after: 20 },
            children: [new TextRun({ text: block.label.toUpperCase(), bold: true, size: 15, color: '5B6B85' })],
          })
        )
        children.push(new Paragraph({ children: [new TextRun({ text: block.text, size: 20 })] }))
        if (block.note) {
          children.push(
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: block.note, size: 16, color: '5B6B85', italics: true })] })
          )
        }
      }
      for (const image of card.images ?? []) {
        children.push(
          new Paragraph({
            spacing: { before: 160, after: 40 },
            children: [
              new ImageRun({
                data: image.bytes,
                transformation: { width: WORD_IMAGE_W, height: Math.round(WORD_IMAGE_W * 0.75) },
                type: image.contentType === 'image/png' ? 'png' : 'jpg',
              }),
            ],
          })
        )
        children.push(
          new Paragraph({
            spacing: { after: image.note ? 20 : 120 },
            children: [new TextRun({ text: image.caption, bold: true, size: 17 })],
          })
        )
        if (image.note) {
          children.push(
            new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: image.note, size: 16, color: '5B6B85' })] })
          )
        }
      }
      for (const gone of card.missing ?? []) {
        children.push(
          new Paragraph({
            spacing: { before: 100 },
            children: [
              new TextRun({ text: `${gone.caption} — not shown. `, bold: true, size: 17, color: 'B42318' }),
              new TextRun({ text: gone.reason, size: 17, color: '5B6B85' }),
            ],
          })
        )
      }
      if ((card.images ?? []).length === 0 && (card.missing ?? []).length === 0 && card.noImagesNote) {
        children.push(
          new Paragraph({
            spacing: { before: 100 },
            children: [new TextRun({ text: card.noImagesNote, size: 16, color: '5B6B85', italics: true })],
          })
        )
      }
    }
  }

  for (const gallery of report.galleries ?? []) {
    if (gallery.title) {
      children.push(
        new Paragraph({ text: gallery.title, heading: HeadingLevel.HEADING_2, spacing: { before: 320, after: 120 } })
      )
    }
    if (gallery.images.length === 0 && (gallery.missing ?? []).length === 0) {
      children.push(
        new Paragraph({
          spacing: { after: 160 },
          children: [new TextRun({ text: gallery.emptyNote ?? 'No photographs.', size: 18, color: '5B6B85' })],
        })
      )
    }
    for (const image of gallery.images) {
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 60 },
          children: [
            new ImageRun({
              data: image.bytes,
              transformation: { width: WORD_IMAGE_W, height: Math.round(WORD_IMAGE_W * 0.75) },
              type: image.contentType === 'image/png' ? 'png' : 'jpg',
            }),
          ],
        })
      )
      children.push(
        new Paragraph({ children: [new TextRun({ text: image.caption, bold: true, size: 18 })] })
      )
      if (image.note) {
        children.push(
          new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: image.note, size: 17, color: '5B6B85' })],
          })
        )
      }
    }
    // Named, never silently dropped — a blank space looks identical to an item
    // that never had a photograph.
    for (const missing of gallery.missing ?? []) {
      children.push(
        new Paragraph({
          spacing: { before: 120 },
          children: [
            new TextRun({ text: `${missing.caption} — not shown. `, bold: true, size: 18, color: 'B42318' }),
            new TextRun({ text: missing.reason, size: 18, color: '5B6B85' }),
          ],
        })
      )
    }
    if (gallery.note) {
      children.push(
        new Paragraph({
          spacing: { before: 160 },
          children: [new TextRun({ text: gallery.note, size: 17, color: '5B6B85', italics: true })],
        })
      )
    }
  }

  for (const note of report.footnotes ?? []) {
    children.push(
      new Paragraph({
        spacing: { before: 240 },
        children: [new TextRun({ text: note, size: 17, color: '5B6B85', italics: true })],
      })
    )
  }

  const doc = new Document({
    creator: 'CxSentinel',
    title: report.title,
    description: report.subtitle ?? report.project,
    sections: [{ properties: {}, children }],
  })

  return Packer.toBuffer(doc)
}

// ── What a PDF can actually print ────────────────────────────────────────
//
// This was found by rendering a defect report with "95 mm² neutral" and
// "12 Ω" in it and looking at the page. Both are ordinary things for an
// electrical engineer to write. Neither survived:
//
//     95 mm² neutral      printed as   95 mm  neutral        (² vanished)
//     12 Ω END            printed as   12 :'Tä@              (!!)
//     5 μs END            printed as   5 ;Ç2Tä@              (!!)
//
// The second and third are the serious ones. pdfkit's built-in Helvetica is
// a WinAnsi font: one byte per character, 224 characters, no Greek. Hand it
// a character outside that set and it does not drop the character — it
// writes a byte that means something else, and EVERYTHING AFTER IT IN THAT
// STRING comes out as garbage. A punch item reading "insulation resistance
// 4.2 GΩ at 5 kV, megger serial 118432" becomes unreadable from the Ω
// onwards, in a document going to a client, with nothing on screen to
// suggest anything is wrong.
//
// This affects every PDF this application produces — the punch list, the
// obligations register, the daily report, the ITP, the dossier, the test
// register, the validity review — and has done since the first one.
//
// ── The fix, and its honest limits ──────────────────────────────────────
//
// Every string is put through `toWinAnsi` before it reaches pdfkit:
//
//   · characters that Helvetica has are left exactly as they are — °, ±,
//     ×, ÷, the dashes, the curly quotes, every accented Latin letter;
//   · the handful an engineer actually types are spelled out — Ω becomes
//     "ohm", μ becomes "u", ² becomes "2", Δ becomes "delta";
//   · anything else becomes "?" — VISIBLE, and only where the character
//     was. A question mark is a bad outcome. Three lines of corrupted text
//     is a much worse one, because nobody can tell it happened.
//
// The limit is real and worth saying out loud: a PDF cannot carry Thai,
// Chinese or Arabic text this way. A Thai contractor name comes out as
// "????". The Word file carries it perfectly — Word is XML and Unicode
// throughout — so that is the button to use for those. Fixing it properly
// means embedding a Unicode font in the deployment, which is a change worth
// making deliberately rather than as a side effect of this one.

/** Characters an engineer types that Helvetica cannot draw. */
const SPELLED_OUT: Record<string, string> = {
  '²': '2', '³': '3', '¹': '1', '⁰': '0', '⁴': '4',
  '½': '1/2', '¼': '1/4', '¾': '3/4',
  'Ω': 'ohm', 'ω': 'omega', 'µ': 'u', 'μ': 'u',
  'Δ': 'delta', 'δ': 'delta', 'Σ': 'sum', 'σ': 'sigma',
  'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'ε': 'epsilon', 'η': 'eta',
  'θ': 'theta', 'λ': 'lambda', 'π': 'pi', 'ρ': 'rho', 'τ': 'tau',
  'φ': 'phi', 'Φ': 'phi', 'χ': 'chi', 'ψ': 'psi',
  '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~', '≡': '=',
  '→': '->', '←': '<-', '↔': '<->', '⇒': '=>',
  '∅': 'dia ', '⌀': 'dia ', '∞': 'infinity', '√': 'sqrt',
  '∆': 'delta', '·': '·', '‰': 'o/oo', '′': "'", '″': '"',
  ' ': ' ', ' ': ' ', ' ': ' ', '​': '',
  '\t': '  ',
}

/**
 * A string pdfkit's Helvetica can print without corrupting itself.
 *
 * WinAnsi is Latin-1 plus a handful of typographic characters in the 0x80
 * block. Everything in those ranges goes through untouched.
 */
export function toWinAnsi(text: string): string {
  let out = ''
  for (const ch of text) {
    const spelled = SPELLED_OUT[ch]
    if (spelled !== undefined) {
      out += spelled
      continue
    }
    const code = ch.codePointAt(0) ?? 0
    // Printable ASCII, and Latin-1 above the C1 control block. Both are in
    // WinAnsi at the same code point.
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      out += ch
      continue
    }
    if (ch === '\n' || ch === '\r') {
      out += ch
      continue
    }
    // The 0x80 block: the curly quotes, the dashes, the ellipsis, the bullet.
    // WinAnsi has these and this application uses all of them.
    const WIN80 = '€‚ƒ„…†‡ˆ‰Š‹Œ Ž  ‘’“”•–—˜™š›œ žŸ'
    if (WIN80.includes(ch)) {
      out += ch
      continue
    }
    out += '?'
  }
  return out
}

/** The same, over every string in a report. */
function plainReport(report: Report): Report {
  const s = (v: string | undefined) => (v === undefined ? undefined : toWinAnsi(v))
  const cellOf = (v: string | number | null) => (typeof v === 'string' ? toWinAnsi(v) : v)

  return {
    ...report,
    title: toWinAnsi(report.title),
    subtitle: s(report.subtitle),
    project: toWinAnsi(report.project),
    standfirst: s(report.standfirst),
    figures: report.figures?.map((f) => ({
      label: toWinAnsi(f.label),
      value: typeof f.value === 'string' ? toWinAnsi(f.value) : f.value,
      note: s(f.note),
    })),
    tables: report.tables?.map((t) => ({
      ...t,
      title: s(t.title),
      columns: t.columns.map(toWinAnsi),
      rows: t.rows.map((r) => r.map(cellOf)),
    })),
    cards: report.cards?.map((set) => ({
      ...set,
      title: s(set.title),
      intro: s(set.intro),
      emptyNote: s(set.emptyNote),
      cards: set.cards.map((c) => ({
        ...c,
        heading: toWinAnsi(c.heading),
        strapline: s(c.strapline),
        facts: c.facts?.map((f) => ({ label: toWinAnsi(f.label), value: toWinAnsi(f.value) })),
        paragraphs: c.paragraphs?.map((p) => ({ label: toWinAnsi(p.label), text: toWinAnsi(p.text), note: s(p.note) })),
        images: c.images?.map((i) => ({ ...i, caption: toWinAnsi(i.caption), note: s(i.note) })),
        missing: c.missing?.map((m) => ({ caption: toWinAnsi(m.caption), reason: toWinAnsi(m.reason) })),
        noImagesNote: s(c.noImagesNote),
      })),
    })),
    galleries: report.galleries?.map((g) => ({
      ...g,
      title: s(g.title),
      note: s(g.note),
      emptyNote: s(g.emptyNote),
      images: g.images.map((i) => ({ ...i, caption: toWinAnsi(i.caption), note: s(i.note) })),
      missing: g.missing?.map((m) => ({ caption: toWinAnsi(m.caption), reason: toWinAnsi(m.reason) })),
    })),
    footnotes: report.footnotes?.map(toWinAnsi),
  }
}

// ── PDF ──────────────────────────────────────────────────────────────────

const PAGE_MARGIN = 42
const INK = '#1a2233'
const MUTED = '#5b6b85'
const RULE = '#d5deef'
const DANGER = '#b42318'

/** Widest a photograph is drawn in the PDF, in points. Two fit a row on A4. */
const PDF_IMAGE_W = 250

/**
 * Narrower inside a card.
 *
 * A card carries its photographs under the words that describe them, so the
 * pair has to fit on the same page as the text without pushing every defect
 * onto a page of its own. 210pt ≈ 74 mm, which still prints a loose gland
 * clearly enough to argue about.
 */
const CARD_IMAGE_W = 210

export async function toPdf(original: Report): Promise<Buffer> {
  // Once, here, over the whole report — rather than at each of the forty
  // `doc.text(...)` calls below, where the one that gets forgotten is the one
  // that scrambles a page.
  const report = plainReport(original)
  const at = report.generatedAt ?? new Date()

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      // Pages are buffered so the footers can be stamped at the end, when the
      // total is known. Stamping them as pages appear cannot work: the handler
      // has to move the text cursor to the bottom of the page to draw there,
      // and the caller then writes its next line into that position, overflows
      // immediately, and adds another page. That loop turned a four-page pack
      // into two hundred and sixty-eight.
      bufferPages: true,
      info: { Title: report.title, Author: 'CxSentinel', Subject: report.project },
    })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const width = doc.page.width - PAGE_MARGIN * 2
    const bottom = doc.page.height - PAGE_MARGIN - 26

    // A running footer on every page, stamped at the end over the buffered
    // pages so each one can say "page 3 of 11". A register without page
    // numbers is not a document anybody can refer to in writing.
    const stampFooters = () => {
      const range = doc.bufferedPageRange()
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i)
        const y = doc.page.height - PAGE_MARGIN - 16
        doc
          .save()
          .strokeColor(RULE)
          .lineWidth(0.5)
          .moveTo(PAGE_MARGIN, y - 6)
          .lineTo(PAGE_MARGIN + width, y - 6)
          .stroke()
          .fillColor(MUTED)
          .font('Helvetica')
          .fontSize(7.5)
          .text(`${report.project} · ${report.title} · ${when(at)}`, PAGE_MARGIN, y, {
            width: width - 70,
            lineBreak: false,
          })
          .text(`Page ${i - range.start + 1} of ${range.count}`, PAGE_MARGIN + width - 70, y, {
            width: 70,
            align: 'right',
            lineBreak: false,
          })
          .restore()
      }
    }

    const ensure = (needed: number) => {
      if (doc.y + needed > bottom) doc.addPage()
    }

    // ── Head ──────────────────────────────────────────────────────────
    doc.fillColor(INK).fontSize(20).font('Helvetica-Bold').text(report.title, { width })
    if (report.subtitle) {
      doc.moveDown(0.2).fillColor(MUTED).fontSize(10).font('Helvetica').text(report.subtitle, { width })
    }
    doc.moveDown(0.2).fillColor(MUTED).fontSize(8.5).text(`${report.project} · generated ${when(at)} by CxSentinel`, { width })
    doc.moveDown(0.6)
    doc.strokeColor(RULE).lineWidth(1).moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_MARGIN + width, doc.y).stroke()
    doc.moveDown(0.8)

    if (report.standfirst) {
      doc.fillColor(INK).fontSize(10.5).font('Helvetica').text(report.standfirst, { width })
      doc.moveDown(0.8)
    }

    // ── Figures ───────────────────────────────────────────────────────
    if (report.figures?.length) {
      const columns = Math.min(4, report.figures.length)
      const boxWidth = width / columns
      let x = PAGE_MARGIN
      const top = doc.y
      ensure(56)
      report.figures.forEach((f, i) => {
        if (i > 0 && i % columns === 0) {
          x = PAGE_MARGIN
          doc.y = top + Math.floor(i / columns) * 54
        }
        const y = doc.y
        doc.fillColor(MUTED).fontSize(7.5).font('Helvetica-Bold').text(f.label.toUpperCase(), x, y, { width: boxWidth - 8 })
        doc.fillColor(INK).fontSize(17).font('Helvetica-Bold').text(String(f.value), x, y + 11, { width: boxWidth - 8 })
        if (f.note) {
          doc.fillColor(MUTED).fontSize(7.5).font('Helvetica').text(f.note, x, y + 32, { width: boxWidth - 8 })
        }
        doc.y = y
        x += boxWidth
      })
      doc.y = top + Math.ceil(report.figures.length / columns) * 54
      doc.x = PAGE_MARGIN
      doc.moveDown(0.4)
    }

    // ── Tables ────────────────────────────────────────────────────────
    for (const table of report.tables ?? []) {
      const widths = table.widths ?? table.columns.map(() => 1)
      const total = widths.reduce((a, b) => a + b, 0)
      const cols = widths.map((w) => (w / total) * width)

      if (table.title) {
        ensure(40)
        doc.moveDown(0.5)
        doc.fillColor(INK).fontSize(12).font('Helvetica-Bold').text(table.title, PAGE_MARGIN, doc.y, { width })
        doc.moveDown(0.3)
      }

      const drawHeader = () => {
        const y = doc.y
        doc.save().rect(PAGE_MARGIN, y - 2, width, 16).fill('#eaf1ff').restore()
        let x = PAGE_MARGIN
        doc.fillColor(INK).fontSize(8).font('Helvetica-Bold')
        table.columns.forEach((column, i) => {
          doc.text(column, x + 3, y + 2, { width: cols[i] - 6, lineBreak: false })
          x += cols[i]
        })
        doc.y = y + 18
      }

      ensure(48)
      drawHeader()

      doc.font('Helvetica').fontSize(8)
      table.rows.forEach((row, r) => {
        // How tall this row needs to be, measured before anything is drawn,
        // so a long cell is never clipped by the page break.
        const height = Math.max(
          ...row.map((value, i) => doc.heightOfString(cell(value), { width: cols[i] - 6 })),
          10
        )
        if (doc.y + height + 6 > bottom) {
          doc.addPage()
          drawHeader()
          doc.font('Helvetica').fontSize(8)
        }
        const y = doc.y
        let x = PAGE_MARGIN
        doc.fillColor(table.emphasise?.has(r) ? DANGER : INK)
        row.forEach((value, i) => {
          doc.text(cell(value), x + 3, y, { width: cols[i] - 6 })
          x += cols[i]
        })
        doc.y = y + height + 4
        doc
          .save()
          .strokeColor('#eef2fa')
          .lineWidth(0.5)
          .moveTo(PAGE_MARGIN, doc.y - 2)
          .lineTo(PAGE_MARGIN + width, doc.y - 2)
          .stroke()
          .restore()
      })
      doc.moveDown(0.5)
    }

    // ── Cards ─────────────────────────────────────────────────────────
    //
    // One defect, one block: the words and the photograph of the thing they
    // describe, together.
    //
    // The whole block is MEASURED BEFORE ANY OF IT IS DRAWN, and moved to the
    // next page if it will not fit. That is the difference between a document
    // somebody can hand to a foreman and one where item P-014's photograph is
    // on page 6 and what to do about it is on page 7 — which is how a defect
    // gets closed against the wrong picture.
    //
    // A card taller than a whole page cannot be kept together by anybody, so
    // that one is allowed to flow; it only reserves enough for its heading so
    // the heading is never left alone at the foot of a page.
    for (const set of report.cards ?? []) {
      const gap = 14
      const cellW = (width - gap) / 2
      const imgW = Math.min(cellW, CARD_IMAGE_W)
      const frameH = Math.round(imgW * 0.72)
      const imgRowH = frameH + 30
      const pageH = bottom - PAGE_MARGIN

      ensure(50)
      doc.moveDown(0.8)
      if (set.title) {
        doc.fillColor(INK).fontSize(12).font('Helvetica-Bold').text(set.title, PAGE_MARGIN, doc.y, { width })
        doc.moveDown(0.3)
      }
      if (set.intro) {
        doc.fillColor(MUTED).fontSize(9).font('Helvetica').text(set.intro, PAGE_MARGIN, doc.y, { width })
        doc.moveDown(0.3)
      }
      if (set.cards.length === 0) {
        doc.fillColor(MUTED).fontSize(9).font('Helvetica-Oblique')
          .text(set.emptyNote ?? 'Nothing to report.', PAGE_MARGIN, doc.y, { width })
        doc.moveDown(0.4)
      }

      const factsLine = (card: ReportCard) =>
        (card.facts ?? []).map((f) => `${f.label}: ${f.value}`).join('    ·    ')

      for (const card of set.cards) {
        // Measure. Every fontSize/font call here is matched by the same pair
        // below — a mismatch would measure one thing and draw another, which
        // reads as a random extra gap under some cards and not others.
        let needed = 12
        doc.font('Helvetica-Bold').fontSize(11.5)
        needed += doc.heightOfString(card.heading, { width }) + 3
        if (card.strapline) {
          doc.font('Helvetica').fontSize(8.5)
          needed += doc.heightOfString(card.strapline, { width }) + 4
        }
        const facts = factsLine(card)
        if (facts) {
          doc.font('Helvetica').fontSize(8.5)
          needed += doc.heightOfString(facts, { width }) + 6
        }
        for (const block of card.paragraphs ?? []) {
          needed += 12
          doc.font('Helvetica').fontSize(9.5)
          needed += doc.heightOfString(block.text, { width }) + 3
          if (block.note) {
            doc.font('Helvetica-Oblique').fontSize(7.5)
            needed += doc.heightOfString(block.note, { width }) + 4
          }
        }
        const images = card.images ?? []
        const missing = card.missing ?? []
        if (images.length > 0) needed += 6 + Math.ceil(images.length / 2) * imgRowH
        needed += missing.length * 14
        if (images.length === 0 && missing.length === 0 && card.noImagesNote) needed += 16

        // Keep it whole if it can be whole.
        if (needed <= pageH) ensure(needed)
        else ensure(64)

        // Draw.
        doc.moveDown(0.5)
        doc.save().strokeColor(RULE).lineWidth(1)
          .moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_MARGIN + width, doc.y).stroke().restore()
        doc.moveDown(0.4)

        doc.fillColor(INK).font('Helvetica-Bold').fontSize(11.5).text(card.heading, PAGE_MARGIN, doc.y, { width })
        if (card.strapline) {
          doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(card.strapline, PAGE_MARGIN, doc.y + 1, { width })
        }
        if (facts) {
          doc.fillColor(INK).font('Helvetica').fontSize(8.5).text(facts, PAGE_MARGIN, doc.y + 3, { width })
        }

        for (const block of card.paragraphs ?? []) {
          doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7).text(block.label.toUpperCase(), PAGE_MARGIN, doc.y + 6, { width, characterSpacing: 0.4 })
          doc.fillColor(INK).font('Helvetica').fontSize(9.5).text(block.text, PAGE_MARGIN, doc.y + 1, { width })
          if (block.note) {
            doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(7.5).text(block.note, PAGE_MARGIN, doc.y + 1, { width })
          }
        }

        if (images.length > 0) doc.moveDown(0.5)
        for (let i = 0; i < images.length; i += 2) {
          ensure(imgRowH + 4)
          const top = doc.y
          images.slice(i, i + 2).forEach((image, n) => {
            const x = PAGE_MARGIN + n * (cellW + gap)
            try {
              doc.image(image.bytes, x, top, { fit: [imgW, frameH], align: 'center', valign: 'center' })
            } catch {
              doc.save().fillColor(MUTED).fontSize(8).font('Helvetica-Oblique')
                .text('This image could not be rendered.', x, top + frameH / 2, { width: imgW, align: 'center' })
                .restore()
            }
            doc.save()
            doc.fillColor(INK).fontSize(8).font('Helvetica-Bold')
              .text(image.caption, x, top + frameH + 4, { width: imgW, height: 10, ellipsis: true })
            if (image.note) {
              doc.fillColor(MUTED).fontSize(7).font('Helvetica')
                .text(image.note, x, top + frameH + 15, { width: imgW, height: 13, ellipsis: true })
            }
            doc.restore()
          })
          doc.y = top + imgRowH
        }

        for (const gone of missing) {
          ensure(22)
          doc.save()
          doc.fillColor(DANGER).fontSize(8).font('Helvetica-Bold')
            .text(`${gone.caption} — not shown.`, PAGE_MARGIN, doc.y + 3, { width, continued: true })
          doc.fillColor(MUTED).font('Helvetica').text(` ${gone.reason}`)
          doc.restore()
        }

        if (images.length === 0 && missing.length === 0 && card.noImagesNote) {
          ensure(20)
          doc.fillColor(MUTED).fontSize(7.5).font('Helvetica-Oblique')
            .text(card.noImagesNote, PAGE_MARGIN, doc.y + 4, { width })
        }

        doc.x = PAGE_MARGIN
      }
      doc.moveDown(0.6)
    }

    // ── Photographs ───────────────────────────────────────────────────
    //
    // Two to a row, so a pack of twenty does not run to twenty pages. The
    // height is reserved BEFORE the image is drawn, because pdfkit will
    // happily place an image past the bottom margin and the footer then
    // overlaps it.
    for (const gallery of report.galleries ?? []) {
      const images = gallery.images
      const missing = gallery.missing ?? []

      ensure(46)
      doc.moveDown(0.8)
      if (gallery.title) {
        doc.fillColor(INK).fontSize(12).font('Helvetica-Bold').text(gallery.title, PAGE_MARGIN, doc.y, { width })
        doc.moveDown(0.4)
      }

      if (images.length === 0 && missing.length === 0) {
        doc
          .fillColor(MUTED)
          .fontSize(9)
          .font('Helvetica')
          .text(gallery.emptyNote ?? 'No photographs.', PAGE_MARGIN, doc.y, { width })
        doc.moveDown(0.4)
      }

      const gap = 16
      const cellW = (width - gap) / 2
      const imgW = Math.min(cellW, PDF_IMAGE_W)
      // Reserve a 4:3 frame plus two lines of caption. Photographs come in
      // every shape and pdfkit reports the drawn height only after the fact,
      // so the row advances by a fixed amount and the image is fitted inside.
      const frameH = Math.round(imgW * 0.75)
      const rowH = frameH + 34

      for (let i = 0; i < images.length; i += 2) {
        ensure(rowH + 6)
        const top = doc.y
        const pair = images.slice(i, i + 2)

        pair.forEach((image, n) => {
          const x = PAGE_MARGIN + n * (cellW + gap)
          try {
            doc.image(image.bytes, x, top, { fit: [imgW, frameH], align: 'center', valign: 'center' })
          } catch {
            // A file the renderer cannot decode must not take the document
            // down with it.
            doc.save().fillColor(MUTED).fontSize(8).font('Helvetica-Oblique')
              .text('This image could not be rendered.', x, top + frameH / 2, { width: imgW, align: 'center' })
              .restore()
          }
          doc.save()
          doc.fillColor(INK).fontSize(8.5).font('Helvetica-Bold')
            .text(image.caption, x, top + frameH + 5, { width: imgW, height: 11, ellipsis: true })
          if (image.note) {
            doc.fillColor(MUTED).fontSize(7.5).font('Helvetica')
              .text(image.note, x, top + frameH + 17, { width: imgW, height: 14, ellipsis: true })
          }
          doc.restore()
        })

        doc.y = top + rowH
      }

      // A gap before the first one. Without it the red line lands directly
      // under the last caption and reads as a note about THAT photograph
      // rather than about one that is absent.
      if (missing.length > 0) doc.moveDown(0.7)

      for (const gone of missing) {
        ensure(24)
        doc.save()
        doc.fillColor(DANGER).fontSize(8.5).font('Helvetica-Bold')
          .text(`${gone.caption} — not shown.`, PAGE_MARGIN, doc.y, { width, continued: true })
        doc.fillColor(MUTED).font('Helvetica').text(` ${gone.reason}`)
        doc.restore()
        doc.moveDown(0.2)
      }

      if (gallery.note) {
        ensure(26)
        doc.moveDown(0.3)
        doc.fillColor(MUTED).fontSize(8).font('Helvetica-Oblique').text(gallery.note, PAGE_MARGIN, doc.y, { width })
      }
    }

    // ── Small print ───────────────────────────────────────────────────
    for (const note of report.footnotes ?? []) {
      ensure(30)
      doc.moveDown(0.4)
      doc.fillColor(MUTED).fontSize(8).font('Helvetica-Oblique').text(note, PAGE_MARGIN, doc.y, { width })
    }

    stampFooters()
    doc.flushPages()
    doc.end()
  })
}

export function wordResponse(buffer: Buffer, fileName: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}

export function pdfResponse(buffer: Buffer, fileName: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}

export function safeFileName(name: string): string {
  // Collapse the runs. A subject titled "SUB-A — Substation A" has three
  // characters in a row that are not filename-safe, and one underscore per
  // character gave "SUB-A___Substation_A".
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+(?=\.)|_+$/g, '')
}
