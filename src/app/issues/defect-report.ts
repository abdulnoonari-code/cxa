// The defect report — the document you issue to whoever has to fix it.
//
// ── How this differs from the punch list PDF, and why both exist ────────
//
// `report.ts` builds the punch LIST: a table of everything outstanding, with
// the photographs gathered at the back. It is a register. It is what you print
// to walk the site with, and what you attach to a progress report.
//
// This builds the defect REPORT: one block per item, each carrying its own
// photograph, what is wrong, and what must be done about it. It is not a
// register — it is an instruction, and it goes to a party who was not standing
// there when the defect was found.
//
// Two rules follow from that, and they are the whole design:
//
//   1. **The photograph belongs beside the defect.** Not in a gallery at the
//      back. A foreman reading "P-014: cable gland not made off" on page 6
//      and finding the picture on page 19 will close the wrong gland.
//
//   2. **A machine's guess is never printed as an instruction.** Every
//      "what must be done" carries the sentence saying where it came from —
//      agreed by a named person on a date, or suggested by a model and agreed
//      by nobody. See lib/remedy.ts.
//
// Like every other document here, it reads the punch list screen's own filters
// off the URL, so what somebody is looking at is what lands in the file.

import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { loadAllPunchWithNotes, ACTION_SQL, type PunchRow } from '@/data/punchlist'
import { refKey } from '@/lib/subjects'
import { LEVELS } from '@/lib/checklist'
import { categoryLabel, statusLabel, summarise, daysOverdue } from '@/lib/punchlist'
import { workOrder, actionCoverage, coverageLine } from '@/lib/remedy'
import { cardFor, groupRows, isGroupBy, type GroupBy, type DefectRow } from '@/lib/defect-sheet'
import { loadIssuePhotos, downloadPhotoBytes, type IssuePhoto } from '@/data/photos'
import { prepareGallery, photoSources, omissionNote, canDownscale, MAX_PHOTOS } from '@/lib/photo-prep'
import type { Report, ReportCard, ReportImage } from '@/lib/docgen'

const SETTLED = new Set(['verified', 'closed'])

export type BuiltDefects = { project: { id: string; name: string }; rows: PunchRow[]; report: Report }

