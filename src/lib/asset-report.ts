// The asset register, reported on.
//
// ── What a report on an asset register is actually for ───────────────────
//
// Not "how many tags do we have". Anybody can count rows. The question
// worth answering is WHETHER THE REGISTER CAN BE TRUSTED, because every
// other number in this application is computed from it: a system's
// readiness, a level's completion, a handover pack's contents. A tag with
// no system is not a small untidiness — it is a piece of plant that can
// never appear in any system's readiness and will never be in anybody's
// pack, and nothing anywhere else on the application says so.
//
// So this is two things in one:
//
//   THE BREAKDOWN — tags by system, by category, by install status, by
//   type. What you would put in a monthly report.
//
//   THE FINDINGS — the specific rows that will make some other screen lie
//   later, each one named, counted, sampled and linked, with what it costs
//   written next to it. A finding with no example is an accusation; every
//   one here carries the first few tags it is about.
//
// ── Rules ────────────────────────────────────────────────────────────────
//
// 1. NO PERCENTAGE OF NOTHING. Same rule as everywhere else in this
//    application: zero of zero is not zero per cent.
// 2. A FINDING IS ONLY RAISED WHEN IT HAS ROWS. An empty findings list is
//    the good answer and must be printable as one, not as twelve green
//    ticks nobody reads.
// 3. NOTHING IS INFERRED. If a tag has no system, it has no system. This
//    file never guesses which one it probably meant.
//
// Pure. No database, no clock.

export type SystemRow = {
  id: string
  system_id: string | null
  name: string | null
  discipline?: string | null
  building?: string | null
  area?: string | null
  floor?: string | null
}

export type TypeRow = {
  id: string
  type_code: string | null
  name: string | null
  manufacturer?: string | null
  model?: string | null
  category?: string | null
}

export type TagRow = {
  id: string
  tag_id: string | null
  description?: string | null
  category?: string | null
  manufacturer?: string | null
  model?: string | null
  location?: string | null
  building?: string | null
  floor?: string | null
  install_status?: string | null
  critical?: boolean | null
  system_id?: string | null
  subsystem_id?: string | null
  type_id?: string | null
}

/** One line of a breakdown table. */
export type Breakdown = {
  key: string
  label: string
  count: number
  /** null only when there is nothing at all to take a share of. */
  percent: number | null
  href: string | null
}

export type Severity = 'blocking' | 'warning' | 'note'

export type Finding = {
  id: string
  severity: Severity
  title: string
  count: number
  /** What is wrong, in one line. */
  what: string
  /** What it COSTS. A finding without this is a nag. */
  cost: string
  href: string
  /** The first few, by name. A finding with no example cannot be acted on. */
  sample: string[]
}

export type AssetReport = {
  counts: { systems: number; types: number; tags: number; typed: number; placed: number }
  bySystem: Breakdown[]
  byCategory: Breakdown[]
  byStatus: Breakdown[]
  byType: Breakdown[]
  findings: Finding[]
  /** How many checks were run, and how many found nothing. */
  checksRun: number
  empty: boolean
  note: string
}

const SAMPLE_LIMIT = 6

function trimmed(v: string | null | undefined): string {
  return (v ?? '').trim()
}

function pct(n: number, of: number): number | null {
  // Rule 1. A share of nothing is not a number.
  return of === 0 ? null : Math.round((n / of) * 100)
}

/** Counts by a key, biggest first, with the blanks gathered at the end. */
function breakdown(
  rows: TagRow[],
  keyOf: (r: TagRow) => string,
  labelOf: (key: string) => string,
  hrefOf: (key: string) => string | null,
  blankLabel: string
): Breakdown[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const k = keyOf(r)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const out: Breakdown[] = []
  for (const [key, count] of counts) {
    if (key === '') continue
    out.push({ key, label: labelOf(key), count, percent: pct(count, rows.length), href: hrefOf(key) })
  }
  out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  // The blank bucket is always last, whatever its size — it is not a
  // category competing with the others, it is the absence of one.
  const blank = counts.get('') ?? 0
  if (blank > 0)
    out.push({ key: '', label: blankLabel, count: blank, percent: pct(blank, rows.length), href: null })
  return out
}

/** The first few names, for a finding. */
function sampleOf(rows: { tag_id?: string | null; system_id?: string | null; type_code?: string | null; name?: string | null }[]): string[] {
  return rows
    .slice(0, SAMPLE_LIMIT)
    .map((r) => trimmed(r.tag_id) || trimmed(r.system_id) || trimmed(r.type_code) || trimmed(r.name) || '(unnamed)')
}

/** Anything that appears more than once, and how many times. */
export function duplicatesOf(values: (string | null | undefined)[]): Map<string, number> {
  const seen = new Map<string, number>()
  for (const v of values) {
    const k = trimmed(v).toUpperCase()
    if (!k) continue
    seen.set(k, (seen.get(k) ?? 0) + 1)
  }
  const dupes = new Map<string, number>()
  for (const [k, n] of seen) if (n > 1) dupes.set(k, n)
  return dupes
}

const RANK: Record<Severity, number> = { blocking: 0, warning: 1, note: 2 }

