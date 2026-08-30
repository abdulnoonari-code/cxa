// How a test's acceptance criteria is expressed. The first three are numeric
// and evaluate themselves; the last is for criteria that can only be judged by
// a person (visual inspection, "operates correctly", and so on).
export const CRITERIA_TYPES = [
  { value: 'max', label: 'Not more than (≤)', hint: 'e.g. contact resistance ≤ 50 µΩ' },
  { value: 'min', label: 'Not less than (≥)', hint: 'e.g. insulation resistance ≥ 1000 MΩ' },
  { value: 'range', label: 'Between', hint: 'e.g. 540 – 560 V DC' },
  { value: 'text', label: 'Judged by engineer', hint: 'No number — you set pass or fail' },
]

export const TEST_RESULTS = [
  { value: 'pending', label: 'Not tested' },
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
]

export function resultBadgeClass(result: string | null): string {
  switch (result) {
    case 'pass':
      return 'badge badge-success'
    case 'fail':
      return 'badge badge-danger'
    default:
      return 'badge badge-warning'
  }
}

// The whole point of a test record: you enter the measured value and the
// system decides, rather than the engineer typing "pass" next to a number that
// does not actually meet the criteria.
export function evaluateTest(
  criteriaType: string | null,
  expectedMin: number | null,
  expectedMax: number | null,
  actual: number | null
): 'pass' | 'fail' | 'pending' {
  if (actual === null || actual === undefined || Number.isNaN(actual)) return 'pending'

  switch (criteriaType) {
    case 'max':
      if (expectedMax === null || expectedMax === undefined) return 'pending'
      return actual <= expectedMax ? 'pass' : 'fail'
    case 'min':
      if (expectedMin === null || expectedMin === undefined) return 'pending'
      return actual >= expectedMin ? 'pass' : 'fail'
    case 'range':
      if (expectedMin === null || expectedMax === null) return 'pending'
      return actual >= expectedMin && actual <= expectedMax ? 'pass' : 'fail'
    default:
      return 'pending'
  }
}

// A readable version of the criteria, for the screen and for reports.
export function criteriaLabel(
  criteriaType: string | null,
  expectedMin: number | null,
  expectedMax: number | null,
  unit: string | null,
  criteriaText: string | null
): string {
  const u = unit ? ` ${unit}` : ''
  switch (criteriaType) {
    case 'max':
      return expectedMax !== null ? `≤ ${expectedMax}${u}` : '—'
    case 'min':
      return expectedMin !== null ? `≥ ${expectedMin}${u}` : '—'
    case 'range':
      return expectedMin !== null && expectedMax !== null ? `${expectedMin} – ${expectedMax}${u}` : '—'
    default:
      return criteriaText || 'Judged by engineer'
  }
}

// ── Instrument calibration ────────────────────────────────────────────────
export type CalibrationState = 'valid' | 'expiring' | 'expired' | 'unknown'

export function calibrationStatus(expiry: string | null): CalibrationState {
  if (!expiry) return 'unknown'
  const today = new Date(new Date().toDateString())
  const end = new Date(expiry)
  if (end < today) return 'expired'
  const thirtyDays = new Date(today)
  thirtyDays.setDate(thirtyDays.getDate() + 30)
  return end <= thirtyDays ? 'expiring' : 'valid'
}

export function calibrationBadgeClass(state: CalibrationState): string {
  switch (state) {
    case 'valid':
      return 'badge badge-success'
    case 'expiring':
      return 'badge badge-warning'
    case 'expired':
      return 'badge badge-danger'
    default:
      return 'badge badge-neutral'
  }
}

export function calibrationLabel(state: CalibrationState): string {
  switch (state) {
    case 'valid':
      return 'In calibration'
    case 'expiring':
      return 'Expires within 30 days'
    case 'expired':
      return 'Calibration expired'
    default:
      return 'No certificate'
  }
}

// A result recorded on an instrument whose certificate had lapsed is not a
// valid record. The test is kept, but it cannot be approved until the
// instrument is sorted out.
export function testBlockedReason(
  result: string | null,
  calibration: CalibrationState,
  hasInstrument: boolean
): string | null {
  if (!hasInstrument) return null
  if (calibration === 'expired') {
    return 'Test instrument calibration has expired. This result cannot be accepted until the instrument is recalibrated or the test is repeated.'
  }
  if (calibration === 'unknown' && result !== 'pending') {
    return 'No calibration certificate recorded for this instrument. Add the certificate and expiry before this result is accepted.'
  }
  return null
}
