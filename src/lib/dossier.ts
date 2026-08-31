// The handover dossier.
//
// Everything else in CxSentinel records something. This is the thing all of it
// was recorded *for*: the pack you hand over when a system is finished, that
// proves it was commissioned rather than merely built.
//
// Two positions govern the whole file, and they are the same two that govern
// every verdict in the app:
//
//   1. **The certificate does not certify.** It states what the record shows
//      and it provides the blocks for the people who are entitled to decide.
//      It never says the system is complete, because a document cannot decide
//      that — named people can, and the signature blocks are where they do it.
//
//   2. **A missing section is named, never omitted.** A pack that quietly
//      leaves out the test register because there are no tests is a pack that
//      lies by omission — and it is exactly the pack that gets found out at
//      handover. Every section appears; an empty one says it is empty and
//      says what that means.

import { LEVELS } from '@/lib/checklist'

export type SectionKey =
  | 'requirements'
  | 'checks'
  | 'tests'
  | 'holdpoints'
  | 'punch'
  | 'obligations'
  | 'gates'
  | 'documents'

export const SECTIONS: { key: SectionKey; title: string; whatItProves: string; emptyMeans: string }[] = [
  {
    key: 'requirements',
    title: 'Requirements',
    whatItProves: 'What this system was required to do, where each requirement came from, and what proves it was met.',
    emptyMeans:
      'No requirements are recorded against this system. That does not mean none apply — it means none have been read into CxSentinel from the specification.',
  },
  {
    key: 'checks',
    title: 'Commissioning checks',
    whatItProves: 'Every check carried out, at every level, with its result and its supporting note.',
    emptyMeans: 'No checklist items are recorded. A system with no checks has not been commissioned in here.',
  },
  {
    key: 'tests',
    title: 'Test records',
    whatItProves:
      'Every measurement taken, the criterion it was judged against, the instrument that took it and who witnessed it.',
    emptyMeans: 'No test records. Any acceptance criterion needing a measurement is therefore unproven.',
  },
  {
    key: 'holdpoints',
    title: 'Hold and witness points',
    whatItProves: 'Which activities required a release or a notice, and the signature or notice that answered it.',
    emptyMeans: 'No activity on this system was marked as a hold or witness point.',
  },
  {
    key: 'punch',
    title: 'Punch list',
    whatItProves: 'Every defect raised, what it blocks, and whether it was cleared and accepted.',
    emptyMeans: 'No punch items raised. That is either a clean system or an unwalked one.',
  },
  {
    key: 'obligations',
    title: 'Obligations',
    whatItProves: 'What each party owed under the contract and specification, and whether it was discharged.',
    emptyMeans: 'No obligations recorded against this system.',
  },
  {
    key: 'gates',
    title: 'Readiness gates',
    whatItProves: 'The rules that had to be met before each stage, how they were assessed, and who signed.',
    emptyMeans: 'No readiness gate has been raised for this system.',
  },
  {
    key: 'documents',
    title: 'Documents cited',
    whatItProves: 'The controlled documents and revisions the records above refer to.',
    emptyMeans: 'No controlled document is cited by anything in this pack.',
  },
]

export function sectionTitle(key: SectionKey): string {
  return SECTIONS.find((s) => s.key === key)?.title ?? key
}

// ── What the pack contains ───────────────────────────────────────────────

export type SectionCount = { key: SectionKey; total: number; outstanding: number }

export type DossierInput = {
  requirements: { verified: number; total: number }
  checks: { done: number; failed: number; total: number }
  tests: { passed: number; failed: number; total: number }
  holdPoints: { released: number; unreleased: number; total: number }
  punch: { openA: number; openOther: number; closed: number; total: number }
  obligations: { outstanding: number; total: number }
  gates: { signed: number; unmet: number; total: number }
  documents: number
}

export type Gap = {
  severity: 'blocking' | 'gap' | 'note'
  title: string
  detail: string
}

/**
 * What is missing from the pack, in the words the person receiving it would
 * use. This is printed inside the dossier itself, on purpose: a pack that
 * hides its own gaps gets rejected, and a pack that names them gets
 * negotiated.
 */
