// Every free rule, in one place, for every screen that wants them.
//
// This composition used to live inside the Rule Checks page. It could not stay
// there: the Dashboard needs the same answer, and the second copy of a list of
// twelve rule families is the copy that quietly loses one. A rule that exists
// but is not in the list is worse than a rule that does not exist — it passes
// its own tests forever and never reaches a screen.
//
// One list. Both screens read it. Adding a rule means adding it here, once.

import type { Project } from '@/lib/project'
import { loadRuleInputs } from '@/data/site-rules'
import { loadCheckLinkInputs } from '@/data/check-links'
import { checkLinkFindings } from '@/lib/check-links'
import { loadFailedChecks } from '@/data/failed-checks'
import { failedCheckFindings } from '@/lib/failed-checks'
import { loadScopedChecks } from '@/data/scope'
import { scopeFindings, duplicateFindings } from '@/lib/scope'
import { loadLibrary } from '@/data/templates'
import { driftFindings } from '@/lib/templates'
import { loadCoverage } from '@/data/coverage'
import { leftOutFindings, untestedSystemFindings, partialApplicationFindings } from '@/lib/coverage'
import { punchFindings, scheduleFindings, type SiteFinding } from '@/lib/site-rules'

export type AllFindings = {
  findings: SiteFinding[]
  /** What the rules were run over, so a page can say "nothing found, over nothing". */
  counts: { punch: number; checks: number; dated: number }
  /** False when the photographs table is not installed — its rules could not run at all. */
  photosReady: boolean
}

export async function loadAllFindings(project: Project | null, today = new Date()): Promise<AllFindings> {
  const id = project?.id ?? null
  const [inputs, checkInputs, failed, scoped, lib, cov] = await Promise.all([
    loadRuleInputs(id, project ?? null),
    loadCheckLinkInputs(id),
    loadFailedChecks(id),
    loadScopedChecks(id),
    loadLibrary(id),
    loadCoverage(id),
  ])

  const widen = (href: string) => (f: {
    level: SiteFinding['level']
    rule: string
    title: string
    detail: string
    count: number
    examples: string[]
  }): SiteFinding => ({ area: 'checks', level: f.level, rule: f.rule, title: f.title, detail: f.detail, count: f.count, examples: f.examples, href })

  const findings: SiteFinding[] = [
    ...punchFindings(inputs.punch, inputs.checks, today),
    ...scheduleFindings(
      {
        project: inputs.project,
        milestones: inputs.milestones,
        tasks: inputs.tasks,
        obligations: inputs.obligations,
        checks: inputs.checks,
        openPunch: inputs.punch.filter((p) => p.status !== 'closed' && p.status !== 'verified').length,
      },
      today
    ),
    // These come from a different shape — they are about pairs of checks
    // rather than about one register — so they are widened here rather than
    // bending either model to fit the other.
    ...[
      ...scopeFindings(scoped.checks, scoped.codeOf),
      ...duplicateFindings(scoped.checks, scoped.codeOf),
      ...driftFindings(lib.templates, lib.records, lib.codeOf),
      ...leftOutFindings(cov.subjects, cov.checks),
      ...untestedSystemFindings(cov.subjects, cov.checks),
      ...partialApplicationFindings(cov.subjects, cov.checks, cov.titleOf),
    ].map(widen('/checklists')),
    ...failedCheckFindings(failed.checks, failed.raisedFor).map(widen('/issues')),
    ...checkLinkFindings(checkInputs).map(widen('/checklists')),
  ]

  return {
    findings,
    counts: {
      punch: inputs.punch.length,
      checks: inputs.checks.length,
      dated: inputs.milestones.length + inputs.tasks.length + inputs.obligations.length,
    },
    photosReady: inputs.photosReady,
  }
}
