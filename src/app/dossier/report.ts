// The handover pack, as one document.
//
// Everything CxSentinel records converges here. The order of the sections is
// the order the receiving party reads them in: what it says on the front, who
// is being asked to sign, what is outstanding, and only then the evidence.
//
// Putting the gaps on page two — before any register — is deliberate. A pack
// that buries what is missing at the back is a pack that gets found out; one
// that names it up front gets negotiated.

import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { loadPack, releaseFor } from '@/data/dossier'
import { subjectLabel, type SubjectType } from '@/lib/subjects'
import { SECTIONS, SIGNATURE_BLOCKS, gapsIn, verdict, type Gap } from '@/lib/dossier'
import { LEVELS, STATUSES, reviewLabel } from '@/lib/checklist'
import { INSPECTION_TYPES } from '@/lib/inspection'
import { partyShort, statusLabel as obligationStatus } from '@/lib/obligations'
import { statusLabel as punchStatus, categoryLabel, severityLabel } from '@/lib/punchlist'
import {
  criticalityLabel,
  revisionStatusLabel,
  statusLabel as requirementStatus,
  type RequirementStatus,
} from '@/lib/requirements'
import { gateVerdict } from '@/lib/gates'
import { loadIssuePhotos, downloadPhotoBytes } from '@/data/photos'
import { prepareGallery, photoSources, omissionNote, canDownscale, MAX_PHOTOS } from '@/lib/photo-prep'
import type { Report, ReportTable, ReportGallery } from '@/lib/docgen'

export type BuiltDossier = {
  project: { id: string; name: string }
  title: string
  /** What the downloaded file is called, without its extension. */
  fileStem: string
  report: Report
}

const statusOf = (v: string) => STATUSES.find((s) => s.value === v)?.label ?? v
const itpOf = (v: string | null) => INSPECTION_TYPES.find((t) => t.value === (v ?? 'surveillance'))?.label ?? 'Surveillance'

