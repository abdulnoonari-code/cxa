// Notices and alerts.
//
// Two separate things live here. A NOTICE is something you deliberately send
// to a person — "the transformer test is ready, please come and witness it".
// An ALERT is something the system works out for itself by looking at the
// records — an expired instrument, a hold point nobody has released.
//
// Notices are recorded permanently because on a witness point, proof that you
// gave proper notice is what lets work proceed when nobody turns up. Alerts
// are never stored: like readiness, they are recomputed every time so they
// cannot go stale.

import { calibrationStatus } from '@/lib/tests'
import { releaseBlocks, inspectionLabel, type ReleaseState } from '@/lib/inspection'

// ── Notice composition ────────────────────────────────────────────────────

export type NoticeInput = {
  projectName: string
  projectNumber?: string | null
  equipmentTag: string
  activity: string
  inspectionType: string
  scheduledFor?: string | null
  location?: string | null
  procedureRef?: string | null
  acceptanceCriteria?: string | null
  note?: string | null
  fromName: string
  fromRole: string
  fromCompany?: string | null
}

export function noticeSubject(input: NoticeInput): string {
  const kind = input.inspectionType === 'hold' ? 'Hold Point' : 'Witness Point'
  const ref = input.projectNumber ? `${input.projectNumber} — ` : ''
  return `Inspection Notice (${kind}) — ${ref}${input.equipmentTag} — ${input.activity}`
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return 'To be confirmed'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Plain text on purpose. It has to survive being pasted into any email client,
// printed, and read on a phone in a substation.
export function noticeBody(input: NoticeInput): string {
  const isHold = input.inspectionType === 'hold'
  const lines: string[] = []

  lines.push('Dear Sir / Madam,')
  lines.push('')
  lines.push(
    `This is formal notice that the following activity on ${input.projectName} is scheduled for inspection. ` +
      `It is designated a ${inspectionLabel(input.inspectionType)} on the approved Inspection and Test Plan, ` +
      `and you are invited to attend.`
  )
  lines.push('')
  lines.push(`Project:         ${input.projectName}${input.projectNumber ? ` (${input.projectNumber})` : ''}`)
  lines.push(`Equipment / tag: ${input.equipmentTag}`)
  lines.push(`Activity:        ${input.activity}`)
  lines.push(`ITP designation: ${inspectionLabel(input.inspectionType)}`)
  lines.push(`Scheduled for:   ${formatWhen(input.scheduledFor)}`)
  if (input.location) lines.push(`Location:        ${input.location}`)
  if (input.procedureRef) lines.push(`Procedure:       ${input.procedureRef}`)
  if (input.acceptanceCriteria) lines.push(`Acceptance:      ${input.acceptanceCriteria}`)
  lines.push('')

  if (input.note) {
    lines.push(input.note)
    lines.push('')
  }

  if (isHold) {
    lines.push(
      'This is a HOLD POINT. Work will not proceed beyond this activity until it has been ' +
        'inspected and released in writing. Please confirm your attendance.'
    )
  } else {
    lines.push(
      'This is a WITNESS POINT. Please confirm whether you intend to attend. If no ' +
        'representative attends at the scheduled time, the activity will proceed and be ' +
        'recorded as carried out without witness, in accordance with the contract.'
    )
  }

  lines.push('')
  lines.push('Kind regards,')
  lines.push(input.fromName)
  lines.push(input.fromRole + (input.fromCompany ? `, ${input.fromCompany}` : ''))
  lines.push('')
  lines.push('— Sent from CxSentinel commissioning management')

  return lines.join('\n')
}

// A mailto: link opens the engineer's own email client with everything already
// written. It costs nothing, needs no email service and no domain, and the
// message goes out from his real work address — which as a contract record is
// stronger than an automated one from an app.
//
// When automatic sending is switched on later, only the delivery step changes:
// the subject and body built above are exactly what gets sent.
export function mailtoLink(to: string[], subject: string, body: string): string {
  // Addresses go in unencoded and comma-separated, which is what mail clients
  // expect; the subject and body are percent-encoded because they contain
  // spaces, newlines and punctuation.
  const recipients = to.filter(Boolean).join(',')
  const q = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  return `mailto:${recipients}?${q}`
}

// Some email clients truncate very long mailto links. Anything over this and
// the page tells the engineer to copy the text instead of trusting the link.
export const MAILTO_SAFE_LENGTH = 1900

export function mailtoIsSafe(link: string): boolean {
  return link.length <= MAILTO_SAFE_LENGTH
}

// ── Alert engine ──────────────────────────────────────────────────────────

export type AlertSeverity = 'critical' | 'warning' | 'info'

export type Alert = {
  severity: AlertSeverity
  category: string
  title: string
  detail: string
  href: string
}

export function alertBadgeClass(severity: AlertSeverity): string {
  switch (severity) {
    case 'critical':
      return 'badge badge-danger'
    case 'warning':
      return 'badge badge-warning'
    default:
      return 'badge badge-info'
  }
}

export const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }

