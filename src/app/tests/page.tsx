import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import {
  CRITERIA_TYPES,
  TEST_RESULTS,
  resultBadgeClass,
  criteriaLabel,
  calibrationStatus,
  calibrationBadgeClass,
  calibrationLabel,
  testBlockedReason,
} from '@/lib/tests'
import { REVIEW_STATES, reviewBadgeClass, reviewLabel } from '@/lib/checklist'
import { createTest, recordResult, raiseIssueFromTest, approveTest, deleteTest } from './actions'

export const dynamic = 'force-dynamic'

export default async function TestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    equipment?: string
    result?: string
    failed?: string
    name?: string
    criteria?: string
    actual?: string
  }>
}) {
  const {
    equipment: equipmentFilter,
    result: resultFilter,
    failed,
    name: failedName,
    criteria: failedCriteria,
    actual: failedActual,
  } = await searchParams

  const project = await getCurrentProject()

  const { data: equipmentRows } = project
    ? await supabase.from('equipment').select('id, tag_id, description').eq('project_id', project.id).order('tag_id')
    : { data: [] }

  const equipment = equipmentRows ?? []
  const tagById = new Map(equipment.map((e) => [e.id, e.tag_id]))

  const { data: instrumentRows } = project
    ? await supabase
        .from('instruments')
        .select('id, instrument_id, name, calibration_expiry')
        .eq('project_id', project.id)
        .order('instrument_id')
    : { data: [] as { id: string; instrument_id: string; name: string | null; calibration_expiry: string | null }[] }

  const instruments = instrumentRows ?? []
  const instrumentById = new Map(instruments.map((i) => [i.id, i]))

  let query = supabase
    .from('test_records')
    .select(
      'id, test_ref, name, procedure_ref, preconditions, criteria_type, expected_min, expected_max, unit, criteria_text, actual_value, actual_text, result, instrument_id, tested_by, tested_at, witness, comments, approval_state, equipment_id'
    )
    .order('created_at', { ascending: true })

  if (project) query = query.eq('project_id', project.id)
  if (equipmentFilter) query = query.eq('equipment_id', equipmentFilter)
  if (resultFilter) query = query.eq('result', resultFilter)

  const { data: testsRaw } = project ? await query : { data: [] }
  const tests = testsRaw ?? []

  const { data: allRaw } =
    project
      ? await supabase.from('test_records').select('result, approval_state').eq('project_id', project.id)
      : { data: [] as { result: string; approval_state: string | null }[] }

  const all = allRaw ?? []
  const passed = all.filter((t) => t.result === 'pass').length
  const failedCount = all.filter((t) => t.result === 'fail').length
  const pending = all.filter((t) => t.result === 'pending').length
  const passRate = all.length > 0 ? Math.round((passed / all.length) * 100) : 0

  return (
    <>
      <h1 className="page-title">Tests</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — enter the measured value and CXA decides pass or fail
        against the acceptance criteria. You never type the verdict.
      </p>

      {failed && (
        <div className="alert alert-danger" style={{ display: 'grid', gap: 12 }}>
          <div>
            <strong>FAIL — {failedName}.</strong> Measured {failedActual || '—'} against acceptance criteria{' '}
            {failedCriteria}. What should happen next?
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <form action={raiseIssueFromTest}>
              <input type="hidden" name="test_id" value={failed} />
              <button type="submit" className="btn btn-primary btn-sm">
                Raise a Category A punch list item
              </button>
            </form>
            <a href="/tests" className="btn btn-secondary btn-sm">
              Leave it for now
            </a>
          </div>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-success-solid)' }}>
          <div className="stat-label">Pass rate</div>
          <div className="stat-value">{passRate}%</div>
          <div className="stat-note">
            {passed} of {all.length} tests
          </div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-danger-solid)' }}>
          <div className="stat-label">Failed</div>
          <div className="stat-value">{failedCount}</div>
          <div className="stat-note">{failedCount > 0 ? 'Awaiting corrective action' : 'Nothing failing'}</div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-warning-solid)' }}>
          <div className="stat-label">Not tested</div>
          <div className="stat-value">{pending}</div>
          <div className="stat-note">Still to run</div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-primary)' }}>
          <div className="stat-label">Instruments</div>
          <div className="stat-value">{instruments.length}</div>
          <div className="stat-note">
            <a href="/instruments" className="link">
              Calibration register
            </a>
          </div>
        </div>
      </div>

      <details className="card">
        <summary className="section-title" style={{ cursor: 'pointer', marginBottom: 0 }}>
          Add a test
        </summary>
        <form action={createTest} style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr 1fr', marginTop: 16 }}>
          <label className="field">
            Equipment *
            <select name="equipment_id" required className="input" defaultValue="">
              <option value="" disabled>
                — choose —
              </option>
              {equipment.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.tag_id}
                  {e.description ? ` — ${e.description}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Test name *
            <input name="name" required placeholder="e.g. Contact resistance" className="input" />
          </label>
          <label className="field">
            Test ID
            <input name="test_ref" placeholder="e.g. CB-01-CR" className="input" />
          </label>

          <label className="field">
            Acceptance criteria *
            <select name="criteria_type" className="input" defaultValue="max">
              {CRITERIA_TYPES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Minimum value
            <input name="expected_min" type="number" step="any" placeholder="for ≥ or Between" className="input" />
          </label>
          <label className="field">
            Maximum value
            <input name="expected_max" type="number" step="any" placeholder="for ≤ or Between" className="input" />
          </label>

          <label className="field">
            Unit
            <input name="unit" placeholder="e.g. µΩ, MΩ, s, V" className="input" />
          </label>
          <label className="field">
            Procedure reference
            <input name="procedure_ref" placeholder="e.g. CP-EL-014 rev B" className="input" />
          </label>
          <label className="field">
            Criteria in words
            <input name="criteria_text" placeholder="Used when judged by engineer" className="input" />
          </label>

          <label className="field" style={{ gridColumn: '1 / -1' }}>
            Preconditions
            <input name="preconditions" placeholder="e.g. Breaker isolated and earthed, CTs shorted" className="input" />
          </label>

          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="btn btn-primary" disabled={equipment.length === 0}>
              Add test
            </button>
          </div>
        </form>
        {equipment.length === 0 && (
          <p className="text-secondary" style={{ fontSize: 13, marginTop: 10 }}>
            Add equipment first — a test belongs to a tag.
          </p>
        )}
      </details>

      <div style={{ margin: '24px 0 16px' }}>
        <form style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select name="equipment" defaultValue={equipmentFilter ?? ''} className="input" style={{ maxWidth: 240 }}>
            <option value="">All equipment</option>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.tag_id}
              </option>
            ))}
          </select>
          <select name="result" defaultValue={resultFilter ?? ''} className="input" style={{ maxWidth: 200 }}>
            <option value="">All results</option>
            {TEST_RESULTS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary">
            Filter
          </button>
        </form>
      </div>

      {tests.length > 0 ? (
        <div style={{ display: 'grid', gap: 14 }}>
          {tests.map((t) => {
            const instrument = t.instrument_id ? instrumentById.get(t.instrument_id) : null
            const calState = calibrationStatus(instrument?.calibration_expiry ?? null)
            const blocked = testBlockedReason(t.result, calState, Boolean(instrument))
            const criteria = criteriaLabel(t.criteria_type, t.expected_min, t.expected_max, t.unit, t.criteria_text)
            const isText = t.criteria_type === 'text'

            return (
              <div key={t.id} className="card">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 14,
                    flexWrap: 'wrap',
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <div className="text-secondary mono" style={{ fontSize: 11.5, marginBottom: 3 }}>
                      {tagById.get(t.equipment_id) ?? '—'}
                      {t.test_ref ? ` · ${t.test_ref}` : ''}
                      {t.procedure_ref ? ` · ${t.procedure_ref}` : ''}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 15.5 }}>{t.name}</div>
                    {t.preconditions && (
                      <div className="text-secondary" style={{ fontSize: 12.5, marginTop: 4 }}>
                        Preconditions: {t.preconditions}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={reviewBadgeClass(t.approval_state)}>{reviewLabel(t.approval_state)}</span>
                    <span className={resultBadgeClass(t.result)}>
                      {TEST_RESULTS.find((r) => r.value === t.result)?.label ?? t.result}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 26,
                    flexWrap: 'wrap',
                    padding: '12px 14px',
                    background: 'var(--color-neutral-bg)',
                    borderRadius: 9,
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <div className="stat-label">Acceptance criteria</div>
                    <div className="mono" style={{ fontSize: 16, fontWeight: 600 }}>
                      {criteria}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Measured</div>
                    <div className="mono" style={{ fontSize: 16, fontWeight: 600 }}>
                      {t.actual_value !== null && t.actual_value !== undefined
                        ? `${t.actual_value}${t.unit ? ` ${t.unit}` : ''}`
                        : t.actual_text || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Verdict</div>
                    <div style={{ marginTop: 3 }}>
                      <span className={resultBadgeClass(t.result)}>
                        {TEST_RESULTS.find((r) => r.value === t.result)?.label ?? t.result}
                      </span>
                    </div>
                  </div>
                  {instrument && (
                    <div>
                      <div className="stat-label">Instrument</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
                        <span className="mono" style={{ fontSize: 13 }}>
                          {instrument.instrument_id}
                        </span>
                        <span className={calibrationBadgeClass(calState)}>{calibrationLabel(calState)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {blocked && (
                  <p className="alert alert-danger" style={{ fontSize: 13 }}>
                    <strong>Not acceptable:</strong> {blocked}
                  </p>
                )}

                <form action={recordResult} style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(4, 1fr)' }}>
                  <input type="hidden" name="id" value={t.id} />

                  {isText ? (
                    <label className="field">
                      Result
                      <select name="manual_result" defaultValue={t.result} className="input">
                        {TEST_RESULTS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="field">
                      Measured value{t.unit ? ` (${t.unit})` : ''}
                      <input
                        key={`v-${t.id}-${t.actual_value ?? ''}`}
                        name="actual_value"
                        type="number"
                        step="any"
                        defaultValue={t.actual_value ?? ''}
                        placeholder="Enter reading"
                        className="input"
                      />
                    </label>
                  )}

                  <label className="field">
                    Instrument used
                    <select
                      key={`i-${t.id}-${t.instrument_id ?? ''}`}
                      name="instrument_id"
                      defaultValue={t.instrument_id ?? ''}
                      className="input"
                    >
                      <option value="">— none —</option>
                      {instruments.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.instrument_id}
                          {i.name ? ` — ${i.name}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    Tested by
                    <input
                      key={`tb-${t.id}-${t.tested_by ?? ''}`}
                      name="tested_by"
                      defaultValue={t.tested_by ?? ''}
                      className="input"
                    />
                  </label>

                  <label className="field">
                    Date
                    <input
                      key={`td-${t.id}-${t.tested_at ?? ''}`}
                      type="date"
                      name="tested_at"
                      defaultValue={t.tested_at ?? ''}
                      className="input"
                    />
                  </label>

                  <label className="field" style={{ gridColumn: 'span 2' }}>
                    Witness
                    <input
                      key={`w-${t.id}-${t.witness ?? ''}`}
                      name="witness"
                      defaultValue={t.witness ?? ''}
                      placeholder="Who witnessed the test"
                      className="input"
                    />
                  </label>

                  <label className="field" style={{ gridColumn: 'span 2' }}>
                    Comments
                    <input
                      key={`c-${t.id}-${t.comments ?? ''}`}
                      name="comments"
                      defaultValue={t.comments ?? ''}
                      className="input"
                    />
                  </label>

                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="submit" className="btn btn-primary btn-sm">
                      Record result
                    </button>
                  </div>
                </form>

                <div
                  style={{
                    marginTop: 14,
                    paddingTop: 12,
                    borderTop: '1px solid var(--color-border-soft)',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'end',
                    flexWrap: 'wrap',
                  }}
                >
                  <form action={approveTest} style={{ display: 'flex', gap: 10, alignItems: 'end' }}>
                    <input type="hidden" name="id" value={t.id} />
                    <label className="field" style={{ minWidth: 180 }}>
                      Approval
                      <select
                        key={`a-${t.id}-${t.approval_state ?? ''}`}
                        name="approval_state"
                        defaultValue={t.approval_state ?? 'draft'}
                        className="input"
                        disabled={Boolean(blocked)}
                      >
                        {REVIEW_STATES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" className="btn btn-secondary btn-sm" disabled={Boolean(blocked)}>
                      Set
                    </button>
                  </form>

                  {t.result === 'fail' && (
                    <form action={raiseIssueFromTest}>
                      <input type="hidden" name="test_id" value={t.id} />
                      <button type="submit" className="btn btn-secondary btn-sm">
                        Raise punch list item
                      </button>
                    </form>
                  )}

                  <form action={deleteTest} style={{ marginLeft: 'auto' }}>
                    <input type="hidden" name="id" value={t.id} />
                    <button type="submit" className="btn-link">
                      Delete test
                    </button>
                  </form>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card">
          <p className="text-secondary" style={{ fontSize: 14, marginBottom: 0 }}>
            No tests yet. Add one above — set the acceptance criteria, and when you enter a reading the verdict is
            worked out for you.
          </p>
        </div>
      )}
    </>
  )
}
