// Which version of the code is actually on the website.
//
// ── Why this exists ─────────────────────────────────────────────────────
//
// Because neither of us could answer that question, and it cost a day.
//
// The code gets to the website by somebody dragging files into GitHub.
// There is no branch, no preview, no deploy log anybody reads, and no
// rollback. Updates go out as a zip of changed files, and the only record
// that one was applied is whether the person remembers doing it.
//
// On 27 September a deployment failed. The conversation that followed went:
// "did update 116 go up first?" — "yes" — and the truth turned out to be
// that an earlier one had not, which is why the later one could not build.
// Nobody was being careless. THERE WAS SIMPLY NOWHERE TO LOOK.
//
// So the running application says what it is. One line on the Setup screen:
//
//     Update 121 · 27 Sep 2026
//
// If that number is lower than the last zip that was sent, an upload did
// not land. That is the whole feature, and it turns a half-hour of
// archaeology into a glance.
//
// ── The one rule ────────────────────────────────────────────────────────
//
// THIS FILE IS BUMPED IN THE SAME EDIT AS THE WORK, NEVER AFTERWARDS.
// A release number updated later is a release number that is sometimes
// wrong, and a version stamp that is sometimes wrong is worse than none —
// it is the thing people check instead of checking properly.
//
// An assertion in src/checks/release.check.mts holds the shape of the list
// below. It cannot check that the number matches reality, because nothing
// can; that is a habit, not a test.

export type Release = {
  /** The update number, as it appears on the zip and in the READ-ME. */
  update: number
  /** ISO date the package was built. */
  on: string
  /** One line. What somebody would need to know to recognise it. */
  what: string
}

/**
 * Newest first. Only the updates that changed the application — a revised
 * package that replaced an earlier one takes that one's number, because
 * that is the number written on the zip somebody has in their downloads.
 */
export const RELEASES: Release[] = [
  { update: 133, on: '2026-09-29', what: 'Nineteen ways one project could reach another project\u2019s records, closed' },
  { update: 132, on: '2026-09-29', what: 'Superseded by 133 \u2014 do not apply' },
  { update: 131, on: '2026-09-29', what: 'Superseded by 132 \u2014 do not apply' },
  { update: 130, on: '2026-09-29', what: 'Superseded by 131 \u2014 do not apply' },
  { update: 129, on: '2026-09-29', what: 'Superseded by 130 \u2014 do not apply' },
  { update: 128, on: '2026-09-29', what: 'One sheet sets up assets, systems, subsystems, equipment types and tags' },
  { update: 127, on: '2026-09-28', what: 'Superseded by 128 \u2014 do not apply' },
  // 123 to 127 were all attempts at the same thing and none of them was
  // deployed: 123-126 built a separate "job sheet" screen with a Facility
  // column, and 127 fixed the shape but only carried three levels and put
  // a diagram and two paragraphs in front of the buttons. 128 replaces all
  // five. Their numbers stay listed because zips carrying them were sent,
  // and a gap in this list is a question somebody has to go and answer.
  { update: 126, on: '2026-09-28', what: 'Superseded by 127 \u2014 do not apply' },
  { update: 125, on: '2026-09-28', what: 'Superseded by 127 \u2014 do not apply' },
  { update: 124, on: '2026-09-28', what: 'No importer can read another project\u2019s subsystems' },
  { update: 123, on: '2026-09-28', what: 'Superseded by 127 \u2014 do not apply' },
  { update: 122, on: '2026-09-27', what: 'The Setup screen says which update is actually deployed' },
  { update: 121, on: '2026-09-27', what: 'Each readiness gate says whether it will make its planned date' },
  { update: 120, on: '2026-09-27', what: 'Project Plan forecasts each level from the rate checks are signed' },
  { update: 119, on: '2026-09-27', what: 'Cover band grows to fit a long title; font names in one place' },
  { update: 118, on: '2026-09-27', what: 'Green means passed only; every radio and tick box in the brand colour' },
  { update: 117, on: '2026-09-26', what: 'Every record action checks the record is on your project' },
  { update: 116, on: '2026-09-26', what: 'A gate on every page, every action and every route handler' },
  { update: 115, on: '2026-09-26', what: 'Graphite and cyan brand, the dial mark' },
  { update: 114, on: '2026-09-25', what: 'CxNivora; rebuilt defect report; several photographs on one defect' },
]

export const CURRENT: Release = RELEASES[0]

/** "Update 121 · 27 Sep 2026" */
export function releaseLabel(r: Release = CURRENT): string {
  const d = new Date(r.on + 'T00:00:00Z')
  const when = Number.isNaN(d.getTime())
    ? r.on
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return `Update ${r.update} · ${when}`
}

/**
 * How far behind the running code is, given the newest update somebody
 * knows was sent.
 *
 * Returns null when it is level or ahead — "up to date" and "I cannot
 * tell" must not look the same, which is the same rule the forecast
 * follows for a date it cannot work out.
 */
export function behindBy(latestSent: number): number | null {
  const gap = latestSent - CURRENT.update
  return gap > 0 ? gap : null
}
