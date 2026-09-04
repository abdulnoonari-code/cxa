import { importTestScript } from '@/app/checklists/script-actions'
import { LEVELS } from '@/lib/checklist'

/**
 * Uploading a test script.
 *
 * Its own card rather than a second mode on the checklist importer, because
 * the two files are not alike. A checklist is a register — one row, one check.
 * A test script is a document somebody works through in order: numbered,
 * sectioned, with an answer, the evidence, a remark and what each step is
 * connected to. Those last four are the columns people write in the margin of
 * every printed test sheet, and the reason this format exists at all.
 */
export default function ScriptImport({ params }: { params: Record<string, string | string[] | undefined> }) {
  const one = (k: string) => {
    const v = params[k]
    return Array.isArray(v) ? v[0] : v
  }
  const state = one('script')

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2 className="section-title">Upload a test script</h2>
      <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12 }}>
        A numbered procedure rather than a flat list: the equipment and level named once at the top, then the
        checks in the order they are carried out, each with what proves it, what happened, and what it is
        connected to.
      </p>

      {state === 'ok' && (
        <div className="alert" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
          <strong>
            {one('added')} added
            {Number(one('updated') ?? 0) > 0 ? `, ${one('updated')} updated` : ''}
            {Number(one('removed') ?? 0) > 0 ? `, ${one('removed')} removed` : ''}.
          </strong>{' '}
          Read from {one('sheets')} sheet{one('sheets') === '1' ? '' : 's'}.
          {Number(one('warnings') ?? 0) > 0 &&
            ` ${one('warnings')} things were kept as written rather than matched to anything — they are listed in the audit entry.`}
        </div>
      )}
      {state === 'rejected' && (
        <div className="alert alert-danger">
          <strong>Nothing was imported.</strong> {one('detail')}
        </div>
      )}
      {state === 'noproject' && <div className="alert alert-danger">No project is open.</div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/checklists/script-template" className="btn btn-secondary btn-sm">
          Download blank script
        </a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/checklists/script-export" className="btn btn-secondary btn-sm">
          Export whole project as a script
        </a>
      </div>

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
        <div style={{ fontWeight: 600, marginBottom: 6 }}>The columns</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ fontSize: 12.5, marginBottom: 8 }}>
            <tbody>
              <tr>
                <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>No.</td>
                <td>The serial number. Unique on the sheet — it is what somebody says out loud on site, and what one line uses to point at another.</td>
              </tr>
              <tr>
                <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>Section</td>
                <td>The heading a run of checks sits under. Optional.</td>
              </tr>
              <tr>
                <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>Content</td>
                <td>The check itself. The only column that has to be filled in.</td>
              </tr>
              <tr>
                <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>Answer</td>
                <td>
                  Yes, No or N/A — Pass and Fail are accepted too. <strong>Leave it empty</strong> for a check
                  nobody has done. Empty and N/A are different facts and are never merged.
                </td>
              </tr>
              <tr>
                <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>Attachment</td>
                <td>What proves it — a file name, a photo, a drawing number. A spreadsheet cannot carry a file, so this records what the evidence is; the file is uploaded against the check.</td>
              </tr>
              <tr>
                <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>Remark</td>
                <td>What actually happened.</td>
              </tr>
              <tr>
                <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>Links to</td>
                <td>
                  What this check is connected to; several allowed, separated by a semicolon. Four kinds are
                  understood — a line on the same sheet (<span className="mono">2</span>), a tag or system (
                  <span className="mono">GIS-115-CB-02</span>), a requirement or obligation (
                  <span className="mono">REQ-014</span>), or anything else — a drawing, a submittal, a standard
                  clause — which is kept exactly as typed.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-secondary" style={{ margin: 0 }}>
          A link that <em>can</em> be checked and is wrong stops the file: a line pointing at a number that is
          not on the sheet, or a requirement nobody can look up. A link that cannot be checked — a drawing
          number — is kept as written and reported, never guessed at.
        </p>
      </div>

      <form action={importTestScript} style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1.4fr 1fr' }}>
          <label className="field">
            Script file (.xlsx or .csv) *
            <input type="file" name="file" accept=".xlsx,.csv" required className="input" />
          </label>
          <label className="field">
            Level, if the sheet does not say
            <select name="level" className="input" defaultValue="">
              <option value="">— take it from the sheet —</option>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <button type="submit" className="btn btn-primary">
            Import test script
          </button>
        </div>
      </form>

      <p className="text-secondary" style={{ margin: '12px 0 0', fontSize: 11.5, fontStyle: 'italic' }}>
        The equipment has to already be on this project — a test script cannot create the thing it tests. If any
        row cannot be read, nothing at all is imported and every bad row is reported by its number. Export the
        project, mark it up on site, upload it back: nothing duplicates, because the CXA ID column says which
        check each row already is.
      </p>
    </div>
  )
}
