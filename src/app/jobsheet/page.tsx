import { requirePage } from '@/data/require-page'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { getCurrentProject } from '@/lib/project'
import { importJobSheet } from './actions'
import { IMPORT_COOKIE, decodeOutcome, summaryLine, alertClass, detailLines } from '@/lib/import-result'

export const dynamic = 'force-dynamic'

/**
 * One sheet that builds the whole job.
 *
 * ── Why this screen exists ──────────────────────────────────────────────
 *
 * Because the old answer to "how do I get my job in" was: understand four
 * screens and four spreadsheets, and do them in the right order, which
 * nothing told you. A person holding a list of tags and the checks against
 * them had to take it apart into three files and reassemble it in sequence
 * before anything appeared anywhere.
 *
 * That is the application asking somebody to hold its database schema in
 * their head before they can use it. This screen is the whole of the
 * answer instead: one sheet, one button.
 */
export default async function JobSheetPage() {
  const refused = await requirePage()
  if (refused) return refused

  const project = await getCurrentProject()
  const jar = await cookies()
  const outcome = decodeOutcome(jar.get(IMPORT_COOKIE)?.value)

  const EXAMPLE = [
    ['SUDB-MV-SWGR', 'Incomer', 'SUDB-MV-SWGR-01', '22 kV incomer', 'L2', 'Busbar bolt torque', '55 Nm'],
    ['', '', '', '', 'L3', 'Insulation resistance', '>100 MΩ at 5 kV'],
    ['', 'Feeder 1', 'SUDB-MV-SWGR-02', 'Feeder to DCDB', 'L2', 'Busbar bolt torque', '55 Nm'],
    ['', '', '', '', 'L3', 'Phase rotation', 'R-Y-B'],
    ['DCDB-01', '', 'DCDB-01-MAIN', 'DC main board', 'L2', 'Earth continuity', '< 0.1 Ω'],
  ]

  return (
    <>
      <h1 className="page-title">Job sheet</h1>
      <p className="page-subtitle">
        One spreadsheet that builds the systems, the tags and every check against them. Nothing else has to be set up
        first, and nothing is written until the whole sheet has been read.
      </p>

      {outcome && (
        <div className={alertClass(outcome)} style={{ marginBottom: 16 }}>
          <strong>{summaryLine(outcome)}</strong>
          {detailLines(outcome).length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              {detailLines(outcome).map((line, i) => (
                <li key={i} style={{ fontSize: 13, marginBottom: 2 }}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!project && (
        <div className="alert alert-warning">
          <strong>No project is open.</strong> Choose one on <Link href="/projects" className="link">Projects</Link>{' '}
          before importing.
        </div>
      )}

      <div className="card">
        <h2 className="section-title" style={{ marginTop: 0 }}>What the sheet looks like</h2>
        <p className="text-secondary" style={{ fontSize: 13.5, marginTop: 0 }}>
          One row for every check. Repeat the system and the tag down the rows, or leave them blank and they carry
          down from the row above — which is what the blanks in the example mean.
        </p>
        <div className="table-wrap">
          <table className="table" style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th>System</th>
                <th>Subsystem</th>
                <th>Tag</th>
                <th>Description</th>
                <th>Level</th>
                <th>Check</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {EXAMPLE.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className={j === 4 ? 'mono' : undefined} style={{ whiteSpace: 'nowrap' }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-secondary" style={{ fontSize: 12.5, marginBottom: 0 }}>
          Only <strong>System</strong>, <strong>Tag</strong>, <strong>Level</strong> and <strong>Check</strong> have
          to be there. The column headings do not have to match exactly — Sys, KKS, Cx Level, Activity and Acceptance
          Criteria are all understood, and a title row above the table is ignored.
        </p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>Import</h2>
        <form action={importJobSheet} style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
          <label className="field">
            The spreadsheet
            <input type="file" name="file" accept=".xlsx" required className="input" />
          </label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-primary" disabled={!project}>
              Import
            </button>
            <a href="/jobsheet/template" className="link" style={{ fontSize: 13 }}>
              Download a blank sheet
            </a>
          </div>
        </form>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>What it will and will not do</h2>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.6 }}>
          <li>
            <strong>All of it, or none of it.</strong> If one row is wrong the file is refused whole and every problem
            is listed with its row number. A job half imported is worse than one not imported, because the half that is
            there looks finished.
          </li>
          <li>
            <strong>Importing the same sheet twice is safe.</strong> Systems match on name, tags on their tag, and
            checks on tag plus level plus wording — so a corrected sheet updates rather than doubles.
          </li>
          <li>
            <strong>Nothing is ever deleted.</strong> A row taken out of the sheet leaves its record alone. Removing a
            line from a spreadsheet must never delete the signed test record underneath it.
          </li>
          <li>
            <strong>It will not guess.</strong> A level it does not recognise, a tag under two different systems, or
            the same check twice on one tag are all reported by row rather than quietly resolved.
          </li>
        </ul>
      </div>
    </>
  )
}
