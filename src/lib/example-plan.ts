// The worked example, described as data.
//
// Nothing in this application has ever been seen running against a real
// project. Every rule, every matrix, every screen has been proved by
// assertions and by rendering components with invented figures — which
// catches a great deal and cannot catch the one thing that matters most:
// whether the whole chain holds together on a database.
//
// So this is a project that can be created in one press and deleted in
// another. It is not a demonstration of a well-run job.
//
//   IT IS BUILT TO FAIL. Deliberately, in fourteen specific ways, one for
//   each rule the application can report — so that opening Rule Checks on
//   it shows what every finding actually looks like on real records
//   instead of an empty page.
//
// Each fault below is annotated with the rule it is there to trigger. If a
// rule is ever removed, its fault should go with it; if a rule is added,
// this is where the case for it gets written.

export type ExampleTag = { tag: string; description: string }

export const EXAMPLE_PROJECT = {
  name: 'Worked example — 11kV switchboard',
  client: 'Example client (delete this project when you are done)',
  location: 'Bangkok',
}

export const EXAMPLE_TAGS: ExampleTag[] = [
  { tag: 'SUDB-A1-Q1', description: 'Incoming circuit breaker' },
  { tag: 'SUDB-A1-Q2', description: 'Feeder circuit breaker' },
  { tag: 'SUDB-A1-Q3', description: 'Feeder circuit breaker' },
  { tag: 'SUDB-A1-Q4', description: 'Bus tie circuit breaker' },
  { tag: 'PQM-A1', description: 'Power quality meter' },
]

export const EXAMPLE_TAGS_B: ExampleTag[] = [
  { tag: 'SUDB-B1-Q1', description: 'Incoming circuit breaker' },
  { tag: 'SUDB-B1-Q2', description: 'Feeder circuit breaker' },
]

/** L1 — what the vendor tested. Every tag, all passed. */
export const L1_CHECKS = [
  'Routine test certificate issued and signed by the manufacturer.',
  'Type test report available for this rating.',
  'Nameplate data matches the approved technical data sheet.',
  'Primary injection results within the manufacturer tolerance.',
  'Insulation resistance recorded at the factory.',
  'Packing and preservation confirmed before shipment.',
]

/** L2 — that it arrived and was installed as designed. */
export const L2_CHECKS = [
  'Asset tag is attached.',
  'Arc flash labels are applied and verified to the latest revision.',
  'Equipment layout and cubicle identification matches the drawing.',
  'Unit is set square and level.',
  'All cables properly torqued, double torque marks visible.',
  'Proper termination of all power and earth cables including bolted connections and crimps.',
  'Proper labelling of all power and earth cables.',
  'Component integrity — no damaged components.',
  'Proper grounding of the enclosure to the building earth point.',
  'Adequate cleanliness of the compartments.',
]

/** L3 — that it is safe to energise. */
export const L3_CHECKS = [
  'MV supply isolated by approved switching and LOTO procedure.',
  'CT terminals in the in-service position, shorting links open.',
  'VT circuit links are closed.',
  'Correct breaker rating, CT and VT ratio confirmed.',
  'Insulation resistance test recorded and within limits.',
  'Protection settings loaded per the approved discrimination study.',
  'Anti-tamper seals intact.',
  'Green tag applied — equipment released for functional testing.',
]

export type ExampleScriptLine = {
  serial: number
  section: string
  content: string
  /** pass | fail | na | pending */
  status: string
  remark?: string
  evidence?: string
  links?: string
}

/**
 * A functional test script against the board itself — L4, system scope.
 *
 * Two lines fail. One of them is the line another line depends on, and that
 * dependent line is marked pass — which is the finding no single screen can
 * see and the reason `check-links.ts` exists.
 */