export function gapsIn(input: DossierInput): Gap[] {
  const gaps: Gap[] = []

  if (input.punch.openA > 0) {
    gaps.push({
      severity: 'blocking',
      title: `${input.punch.openA} open Category A punch item${input.punch.openA === 1 ? '' : 's'}`,
      detail: 'A Category A item stops the system advancing. These have to be cleared and accepted before handover.',
    })
  }
  if (input.checks.failed > 0) {
    gaps.push({
      severity: 'blocking',
      title: `${input.checks.failed} failed check${input.checks.failed === 1 ? '' : 's'}`,
      detail: 'A check recorded as Fail has not been re-done. Either the defect stands or the record is out of date.',
    })
  }
  if (input.tests.failed > 0) {
    gaps.push({
      severity: 'blocking',
      title: `${input.tests.failed} failed test${input.tests.failed === 1 ? '' : 's'}`,
      detail: 'The measured value does not meet its acceptance criterion. The test has to be repeated and passed.',
    })
  }
  if (input.holdPoints.unreleased > 0) {
    gaps.push({
      severity: 'blocking',
      title: `${input.holdPoints.unreleased} hold point${input.holdPoints.unreleased === 1 ? '' : 's'} with no release signature`,
      detail:
        'A hold point stops the work until a named person signs it off. Nothing in this pack shows anybody did, so everything downstream of it is unsupported.',
    })
  }

  if (input.requirements.total > 0 && input.requirements.verified < input.requirements.total) {
    const short = input.requirements.total - input.requirements.verified
    gaps.push({
      severity: 'gap',
      title: `${short} requirement${short === 1 ? '' : 's'} not yet verified and approved`,
      detail: 'A requirement is only satisfied when its verifying activity has passed AND been approved.',
    })
  }
  if (input.requirements.total === 0) {
    gaps.push({
      severity: 'gap',
      title: 'No requirements recorded',
      detail:
        'Nothing in this pack states what the system was required to do, so nothing in it can show that it does.',
    })
  }
  if (input.tests.total === 0) {
    gaps.push({
      severity: 'gap',
      title: 'No test records',
      detail: 'Any acceptance criterion that needs a measurement is unproven in this pack.',
    })
  }
  if (input.gates.total === 0) {
    gaps.push({
      severity: 'gap',
      title: 'No readiness gate raised',
      detail:
        'A gate is where the rules for a stage are assessed and signed. Without one, nothing in this pack records a decision to proceed.',
    })
  } else if (input.gates.unmet > 0) {
    gaps.push({
      severity: 'gap',
      title: `${input.gates.unmet} gate rule${input.gates.unmet === 1 ? '' : 's'} not met`,
      detail: 'The gate was raised and its rules were assessed; some are not satisfied.',
    })
  }
  if (input.obligations.outstanding > 0) {
    gaps.push({
      severity: 'note',
      title: `${input.obligations.outstanding} obligation${input.obligations.outstanding === 1 ? '' : 's'} still owed`,
      detail: 'Contractual duties that have not been discharged and accepted. Not all of them block handover.',
    })
  }
  if (input.punch.openOther > 0) {
    gaps.push({
      severity: 'note',
      title: `${input.punch.openOther} open punch item${input.punch.openOther === 1 ? '' : 's'} below Category A`,
      detail: 'Category B items need the owner to accept them in writing; Category C items are carried forward.',
    })
  }

  return gaps
}

export type DossierVerdict = {
  label: string
  tone: 'blocking' | 'gap' | 'ready' | 'empty'
  detail: string
}

/**
 * The one line at the top of the pack.
 *
 * Note what the best case says. Not "complete", not "accepted", not "approved
 * for handover" — **the records in this pack support handover**. The pack
 * reports; the people signing it decide. Every verdict in CxSentinel refuses
 * to authorise, and the one on the front of the handover document is the one
 * where that matters most.
 */
export function verdict(input: DossierInput, gaps: Gap[]): DossierVerdict {
  const records =
    input.checks.total + input.tests.total + input.punch.total + input.requirements.total

  if (records === 0) {
    return {
      label: 'NOTHING TO HAND OVER',
      tone: 'empty',
      detail:
        'No checks, tests, punch items or requirements are recorded against this system. There is no pack here yet.',
    }
  }

  const blocking = gaps.filter((g) => g.severity === 'blocking')
  if (blocking.length > 0) {
    return {
      label: 'NOT READY',
      tone: 'blocking',
      detail: `${blocking.length} thing${blocking.length === 1 ? '' : 's'} in this pack stop${
        blocking.length === 1 ? 's' : ''
      } handover: ${blocking.map((g) => g.title.toLowerCase()).join('; ')}.`,
    }
  }

  const holes = gaps.filter((g) => g.severity === 'gap')
  if (holes.length > 0) {
    return {
      label: 'INCOMPLETE RECORD',
      tone: 'gap',
      detail: `Nothing in this pack has failed, but it does not yet show everything a handover pack should: ${holes
        .map((g) => g.title.toLowerCase())
        .join('; ')}.`,
    }
  }

  return {
    label: 'RECORDS SUPPORT HANDOVER',
    tone: 'ready',
    detail:
      'Nothing outstanding in the records assembled here. This is a statement about the pack, not a decision — handover is agreed by the people who sign below, not by this document.',
  }
}

// ── The certificate ──────────────────────────────────────────────────────

export type SignatureBlock = { role: string; statement: string }

/**
 * Who signs, and exactly what each of them is putting their name to.
 *
 * The statements are deliberately different from one another. A contractor
 * saying "the work is complete", a commissioning manager saying "it was
 * commissioned per the plan" and a client saying "we accept it" are three
 * different claims, and printing one statement over four boxes lets everybody
 * sign the strongest reading of it.
 */
export const SIGNATURE_BLOCKS: SignatureBlock[] = [
  {
    role: 'Contractor',
    statement:
      'The works described in this pack have been completed and the records within it were produced by or on behalf of the Contractor.',
  },
  {
    role: 'Commissioning Manager (CxM)',
    statement:
      'The commissioning activities recorded here were carried out in accordance with the approved commissioning plan and the levels stated.',
  },
  {
    role: 'Commissioning Authority (CxA)',
    statement:
      'The records in this pack have been reviewed and are consistent with the process the project committed to follow.',
  },
  {
    role: 'Client / Owner',
    statement:
      'The system described above is accepted for handover on the basis of this pack and any items listed as outstanding within it.',
  },
]

export function levelLabel(value: string | null): string {
  return LEVELS.find((l) => l.value === value)?.label ?? value ?? '—'
}

export function levelShort(value: string | null): string {
  return LEVELS.find((l) => l.value === value)?.label.split('—')[0].trim() ?? value ?? '—'
}
