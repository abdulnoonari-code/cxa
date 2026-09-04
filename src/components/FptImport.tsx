import { importFptScript } from '@/app/checklists/fpt-actions'
import { LEVELS } from '@/lib/checklist'

/**
 * Uploading a functional test script.
 *
 * Kept as its own card rather than a second mode on the checklist importer,
 * because the two files are nothing alike. A checklist is a register — one
 * row, one check. A test script is a document: a name, a type, headings,
 * instructions, set points, calibration lines and questions, in the order a
 * tester works through them. Reading it means deciding, line by line, which
 * of those is a check and which is not, and that decision is the feature.
 */
export default function FptImport({ params }: { params: Record<string, string | string[] | undefined> }) {
  const one = (k: string) => {
    const v = params[k]
    return Array.isArray(v) ? v[0] : v
  }
  const state = one('fpt')

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2 className="section-title">Upload a functional test script</h2>
      <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12 }}>
        The Facility Grid FPT import template, as your team writes it — one script per worksheet, with the FPT
        name and type above the table. Every question becomes a check, filed against the equipment the script
        names, at the level its type implies.
      </p>

      {state === 'ok' && (
        <div className="alert" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
          <strong>
            {one('added')} checks added{Number(one('updated') ?? 0) > 0 ? `, ${one('updated')} updated` : ''}.
          </strong>{' '}
          From {one('scripts')} script{one('scripts') === '1' ? '' : 's'}. {one('skipped')} lines were read and
          not imported — headings, instructions, set points and calibration lines. The audit trail lists them by
          kind.
          {Number(one('warnings') ?? 0) > 0 && ` ${one('warnings')} lines could not be read; they are in the audit entry.`}
        </div>
      )}
      {state === 'rejected' && (
        <div className="alert alert-danger">
          <strong>Nothing was imported.</strong> {one('detail')}
        </div>
      )}
      {state === 'noproject' && <div className="alert alert-danger">No project is open.</div>}

      <div
        style={{
          border: '1px solid var(--color-border)',
          borderLeft: '4px solid var(--color-neutral-solid, #b9c8e0)',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 14,
          fontSize: 12.5,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>What becomes a check, and what does not</div>
        <p className="text-secondary" style={{ margin: 0 }}>
          Only a <strong>question</strong> becomes a check — Yes/No/N&nbsp;A, Pass/Fail or a custom answer.
          Headings are kept as the context shown above each check, never as checks of their own: a heading can
          never be completed, so importing one would leave the register permanently short. Set points and
          calibration lines are <strong>not</strong> imported, because a number that has to be recorded and
          compared must not become a tick — those belong on Test Records. Anything this reader does not
          understand is reported by row rather than guessed at.
        </p>
      </div>

      <form action={importFptScript} style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1.4fr 1fr' }}>
          <label className="field">
            Test script (.xlsx) *
            <input type="file" name="file" accept=".xlsx" required className="input" />
          </label>
          <label className="field">
            Level, if the FPT type does not decide it
            <select name="level" className="input" defaultValue="">
              <option value="">— take it from the FPT type —</option>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-secondary" style={{ margin: 0, fontSize: 12 }}>
          Factory, functional and integrated test types set their own level. Types that different projects place
          differently — Room Readiness, Global Test, a NETA scope — are asked about rather than assumed, because
          the level is what a check counts towards in a readiness figure somebody signs.
        </p>
        <div>
          <button type="submit" className="btn btn-primary">
            Import test script
          </button>
        </div>
      </form>

      <p className="text-secondary" style={{ margin: '12px 0 0', fontSize: 11.5, fontStyle: 'italic' }}>
        The script has to name equipment that is already on this project. If the FPT name is not a tag, system or
        area here, nothing is imported and the file says so — a test script cannot bring into being the thing it
        tests. Re-importing a revised script updates the checks it already created rather than adding a second
        copy of every line.
      </p>
    </div>
  )
}
