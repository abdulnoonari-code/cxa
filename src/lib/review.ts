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

// The same rule-based reviewer the checklist runs on every save. Kept here so
// both the equipment checklist and the project-wide Checklists screen can call
// it — a 'use server' file may only export async functions.
export function generateCheckComment(status: string, notes: string | null): string {
  if (status === 'fail' && !notes) {
    return 'Flagged: marked Fail with no note explaining why or what corrective action is planned. Add a note before this can be treated as resolved.'
  }
  if (status === 'fail' && notes) {
    return 'Marked Fail with a note on file. Confirm a retest is scheduled once the corrective action is complete.'
  }
  if (status === 'pass' && !notes) {
    return 'Marked Pass with no supporting note. For audit traceability, add what was verified (a reading, a test result, or who witnessed it).'
  }
  if (status === 'pass' && notes) {
    return 'Looks complete — status and a supporting note are both present.'
  }
  if (status === 'na') {
    return 'Marked Not Applicable. Confirm this was a deliberate engineering decision, not a step that was skipped.'
  }
  return 'Not yet checked — no status has been recorded for this item.'
}