type AlertInput = {
  instruments: { instrument_id: string; name: string | null; calibration_expiry: string | null }[]
  tests: {
    name: string
    result: string
    approval_state: string | null
    inspection_type?: string | null
    release?: ReleaseState
    tag: string
  }[]
  checks: {
    item: string
    status: string
    review_state: string | null
    inspection_type?: string | null
    release?: ReleaseState
    notified_at?: string | null
    tag: string
  }[]
  issues: { title: string; category: string | null; status: string; severity: string }[]
  contactsWithEmail: number
}

const DAY = 24 * 60 * 60 * 1000

export function daysUntil(dateString: string | null | undefined, now: Date = new Date()): number | null {
  if (!dateString) return null
  const target = new Date(dateString)
  if (Number.isNaN(target.getTime())) return null
  return Math.ceil((target.getTime() - now.getTime()) / DAY)
}

// Everything here is derived from the records. Nothing is stored, so an alert
// disappears the moment the thing causing it is fixed.
export function computeAlerts(input: AlertInput, now: Date = new Date()): Alert[] {
  const alerts: Alert[] = []

  // ── Hold points ─────────────────────────────────────────────────────────
  for (const c of input.checks) {
    if (c.release && releaseBlocks(c.inspection_type, c.release)) {
      alerts.push({
        severity: 'critical',
        category: 'Hold point',
        title: `Work is held at ${c.tag}`,
        detail:
          c.release === 'rejected'
            ? `"${c.item}" was refused at inspection. It cannot proceed until it is reworked and signed again.`
            : `"${c.item}" has been reached and not released. Work may not proceed past it.`,
        href: '/holdpoints',
      })
    }
  }
  for (const t of input.tests) {
    if (t.release && releaseBlocks(t.inspection_type, t.release)) {
      alerts.push({
        severity: 'critical',
        category: 'Hold point',
        title: `Work is held at ${t.tag}`,
        detail:
          t.release === 'rejected'
            ? `Test "${t.name}" was refused at inspection and is not released.`
            : `Test "${t.name}" has been reached and not released.`,
        href: '/holdpoints',
      })
    }
  }

  // Witness points reached with nobody invited — the exact situation that
  // loses an argument later.
  const unnotified = input.checks.filter((c) => c.inspection_type === 'witness' && c.release === 'awaiting_notice')
  if (unnotified.length > 0) {
    alerts.push({
      severity: 'warning',
      category: 'Notice',
      title: `${unnotified.length} witness point${unnotified.length === 1 ? '' : 's'} carried out with no notice given`,
      detail:
        'Work may proceed past a witness point only if proper notice was given. Give notice from the Hold & Witness Points page so the record exists.',
      href: '/holdpoints',
    })
  }

  // ── Test instruments ────────────────────────────────────────────────────
  for (const i of input.instruments) {
    const status = calibrationStatus(i.calibration_expiry)
    const label = i.name ? `${i.instrument_id} (${i.name})` : i.instrument_id
    if (status === 'expired') {
      alerts.push({
        severity: 'critical',
        category: 'Calibration',
        title: `Calibration expired — ${label}`,
        detail: `This instrument's calibration expired on ${i.calibration_expiry}. Results recorded on it are not valid evidence.`,
        href: '/instruments',
      })
    } else if (status === 'expiring') {
      const days = daysUntil(i.calibration_expiry, now)
      alerts.push({
        severity: 'warning',
        category: 'Calibration',
        title: `Calibration expires soon — ${label}`,
        detail: `Expires in ${days} day${days === 1 ? '' : 's'} (${i.calibration_expiry}). Book recalibration before it stops any testing.`,
        href: '/instruments',
      })
    }
  }

  // ── Failed work ─────────────────────────────────────────────────────────
  const failedTests = input.tests.filter((t) => t.result === 'fail')
  for (const t of failedTests) {
    alerts.push({
      severity: 'critical',
      category: 'Test failure',
      title: `Test failed — ${t.tag}`,
      detail: `"${t.name}" did not meet its acceptance criteria. Raise an issue and schedule a retest.`,
      href: '/tests',
    })
  }

  const failedChecks = input.checks.filter((c) => c.status === 'fail')
  if (failedChecks.length > 0) {
    alerts.push({
      severity: 'warning',
      category: 'Checks',
      title: `${failedChecks.length} check${failedChecks.length === 1 ? '' : 's'} failed`,
      detail: 'Each needs a corrective action and a recheck before the system can advance.',
      href: '/checklists',
    })
  }

  const rejected = input.checks.filter((c) => (c.review_state ?? 'draft') === 'rejected')
  if (rejected.length > 0) {
    alerts.push({
      severity: 'warning',
      category: 'Review',
      title: `${rejected.length} check${rejected.length === 1 ? '' : 's'} rejected at review`,
      detail: 'These were sent back for rework. They will keep blocking readiness until they are redone and approved.',
      href: '/review',
    })
  }

  // ── Approvals waiting ───────────────────────────────────────────────────
  const awaitingApproval =
    input.checks.filter((c) => ['submitted', 'reviewed'].includes(c.review_state ?? 'draft')).length +
    input.tests.filter((t) => ['submitted', 'reviewed'].includes(t.approval_state ?? 'draft')).length
  if (awaitingApproval > 0) {
    alerts.push({
      severity: 'info',
      category: 'Approvals',
      title: `${awaitingApproval} record${awaitingApproval === 1 ? '' : 's'} waiting for approval`,
      detail: 'Nothing closes out until somebody with approve rights signs these off.',
      href: '/review',
    })
  }

  // ── Punch list ──────────────────────────────────────────────────────────
  const openIssues = input.issues.filter((i) => i.status !== 'closed' && i.status !== 'verified')
  const categoryA = openIssues.filter((i) => i.category === 'A')
  if (categoryA.length > 0) {
    alerts.push({
      severity: 'critical',
      category: 'Punch list',
      title: `${categoryA.length} Category A punch item${categoryA.length === 1 ? '' : 's'} open`,
      detail: 'Category A is safety-critical. These must be closed before the system advances.',
      href: '/issues',
    })
  }
  const uncategorised = openIssues.filter((i) => !i.category)
  if (uncategorised.length > 0) {
    alerts.push({
      severity: 'info',
      category: 'Punch list',
      title: `${uncategorised.length} punch item${uncategorised.length === 1 ? '' : 's'} not categorised`,
      detail: 'Give each one a category (A, B or C) so it is clear what blocks handover and what does not.',
      href: '/issues',
    })
  }

  // ── Setup ───────────────────────────────────────────────────────────────
  if (input.contactsWithEmail === 0) {
    alerts.push({
      severity: 'info',
      category: 'Setup',
      title: 'No contacts with an email address yet',
      detail: 'Add the client and consultant on the Contacts page so inspection notices have somewhere to go.',
      href: '/contacts',
    })
  }

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}
