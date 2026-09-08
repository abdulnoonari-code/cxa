// The shape of a system spreadsheet — one list, used by three files.
//
// ── Why this is a shared constant and not typed out twice ────────────────
//
// The equipment exporter once wrote FEWER columns than the equipment
// importer reads. Nothing failed. A person exported their tags, fixed a
// couple of descriptions in Excel, imported the file back, and Building,
// Floor and Critical were silently blanked on every row — because a column
// that is not in the file is a column the importer never sees, and the
// round trip looked like it had worked.
//
// The fix for that instance was to add the columns. The fix for the CLASS
// is this file: the blank template, the export and the assertion that
// checks the importer can read both all take the header list from the same
// place, so the three cannot drift apart again.
//
// Order matters — it is the order a person reads left to right, and both
// the template and the export must present it identically or the file that
// comes back looks unfamiliar.

export type SystemSheetColumn = {
  /** The heading text, exactly as it is written into row 1. */
  header: string
  /** The exceljs row key, and the field name in the parsed row. */
  key: string
  width: number
}

export const SYSTEM_SHEET_COLUMNS: SystemSheetColumn[] = [
  { header: 'System ID', key: 'system_id', width: 22 },
  { header: 'System name', key: 'name', width: 40 },
  { header: 'Discipline', key: 'discipline', width: 20 },
  { header: 'Building', key: 'building', width: 16 },
  { header: 'Area', key: 'area', width: 22 },
  { header: 'Floor', key: 'floor', width: 12 },
  { header: 'Boundary', key: 'boundary', width: 52 },
  { header: 'Responsible', key: 'responsible', width: 22 },
  { header: 'Stage', key: 'stage', width: 22 },
  { header: 'Notes', key: 'description', width: 40 },
]

/**
 * The name of the second sheet in both files.
 *
 * It has to be exactly this, because `parseSystemWorkbook` skips a sheet
 * called "Guide" by name — otherwise the importer would try to read the
 * explanation as data. Calling the sheet something friendlier in one file
 * and not the other is a bug waiting for the first person who exports,
 * edits and imports back.
 */
export const SYSTEM_GUIDE_SHEET = 'Guide'
