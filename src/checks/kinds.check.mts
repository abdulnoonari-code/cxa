// Applying one check to an EQUIPMENT KIND.
//
// "we can 100 MVSG, so hundred checklist" — a hundred MV panels are a
// hundred tags of one kind. Ticking a hundred boxes to apply one check is
// the same work as typing it a hundred times, only faster to get wrong:
// miss three and nobody finds out until handover.
//
// A kind is one tick, and it means every tag of that kind. The expansion
// happens BEFORE planApply, so the scope rules and the already-have check
// downstream still see nothing but ordinary tag targets — which is what
// makes "run it again next month and the new panels get it" free rather
// than a second mechanism.
import { expandKinds, expansionLine, planApply, type Target, type Template, type AppliedRecord, type EquipmentKind } from '@/lib/templates'

let pass = 0, fail = 0
function ok(n: string, c: boolean, extra = '') { if (c) pass++; else { fail++; console.log('FAIL: ' + n + (extra ? ' — ' + extra : '')) } }
function eq(n: string, a: unknown, b: unknown) { ok(n, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`) }

const tag = (n: number, prefix = 'MV-SWGR'): Target =>
  ({ id: `t${prefix}${n}`, type: 'equipment', code: `${prefix}-${String(n).padStart(3, '0')}` })

const panels = Array.from({ length: 100 }, (_, i) => tag(i + 1))
const transformers = [tag(1, 'TX'), tag(2, 'TX')]

const KINDS: EquipmentKind[] = [
  { id: 'k-panel', code: 'MV Panel', tags: panels },
  { id: 'k-tx', code: 'Dry Transformer', tags: transformers },
  { id: 'k-empty', code: 'Busway', tags: [] },
]

const TEMPLATE: Template = {
  id: 'tpl-1', code: 'IV-01', title: 'Busbar bolt torque to 70 Nm, marks applied',
  level: 'L2_iv', section: null, answerType: null, guidance: null,
}

// ════════ ONE TICK, A HUNDRED TAGS ════════
{
  const e = expandKinds(['k-panel'], KINDS, [])
  eq('a hundred tags from one tick', e.targets.length, 100)
  eq('  …all of them panels', new Set(e.targets.map((t) => t.code.slice(0, 7))).size, 1)
  eq('  …and the sentence says so before you press it', expansionLine(e), 'MV Panel (100 tags)')

  const plan = planApply(TEMPLATE, e.targets, [])
  eq('a hundred records planned', plan.create.length, 100)
  eq('  …none already had it', plan.alreadyHave.length, 0)
  eq('  …and none is out of scope', plan.wrongScope.length, 0)
}

// ════════ RUN IT AGAIN NEXT MONTH ════════
//
// Twenty more panels arrive and are imported. Applying the same check to
// the same kind must create twenty records and leave the hundred alone.
{
  const applied: AppliedRecord[] = panels.map((t) => ({
    id: `rec-${t.id}`, templateId: 'tpl-1', subjectId: t.id,
    subjectType: 'equipment', level: 'L2_iv', item: TEMPLATE.title, status: 'pending',
  }))

  const twentyMore = Array.from({ length: 20 }, (_, i) => tag(101 + i))
  const grown: EquipmentKind[] = [{ id: 'k-panel', code: 'MV Panel', tags: [...panels, ...twentyMore] }]

  const e = expandKinds(['k-panel'], grown, [])
  eq('the kind now holds a hundred and twenty', e.targets.length, 120)

  const plan = planApply(TEMPLATE, e.targets, applied)
  eq('only the twenty new ones are created', plan.create.length, 20)
  eq('  …the hundred already have it', plan.alreadyHave.length, 100)
  ok('  …and the new ones are the right twenty',
     plan.create.every((t) => Number(t.code.split('-')[2]) > 100),
     JSON.stringify(plan.create.slice(0, 3)))
}

// ════════ APPLYING IT TWICE OVER DOES NOTHING THE SECOND TIME ════════
{
  const e = expandKinds(['k-panel'], KINDS, [])
  const first = planApply(TEMPLATE, e.targets, [])
  const applied: AppliedRecord[] = first.create.map((t) => ({
    id: `rec-${t.id}`, templateId: 'tpl-1', subjectId: t.id,
    subjectType: 'equipment', level: 'L2_iv', item: TEMPLATE.title, status: 'pending',
  }))
  const second = planApply(TEMPLATE, e.targets, applied)
  eq('nothing to create the second time', second.create.length, 0)
  eq('  …all hundred reported as already having it', second.alreadyHave.length, 100)
}

// ════════ A TAG REACHED TWO WAYS IS PLANNED ONCE ════════
//
// Ticking the kind AND one of its tags must not plan the same record
// twice — the unique index would drop the second and the count would
// report a record that was never written.
{
  const e = expandKinds(['k-panel', panels[0].id], KINDS, panels)
  eq('still a hundred, not a hundred and one', e.targets.length, 100)
  eq('  …with no repeats', new Set(e.targets.map((t) => t.id)).size, 100)
}

// ════════ ONE TAG IN TWO KINDS ════════
//
// A tag has one type_id, so this should be impossible — but "should be
// impossible" is how the same record gets planned twice, dropped by the
// unique index, and reported as created. The dedupe inside the kind walk
// exists for this, and without this fixture nothing exercised it.
{
  const shared = tag(1)
  const overlapping: EquipmentKind[] = [
    { id: 'k-a', code: 'Kind A', tags: [shared, tag(2)] },
    { id: 'k-b', code: 'Kind B', tags: [shared, tag(3)] },
  ]
  const e = expandKinds(['k-a', 'k-b'], overlapping, [])
  eq('the shared tag is planned once', e.targets.length, 3)
  eq('  …with no repeats', new Set(e.targets.map((t) => t.id)).size, 3)
  eq('  …and the second kind reports only what it actually added',
     e.from, [{ code: 'Kind A', tags: 2 }, { code: 'Kind B', tags: 1 }])
}

// ════════ KINDS AND LOOSE TAGS TOGETHER ════════
{
  const loose = [tag(9, 'GEN')]
  const e = expandKinds(['k-tx', loose[0].id], KINDS, [...transformers, ...loose])
  eq('two transformers and one loose tag', e.targets.length, 3)
  eq('  …the kind is named, the loose tag is not', expansionLine(e), 'Dry Transformer (2 tags)')

  const both = expandKinds(['k-panel', 'k-tx'], KINDS, [])
  eq('two kinds add up', both.targets.length, 102)
  eq('  …and both are named', expansionLine(both), 'MV Panel (100 tags), Dry Transformer (2 tags)')
}

// ════════ THE ORDINARY AND AWKWARD CASES ════════
{
  eq('nothing ticked, nothing planned', expandKinds([], KINDS, panels).targets, [])
  eq('  …and no sentence', expansionLine(expandKinds([], KINDS, panels)), '')

  const empty = expandKinds(['k-empty'], KINDS, [])
  eq('a kind with no tags yet expands to nothing', empty.targets.length, 0)
  ok('  …but is still reported, so the zero is visible rather than silent',
     expansionLine(empty) === 'Busway (0 tags)')

  const unknown = expandKinds(['not-a-kind'], KINDS, [])
  eq('an id that is neither a kind nor a target is ignored', unknown.targets, [])

  // Order matters for the preview: kinds in the order given, then loose
  // tags, so the sentence and the list agree.
  const ordered = expandKinds(['k-tx', 'k-panel'], KINDS, [])
  eq('the first ticked kind comes first', ordered.targets[0].code, 'TX-001')
  eq('  …and the sentence matches', expansionLine(ordered), 'Dry Transformer (2 tags), MV Panel (100 tags)')
}

// ════════ SCOPE IS STILL ENFORCED AFTER EXPANSION ════════
//
// An L4 functional test belongs to a system, not to a hundred individual
// breakers. Expanding a kind must not smuggle tag targets past the rule
// that was written to catch exactly that.
{
  const l4: Template = { ...TEMPLATE, id: 'tpl-l4', level: 'L4_fpt', title: 'Load transfer under full load' }
  const e = expandKinds(['k-panel'], KINDS, [])
  const plan = planApply(l4, e.targets, [])
  eq('nothing is created', plan.create.length, 0)
  eq('  …all hundred are reported as the wrong scope', plan.wrongScope.length, 100)
}

console.log(`${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
