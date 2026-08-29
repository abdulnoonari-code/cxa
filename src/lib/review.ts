// Phase 0 "initial assessment" is a fast, rule-based intake check that runs the
// instant a file is uploaded — no API key, no cost. It checks the file itself
// (name, extension, size), not its content. Real content review (Part 2) is a
// separate, deeper AI pass that reads what's actually in the document.
//
// This lives in lib/ rather than in a server-actions file because a file marked
// 'use server' may only export async functions.
export const ACCEPTED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'csv']

export function generateAttachmentReview(
  fileName: string,
  fileSize: number,
  tagId: string | null
): { status: 'ok' | 'warning'; note: string } {
  const issues: string[] = []
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''

  if (!ext || !ACCEPTED_EXTENSIONS.includes(ext)) {
    issues.push(`unexpected file type ".${ext || '?'}" — confirm this is the right document`)
  }
  if (tagId && !fileName.toLowerCase().includes(tagId.toLowerCase())) {
    issues.push(`file name doesn't include the equipment tag "${tagId}" — consider renaming for traceability`)
  }
  if (fileSize < 2048) {
    issues.push("file is unusually small — confirm it isn't a blank or corrupted scan")
  }

  if (issues.length === 0) {
    return { status: 'ok', note: 'Initial check passed — file type and name look correct.' }
  }
  return { status: 'warning', note: `Initial check flagged: ${issues.join('; ')}.` }
}
