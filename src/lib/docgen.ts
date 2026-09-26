// Word and PDF out.
//
// Everything CxNivora produces has, until now, gone out as Excel — right for
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
import { CXNIVORA, type Brand } from '@/lib/brand'
import { drawMark } from '@/lib/mark'

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
  /**
   * A short word printed ON the photograph — "before", "after".
   *
   * On the photograph and not under it, because a caption is read after the
   * picture, and by then the reader has already decided which one they are
   * looking at. On a defect report that decision is the whole point.
   */
  tag?: string
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

  /**
   * Which brand to wear. Defaults to the first — every document in the
   * application wears the same one, and it is passed rather than imported
   * so a sample can be rendered in another without a global being changed.
   */
  brand?: Brand

  /**
   * The parts that make this an ISSUED DOCUMENT rather than a printout.
   *
   * A punch list somebody prints to walk the site with wants none of them,
   * and passes `cover: false`. A defect report going to a contractor wants
   * all of them, because the first three questions anybody asks of a
   * document are which revision, who issued it, and to whom.
   */
  meta?: {
    cover?: boolean
    docNumber?: string
    revision?: string
    issuedTo?: string
    preparedBy?: string
    checkedBy?: string
    acceptedBy?: string
    status?: string
    signatures?: boolean
  }
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
      children: [new TextRun({ text: `${report.project} · generated ${when(at)} by CxNivora`, size: 18, color: '5B6B85' })],
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
    creator: 'CxNivora',
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
        images: c.images?.map((i) => ({ ...i, caption: toWinAnsi(i.caption), note: s(i.note), tag: s(i.tag) })),
        missing: c.missing?.map((m) => ({ caption: toWinAnsi(m.caption), reason: toWinAnsi(m.reason) })),
        noImagesNote: s(c.noImagesNote),
      })),
    })),
    galleries: report.galleries?.map((g) => ({
      ...g,
      title: s(g.title),
      note: s(g.note),
      emptyNote: s(g.emptyNote),
      images: g.images.map((i) => ({ ...i, caption: toWinAnsi(i.caption), note: s(i.note), tag: s(i.tag) })),
      missing: g.missing?.map((m) => ({ caption: toWinAnsi(m.caption), reason: toWinAnsi(m.reason) })),
    })),
    footnotes: report.footnotes?.map(toWinAnsi),
    // The cover carries names and document numbers, and a Thai contractor
    // name on a cover page would scramble the rest of the line exactly as it
    // did in the body before this pass existed.
    meta: report.meta
      ? {
          ...report.meta,
          docNumber: s(report.meta.docNumber),
          revision: s(report.meta.revision),
          issuedTo: s(report.meta.issuedTo),
          preparedBy: s(report.meta.preparedBy),
          checkedBy: s(report.meta.checkedBy),
          acceptedBy: s(report.meta.acceptedBy),
          status: s(report.meta.status),
        }
      : undefined,
  }
}

// ── PDF ──────────────────────────────────────────────────────────────────

/**
 * 48, not 42.
 *
 * The old margin was set when the page had no header on it. Now every page
 * past the cover carries the mark and the document's name, and 42 put the
 * first line of text six points under a hairline — which reads as cramped
 * even to somebody who could not say why.
 */
const PAGE_MARGIN = 48

/**
 * The one colour that is NOT the brand's to choose.
 *
 * Red means failed, here and everywhere else in this application. A
 * photograph that could not be fetched and a row that is overdue are printed
 * in it whatever brand the document is wearing — see lib/brand.ts for why
 * the brand accent is kept measurably far away from it.
 */
