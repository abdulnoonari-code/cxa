// The daily commissioning report.
//
// Every commissioning manager writes one of these by hand at the end of the
// day, from memory and from whatever notes survived the site. This builds it
// from the audit log instead — which is append-only and cannot be edited, so
// the report is the record rather than somebody's recollection of it.
//
// The honesty rule that governs the whole file: this reports what was
// RECORDED on a day, not what happened on site. If nobody entered anything,
// the report says so plainly. It never implies work did not happen, and it
// never fills a quiet day with something that looks like activity.

export type AuditEvent = {
  id: string
  actor_name: string | null
  actor_email: string | null
  actor_role: string | null
  action: string
  entity: string
  entity_id: string | null
  entity_label: string | null
  old_value: string | null
  new_value: string | null
  comment: string | null
  created_at: string
}

export const SECTIONS = [
  { key: 'testing', label: 'Testing & inspection', note: 'Results recorded and ITP activities carried out' },
  { key: 'quality', label: 'Punch list & quality', note: 'Issues raised, worked and closed' },
  { key: 'inspection_notices', label: 'Inspection notices', note: 'Clients and witnesses invited, and notices sent' },
  { key: 'approvals', label: 'Approvals & signatures', note: 'Records put beyond dispute by somebody signing them' },
  { key: 'gates', label: 'Readiness gates', note: 'Gate prerequisites answered and gates set up' },
  { key: 'engineering', label: 'Engineering & requirements', note: 'Documents, revisions and what must be proven' },
  { key: 'administration', label: 'Project administration', note: 'Team, roles, contacts and data imports' },
  { key: 'other', label: 'Other activity', note: 'Everything else recorded that day' },
]

export function sectionLabel(key: string): string {
  return SECTIONS.find((s) => s.key === key)?.label ?? 'Other activity'
}

// Matching is on the entity first and keywords second, with a catch-all that
// keeps anything unrecognised. A future action name that nobody remembers to
// classify must still appear in the report rather than vanish from it.
export function classify(event: AuditEvent): string {
  const a = event.action.toLowerCase()

  if (a.includes('sign')) return 'approvals'
  if (a.includes('notice')) return 'inspection_notices'
  if (a.includes('gate')) return 'gates'

  if (event.entity === 'test_record' || event.entity === 'checklist_item') return 'testing'
  if (event.entity === 'issue') return 'quality'
  if (event.entity === 'notification') return 'inspection_notices'
  if (event.entity === 'requirement' || event.entity === 'controlled_document') return 'engineering'
  if (event.entity === 'project_member' || event.entity === 'project_role' || event.entity === 'project_contact') {
    return 'administration'
  }

  if (a.includes('import')) return 'administration'
  if (a.includes('issue') || a.includes('punch')) return 'quality'

  return 'other'
}

// A local calendar day, not a UTC one. A test recorded at 8pm in Bangkok
// belongs to that day's report, not to the next one.
export function isOnDay(iso: string, day: string): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10) === day
}

export type PersonActivity = {
  name: string
  role: string | null
  entries: number
}

export type ReportSection = {
  key: string
  label: string
  note: string
  events: AuditEvent[]
}

export type DailyReport = {
  day: string
  sections: ReportSection[]
  total: number
  people: PersonActivity[]
  /** counts that a client actually reads */
  figures: {
    testsRecorded: number
    checksRecorded: number
    failures: number
    issuesRaised: number
    issuesClosed: number
    noticesIssued: number
    signatures: number
    prerequisitesAnswered: number
  }
}

export function buildDailyReport(events: AuditEvent[], day: string): DailyReport {
  const onDay = events.filter((e) => isOnDay(e.created_at, day))

  const sections: ReportSection[] = SECTIONS.map((s) => ({
    key: s.key,
    label: s.label,
    note: s.note,
    events: onDay.filter((e) => classify(e) === s.key),
  })).filter((s) => s.events.length > 0)

  const byPerson = new Map<string, PersonActivity>()
  for (const e of onDay) {
    const name = e.actor_name || e.actor_email || 'Unknown'
    const existing = byPerson.get(name)
    if (existing) existing.entries += 1
    else byPerson.set(name, { name, role: e.actor_role, entries: 1 })
  }

  const has = (e: AuditEvent, ...words: string[]) => {
    const a = e.action.toLowerCase()
    return words.some((w) => a.includes(w))
  }

  return {
    day,
    sections,
    total: onDay.length,
    people: [...byPerson.values()].sort((a, b) => b.entries - a.entries),
    figures: {
      testsRecorded: onDay.filter((e) => e.entity === 'test_record' && !has(e, 'sign', 'notice')).length,
      checksRecorded: onDay.filter((e) => e.entity === 'checklist_item' && !has(e, 'sign', 'notice')).length,
      // A failure is worth its own line: it is the thing a client looks for.
      failures: onDay.filter((e) => (e.new_value ?? '').toLowerCase().includes('fail')).length,
      issuesRaised: onDay.filter((e) => e.entity === 'issue' && has(e, 'raised', 'created', 'added')).length,
      issuesClosed: onDay.filter((e) => e.entity === 'issue' && has(e, 'closed', 'verified', 'resolved')).length,
      noticesIssued: onDay.filter((e) => has(e, 'notice')).length,
      signatures: onDay.filter((e) => has(e, 'sign')).length,
      prerequisitesAnswered: onDay.filter((e) => has(e, 'prerequisite')).length,
    },
  }
}

// ── Dates ─────────────────────────────────────────────────────────────────

export function today(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

export function shiftDay(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function longDate(day: string): string {
  const d = new Date(`${day}T12:00:00`)
  if (Number.isNaN(d.getTime())) return day
  return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

export function timeOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// What a quiet day should say. Not "no work was done" — the records simply do
// not show any, which is a different statement and the only one the app is
// entitled to make.
export function emptyDayNote(day: string): string {
  return `No entries were recorded on ${longDate(day)}. This does not mean no work took place — only that nothing was entered into CxSentinel that day.`
}
