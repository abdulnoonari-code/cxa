// The subject spine.
//
// Until now every check, test and issue could only belong to a piece of
// equipment. A subject is any level of the asset hierarchy — the project, a
// site, an area, a system, a subsystem, a piece of equipment or a component —
// and any record can point at any of them.
//
// One reference type, resolved in both directions, is what makes hierarchical
// dashboards and forward/backward traceability possible without a bespoke
// join for every module.

export type SubjectType = 'project' | 'site' | 'area' | 'system' | 'subsystem' | 'equipment' | 'component'

export type SubjectRef = { type: SubjectType; id: string }

export const SUBJECT_TYPES: {
  value: SubjectType
  label: string
  plural: string
  depth: number
  note: string
}[] = [
  { value: 'project', label: 'Project', plural: 'Projects', depth: 0, note: 'The whole job' },
  { value: 'site', label: 'Site', plural: 'Sites', depth: 1, note: 'A physical location on the project' },
  { value: 'area', label: 'Area', plural: 'Areas', depth: 2, note: 'A zone within a site' },
  { value: 'system', label: 'System', plural: 'Systems', depth: 3, note: 'A functional system with a boundary' },
  { value: 'subsystem', label: 'Subsystem', plural: 'Subsystems', depth: 4, note: 'A division within a system' },
  { value: 'equipment', label: 'Equipment', plural: 'Equipment', depth: 5, note: 'A tagged item of plant' },
  { value: 'component', label: 'Component', plural: 'Components', depth: 6, note: 'A part within an item' },
]

export function subjectLabel(type: string | null | undefined): string {
  return SUBJECT_TYPES.find((s) => s.value === type)?.label ?? 'Subject'
}

export function subjectDepth(type: string | null | undefined): number {
  return SUBJECT_TYPES.find((s) => s.value === type)?.depth ?? 99
}

export function subjectBadgeClass(type: string | null | undefined): string {
  switch (type) {
    case 'project':
      return 'badge badge-info'
    case 'system':
    case 'subsystem':
      return 'badge badge-success'
    case 'equipment':
    case 'component':
      return 'badge badge-warning'
    default:
      return 'badge badge-neutral'
  }
}

// A subject as the rest of the application sees it: identity, a display name,
// and where it sits.
export type Subject = {
  type: SubjectType
  id: string
  code: string | null
  name: string
  parent: SubjectRef | null
}

export function refKey(ref: SubjectRef | { type: string | null; id: string | null }): string {
  return `${ref.type ?? '?'}:${ref.id ?? '?'}`
}

export function sameRef(a: SubjectRef | null, b: SubjectRef | null): boolean {
  if (!a || !b) return false
  return a.type === b.type && a.id === b.id
}

// How a subject is written in a list or a notice: "GIS-01 — Line Bay E03".
export function subjectTitle(s: Subject | null): string {
  if (!s) return 'Unassigned'
  if (s.code && s.name && s.code !== s.name) return `${s.code} — ${s.name}`
  return s.code || s.name || subjectLabel(s.type)
}

// ── The index ─────────────────────────────────────────────────────────────

// Every subject on a project, plus the parent links between them. Built once
// per request from a fixed number of queries, then walked in memory — which is
// what makes ancestors and descendants cheap enough to use on every page.
export type SubjectIndex = {
  byKey: Map<string, Subject>
  childrenOf: Map<string, Subject[]>
  root: Subject | null
}

export function buildIndex(subjects: Subject[], root: Subject | null): SubjectIndex {
  const byKey = new Map<string, Subject>()
  const childrenOf = new Map<string, Subject[]>()

  for (const s of subjects) byKey.set(refKey(s), s)

  for (const s of subjects) {
    if (!s.parent) continue
    const k = refKey(s.parent)
    const list = childrenOf.get(k)
    if (list) list.push(s)
    else childrenOf.set(k, [s])
  }

  return { byKey, childrenOf, root }
}

