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

export type Report = {
  title: string
  subtitle?: string
  project: string
  /** a short paragraph under the title — the verdict, usually */
  standfirst?: string
  figures?: ReportFigure[]
  tables?: ReportTable[]
  /** photographs, printed after the tables */
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

// ── PDF ──────────────────────────────────────────────────────────────────

const PAGE_MARGIN = 42
const INK = '#1a2233'
const MUTED = '#5b6b85'
const RULE = '#d5deef'
const DANGER = '#b42318'

/** Widest a photograph is drawn in the PDF, in points. Two fit a row on A4. */
const PDF_IMAGE_W = 250

export async function toPdf(report: Report): Promise<Buffer> {
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