export function buildAssetReport(
  systems: SystemRow[],
  types: TypeRow[],
  tags: TagRow[],
  labels: { category: (v: string) => string; status: (v: string) => string }
): AssetReport {
  const systemById = new Map(systems.map((s) => [s.id, s]))
  const typeById = new Map(types.map((t) => [t.id, t]))

  const systemName = (id: string) => {
    const s = systemById.get(id)
    return trimmed(s?.system_id) || trimmed(s?.name) || 'Unknown system'
  }
  const typeName = (id: string) => {
    const t = typeById.get(id)
    return trimmed(t?.type_code) || trimmed(t?.name) || 'Unknown type'
  }

  const bySystem = breakdown(
    tags,
    (r) => trimmed(r.system_id),
    systemName,
    (id) => `/equipment?system=${encodeURIComponent(id)}`,
    'No system'
  )
  const byCategory = breakdown(
    tags,
    (r) => trimmed(r.category),
    (k) => labels.category(k),
    (k) => `/equipment?category=${encodeURIComponent(k)}`,
    'No category'
  )
  const byStatus = breakdown(
    tags,
    (r) => trimmed(r.install_status),
    (k) => labels.status(k),
    (k) => `/equipment?status=${encodeURIComponent(k)}`,
    'No status'
  )
  const byType = breakdown(
    tags,
    (r) => trimmed(r.type_id),
    typeName,
    (id) => `/equipment-types/${id}`,
    'No type'
  )

  const findings: Finding[] = []
  const add = (f: Finding) => {
    // Rule 2: only when it has rows.
    if (f.count > 0) findings.push(f)
  }

  // ── Blocking ──────────────────────────────────────────────────────────

  const blankTags = tags.filter((t) => !trimmed(t.tag_id))
  add({
    id: 'tag-blank',
    severity: 'blocking',
    title: 'Tags with no tag number',
    count: blankTags.length,
    what: 'A row of equipment with nothing in the tag column.',
    cost: 'It cannot be scanned, cannot be searched for, and an import that touches it will create a second one rather than update it.',
    href: '/equipment',
    sample: sampleOf(blankTags.map((t) => ({ name: trimmed(t.description) || '(no description either)' }))),
  })

  const dupeTags = duplicatesOf(tags.map((t) => t.tag_id))
  add({
    id: 'tag-duplicate',
    severity: 'blocking',
    title: 'Duplicate tag numbers',
    count: dupeTags.size,
    what: 'The same tag number on more than one row.',
    cost: 'A check, a photograph or a punch item attaches to whichever row the database happened to return first — so half the evidence for that tag ends up on the copy nobody looks at.',
    href: '/equipment',
    sample: Array.from(dupeTags.entries())
      .slice(0, SAMPLE_LIMIT)
      .map(([k, n]) => `${k} (${n}×)`),
  })

  const dupeSystems = duplicatesOf(systems.map((s) => s.system_id))
  add({
    id: 'system-duplicate',
    severity: 'blocking',
    title: 'Duplicate system numbers',
    count: dupeSystems.size,
    what: 'Two systems sharing one system number.',
    cost: 'Importing a tag list against that number puts some of the plant in one system and the rest in the other, and neither system is ever complete.',
    href: '/systems',
    sample: Array.from(dupeSystems.entries())
      .slice(0, SAMPLE_LIMIT)
      .map(([k, n]) => `${k} (${n}×)`),
  })

  const dupeTypes = duplicatesOf(types.map((t) => t.type_code))
  add({
    id: 'type-duplicate',
    severity: 'blocking',
    title: 'Duplicate type codes',
    count: dupeTypes.size,
    what: 'Two catalogue entries with the same code.',
    cost: 'The tags for one model split across two entries, so the checklist attached to the type applies to only half of them.',
    href: '/equipment-types',
    sample: Array.from(dupeTypes.entries())
      .slice(0, SAMPLE_LIMIT)
      .map(([k, n]) => `${k} (${n}×)`),
  })

  const noSystem = tags.filter((t) => !trimmed(t.system_id))
  add({
    id: 'tag-no-system',
    severity: 'blocking',
    title: 'Tags in no system',
    count: noSystem.length,
    what: 'Equipment that has not been put into a system.',
    cost: 'It can never appear in a system’s readiness, never be in a handover pack, and never block a gate — so the job can be declared ready with this plant untested and nothing will say so.',
    href: '/equipment',
    sample: sampleOf(noSystem),
  })

  // ── Warnings ──────────────────────────────────────────────────────────

  const tagCountBySystem = new Map<string, number>()
  for (const t of tags) {
    const k = trimmed(t.system_id)
    if (k) tagCountBySystem.set(k, (tagCountBySystem.get(k) ?? 0) + 1)
  }
  const emptySystems = systems.filter((s) => (tagCountBySystem.get(s.id) ?? 0) === 0)
  add({
    id: 'system-empty',
    severity: 'warning',
    title: 'Systems with no equipment in them',
    count: emptySystems.length,
    what: 'A system on the list with not one tag against it.',
    cost: 'A system with nothing in it has nothing that can fail, so on any screen that scores readiness it is indistinguishable from one that has passed everything.',
    href: '/systems',
    sample: sampleOf(emptySystems),
  })

  const noType = tags.filter((t) => !trimmed(t.type_id))
  add({
    id: 'tag-no-type',
    severity: 'warning',
    title: 'Tags not linked to a type',
    count: noType.length,
    what: 'Equipment with no catalogue entry behind it.',
    cost: 'Everything the model shares — the manual, the factory certificate, the standard checklist — has to be attached to each tag by hand, and then it drifts.',
    href: '/equipment',
    sample: sampleOf(noType),
  })

  const nowhere = tags.filter(
    (t) => !trimmed(t.location) && !trimmed(t.building) && !trimmed(t.floor)
  )
  add({
    id: 'tag-nowhere',
    severity: 'warning',
    title: 'Tags with no location at all',
    count: nowhere.length,
    what: 'No building, no floor and no location text.',
    cost: 'Somebody sent to test it has nowhere to go, and the QR label for it cannot be put anywhere sensible.',
    href: '/equipment',
    sample: sampleOf(nowhere),
  })

  // A tag and its type disagreeing about what kind of thing it is. One of
  // them is wrong and there is no way to tell which from here — which is
  // exactly why it is worth a person looking rather than a guess.
  const categoryClash = tags.filter((t) => {
    const ty = trimmed(t.type_id) ? typeById.get(trimmed(t.type_id)) : null
    const a = trimmed(t.category).toLowerCase()
    const b = trimmed(ty?.category).toLowerCase()
    return Boolean(a && b && a !== b)
  })
  add({
    id: 'tag-category-clash',
    severity: 'warning',
    title: 'Tags whose category contradicts their type',
    count: categoryClash.length,
    what: 'The tag says one discipline and the catalogue entry it points at says another.',
    cost: 'One of the two is wrong, and every filter, count and report that uses category will disagree with the one that uses the type.',
    href: '/equipment',
    sample: sampleOf(categoryClash),
  })

  // ── Notes ─────────────────────────────────────────────────────────────

  const typeUse = new Map<string, number>()
  for (const t of tags) {
    const k = trimmed(t.type_id)
    if (k) typeUse.set(k, (typeUse.get(k) ?? 0) + 1)
  }
  const unusedTypes = types.filter((t) => (typeUse.get(t.id) ?? 0) === 0)
  add({
    id: 'type-unused',
    severity: 'note',
    title: 'Catalogue entries no tag uses',
    count: unusedTypes.length,
    what: 'A type in the catalogue with no equipment pointing at it.',
    cost: 'Harmless in itself, but usually means either the tags were imported before the types, or the type code was typed differently on the tag list.',
    href: '/equipment-types',
    sample: sampleOf(unusedTypes),
  })

  const thinTypes = types.filter((t) => !trimmed(t.manufacturer) && !trimmed(t.model))
  add({
    id: 'type-thin',
    severity: 'note',
    title: 'Types with no manufacturer and no model',
    count: thinTypes.length,
    what: 'A catalogue entry that names neither a make nor a model.',
    cost: 'A type IS a make and model. One with neither is a label, and it cannot be matched against a submittal or a factory certificate.',
    href: '/equipment-types',
    sample: sampleOf(thinTypes),
  })

  findings.sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.count - a.count)

  const typed = tags.filter((t) => trimmed(t.type_id)).length
  const placed = tags.filter((t) => trimmed(t.location) || trimmed(t.building) || trimmed(t.floor)).length

  return {
    counts: { systems: systems.length, types: types.length, tags: tags.length, typed, placed },
    bySystem,
    byCategory,
    byStatus,
    byType,
    findings,
    // Eleven checks are run whatever the answer. Saying so is what makes a
    // clean report mean something rather than look like a page that failed
    // to load.
    checksRun: 11,
    empty: systems.length === 0 && types.length === 0 && tags.length === 0,
    note: reportNote(systems.length, types.length, tags.length, findings),
  }
}

export function reportNote(systems: number, types: number, tags: number, findings: Finding[]): string {
  if (systems === 0 && types === 0 && tags === 0)
    return 'Nothing in the asset register yet. Import a system list and a tag list, and this report fills in.'

  const blocking = findings.filter((f) => f.severity === 'blocking').reduce((n, f) => n + f.count, 0)
  const warning = findings.filter((f) => f.severity === 'warning').reduce((n, f) => n + f.count, 0)

  const head = `${tags} tag${tags === 1 ? '' : 's'} in ${systems} system${systems === 1 ? '' : 's'}, against ${types} catalogue entr${types === 1 ? 'y' : 'ies'}`
  if (blocking === 0 && warning === 0)
    return `${head} · eleven checks run, nothing found. The register can be trusted by the screens that depend on it.`

  const parts = [head]
  if (blocking > 0)
    parts.push(
      `${blocking} record${blocking === 1 ? '' : 's'} will make another screen wrong until fixed`
    )
  if (warning > 0) parts.push(`${warning} worth looking at`)
  return parts.join(' · ')
}