export async function buildDefectReport(url: string): Promise<BuiltDefects | null> {
  const project = await getCurrentProject()
  if (!project) return null

  const p = new URL(url).searchParams
  const filter = {
    status: p.get('status'),
    category: p.get('category'),
    severity: p.get('severity'),
    level: p.get('level'),
    party: p.get('party'),
    // Unlike the punch list, this one defaults to OPEN ITEMS ONLY. Nobody
    // issues a contractor a document listing work they have already done and
    // that has already been accepted; a report that arrives full of closed
    // items is a report that gets skimmed and put down.
    openOnly: p.get('open') !== '0',
  }
  const groupBy: GroupBy = isGroupBy(p.get('group')) ? (p.get('group') as GroupBy) : 'subject'
  // And unlike the punch list, photographs are ON unless they are turned off.
  // The picture is the reason this document exists.
  const withPhotos = p.get('photos') !== '0'

  const [index, punch, store] = await Promise.all([
    loadSubjectIndex(project.id),
    loadAllPunchWithNotes(project.id),
    loadIssuePhotos(project.id),
  ])

  const filtered = punch.rows.filter((r) => {
    if (filter.status && r.status !== filter.status) return false
    if (filter.category === 'none' && r.category) return false
    if (filter.category && filter.category !== 'none' && r.category !== filter.category) return false
    if (filter.severity && r.severity !== filter.severity) return false
    if (filter.level && r.level !== filter.level) return false
    if (filter.party && r.responsible_party !== filter.party) return false
    if (filter.openOnly && SETTLED.has(r.status)) return false
    return true
  })

  // Most urgent first, everywhere: in the sections, inside each section, and
  // in the order the photograph budget is spent.
  const rows = workOrder(filtered) as (PunchRow & DefectRow)[]

  const against = (r: PunchRow): string => {
    const subject =
      r.subject_type && r.subject_id
        ? index.byKey.get(refKey({ type: r.subject_type, id: r.subject_id }))
        : r.equipment_id
          ? index.byKey.get(refKey({ type: 'equipment', id: r.equipment_id }))
          : undefined
    return subject?.code ?? subject?.name ?? 'Not assigned to a tag or system'
  }

  const levelLabel = (v: string | null | undefined) =>
    LEVELS.find((l) => l.value === v)?.label.split('—')[0].trim() ?? ''

  // ── The photographs ────────────────────────────────────────────────────
  //
  // One pass over every photograph in the report, in card order, so the budget
  // is spent on the items at the top — the Category A item that stops the job
  // gets its picture, and the observation about a crooked label is the one
  // that goes without. Spending it in database order would be arbitrary.
  const carried = new Map<string, ReportImage[]>()
  const lost = new Map<string, { caption: string; reason: string }[]>()
  let note: string | null = null
  let omitted = 0

  const photoCount = (id: string) => (store.byIssue.get(id) ?? []).length

  if (withPhotos && store.schemaReady) {
    const refOf = new Map(rows.map((r) => [r.id, r.ref ?? r.title]))
    const inOrder: IssuePhoto[] = rows.flatMap((r) => store.byIssue.get(r.id) ?? [])

    const gallery = await prepareGallery(
      photoSources(inOrder, (row) => refOf.get(row.issue_id) ?? 'Punch item'),
      downloadPhotoBytes
    )

    for (const photo of gallery.photos) {
      if (!photo.owner) continue
      const list = carried.get(photo.owner)
      const image: ReportImage = {
        bytes: photo.bytes,
        contentType: photo.contentType,
        caption: photo.caption,
        note: photo.note || undefined,
      }
      if (list) list.push(image)
      else carried.set(photo.owner, [image])
    }
    for (const gone of gallery.failed) {
      if (!gone.owner) continue
      const list = lost.get(gone.owner)
      if (list) list.push(gone)
      else lost.set(gone.owner, [gone])
    }

    omitted = gallery.omitted
    const downscales = await canDownscale()
    note =
      [
        omissionNote(gallery, 'the punch item in CxSentinel'),
        downscales
          ? null
          : 'This deployment cannot resize photographs, so they are carried at full size and fewer fit within the size limit. Everything uploaded is still in CxSentinel.',
      ]
        .filter(Boolean)
        .join(' ') || null
  }

  const toCard = (r: PunchRow & DefectRow): ReportCard => {
    const sheet = cardFor(r, { against: against(r), level: levelLabel(r.level), photos: photoCount(r.id) })
    return {
      heading: sheet.heading,
      strapline: sheet.strapline,
      facts: sheet.facts,
      paragraphs: sheet.paragraphs,
      images: carried.get(r.id) ?? [],
      missing: lost.get(r.id) ?? [],
      noImagesNote: withPhotos
        ? store.schemaReady
          ? sheet.noImagesNote
          : 'Photographs are not set up on this database yet — run week5-part21-photos.sql.'
        : 'Photographs were left out of this copy. Use the button with photographs for a copy that carries them.',
    }
  }

  const keyOf = (r: PunchRow & DefectRow, by: GroupBy): string => {
    if (by === 'party') return (r.responsible_party ?? '').trim() || 'Nobody is assigned'
    if (by === 'category') return r.category ? categoryLabel(r.category) : 'Uncategorised'
    if (by === 'level') return levelLabel(r.level) || 'No level recorded'
    return against(r)
  }

  const sections = groupRows(rows, groupBy, keyOf)
  const summary = summarise(rows)
  const coverage = actionCoverage(rows)
  const overdue = rows.filter((r) => daysOverdue(r) !== null).length
  const withPictures = rows.filter((r) => photoCount(r.id) > 0).length

  const narrowed: string[] = []
  if (filter.party) narrowed.push(`items the ${filter.party} is responsible for`)
  if (filter.category === 'none') narrowed.push('items with no category')
  else if (filter.category) narrowed.push(`Category ${filter.category}`)
  if (filter.level) narrowed.push(levelLabel(filter.level))
  if (filter.status) narrowed.push(`state “${statusLabel(filter.status)}”`)
  narrowed.push(filter.openOnly ? 'outstanding items only' : 'every item, open and closed')

  const report: Report = {
    title: 'Defect Report',
    subtitle: narrowed.join(', '),
    project: project.name,
    // The standfirst says what somebody pressing the button needs to know
    // BEFORE they send it: how much of this document is actually actionable.
    standfirst: `${rows.length} defect${rows.length === 1 ? '' : 's'} on this project${
      filter.party ? ` for ${filter.party}` : ''
    }. ${coverageLine(coverage)}`,
    figures: [
      { label: 'In this report', value: rows.length, note: 'Defects listed' },
      { label: 'Category A', value: summary.openA, note: 'Stops the system advancing' },
      { label: 'Overdue', value: overdue, note: 'Past an agreed date' },
      { label: 'With an action', value: coverage.agreed, note: 'Somebody has said what to do' },
    ],
    cards: sections.map((section, i) => ({
      title: section.title || (i === 0 ? 'The defects' : ''),
      intro:
        i === 0 && groupBy !== 'none'
          ? `${sections.length} section${sections.length === 1 ? '' : 's'}, most urgent first. Within each one, Category A before B before C, and overdue before not.`
          : undefined,
      cards: section.rows.map(toCard),
      emptyNote: 'Nothing outstanding.',
    })),
    footnotes: [
      // Before anything else: on a database where part 42 has not been run
      // there is NOWHERE to write a remedy, so every item would say "no
      // action has been agreed" — true, and a completely misleading thing to
      // send to a contractor without this sentence beside it.
      punch.missing.length > 0
        ? `THIS DATABASE CANNOT HOLD A REMEDY YET. Run ${ACTION_SQL} on the Setup page. Until then there is nowhere in CxSentinel to write what must be done, so every item in this report says nobody has decided — which reflects the database, not the job.`
        : null,
      // Then the sentence that decides whether the document can be acted on.
      coverage.agreed < coverage.total
        ? `${coverage.total - coverage.agreed} of the ${coverage.total} defect${coverage.total === 1 ? '' : 's'} here carr${coverage.total - coverage.agreed === 1 ? 'ies' : 'y'} no agreed action. Anything shown under “what must be done” for those items is an AI suggestion or nothing at all — it has not been agreed with anybody and must not be treated as an instruction. Write the action on the item in CxSentinel and re-issue.`
        : 'Every defect in this report carries an action agreed by a named person on a date.',
      withPhotos
        ? `Photographs are evidence of what was seen, not of what was decided. ${withPictures} of ${rows.length} defect${rows.length === 1 ? '' : 's'} here ${withPictures === 1 ? 'has' : 'have'} one. At most ${MAX_PHOTOS} are carried so the file stays small enough to send${omitted > 0 ? '' : ', which this report is within'}.`
        : `This copy carries no photographs. ${withPictures} of the ${rows.length} defect${rows.length === 1 ? '' : 's'} listed ${withPictures === 1 ? 'has' : 'have'} one on record.`,
      note,
      'This is a record of what is outstanding and what has been asked for. It is not a clearance, and it does not accept anything as closed — whether a system may proceed is decided by its readiness gate.',
    ].filter((line): line is string => typeof line === 'string' && line.length > 0),
  }

  return { project, rows, report }
}