// The last line of defence for a column with no vocabulary of its own. A
// handover pack is signed by four companies; "not_planned" and
// "pre_commissioning" are database keys and have no business appearing in it.
const humanise = (v: string | null | undefined): string => {
  if (!v) return '—'
  const words = v.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export async function buildDossier(url: string, type: string, id: string): Promise<BuiltDossier | null> {
  const project = await getCurrentProject()
  if (!project) return null

  const index = await loadSubjectIndex(project.id)
  const pack = await loadPack(project.id, index, { type: type as SubjectType, id })
  if (!pack) return null

  const gaps = gapsIn(pack.input)
  const reading = verdict(pack.input, gaps)
  const showAll = new URL(url).searchParams.get('full') === '1'
  const withPhotos = new URL(url).searchParams.get('photos') === '1'

  const tables: ReportTable[] = []

  // ── Who signs ───────────────────────────────────────────────────────────
  tables.push({
    title: 'Signatures',
    columns: ['Role', 'What is being signed', 'Name', 'Signature', 'Date'],
    widths: [2, 5.4, 2.2, 2.2, 1.4],
    rows: SIGNATURE_BLOCKS.map((b) => [b.role, b.statement, '', '', '']),
  })

  // ── What is outstanding ─────────────────────────────────────────────────
  tables.push({
    title: 'What is outstanding',
    columns: ['', 'Item', 'What it means'],
    widths: [1.2, 3.6, 7],
    rows:
      gaps.length === 0
        ? [['—', 'Nothing outstanding', 'No blocking item and no gap in the record assembled here.']]
        : gaps.map((g: Gap) => [
            g.severity === 'blocking' ? 'BLOCKS' : g.severity === 'gap' ? 'GAP' : 'NOTE',
            g.title,
            g.detail,
          ]),
    emphasise: new Set(gaps.map((g, i) => (g.severity === 'blocking' ? i : -1)).filter((i) => i >= 0)),
  })

  // ── Contents ────────────────────────────────────────────────────────────
  const counts: Record<string, number> = {
    requirements: pack.input.requirements.total,
    checks: pack.input.checks.total,
    tests: pack.input.tests.total,
    holdpoints: pack.input.holdPoints.total,
    punch: pack.input.punch.total,
    obligations: pack.input.obligations.total,
    gates: pack.input.gates.total,
    documents: pack.input.documents,
  }

  tables.push({
    title: 'Contents of this pack',
    columns: ['Section', 'Records', 'What it proves'],
    widths: [2.6, 1, 8.4],
    // Every section appears whether or not it has anything in it. A pack that
    // silently omits an empty register lies by omission.
    rows: SECTIONS.map((s) => [
      s.title,
      counts[s.key] || 'none',
      counts[s.key] > 0 ? s.whatItProves : s.emptyMeans,
    ]),
  })

  // ── Requirements ────────────────────────────────────────────────────────
  tables.push({
    title: '1. Requirements',
    columns: ['Ref', 'Requirement', 'Criticality', 'Status'],
    widths: [1.2, 7.4, 1.6, 1.8],
    rows:
      pack.rollup.requirements.length === 0
        ? [['—', SECTIONS[0].emptyMeans, '', '']]
        : pack.rollup.requirements.map((r) => [
            r.ref ?? '',
            r.statement,
            criticalityLabel(r.criticality),
            requirementStatus(r.status as RequirementStatus),
          ]),
    emphasise: new Set(
      pack.rollup.requirements.map((r, i) => (r.status !== 'verified' && r.blocking ? i : -1)).filter((i) => i >= 0)
    ),
  })

  // ── Checks, by level ────────────────────────────────────────────────────
  // Grouped by level because that is how a commissioning pack is read: an
  // engineer looking for the L3 records should find them together.
  const byLevel = new Map<string, typeof pack.rollup.checks>()
  for (const c of pack.rollup.checks) {
    const list = byLevel.get(c.level)
    if (list) list.push(c)
    else byLevel.set(c.level, [c])
  }

  if (pack.rollup.checks.length === 0) {
    tables.push({
      title: '2. Commissioning checks',
      columns: ['', ''],
      widths: [2, 10],
      rows: [['No records', SECTIONS[1].emptyMeans]],
    })
  } else {
    for (const level of LEVELS) {
      const checks = byLevel.get(level.value) ?? []
      if (checks.length === 0) continue
      const failed = new Set(checks.map((c, i) => (c.status === 'fail' ? i : -1)).filter((i) => i >= 0))
      tables.push({
        title: `2. Commissioning checks — ${level.label}`,
        columns: ['Tag', 'Check', 'Result', 'Point type', 'Review'],
        widths: [1.6, 6.6, 1.2, 1.4, 1.4],
        rows: checks.map((c) => [c.tag, c.item, statusOf(c.status), itpOf(c.inspection_type), reviewLabel(c.review_state)]),
        emphasise: failed,
      })
    }
    // Levels with nothing in them are named rather than skipped, so a reader
    // can see the ladder has a rung missing.
    const missing = LEVELS.filter((l) => !byLevel.has(l.value))
    if (missing.length > 0) {
      tables.push({
        title: '2. Levels with no records',
        columns: ['Level', 'What that means'],
        widths: [3, 9],
        rows: missing.map((l) => [
          l.label,
          'Nothing is recorded at this level for this system. Either the stage was not required, or its records are not in CxSentinel.',
        ]),
      })
    }
  }

  // ── Tests ───────────────────────────────────────────────────────────────
  tables.push({
    title: '3. Test records',
    columns: ['Ref', 'Tag', 'Test', 'Result', 'Point type', 'Approval'],
    widths: [1.2, 1.5, 5.6, 1.2, 1.4, 1.4],
    rows:
      pack.rollup.tests.length === 0
        ? [['—', '', SECTIONS[2].emptyMeans, '', '', '']]
        : pack.rollup.tests.map((t) => [
            t.test_ref ?? '',
            t.tag,
            t.name,
            t.result.toUpperCase(),
            itpOf(t.inspection_type),
            reviewLabel(t.approval_state),
          ]),
    emphasise: new Set(pack.rollup.tests.map((t, i) => (t.result === 'fail' ? i : -1)).filter((i) => i >= 0)),
  })

  // ── Hold and witness points ─────────────────────────────────────────────
  const holds = [
    ...pack.rollup.checks
      .filter((c) => c.inspection_type === 'hold' || c.inspection_type === 'witness')
      .map((c) => ({ entity: 'checklist_item', id: c.id, tag: c.tag, label: c.item, type: c.inspection_type })),
    ...pack.rollup.tests
      .filter((t) => t.inspection_type === 'hold' || t.inspection_type === 'witness')
      .map((t) => ({ entity: 'test_record', id: t.id, tag: t.tag, label: t.name, type: t.inspection_type })),
  ]

  tables.push({
    title: '4. Hold and witness points',
    columns: ['Tag', 'Activity', 'Point type', 'Released by', 'Company', 'Date'],
    widths: [1.5, 5.2, 1.4, 2, 1.8, 1.3],
    rows:
      holds.length === 0
        ? [['—', SECTIONS[3].emptyMeans, '', '', '', '']]
        : holds.map((h) => {
            const sig = releaseFor(pack.signatures, h.entity, h.id)
            return [
              h.tag,
              h.label,
              itpOf(h.type),
              sig?.signer_name ?? 'NOT RELEASED',
              sig?.signer_company ?? '',
              (sig?.created_at ?? '').slice(0, 10),
            ]
          }),
    emphasise: new Set(
      holds.map((h, i) => (releaseFor(pack.signatures, h.entity, h.id) ? -1 : i)).filter((i) => i >= 0)
    ),
  })

  // ── Punch list ──────────────────────────────────────────────────────────
  const open = pack.rollup.issues.filter((i) => i.status !== 'verified' && i.status !== 'closed')
  tables.push({
    title: '5. Punch list — outstanding',
    // The reference is first because a pack is read beside the punch list it
    // was drawn from, and an item nobody can look up is an item nobody argues
    // about at the handover meeting.
    columns: ['No', 'Item', 'Category', 'Severity', 'State'],
    widths: [1, 6.4, 1.8, 1.4, 1.4],
    rows:
      open.length === 0
        ? [['', 'Nothing outstanding on the punch list for this system.', '', '', '']]
        : open.map((i) => [i.ref ?? '', i.title, categoryLabel(i.category), severityLabel(i.severity), punchStatus(i.status)]),
    emphasise: new Set(open.map((i, n) => (i.category === 'A' ? n : -1)).filter((n) => n >= 0)),
  })

  if (showAll && pack.input.punch.closed > 0) {
    const closed = pack.rollup.issues.filter((i) => i.status === 'verified' || i.status === 'closed')
    tables.push({
      title: '5. Punch list — closed and accepted',
      columns: ['No', 'Item', 'Category', 'State'],
      widths: [1, 7.4, 1.8, 1.8],
      rows: closed.map((i) => [i.ref ?? '', i.title, categoryLabel(i.category), punchStatus(i.status)]),
    })
  }

  // ── Obligations ─────────────────────────────────────────────────────────
  tables.push({
    title: '6. Obligations',
    columns: ['Ref', 'Clause', 'Party', 'Obligation', 'State'],
    widths: [1.1, 0.9, 1.4, 6.8, 1.8],
    rows:
      pack.obligations.length === 0
        ? [['—', '', '', SECTIONS[5].emptyMeans, '']]
        : pack.obligations.map((o) => [
            o.ref ?? '',
            o.clause ?? '',
            partyShort(o.party),
            o.statement,
            obligationStatus(o.status),
          ]),
    emphasise: new Set(
      pack.obligations
        .map((o, i) => (o.status !== 'accepted' && o.status !== 'waived' && o.status !== 'not_applicable' ? i : -1))
        .filter((i) => i >= 0)
    ),
  })

  // ── Gates ───────────────────────────────────────────────────────────────
  tables.push({
    title: '7. Readiness gates',
    columns: ['Gate', 'Stage', 'Rules met', 'Not met', 'Reading', 'State'],
    widths: [3.2, 2, 1.2, 1.2, 3, 1.4],
    rows:
      pack.gates.length === 0
        ? [['—', '', '', '', SECTIONS[6].emptyMeans, '']]
        : pack.gates.map((g) => [
            g.name,
            humanise(g.stage_key),
            g.result?.met ?? 0,
            g.result?.notMet ?? 0,
            g.result ? gateVerdict(g.result) : '',
            humanise(g.status),
          ]),
    emphasise: new Set(pack.gates.map((g, i) => ((g.result?.notMet ?? 0) > 0 ? i : -1)).filter((i) => i >= 0)),
  })

  // ── Documents ───────────────────────────────────────────────────────────
  tables.push({
    title: '8. Documents cited',
    columns: ['Number', 'Title', 'Revision', 'Status'],
    widths: [2, 6.4, 1.6, 2],
    rows:
      pack.documents.length === 0
        ? [['—', SECTIONS[7].emptyMeans, '', '']]
        : pack.documents.map((d) => [
            d.doc_number,
            d.title ?? '',
            d.rev ?? '',
            d.status ? revisionStatusLabel(d.status) : '—',
          ]),
  })

  // ── Photographs ─────────────────────────────────────────────────────────
  //
  // Ordered the way the receiving party reads the pack: photographs of what is
  // still outstanding first, because those are what gets negotiated at the
  // handover meeting, and rectification photographs after, because those are
  // what closes the argument about an item already marked done.
  //
  // Only photographs of punch items inside this pack's scope. A pack for one
  // substation must not carry a photograph from another.
  const galleries: ReportGallery[] = []
  const inScopeIds = new Set(pack.rollup.issues.map((i) => i.id))
  const photoStore = await loadIssuePhotos(project.id)
  const photosInScope = photoStore.all.filter((ph) => inScopeIds.has(ph.issue_id))

  if (withPhotos) {
    const store = photoStore
    if (!store.schemaReady) {
      galleries.push({
        title: '9. Photographic evidence',
        images: [],
        emptyNote:
          'Photographic evidence is not set up on this database yet — run week5-part21-photos.sql. Nothing is missing from this pack; there are no photographs to carry.',
      })
    } else {
      const inScope = inScopeIds
      const refOf = new Map(pack.rollup.issues.map((i) => [i.id, i.ref ?? i.title]))
      const openIds = new Set(open.map((i) => i.id))
      const mine = store.all.filter((ph) => inScope.has(ph.issue_id))
      const ordered = [
        ...mine.filter((ph) => openIds.has(ph.issue_id)),
        ...mine.filter((ph) => !openIds.has(ph.issue_id)),
      ]

      const downscales = await canDownscale()
      const gallery = await prepareGallery(photoSources(ordered, (row) => refOf.get(row.issue_id) ?? 'Punch item'), downloadPhotoBytes)
      galleries.push({
        title: '9. Photographic evidence',
        images: gallery.photos.map((ph) => ({
          bytes: ph.bytes,
          contentType: ph.contentType,
          caption: ph.caption,
          note: ph.note || undefined,
        })),
        missing: gallery.failed,
        note: [
          omissionNote(gallery, 'the punch list in CxSentinel'),
          // Said out loud rather than left to be inferred from a short
          // gallery. Without the image library the photographs go in at
          // their original size, the byte budget fills after two or three,
          // and the document would otherwise look as though only two or
          // three had been uploaded.
          downscales
            ? null
            : 'This deployment cannot resize photographs, so they are carried at full size and fewer fit within the size limit. Everything uploaded is still in CxSentinel.',
        ]
          .filter(Boolean)
          .join(' ') || undefined,
        emptyNote:
          ordered.length > 0
            ? undefined
            : store.all.length > 0
              ? `No photographs are attached to the punch items in this pack. There ${store.all.length === 1 ? 'is 1 photograph' : `are ${store.all.length} photographs`} elsewhere in this project, on items outside this pack's scope. That is not evidence that no defect was photographed here — only that none was uploaded against these items.`
              : 'No photographs have been uploaded anywhere in this project. That is not evidence that no defect was photographed — it is evidence that none reached CxSentinel.',
      })
    }
  }

  const report: Report = {
    title: 'Handover Pack',
    subtitle: `${subjectLabel(type)} — ${pack.title}`,
    project: project.name,
    standfirst: `${reading.label}. ${reading.detail}`,
    figures: [
      {
        label: 'Checks & tests resolved',
        value: `${pack.rollup.readiness.requirementsMet}/${pack.rollup.readiness.requirementsTotal}`,
        note: 'Not a readiness verdict',
      },
      { label: 'Checks', value: pack.input.checks.total, note: `${pack.input.checks.failed} failed` },
      { label: 'Tests', value: pack.input.tests.total, note: `${pack.input.tests.failed} failed` },
      { label: 'Open punch items', value: pack.input.punch.openA + pack.input.punch.openOther, note: `${pack.input.punch.openA} Category A` },
    ],
    tables,
    galleries: galleries.length > 0 ? galleries : undefined,
    footnotes: [
      `Asset path: ${pack.path}.`,
      withPhotos
        ? `Photographs show what was seen on site. A photograph carrying an AI reading is marked as such; that reading is a suggestion, it closed nothing and nobody signed it. At most ${MAX_PHOTOS} are carried so the pack stays small enough to send, and any left out are counted under the block.`
        : photosInScope.length > 0
          ? `${photosInScope.length} photograph${photosInScope.length === 1 ? ' has' : 's have'} been uploaded against the punch items in this pack and ${photosInScope.length === 1 ? 'is' : 'are'} NOT in this document. Use the “Full pack, with photographs” button for a copy that carries them.`
          : 'No photographs have been uploaded against the punch items in this pack, so there are none this document could carry.',
      'This pack is assembled from the records in CxSentinel at the moment it was generated. Nothing in it is stored — regenerate it and it will reflect whatever has changed since.',
      'It does not certify anything. It states what the record shows, and provides the blocks for the people entitled to decide. Handover is agreed by the signatures above, not by this document.',
      'Every section appears whether or not it has records in it. An empty section says so, and says what that absence means — a pack that omits an empty register lies by omission.',
      showAll
        ? 'This is the full pack, including closed punch items.'
        : 'Closed punch items are summarised rather than listed. Add ?full=1 to the address for the complete pack.',
    ],
  }

  // A pack for the whole project has the project as its subject, so naming the
  // file "<project>-<subject>-handover" gave the same name twice.
  const same = pack.title.trim().toLowerCase() === project.name.trim().toLowerCase()
  const fileStem = same ? `${project.name}-handover` : `${project.name}-${pack.title}-handover`

  return { project, title: pack.title, fileStem, report }
}
