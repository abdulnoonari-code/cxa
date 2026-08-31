// Reading Word and PDF.
//
// A contract, a commissioning specification and a vendor procedure arrive as
// .docx or .pdf, and everything they demand of anybody is buried in prose. To
// get an obligation register out of them, the first job is to turn a file into
// numbered paragraphs — because a clause number is what an argument on site is
// conducted in. "Clause 7.1 says you were supposed to give us fourteen days"
// is a conversation; "somewhere in the spec it says" is not.
//
// Nothing here interprets. It splits a document into paragraphs, works out
// which of them carry a clause number, and stops. What is an obligation and
// whose it is belongs in lib/obligations.ts.

import mammoth from 'mammoth'
import { extractText, getDocumentProxy } from 'unpdf'

export type SourceFormat = 'docx' | 'pdf' | 'text'

export type Para = {
  /** 1-based position in the document, so a paragraph is always citable */
  index: number
  /** "7.1", "4.2.3", "Section 5" — null when the paragraph carries no number */
  clause: string | null
  /** the paragraph without its clause number */
  text: string
  /** looks like a heading rather than a body paragraph */
  heading: boolean
  page: number | null
}

export type Extraction = {
  ok: boolean
  format: SourceFormat | null
  paragraphs: Para[]
  /** the whole document as text, kept so it can be searched later */
  text: string
  pageCount: number | null
  wordCount: number
  reason: string | null
}

export function formatOf(fileName: string): SourceFormat | null {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.docx')) return 'docx'
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'text'
  return null
}

// A clause number at the start of a paragraph. Deliberately narrow: it must be
// at the very start, and it must look like a numbering scheme rather than a
// measurement, so "7.1 The Contractor shall…" is a clause and "11 kV busbar
// clearance" is not.
const CLAUSE_PATTERNS: RegExp[] = [
  // 7.1, 4.2.3, 12.10.1.4 — two or more parts, the usual specification style
  /^((?:\d+\.){1,5}\d+)[.)]?\s+(.*)$/,
  // Section 5, Clause 7, Article 12, Appendix B, Annex 3
  /^((?:section|clause|article|appendix|annex|schedule|part)\s+[\dA-Z][\d.\w]*)[.:)]?\s+(.*)$/i,
  // (a), (iv), a) — sub-clauses inside a numbered clause
  /^(\([a-z]{1,4}\)|\([ivxlc]{1,6}\)|[a-z]\))\s+(.*)$/i,
  // A single leading integer only when a decent sentence follows it, so a
  // stray page number or a quantity does not become a clause.
  /^(\d{1,2})[.)]\s+([A-Z].{25,})$/,
]

function splitClause(raw: string): { clause: string | null; text: string } {
  const line = raw.trim()
  for (const pattern of CLAUSE_PATTERNS) {
    const match = line.match(pattern)
    if (match) return { clause: match[1].trim(), text: match[2].trim() }
  }
  return { clause: null, text: line }
}

// A heading is short, has no full stop at the end, and is not a sentence about
// anybody doing anything. Headings are kept because they give a clause its
// context, but they are never obligations.
function looksLikeHeading(text: string): boolean {
  if (text.length > 90) return false
  if (/[.;]$/.test(text)) return false
  if (/\b(shall|must|will|should|is responsible|to be)\b/i.test(text)) return false
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return false
  if (words.length <= 12) return true
  return text === text.toUpperCase()
}

function toParagraphs(lines: string[], pageOf: (index: number) => number | null): Para[] {
  const paragraphs: Para[] = []
  let n = 0
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim()
    // Anything shorter than this is a page number, a header or a stray bullet.
    if (line.length < 3) continue
    n += 1
    const { clause, text } = splitClause(line)
    if (!text) continue
    paragraphs.push({
      index: n,
      clause,
      text,
      heading: looksLikeHeading(text),
      page: pageOf(paragraphs.length),
    })
  }
  return paragraphs
}

/**
 * Turn already-extracted text back into paragraphs.
 *
 * A revision's text is stored once, when the file is attached. Reading it for
 * obligations today and for requirements next week must not mean uploading
 * the file twice — and more importantly, both reads must see exactly the same
 * paragraphs, or the two registers will cite the same document differently.
 */
export function paragraphsFromText(text: string): Para[] {
  return toParagraphs(text.split(/\r?\n/), () => null)
}

/**
 * Turn an uploaded document into paragraphs.
 *
 * Never throws. A corrupt file, a scanned PDF with no text layer, a format
 * nobody expected — all come back as `{ ok: false }` with something a site
 * engineer can act on, because a 500 page on an upload screen tells nobody
 * anything.
 */
export async function extractDocument(
  buffer: ArrayBuffer,
  fileName: string
): Promise<Extraction> {
  const format = formatOf(fileName)
  const empty: Extraction = {
    ok: false,
    format,
    paragraphs: [],
    text: '',
    pageCount: null,
    wordCount: 0,
    reason: null,
  }

  if (!format) {
    return {
      ...empty,
      reason: `CxSentinel can read .docx, .pdf, .txt and .md. "${fileName}" is none of those. If it is an old .doc, open it in Word and save it as .docx.`,
    }
  }

  try {
    if (format === 'docx') {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })
      const text = result.value ?? ''
      const paragraphs = toParagraphs(text.split(/\r?\n/), () => null)
      if (paragraphs.length === 0) {
        return { ...empty, reason: 'The document opened but had no text in it.' }
      }
      return {
        ok: true,
        format,
        paragraphs,
        text,
        pageCount: null,
        wordCount: text.split(/\s+/).filter(Boolean).length,
        reason: null,
      }
    }

    if (format === 'pdf') {
      const proxy = await getDocumentProxy(new Uint8Array(buffer))
      // Page by page, so a paragraph can carry the page it came from — a
      // clause citation without a page number is half a citation.
      const perPage = await extractText(proxy, { mergePages: false })
      const pages: string[] = Array.isArray(perPage.text) ? perPage.text : [String(perPage.text ?? '')]

      const lines: string[] = []
      const pageOfLine: number[] = []
      pages.forEach((pageText, i) => {
        for (const line of String(pageText).split(/\r?\n/)) {
          lines.push(line)
          pageOfLine.push(i + 1)
        }
      })

      // toParagraphs skips short lines, so the page index is tracked against
      // the lines it keeps rather than the ones it was given.
      const kept: number[] = []
      lines.forEach((line, i) => {
        if (line.replace(/\s+/g, ' ').trim().length >= 3) kept.push(pageOfLine[i])
      })

      const paragraphs = toParagraphs(lines, (i) => kept[i] ?? null)
      const text = pages.join('\n')

      if (paragraphs.length === 0) {
        return {
          ...empty,
          pageCount: perPage.totalPages ?? pages.length,
          reason:
            'The PDF opened but no text could be read from it. It is almost certainly a scan — a picture of a document rather than a document. Run it through OCR, or upload the Word original.',
        }
      }

      return {
        ok: true,
        format,
        paragraphs,
        text,
        pageCount: perPage.totalPages ?? pages.length,
        wordCount: text.split(/\s+/).filter(Boolean).length,
        reason: null,
      }
    }

    const text = Buffer.from(buffer).toString('utf8')
    const paragraphs = toParagraphs(text.split(/\r?\n/), () => null)
    return {
      ok: paragraphs.length > 0,
      format,
      paragraphs,
      text,
      pageCount: null,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      reason: paragraphs.length > 0 ? null : 'The file had no text in it.',
    }
  } catch {
    return {
      ...empty,
      reason:
        'The file could not be opened. If it came out of an email or a zip, try saving it to disk first and uploading that copy.',
    }
  }
}