const DANGER = '#B42318'

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
  const brand = report.brand ?? CXNIVORA
  const c = brand.colors
  const at = report.generatedAt ?? new Date()
  const meta = report.meta ?? {}
  const wantsCover = meta.cover !== false

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      // Pages are buffered so the furniture can be stamped at the end, when
      // the total is known. Stamping as pages appear cannot work: the handler
      // has to move the text cursor to draw at the foot of the page, and the
      // caller then writes its next line into that position, overflows
      // immediately, and adds another page. That loop turned a four-page pack
      // into two hundred and sixty-eight.
      bufferPages: true,
      info: { Title: report.title, Author: brand.name, Subject: report.project },
    })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const width = doc.page.width - PAGE_MARGIN * 2
    const pageW = doc.page.width
    const pageH = doc.page.height
    const bottom = pageH - PAGE_MARGIN - 30

    // Which page the content starts on, so the cover keeps its own furniture.
    let firstContentPage = 0

    const ensure = (needed: number) => {
      if (doc.y + needed > bottom) doc.addPage()
    }

    // ── A label above a thing ─────────────────────────────────────────
    //
    // Small, letterspaced, in the muted ink. Used for every "WHAT IS
    // WRONG" / "DOCUMENT NUMBER" heading, so they are all identical and a
    // reader learns the pattern once.
    const label = (text: string, x: number, y: number, w: number) => {
      doc.fillColor(c.muted).font('Helvetica-Bold').fontSize(7).text(text.toUpperCase(), x, y, {
        width: w,
        characterSpacing: 0.6,
      })
    }

    // ══════════════════════════════════════════════════════════════════
    // THE COVER
    //
    // A document somebody issues to a client has a front. Without one this
    // is a printout: it starts mid-thought, there is nowhere to put the
    // revision or who it was issued to, and nothing on it says who made it.
    // ══════════════════════════════════════════════════════════════════
    if (wantsCover) {
      const bandH = 232

      doc.save().rect(0, 0, pageW, bandH).fill(c.anchor).restore()
      // A thin accent line at the foot of the band: the one place the bright
      // colour is spent on the cover.
      doc.save().rect(0, bandH - 5, pageW, 5).fill(c.accent).restore()

      drawMark(doc as unknown as Parameters<typeof drawMark>[0], brand, PAGE_MARGIN, 46, 38, true)

      doc
        .fillColor(c.ground)
        .font('Helvetica-Bold')
        .fontSize(19)
        .text(brand.name, PAGE_MARGIN + 50, 52, { width: 300, lineBreak: false })
      doc
        .fillColor(c.accent)
        .font('Helvetica')
        .fontSize(8.5)
        .text(brand.line.toUpperCase(), PAGE_MARGIN + 50, 74, { width: 300, characterSpacing: 1.1, lineBreak: false })

      doc
        .fillColor(c.ground)
        .font('Helvetica-Bold')
        .fontSize(29)
        .text(report.title, PAGE_MARGIN, 128, { width: width - 40 })

      if (report.subtitle) {
        doc
          .fillColor('#FFFFFF')
          .opacity(0.72)
          .font('Helvetica')
          .fontSize(11)
          .text(report.subtitle, PAGE_MARGIN, doc.y + 4, { width: width - 60 })
          .opacity(1)
      }

      // ── Who, what, which revision ──────────────────────────────────
      let y = bandH + 34
      doc.fillColor(c.ink).font('Helvetica-Bold').fontSize(15).text(report.project, PAGE_MARGIN, y, { width })
      y = doc.y + 18

      const facts: [string, string][] = [
        ['Document', meta.docNumber ?? report.title],
        ['Revision', meta.revision ?? '—'],
        ['Date of issue', at.toISOString().slice(0, 10)],
        ['Issued to', meta.issuedTo ?? 'The project record'],
        ['Prepared by', meta.preparedBy ?? brand.name],
        ['Status', meta.status ?? 'Issued'],
      ]

      const colW = width / 2
      facts.forEach((fact, i) => {
        const fx = PAGE_MARGIN + (i % 2) * colW
        const fy = y + Math.floor(i / 2) * 42
        label(fact[0], fx, fy, colW - 20)
        doc.fillColor(c.ink).font('Helvetica-Bold').fontSize(10.5).text(fact[1], fx, fy + 12, { width: colW - 20 })
      })
      y += Math.ceil(facts.length / 2) * 42 + 12

      // ── The verdict, in a panel ────────────────────────────────────
      if (report.standfirst) {
        doc.font('Helvetica').fontSize(11)
        const h = doc.heightOfString(report.standfirst, { width: width - 36 }) + 30
        doc.save().roundedRect(PAGE_MARGIN, y, width, h, 6).fill(c.accentWash).restore()
        doc.save().rect(PAGE_MARGIN, y, 4, h).fill(c.accent).restore()
        doc.fillColor(c.ink).font('Helvetica').fontSize(11).text(report.standfirst, PAGE_MARGIN + 20, y + 15, { width: width - 36 })
        y += h + 22
      }

      // ── The figures, as tiles ──────────────────────────────────────
      if (report.figures?.length) {
        const n = Math.min(4, report.figures.length)
        const gap = 10
        const tileW = (width - gap * (n - 1)) / n
        report.figures.slice(0, n).forEach((figure, i) => {
          const fx = PAGE_MARGIN + i * (tileW + gap)
          doc.save().roundedRect(fx, y, tileW, 82, 6).fill(c.ground).restore()
          doc.save().roundedRect(fx, y, tileW, 82, 6).lineWidth(0.8).stroke(c.rule).restore()
          label(figure.label, fx + 12, y + 12, tileW - 20)
          // The number is a WORD, not a shape, so it takes the darker step of the
          // accent. The bright one measures 3.10 on this wash — enough for the
          // tile's border to be found, not enough for a figure somebody is
          // going to write down and act on.
          doc.fillColor(c.accentInk).font('Helvetica-Bold').fontSize(22).text(String(figure.value), fx + 12, y + 24, {
            width: tileW - 20,
            lineBreak: false,
          })
          if (figure.note) {
            // 82 tall and 24 of note, not 74 and 18: "Somebody has said what
            // to do" wraps to two lines and the second one was being cut in
            // half. A figure whose caption is clipped is a figure nobody
            // trusts the rest of.
            doc.fillColor(c.muted).font('Helvetica').fontSize(7.5).text(figure.note, fx + 12, y + 52, { width: tileW - 20, height: 24 })
          }
        })
        y += 82 + 20
      }

      // A closing line at the foot of the cover.
      doc
        .fillColor(c.muted)
        .font('Helvetica')
        .fontSize(7.5)
        .text(
          `Generated by ${brand.name} on ${when(at)}. This document reflects the project record at that moment and is uncontrolled once printed.`,
          PAGE_MARGIN,
          pageH - PAGE_MARGIN - 54,
          { width: width - 10 }
        )

      doc.addPage()
      firstContentPage = 1
      doc.y = PAGE_MARGIN + 30
    }

    // ── The running furniture, stamped at the end ─────────────────────
    const stampFurniture = () => {
      const range = doc.bufferedPageRange()
      const total = range.count
      for (let i = range.start; i < range.start + total; i++) {
        doc.switchToPage(i)
        const isCover = wantsCover && i === range.start

        if (!isCover) {
          // Header: the mark, the name, and what this document is.
          drawMark(doc as unknown as Parameters<typeof drawMark>[0], brand, PAGE_MARGIN, PAGE_MARGIN - 18, 15)
          doc
            .fillColor(c.anchor)
            .font('Helvetica-Bold')
            .fontSize(9)
            .text(brand.name, PAGE_MARGIN + 21, PAGE_MARGIN - 15, { width: 140, lineBreak: false })
          doc
            .fillColor(c.muted)
            .font('Helvetica')
            .fontSize(8)
            .text(`${report.title} · ${report.project}`, PAGE_MARGIN + 150, PAGE_MARGIN - 15, {
              width: width - 150,
              align: 'right',
              lineBreak: false,
            })
          doc
            .save()
            .rect(PAGE_MARGIN, PAGE_MARGIN - 1, width, 1.6)
            .fill(c.accent)
            .restore()
        }

        // Footer on every page, cover included: a page with no number is a
        // page nobody can refer to in writing.
        const fy = pageH - PAGE_MARGIN - 14
        doc
          .save()
          .strokeColor(c.rule)
          .lineWidth(0.6)
          .moveTo(PAGE_MARGIN, fy - 7)
          .lineTo(PAGE_MARGIN + width, fy - 7)
          .stroke()
          .restore()
        doc
          .fillColor(c.muted)
          .font('Helvetica')
          .fontSize(7.5)
          .text(
            isCover ? `${brand.name} · ${report.project}` : `${report.project} · ${report.title}${meta.revision ? ` · Rev ${meta.revision}` : ''}`,
            PAGE_MARGIN,
            fy,
            { width: width - 90, lineBreak: false }
          )
          .text(`Page ${i - range.start + 1} of ${total}`, PAGE_MARGIN + width - 90, fy, {
            width: 90,
            align: 'right',
            lineBreak: false,
          })
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // CONTENT
    // ══════════════════════════════════════════════════════════════════

    // Without a cover, the report still needs a head — the punch list
    // printed to walk the site with does not want a title page.
    if (!wantsCover) {
      drawMark(doc as unknown as Parameters<typeof drawMark>[0], brand, PAGE_MARGIN, doc.y, 26)
      doc.fillColor(c.ink).fontSize(20).font('Helvetica-Bold').text(report.title, PAGE_MARGIN + 36, doc.y + 2, { width: width - 36 })
      if (report.subtitle) {
        doc.moveDown(0.2).fillColor(c.muted).fontSize(10).font('Helvetica').text(report.subtitle, PAGE_MARGIN, doc.y, { width })
      }
      doc.moveDown(0.2).fillColor(c.muted).fontSize(8.5).text(`${report.project} · ${when(at)}`, PAGE_MARGIN, doc.y, { width })
      doc.moveDown(0.5)
      doc.save().rect(PAGE_MARGIN, doc.y, width, 1.6).fill(c.accent).restore()
      doc.moveDown(0.9)

      if (report.standfirst) {
        doc.fillColor(c.ink).fontSize(10.5).font('Helvetica').text(report.standfirst, PAGE_MARGIN, doc.y, { width })
        doc.moveDown(0.8)
      }

      if (report.figures?.length) {
        const n = Math.min(4, report.figures.length)
        const gap = 10
        const tileW = (width - gap * (n - 1)) / n
        const top = doc.y
        ensure(80)
        report.figures.slice(0, n).forEach((figure, i) => {
          const fx = PAGE_MARGIN + i * (tileW + gap)
          doc.save().roundedRect(fx, top, tileW, 70, 6).fill(c.accentWash).restore()
          label(figure.label, fx + 11, top + 11, tileW - 18)
          // The number is a WORD, not a shape, so it takes the darker step of the
          // accent. The bright one measures 3.10 on this wash — enough for the
          // tile's border to be found, not enough for a figure somebody is
          // going to write down and act on.
          doc.fillColor(c.accentInk).font('Helvetica-Bold').fontSize(20).text(String(figure.value), fx + 11, top + 23, {
            width: tileW - 18,
            lineBreak: false,
          })
          if (figure.note) {
            doc.fillColor(c.muted).font('Helvetica').fontSize(7.5).text(figure.note, fx + 11, top + 50, { width: tileW - 18, height: 16 })
          }
        })
        doc.y = top + 70 + 16
        doc.x = PAGE_MARGIN
      }
    }

    // ── Tables ────────────────────────────────────────────────────────
    for (const table of report.tables ?? []) {
      const widths = table.widths ?? table.columns.map(() => 1)
      const total = widths.reduce((a, b) => a + b, 0)
      const cols = widths.map((w) => (w / total) * width)

      if (table.title) {
        ensure(46)
        doc.moveDown(0.7)
        doc.fillColor(c.ink).fontSize(12.5).font('Helvetica-Bold').text(table.title, PAGE_MARGIN, doc.y, { width })
        doc.moveDown(0.35)
      }

      const drawHeader = () => {
        const y = doc.y
        doc.save().rect(PAGE_MARGIN, y - 3, width, 19).fill(c.anchor).restore()
        let x = PAGE_MARGIN
        doc.fillColor(c.ground).fontSize(7.5).font('Helvetica-Bold')
        table.columns.forEach((column, i) => {
          doc.text(column.toUpperCase(), x + 5, y + 3, { width: cols[i] - 10, lineBreak: false, characterSpacing: 0.4 })
          x += cols[i]
        })
        doc.y = y + 21
      }

      ensure(52)
      drawHeader()

      doc.font('Helvetica').fontSize(8)
      table.rows.forEach((row, r) => {
        const height = Math.max(...row.map((value, i) => doc.heightOfString(cell(value), { width: cols[i] - 10 })), 11)
        if (doc.y + height + 8 > bottom) {
          doc.addPage()
          doc.y = PAGE_MARGIN + 30
          drawHeader()
          doc.font('Helvetica').fontSize(8)
        }
        const y = doc.y
        // Banding, so an eye can cross eight columns without losing the row.
        if (r % 2 === 1) doc.save().rect(PAGE_MARGIN, y - 3, width, height + 7).fill(c.ground).restore()

        let x = PAGE_MARGIN
        doc.fillColor(table.emphasise?.has(r) ? DANGER : c.ink)
        row.forEach((value, i) => {
          doc.text(cell(value), x + 5, y, { width: cols[i] - 10 })
          x += cols[i]
        })
        doc.y = y + height + 5
        doc.save().strokeColor(c.rule).lineWidth(0.4).moveTo(PAGE_MARGIN, doc.y - 2).lineTo(PAGE_MARGIN + width, doc.y - 2).stroke().restore()
      })
      doc.moveDown(0.6)
    }

    // ── Cards ─────────────────────────────────────────────────────────
    //
    // One defect, one block: the words and the photograph of the thing they
    // describe, together. Measured whole before any of it is drawn and moved
    // to the next page if it will not fit, so a defect's number is never on
    // one page and what to do about it on the next.
    for (const set of report.cards ?? []) {
      const gap = 16
      const cellW = (width - gap) / 2
      const imgW = Math.min(cellW, CARD_IMAGE_W)
      const frameH = Math.round(imgW * 0.72)
      const imgRowH = frameH + 38
      const pageSpace = bottom - PAGE_MARGIN - 30

      ensure(56)
      doc.moveDown(0.9)
      if (set.title) {
        doc.save().rect(PAGE_MARGIN, doc.y, 4, 17).fill(c.accent).restore()
        doc.fillColor(c.ink).fontSize(13).font('Helvetica-Bold').text(set.title, PAGE_MARGIN + 13, doc.y + 1, { width: width - 13 })
        doc.moveDown(0.35)
      }
      if (set.intro) {
        doc.fillColor(c.muted).fontSize(9).font('Helvetica').text(set.intro, PAGE_MARGIN, doc.y, { width })
        doc.moveDown(0.35)
      }
      if (set.cards.length === 0) {
        doc.fillColor(c.muted).fontSize(9).font('Helvetica-Oblique').text(set.emptyNote ?? 'Nothing to report.', PAGE_MARGIN, doc.y, { width })
        doc.moveDown(0.5)
      }

      const factsLine = (card: ReportCard) => (card.facts ?? []).map((f) => `${f.label}: ${f.value}`).join('     ')

      for (const card of set.cards) {
        const inset = 14
        const textW = width - inset - 6

        // Measure. Every font call here is matched below — a mismatch reads
        // as a random extra gap under some cards and not others.
        let needed = 20
        doc.font('Helvetica-Bold').fontSize(12.5)
        needed += doc.heightOfString(card.heading, { width: textW }) + 4
        if (card.strapline) {
          doc.font('Helvetica').fontSize(8.5)
          needed += doc.heightOfString(card.strapline, { width: textW }) + 6
        }
        const facts = factsLine(card)
        if (facts) {
          doc.font('Helvetica').fontSize(8.5)
          needed += doc.heightOfString(facts, { width: textW - 22 }) + 20
        }
        for (const block of card.paragraphs ?? []) {
          needed += 13
          doc.font('Helvetica').fontSize(9.5)
          needed += doc.heightOfString(block.text, { width: textW }) + 4
          if (block.note) {
            doc.font('Helvetica-Oblique').fontSize(7.5)
            needed += doc.heightOfString(block.note, { width: textW }) + 5
          }
        }
        const images = card.images ?? []
        const missing = card.missing ?? []
        if (images.length > 0) needed += 8 + Math.ceil(images.length / 2) * imgRowH
        needed += missing.length * 15
        if (images.length === 0 && missing.length === 0 && card.noImagesNote) needed += 17

        if (needed <= pageSpace) ensure(needed)
        else ensure(70)

        const cardTop = doc.y + 8

        doc.moveDown(0.6)
        doc.fillColor(c.ink).font('Helvetica-Bold').fontSize(12.5).text(card.heading, PAGE_MARGIN + inset, doc.y, { width: textW })
        if (card.strapline) {
          doc.fillColor(c.muted).font('Helvetica').fontSize(8.5).text(card.strapline, PAGE_MARGIN + inset, doc.y + 2, { width: textW })
        }

        if (facts) {
          const fy = doc.y + 8
          doc.font('Helvetica').fontSize(8.5)
          const fh = doc.heightOfString(facts, { width: textW - 22 }) + 13
          doc.save().roundedRect(PAGE_MARGIN + inset, fy, textW, fh, 4).fill(c.accentWash).restore()
          doc.fillColor(c.ink).font('Helvetica').fontSize(8.5).text(facts, PAGE_MARGIN + inset + 11, fy + 6, { width: textW - 22 })
          doc.y = fy + fh
        }

        for (const block of card.paragraphs ?? []) {
          label(block.label, PAGE_MARGIN + inset, doc.y + 8, textW)
          doc.fillColor(c.ink).font('Helvetica').fontSize(9.5).text(block.text, PAGE_MARGIN + inset, doc.y + 2, { width: textW })
          if (block.note) {
            doc.fillColor(c.muted).font('Helvetica-Oblique').fontSize(7.5).text(block.note, PAGE_MARGIN + inset, doc.y + 2, { width: textW })
          }
        }

        if (images.length > 0) doc.moveDown(0.6)
        for (let i = 0; i < images.length; i += 2) {
          ensure(imgRowH + 6)
          const top = doc.y
          images.slice(i, i + 2).forEach((image, n) => {
            const x = PAGE_MARGIN + inset + n * (cellW + gap)
            doc.save().roundedRect(x, top, imgW, frameH, 4).fill(c.ground).restore()
            try {
              doc.image(image.bytes, x, top, { fit: [imgW, frameH], align: 'center', valign: 'center' })
            } catch {
              // A file the renderer cannot decode must not take the document
              // down with it.
              doc
                .save()
                .fillColor(c.muted)
                .fontSize(8)
                .font('Helvetica-Oblique')
                .text('This image could not be rendered.', x, top + frameH / 2, { width: imgW, align: 'center' })
                .restore()
            }
            doc.save().roundedRect(x, top, imgW, frameH, 4).lineWidth(0.7).stroke(c.rule).restore()

            // BEFORE / AFTER, as a chip on the photograph itself. A caption
            // underneath is read after the picture, which is too late — the
            // reader has already decided which one they are looking at.
            if (image.tag) {
              const text = image.tag.toUpperCase()
              doc.font('Helvetica-Bold').fontSize(6.5)
              const tw = doc.widthOfString(text, { characterSpacing: 0.7 }) + 14
              doc.save().roundedRect(x + 7, top + 7, tw, 14, 3).fill(c.anchor).restore()
              doc.fillColor(c.ground).font('Helvetica-Bold').fontSize(6.5).text(text, x + 7, top + 11, {
                width: tw,
                align: 'center',
                characterSpacing: 0.7,
                lineBreak: false,
              })
            }

            doc.save()
            doc.fillColor(c.ink).fontSize(8).font('Helvetica-Bold').text(image.caption, x, top + frameH + 6, {
              width: imgW,
              height: 11,
              ellipsis: true,
            })
            if (image.note) {
              doc.fillColor(c.muted).fontSize(7).font('Helvetica').text(image.note, x, top + frameH + 18, {
                width: imgW,
                height: 16,
                ellipsis: true,
              })
            }
            doc.restore()
          })
          doc.y = top + imgRowH
        }

        for (const gone of missing) {
          ensure(22)
          doc.save()
          doc.fillColor(DANGER).fontSize(8).font('Helvetica-Bold').text(`${gone.caption} — not shown.`, PAGE_MARGIN + inset, doc.y + 3, {
            width: textW,
            continued: true,
          })
          doc.fillColor(c.muted).font('Helvetica').text(` ${gone.reason}`)
          doc.restore()
        }

        if (images.length === 0 && missing.length === 0 && card.noImagesNote) {
          ensure(20)
          doc.fillColor(c.muted).fontSize(7.5).font('Helvetica-Oblique').text(card.noImagesNote, PAGE_MARGIN + inset, doc.y + 4, { width: textW })
        }

        // The accent rule down the left of the whole block, drawn last now
        // that its height is known. It is what makes a page of defects read
        // as a list of separate things rather than a wall.
        const cardBottom = doc.y + 4
        if (cardBottom > cardTop) {
          doc.save().roundedRect(PAGE_MARGIN, cardTop, 3.5, cardBottom - cardTop, 2).fill(c.accent).restore()
        }

        doc.x = PAGE_MARGIN
        doc.moveDown(0.5)
      }
      doc.moveDown(0.5)
    }

    // ── Photographs gathered together ─────────────────────────────────
    for (const gallery of report.galleries ?? []) {
      const images = gallery.images
      const missing = gallery.missing ?? []

      ensure(50)
      doc.moveDown(0.9)
      if (gallery.title) {
        doc.save().rect(PAGE_MARGIN, doc.y, 4, 17).fill(c.accent).restore()
        doc.fillColor(c.ink).fontSize(13).font('Helvetica-Bold').text(gallery.title, PAGE_MARGIN + 13, doc.y + 1, { width: width - 13 })
        doc.moveDown(0.4)
      }

      if (images.length === 0 && missing.length === 0) {
        doc.fillColor(c.muted).fontSize(9).font('Helvetica').text(gallery.emptyNote ?? 'No photographs.', PAGE_MARGIN, doc.y, { width })
        doc.moveDown(0.4)
      }

      const gap = 16
      const cellW = (width - gap) / 2
      const imgW = Math.min(cellW, PDF_IMAGE_W)
      const frameH = Math.round(imgW * 0.72)
      const rowH = frameH + 38

      for (let i = 0; i < images.length; i += 2) {
        ensure(rowH + 6)
        const top = doc.y
        images.slice(i, i + 2).forEach((image, n) => {
          const x = PAGE_MARGIN + n * (cellW + gap)
          doc.save().roundedRect(x, top, imgW, frameH, 4).fill(c.ground).restore()
          try {
            doc.image(image.bytes, x, top, { fit: [imgW, frameH], align: 'center', valign: 'center' })
          } catch {
            doc
              .save()
              .fillColor(c.muted)
              .fontSize(8)
              .font('Helvetica-Oblique')
              .text('This image could not be rendered.', x, top + frameH / 2, { width: imgW, align: 'center' })
              .restore()
          }
          doc.save().roundedRect(x, top, imgW, frameH, 4).lineWidth(0.7).stroke(c.rule).restore()
          doc.save()
          doc.fillColor(c.ink).fontSize(8).font('Helvetica-Bold').text(image.caption, x, top + frameH + 6, { width: imgW, height: 11, ellipsis: true })
          if (image.note) {
            doc.fillColor(c.muted).fontSize(7).font('Helvetica').text(image.note, x, top + frameH + 18, { width: imgW, height: 16, ellipsis: true })
          }
          doc.restore()
        })
        doc.y = top + rowH
      }

      if (missing.length > 0) doc.moveDown(0.7)
      for (const gone of missing) {
        ensure(24)
        doc.save()
        doc.fillColor(DANGER).fontSize(8.5).font('Helvetica-Bold').text(`${gone.caption} — not shown.`, PAGE_MARGIN, doc.y, { width, continued: true })
        doc.fillColor(c.muted).font('Helvetica').text(` ${gone.reason}`)
        doc.restore()
        doc.moveDown(0.2)
      }

      if (gallery.note) {
        ensure(26)
        doc.moveDown(0.3)
        doc.fillColor(c.muted).fontSize(8).font('Helvetica-Oblique').text(gallery.note, PAGE_MARGIN, doc.y, { width })
      }
    }

    // ── Signatures ────────────────────────────────────────────────────
    //
    // A document issued to another party is signed, or it is a printout of
    // a screen. Three boxes and nothing clever: who made it, who checked
    // it, who accepted it.
    if (meta.signatures !== false) {
      ensure(120)
      doc.moveDown(1.2)
      doc.save().rect(PAGE_MARGIN, doc.y, width, 1).fill(c.rule).restore()
      doc.moveDown(0.6)
      label('Issued and accepted', PAGE_MARGIN, doc.y, width)
      doc.moveDown(1.1)

      const boxes: [string, string][] = [
        ['Prepared by', meta.preparedBy ?? ''],
        ['Checked by', meta.checkedBy ?? ''],
        ['Accepted by', meta.acceptedBy ?? ''],
      ]
      const gap = 14
      const boxW = (width - gap * 2) / 3
      const top = doc.y
      boxes.forEach(([role, name], i) => {
        const x = PAGE_MARGIN + i * (boxW + gap)
        doc.save().roundedRect(x, top, boxW, 78, 5).lineWidth(0.8).stroke(c.rule).restore()
        label(role, x + 11, top + 10, boxW - 22)
        // Two lines, not one. "A. Jabbar, Commissioning Manager" was being
        // cut to "A. Jabbar, Commissioning" — a signature block that clips
        // somebody's job title is the one part of the document people look
        // at hardest.
        doc.fillColor(c.ink).font('Helvetica-Bold').fontSize(9).text(name || ' ', x + 11, top + 22, { width: boxW - 22, height: 24 })
        doc.save().strokeColor(c.rule).lineWidth(0.7).moveTo(x + 11, top + 52).lineTo(x + boxW - 11, top + 52).stroke().restore()
        doc.fillColor(c.muted).font('Helvetica').fontSize(6.8).text('Signature', x + 11, top + 55, { width: boxW - 22 })
        doc.save().strokeColor(c.rule).lineWidth(0.7).moveTo(x + 11, top + 70).lineTo(x + boxW - 11, top + 70).stroke().restore()
        doc.fillColor(c.muted).font('Helvetica').fontSize(6.8).text('Date', x + 11, top + 68, { width: boxW - 22 })
      })
      doc.y = top + 78
    }

    // ── Small print ───────────────────────────────────────────────────
    for (const note of report.footnotes ?? []) {
      ensure(32)
      doc.moveDown(0.5)
      doc.fillColor(c.muted).fontSize(8).font('Helvetica-Oblique').text(note, PAGE_MARGIN, doc.y, { width })
    }

    void firstContentPage
    stampFurniture()
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
