'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentProject } from '@/lib/project'
import { actorCan, recordAudit } from '@/lib/audit'
import { parseGroupKey, groupLabel } from '@/lib/check-groups'
import { registerImpact, deleteFromRegister, type RegisterScope } from '@/data/register-groups'
import { REGISTER_PATH, REGISTER_LABEL, isRegisterKind, type RegisterKind } from '@/lib/registers'

/**
 * Deleting an import from one of the three registers.
 *
 * ── Why one file for all three ──────────────────────────────────────────
 *
 * Tags, systems and equipment types are three screens with one rule
 * between them: a row remembers which file it arrived in, and a file can
 * be taken back out. Writing that three times would be three places for
 * the safety check to drift out of step, and the safety check is the whole
 * thing — a tag delete cascades to its checklist, its test records and its
 * punch items, and a person is entitled to the numbers before they press
 * the button rather than after.
 *
 * ── What is never deleted ───────────────────────────────────────────────
 *
 * A row with no source_ref. That covers everything typed in by hand and
 * everything imported before SQL part 41 existed. It belongs to no group,
 * so no group button can reach it, ever.
 */

const PATHS = REGISTER_PATH

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

function refresh(kind: RegisterKind) {
  for (const p of [PATHS[kind], '/assets', '/dashboard', '/checklists', '/plan', '/readiness', '/audit']) {
    revalidatePath(p)
  }
}

async function run(formData: FormData, scopeOf: (f: FormData) => RegisterScope | null, what: string) {
  const register = str(formData, 'register')
  if (!isRegisterKind(register)) redirect('/equipment?purge=notarget')
  const back = PATHS[register]

  const project = await getCurrentProject()
  if (!project) redirect(`${back}?purge=noproject`)

  // The same capability the importer asks for. Somebody who may not change
  // the register must not be able to empty it by posting a form.
  if (!(await actorCan('manage', project.id))) redirect(`${back}?purge=notallowed`)

  const scope = scopeOf(formData)
  if (!scope) redirect(`${back}?purge=notarget`)

  // Counted BEFORE, because afterwards there is nothing left to count and
  // the audit entry would have to guess at what it destroyed.
  const impact = await registerImpact(register, project.id, scope)
  const result = await deleteFromRegister(register, project.id, scope)

  const label = REGISTER_LABEL[register]
  await recordAudit({
    projectId: project.id,
    action: result.ok ? `${label.many} deleted` : `${label.many} delete failed`,
    entity: register === 'equipment_types' ? 'equipment_type' : register.replace(/s$/, ''),
    entityLabel: what,
    oldValue: `${impact.total} ${impact.total === 1 ? label.one : label.many}`,
    comment: result.ok
      ? `Deleted ${result.deleted}. ${impact.breaks.map((b) => `${b.count} ${b.label}`).join('; ') || 'Nothing else referred to them.'}`
      : result.reason,
  })

  refresh(register)

  if (!result.ok) redirect(`${back}?purge=failed&reason=${encodeURIComponent(result.reason.slice(0, 200))}`)
  redirect(`${back}?purge=ok&n=${result.deleted}&what=${encodeURIComponent(what)}`)
}

/** Everything that arrived in one file. */
export async function deleteRegisterGroupAction(formData: FormData) {
  const key = str(formData, 'group')
  const parsed = key ? parseGroupKey(key) : null
  await run(formData, () => (key && parsed ? { kind: 'group', groupKey: key } : null), parsed ? groupLabel(parsed) : 'an import')
}

/** Exactly the rows somebody ticked. */
export async function deletePickedRegisterAction(formData: FormData) {
  const ids = formData.getAll('row_ids').filter((v): v is string => typeof v === 'string')
  await run(formData, () => (ids.length > 0 ? { kind: 'picked', ids } : null), `${ids.length} selected`)
}
