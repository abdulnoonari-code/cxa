// Loading the Inspection and Test Plan for a subject and everything beneath it.
//
// The plan is derived. Every row of it already exists as a checklist item or a
// test record; this file adds the two things the roll-up does not carry — the
// party that holds each point, and the acceptance criterion the test is judged
// against — and joins the signatures that released them.
//
// One deliberate piece of defensiveness. `point_party` and `itp_conventions`
// arrive with SQL part 20, and this page is reachable the moment the code
// deploys. If the columns are not there yet, the queries fail on their own and
// the page renders with nobody holding anything and a banner saying which
// script to run. It does not take the rest of the app down with it, and it does
// not pretend the points are unowned when the truth is that it could not look.

import { supabase } from '@/lib/supabase'
import { subtreeKeys, refKey, subjectTitle, type SubjectIndex, type SubjectRef } from '@/lib/subjects'
import { loadProjectRollup, rollupFor, type ProjectRollup } from '@/data/rollup'
import { latestSignature, type SignatureLike } from '@/lib/inspection'
import { criteriaLabel } from '@/lib/tests'
import { buildConventions, resolveParty, sortActivities, type Convention, type ItpActivity, type PartyValue } from '@/lib/itp'

export type ItpPlan = {
  title: string
  activities: ItpActivity[]
  conventions: { level: string; inspection_type: string; party: PartyValue; note: string | null }[]
  /** False when SQL part 20 has not been run yet. */
  schemaReady: boolean
  projectRollup: ProjectRollup
}

type Signature = SignatureLike & {
  signer_name: string | null
  signer_company: string | null
}

export async function loadItp(
  projectId: string | null,
  index: SubjectIndex,
  ref: SubjectRef | null
): Promise<ItpPlan | null> {
  if (!projectId) return null

  const projectRollup = await loadProjectRollup(projectId, index)
  const scope = ref ?? index.root
  const subject = scope ? index.byKey.get(refKey(scope)) : null
  const keys = scope ? subtreeKeys(index, scope) : new Set<string>()
  const rollup = scope ? rollupFor(projectRollup, scope) : { checks: [], tests: [], issues: [], requirements: [] }

  // The three queries that need part 20, kept apart from everything else so a
  // missing column cannot take the page down.
  const [partyChecks, partyTests, conventionRes, signatureRes, testDetailRes] = await Promise.all([
    supabase.from('checklist_items').select('id, point_party').eq('project_id', projectId),
    supabase.from('test_records').select('id, point_party').eq('project_id', projectId),
    supabase
      .from('itp_conventions')
      .select('level, inspection_type, party, note')
      .eq('project_id', projectId),
    supabase
      .from('signatures')
      .select('entity, entity_id, decision, signer_name, signer_company, created_at')
      .eq('project_id', projectId),
    supabase
      .from('test_records')
      .select('id, procedure_ref, criteria_type, expected_min, expected_max, unit, criteria_text')
      .eq('project_id', projectId),
  ])

  const schemaReady = !partyChecks.error && !partyTests.error && !conventionRes.error

  const partyById = new Map<string, string | null>()
  for (const row of [...(partyChecks.data ?? []), ...(partyTests.data ?? [])] as {
    id: string
    point_party: string | null
  }[]) {
    partyById.set(row.id, row.point_party)
  }

  const conventionRows = (conventionRes.data ?? []) as Convention[] & { note: string | null }[]
  const conventions = buildConventions(conventionRows)

  const signatures = (signatureRes.data ?? []) as Signature[]

  const testDetail = new Map(
    ((testDetailRes.data ?? []) as {
      id: string
      procedure_ref: string | null
      criteria_type: string | null
      expected_min: number | null
      expected_max: number | null
      unit: string | null
      criteria_text: string | null
    }[]).map((t) => [t.id, t])
  )

  const signatureFor = (entity: string, id: string) => latestSignature(signatures, entity, id)

  const fromChecks: ItpActivity[] = rollup.checks
    .filter((c) => keys.size === 0 || keys.has(c.subjectKey))
    .map((c) => {
      const sig = signatureFor('checklist_item', c.id)
      return {
        entity: 'checklist_item',
        id: c.id,
        ref: null,
        tag: c.tag,
        activity: c.item,
        level: c.level,
        inspectionType: c.inspection_type ?? 'surveillance',
        // A checklist item carries no acceptance criterion of its own. That is
        // not a defect in this file — it is what the register holds, and the
        // plan says so rather than inventing one.
        criteria: null,
        reference: null,
        holder: resolveParty(partyById.get(c.id), c.level, c.inspection_type, conventions),
        workComplete: c.status === 'pass' || c.status === 'fail' || c.status === 'na',
        failed: c.status === 'fail',
        release: c.release,
        notifiedAt: c.notified_at,
        signedBy: sig?.signer_name ?? null,
        signedCompany: sig?.signer_company ?? null,
        signedAt: sig?.created_at ?? null,
      }
    })

  const fromTests: ItpActivity[] = rollup.tests
    .filter((t) => keys.size === 0 || keys.has(t.subjectKey))
    .map((t) => {
      const sig = signatureFor('test_record', t.id)
      const detail = testDetail.get(t.id)
      return {
        entity: 'test_record',
        id: t.id,
        ref: t.test_ref,
        tag: t.tag,
        activity: t.name,
        level: 'L4_fpt',
        inspectionType: t.inspection_type ?? 'surveillance',
        criteria: detail
          ? criteriaLabel(
              detail.criteria_type,
              detail.expected_min,
              detail.expected_max,
              detail.unit,
              detail.criteria_text
            )
          : null,
        reference: detail?.procedure_ref ?? null,
        holder: resolveParty(partyById.get(t.id), 'L4_fpt', t.inspection_type, conventions),
        workComplete: t.result === 'pass' || t.result === 'fail',
        failed: t.result === 'fail',
        release: t.release,
        notifiedAt: t.notified_at,
        signedBy: sig?.signer_name ?? null,
        signedCompany: sig?.signer_company ?? null,
        signedAt: sig?.created_at ?? null,
      }
    })

  return {
    title: subject ? subjectTitle(subject) : 'Whole project',
    activities: sortActivities([...fromChecks, ...fromTests]),
    conventions: conventionRows
      .filter((c): c is Convention & { note: string | null; party: PartyValue } =>
        conventions.has(`${c.level}::${c.inspection_type}`)
      )
      .map((c) => ({ level: c.level, inspection_type: c.inspection_type, party: c.party, note: c.note ?? null })),
    schemaReady,
    projectRollup,
  }
}
