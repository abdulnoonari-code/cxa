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

import { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx'
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

export type Report = {
  title: string
  subtitle?: string
  project: string
  /** a short paragraph under the title — the verdict, usually */
  standfirst?: string
  figures?: ReportFigure[]
  tables?: ReportTable[]
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

export async function toPdf(report: Report): Promise<Buffer> {
  const at = report.generatedAt ?? new Date()

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      info: { Title: report.title, Author: 'CxSentinel', Subject: report.project },
    })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const width = doc.page.width - PAGE_MARGIN * 2
    const bottom = doc.page.height - PAGE_MARGIN - 26

    // A running footer on every page, added as pages appear. A register
    // without page numbers is not a document anybody can refer to in writing.
    let pageNumber = 0
    const stampFooter = () => {
      pageNumber += 1
      const y = doc.page.height - PAGE_MARGIN - 16
      doc
        .save()
        .strokeColor(RULE)
        .lineWidth(0.5)
        .moveTo(PAGE_MARGIN, y - 6)
        .lineTo(PAGE_MARGIN + width, y - 6)
        .stroke()
        .fillColor(MUTED)
        .fontSize(7.5)
        .text(`${report.project} · ${report.title} · ${when(at)}`, PAGE_MARGIN, y, { width: width - 60, lineBreak: false })
        .text(`Page ${pageNumber}`, PAGE_MARGIN + width - 60, y, { width: 60, align: 'right', lineBreak: false })
        .restore()
    }
    doc.on('pageAdded', stampFooter)

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

    // ── Small print ───────────────────────────────────────────────────
    for (const note of report.footnotes ?? []) {
      ensure(30)
      doc.moveDown(0.4)
      doc.fillColor(MUTED).fontSize(8).font('Helvetica-Oblique').text(note, PAGE_MARGIN, doc.y, { width })
    }

    stampFooter() // the first page never fires pageAdded
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
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}