// Matching a spreadsheet cell to something in the tree.
//
// An imported row says "GIS-115-CB-01" or "115kV GIS" or "Line Bay 01" and
// means one of them. Codes are collected before names because a code is
// unique by intent and a name is not, and both are kept so that a genuinely
// ambiguous word can be reported rather than silently resolved to whichever
// row happened to load first.
export type SubjectTextIndex = {
  byCode: Map<string, Subject[]>
  byName: Map<string, Subject[]>
}

function textKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function buildTextIndex(index: SubjectIndex): SubjectTextIndex {
  const byCode = new Map<string, Subject[]>()
  const byName = new Map<string, Subject[]>()

  const push = (map: Map<string, Subject[]>, key: string, subject: Subject) => {
    if (!key) return
    const list = map.get(key)
    if (list) list.push(subject)
    else map.set(key, [subject])
  }

  for (const s of index.byKey.values()) {
    if (s.type === 'project') continue
    if (s.code) push(byCode, textKey(s.code), s)
    push(byName, textKey(s.name), s)
  }

  return { byCode, byName }
}

export type SubjectMatch = { subject: Subject | null; candidates: Subject[] }

export function findSubjectByText(text: SubjectTextIndex, raw: string): SubjectMatch {
  const key = textKey(raw)
  if (!key) return { subject: null, candidates: [] }

  const byCode = text.byCode.get(key) ?? []
  if (byCode.length === 1) return { subject: byCode[0], candidates: byCode }
  if (byCode.length > 1) return { subject: null, candidates: byCode }

  const byName = text.byName.get(key) ?? []
  if (byName.length === 1) return { subject: byName[0], candidates: byName }
  return { subject: null, candidates: byName }
}

export function getSubject(index: SubjectIndex, ref: SubjectRef | null): Subject | null {
  if (!ref) return null
  return index.byKey.get(refKey(ref)) ?? null
}

export function childrenOf(index: SubjectIndex, ref: SubjectRef | null): Subject[] {
  if (!ref) return []
  return index.childrenOf.get(refKey(ref)) ?? []
}

// Walking up. Returns the chain from the top down to (but not including) the
// subject itself, which is what a breadcrumb needs.
export function ancestorsOf(index: SubjectIndex, ref: SubjectRef | null): Subject[] {
  const chain: Subject[] = []
  let current = getSubject(index, ref)
  const seen = new Set<string>()

  while (current?.parent) {
    const key = refKey(current.parent)
    // A cycle would hang the page. It should be impossible, but a bad import
    // could create one, and a breadcrumb is not worth an outage.
    if (seen.has(key)) break
    seen.add(key)
    const parent = index.byKey.get(key)
    if (!parent) break
    chain.unshift(parent)
    current = parent
  }

  return chain
}

// Walking down. Every subject beneath this one, at any depth — which is how a
// roll-up knows which records belong to a system.
export function descendantsOf(index: SubjectIndex, ref: SubjectRef | null): Subject[] {
  if (!ref) return []
  const out: Subject[] = []
  const queue: SubjectRef[] = [ref]
  const seen = new Set<string>([refKey(ref)])

  while (queue.length > 0) {
    const next = queue.shift() as SubjectRef
    for (const child of childrenOf(index, next)) {
      const key = refKey(child)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(child)
      queue.push({ type: child.type, id: child.id })
    }
  }

  return out
}

// The set a roll-up actually filters on: this subject and everything under it.
export function subtreeKeys(index: SubjectIndex, ref: SubjectRef | null): Set<string> {
  const keys = new Set<string>()
  if (!ref) return keys
  keys.add(refKey(ref))
  for (const d of descendantsOf(index, ref)) keys.add(refKey(d))
  return keys
}

// "Substation A › 115kV GIS › Bay 01 › CB-01"
export function breadcrumb(index: SubjectIndex, ref: SubjectRef | null): Subject[] {
  const self = getSubject(index, ref)
  const chain = ancestorsOf(index, ref)
  return self ? [...chain, self] : chain
}