export const EXAMPLE_SCRIPT: ExampleScriptLine[] = [
  { serial: 1, section: '1. Prerequisites', content: 'This test script has been reviewed and approved.', status: 'pass' },
  { serial: 2, section: '1. Prerequisites', content: 'Start-up reports and pre-functional checklists completed, signed and approved.', status: 'pass' },
  { serial: 3, section: '1. Prerequisites', content: 'Breakers are set per the approved discrimination study.', status: 'pass', links: 'REQ-014' },
  { serial: 4, section: '1. Prerequisites', content: 'EPMS network is operational end to end.', status: 'pass' },
  { serial: 5, section: '2. Safety', content: 'Job hazard analysis completed and recorded before testing.', status: 'pass' },
  { serial: 6, section: '2. Safety', content: 'Infrared camera and operator available for thermographic scanning.', status: 'na', remark: 'Deferred to the burn-in test at line 24.' },
  { serial: 7, section: '3. Cubicle heaters', content: 'Confirm MV power is isolated to the switchgear.', status: 'pass' },
  { serial: 8, section: '3. Cubicle heaters', content: 'Record thermostat setpoint.', status: 'pass', evidence: 'Photo of thermostat', remark: 'Set to 20 °C as found.' },
  { serial: 9, section: '3. Cubicle heaters', content: 'Verify heater function using a clamp meter.', status: 'pass', evidence: 'Clamp meter reading photo' },
  { serial: 10, section: '4. Power supply redundancy', content: 'Fail power supply to PSU 1.', status: 'pass' },
  { serial: 11, section: '4. Power supply redundancy', content: 'PSU 1 failure alarm appears at the HMI.', status: 'pass' },
  { serial: 12, section: '4. Power supply redundancy', content: 'Verify PSU 2 maintains power to all components.', status: 'pass' },

  // ── FAULT 1: a line fails ─────────────────────────────────────────────
  // Feeds several rules at once: the failed-check count, the punch list gap
  // below, and the dependency finding at line 20.
  {
    serial: 13,
    section: '5. Breaker operation',
    content: 'Simulate trip for breaker Q3 and verify it cannot be closed.',
    status: 'fail',
    remark: 'Q3 closed after a simulated trip. Trip circuit supervision wiring suspect — see cubicle 3.',
    evidence: 'Photo of HMI showing Q3 closed',
  },

  { serial: 14, section: '5. Breaker operation', content: 'Close breaker Q1 and verify the HMI shows it closed.', status: 'pass' },
  { serial: 15, section: '5. Breaker operation', content: 'Close breaker Q2 and verify the HMI shows it closed.', status: 'pass' },
  { serial: 16, section: '5. Breaker operation', content: 'Normalise all breakers and clear alarms.', status: 'pending' },

  // ── FAULT 2: a second failure, with no punch item raised against it ────
  // Rule: check/failed-with-nothing-raised.
  {
    serial: 17,
    section: '6. Earthing switch interlocks',
    content: 'With earthing switch Q1 closed, verify CB Q1 cannot be closed.',
    status: 'fail',
    remark: 'Interlock did not hold. CB Q1 closed onto a closed earth switch.',
  },

  { serial: 18, section: '6. Earthing switch interlocks', content: 'Verify earthing switch Q2 interlock.', status: 'pending' },
  { serial: 19, section: '6. Earthing switch interlocks', content: 'Reset and clear all alarms.', status: 'pending' },

  // ── FAULT 3: passed while the line it depends on failed ───────────────
  // Rule: check/passed-while-what-it-depends-on-failed. Both records are
  // individually honest. Together they do not hold.
  {
    serial: 20,
    section: '7. Bus tie interlock',
    content: 'Confirm bus tie Q4 will not close while the incomer is closed.',
    status: 'pass',
    links: '13; 17',
    remark: 'Witnessed by the client.',
  },

  { serial: 21, section: '7. Bus tie interlock', content: 'Move the Kirk key from Q1 to Q4 and confirm Q4 can then close.', status: 'pending' },

  // ── FAULT 4: evidence named on the sheet, no file ever attached ───────
  // Rule: check/evidence-named-but-not-attached.
  {
    serial: 22,
    section: '8. HMI verification',
    content: 'Simulate protection operated and verify the alarm on the EPMS.',
    status: 'pass',
    evidence: 'Screenshot of EPMS alarm list',
  },

  { serial: 23, section: '8. HMI verification', content: 'Simulate communication loss and verify the status on the EPMS.', status: 'pending', links: 'E-4102-C' },
  { serial: 24, section: '9. Burn in test', content: 'Thermographic scan after one hour at load; verify no thermal anomalies.', status: 'pending', links: '6; IEC 60255' },
]

/** Every deliberate fault, so the screen can list what to look for. */
/**
 * The values the example writes into constrained columns.
 *
 * These are here, and asserted against the application's own option lists,
 * because of what happened the first time the example was pressed on a real
 * database: it wrote `category: 'Switchgear'`, which reads perfectly well in
 * English and is not one of the six categories this application defines.
 * Postgres refused all seven equipment rows on a check constraint, every
 * check belonging to a tag had nothing to attach to, and the findings page
 * reported five of fourteen as though five were the answer.
 *
 * A literal in seed data is a claim about a vocabulary defined somewhere
 * else. Naming them here lets the assertions check that claim; leaving them
 * inline meant the database was the first thing to notice.
 */
export const EXAMPLE_VOCAB = {
  equipmentCategory: 'substation_protection',
  installStatus: 'installed',
  /** The board under test is in functional testing; the second board is behind it. */
  stageA: 'functional_testing',
  stageB: 'pre_commissioning',
  severityCritical: 'critical',
  severityMinor: 'minor',
  punchA: 'A',
  punchB: 'B',
  statusOpen: 'open',
  statusClosed: 'closed',
  milestoneStatus: 'on_track',
  obligationParty: 'contractor',
} as const

