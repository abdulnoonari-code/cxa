// Superseded by lib/checklist-io.ts, which does everything this did and adds
// stable ids, subjects, ITP types, removal and row-level validation. Kept only
// so that nothing still pointing here breaks; delete it once the repo is on
// git and files can be removed cleanly.

export { parseChecklistWorkbook, matchLevel as findLevelValueByLabel } from '@/lib/checklist-io'
export type { ParsedCheck, ChecklistParseResult } from '@/lib/checklist-io'