export const EXAMPLE_FAULTS: { rule: string; what: string }[] = [
  { rule: 'plan/left-out-of-a-level-its-neighbours-were-in', what: 'SUDB-A1-Q4 has no L2 checks at all, while its four neighbours carry ten each.' },
  { rule: 'plan/no-functional-test-exists-for-a-finished-system', what: 'SWGR-B1 has every pre-functional check passed and no functional test recorded at all.' },
  { rule: 'plan/library-check-applied-to-some-tags-and-not-others', what: 'A library check is applied to three breakers in SWGR-A1 and missing from the fourth.' },
  { rule: 'check/failed-with-nothing-raised', what: 'Script line 17 failed and no punch item was ever raised for it.' },
  { rule: 'check/passed-while-what-it-depends-on-failed', what: 'Script line 20 is marked pass and depends on lines 13 and 17, both of which failed.' },
  { rule: 'check/evidence-named-but-not-attached', what: 'Line 22 names a screenshot as its evidence and no file was uploaded.' },
  { rule: 'punch/closed-without-a-photograph', what: 'P-0002 is closed with no photograph anywhere on the record.' },
  { rule: 'punch/too-little-to-act-on', what: 'P-0003 says "Dust" and nothing else.' },
  { rule: 'punch/no-date-at-all', what: 'P-0003 has no date, so it can never appear in an overdue figure.' },
  { rule: 'punch/category-a-past-its-date', what: 'P-0001 is Category A and its date has passed.' },
  { rule: 'schedule/milestone-passed', what: 'Energisation was due three weeks ago and is not marked complete.' },
  { rule: 'schedule/obligation-passed', what: 'OBL-0001 is past its date and only submitted — submitted is not accepted.' },
  { rule: 'repeat/the-same-check-recorded-twice', what: '"Asset tag is attached." appears twice on PQM-A1 at L2.' },
  { rule: 'scope/system-testing-recorded-against-one-tag', what: 'One L4 check is recorded against SUDB-A1-Q1 rather than against the board.' },
]

// ── The rows, built purely so the claim can be checked ──────────────────
//
// The action does the database work; this decides what the rows ARE. Split
// that way for one reason: the promise on the screen is "fourteen faults, one
// per rule", and a promise like that is worth nothing unless something proves
// it. The assertions feed these rows straight into the rule functions and
// require each named rule to fire.

export type ExampleCheckRow = {
  subjectId: string
  subjectType: 'equipment' | 'system'
  level: string
  item: string
  status: string
  notes?: string | null
  sectionPath?: string | null
  serial?: string | null
  sourceRef?: string | null
  evidenceRef?: string | null
  linksTo?: string | null
}

export function buildExampleChecks(
  tagId: (tag: string) => string | undefined,
  systemA: string
): ExampleCheckRow[] {
  const rows: ExampleCheckRow[] = []
  const tagRow = (id: string, level: string, item: string, status: string): ExampleCheckRow => ({
    subjectId: id,
    subjectType: 'equipment',
    level,
    item,
    status,
  })

  for (const t of EXAMPLE_TAGS) {
    const id = tagId(t.tag)
    if (!id) continue
    for (const item of L1_CHECKS) rows.push(tagRow(id, 'L1_fat', item, 'pass'))

    // FAULT: Q4 left out of L2 entirely.
    if (t.tag !== 'SUDB-A1-Q4') {
      for (const item of L2_CHECKS) rows.push(tagRow(id, 'L2_iv', item, 'pass'))
      // FAULT: the same check twice on one tag at one level.
      if (t.tag === 'PQM-A1') rows.push(tagRow(id, 'L2_iv', 'Asset tag is attached', 'pass'))
    }

    for (const [i, item] of L3_CHECKS.entries()) {
      rows.push(tagRow(id, 'L3_prefunctional', item, i === 5 && t.tag === 'SUDB-A1-Q2' ? 'pending' : 'pass'))
    }
  }

  // FAULT: a finished second board with no functional test at all.
  for (const t of EXAMPLE_TAGS_B) {
    const id = tagId(t.tag)
    if (!id) continue
    for (const item of L3_CHECKS) rows.push(tagRow(id, 'L3_prefunctional', item, 'pass'))
  }

  // FAULT: system-level testing recorded against one breaker.
  const q1 = tagId('SUDB-A1-Q1')
  if (q1) rows.push(tagRow(q1, 'L4_fpt', 'Verify breaker Q1 closes and trips from the HMI.', 'pass'))

  for (const line of EXAMPLE_SCRIPT) {
    rows.push({
      subjectId: systemA,
      subjectType: 'system',
      level: 'L4_fpt',
      item: line.content,
      status: line.status,
      notes: line.remark ?? null,
      sectionPath: line.section,
      serial: String(line.serial),
      sourceRef: `SCRIPT:SUDB A1 functional test:${line.serial}`,
      evidenceRef: line.evidence ?? null,
      linksTo: line.links ?? null,
    })
  }

  return rows
}
