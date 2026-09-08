import Link from 'next/link'
import { getCurrentProject } from '@/lib/project'
import { loadLevelSummary } from '@/data/level-summary'
import { missingColumnNote } from '@/lib/pg-columns'
import { NO_LEVEL, type Counts, type LevelRow } from '@/lib/level-summary'

export const dynamic = 'force-dynamic'

/**
 * The five levels, side by side, in tasks and in defects.
 *
 * Every number on this page is a LINK to the list it counts. A summary that
 * cannot be opened is a summary you have to take on trust, and the whole
 * reason to look at one is to find the thing to go and work on — so
 * "3 overdue at L4" has to be one click from the three records.
 */

/** A number that opens the list behind it — or a quiet dash for a zero. */
function Cell({
  n,
  href,
  tone,
  title,
}: {
  n: number
  href: string
  tone?: 'danger' | 'warn' | 'good'
  title: string
}) {
  if (n === 0)
    return (
      <td className="lv-num">
        <span className="lv-zero" title={`None — ${title}`}>
          —
        </span>
      </td>
    )
  return (
    <td className="lv-num">
      <Link href={href} className={tone ? `lv-count lv-${tone}` : 'lv-count'} title={title}>
        {n}
      </Link>
    </td>
  )
}

/** A total. Not a link — a total is not a filtered view of anything. */
function Total({ n }: { n: number }) {
  return (
    <td className="lv-num mono">
      {n === 0 ? <span className="lv-zero">—</span> : n}
    </td>
  )
}

/** Closed-out share. A dash where there is nothing to take a share of. */
function Percent({ c }: { c: Counts }) {
  if (c.percent === null)
    return (
      <td className="lv-num">
        {/* Not 0%, and not 100%. Zero of zero has no percentage, and printing
            one either way is how a bar comes to read as finished. */}
        <span className="lv-zero" title="Nothing recorded, so there is no percentage to give">
          —
        </span>
      </td>
    )
  return (
    <td className="lv-num">
      <div className="lv-bar" title={`${c.done} of ${c.total} closed`}>
        <span style={{ width: `${c.percent}%` }} />
      </div>
      <span className="lv-percent mono">{c.percent}%</span>
    </td>
  )
}

function levelHref(base: string, row: LevelRow, extra = ''): string {
  // The "no level" row cannot be expressed as a level filter, so it opens
  // the unfiltered list rather than a filter that would silently return
  // everything and look like an answer.
  const q = row.key === NO_LEVEL ? '' : `level=${encodeURIComponent(row.key)}`
  const all = [q, extra].filter(Boolean).join('&')
  return all ? `${base}?${all}` : base
}

export default async function LevelsPage() {
  const project = await getCurrentProject()
  const today = new Date().toISOString().slice(0, 10)
  const { summary, missing, error } = await loadLevelSummary(project?.id ?? null, today)
  const schemaNote = missingColumnNote(missing, 'Step 36 — Task levels')

  return (
    <>
      <h1 className="page-title">Level Summary</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — the five commissioning levels side by side. A job does
        not run out of tasks, it runs out of levels: L3 has to be clean before anything is energised and L4 before
        anything is integrated, so one unclosed L4 defect stops L5 whatever the overall percentage says. Every
        number here opens the list behind it.
      </p>

      {schemaNote && (
        <div className="alert alert-warning" role="alert" style={{ marginBottom: 18 }}>
          {schemaNote}
        </div>
      )}
      {error && (
        <div className="alert alert-danger" role="alert" style={{ marginBottom: 18 }}>
          The database refused the query, so these numbers are not the answer: {error}
        </div>
      )}

      {summary.unlevelled > 0 && (
        <div className="alert alert-warning" role="alert" style={{ marginBottom: 18 }}>
          <strong>{summary.unlevelled}</strong> record{summary.unlevelled === 1 ? '' : 's'} carry no level. They are
          invisible to every level filter on this system and they will not appear in any level&rsquo;s readiness — so
          they are the first thing to fix, not the last.
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="table lv-table">
            <thead>
              <tr className="lv-group-row">
                <th />
                {/* No `lv-group-issues` twin: the only thing that
                    distinguishes the two blocks is the rule down the left of
                    the tasks side, so a class for the defects side would be
                    a class no stylesheet reads. */}
                <th colSpan={5} className="lv-group">
                  Punch list — defects found
                </th>
                <th colSpan={5} className="lv-group lv-group-tasks">
                  Tasks — work assigned
                </th>
              </tr>
              <tr>
                <th style={{ minWidth: 210 }}>Level</th>
                <th className="lv-num">Open</th>
                <th className="lv-num">Serious open</th>
                <th className="lv-num">Late</th>
                <th className="lv-num">Total</th>
                <th className="lv-num">Closed</th>
                <th className="lv-num">Open</th>
                <th className="lv-num">Blocked</th>
                <th className="lv-num">Late</th>
                <th className="lv-num">Total</th>
                <th className="lv-num">Done</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => (
                <tr key={row.key} className={row.orphan ? 'lv-orphan' : row.untouched ? 'lv-untouched' : undefined}>
                  <td>
                    <div className="lv-level">
                      <span
                        className="lv-chip"
                        style={{
                          background: row.tone.bg,
                          borderColor: row.tone.border,
                          color: row.tone.text,
                        }}
                      >
                        {row.code}
                      </span>
                      <div>
                        <div className="lv-label">{row.label.replace(/^L\d\s*—\s*/, '')}</div>
                        <div className="lv-verdict">{row.verdict}</div>
                      </div>
                    </div>
                  </td>

                  <Cell n={row.issues.open} href={levelHref('/issues', row, 'open=1')} title="Open punch items" />
                  <Cell
                    n={row.issues.flagged}
                    href={levelHref('/issues', row, 'open=1&severity=critical')}
                    tone="danger"
                    title="Critical or high severity, and still open"
                  />
                  <Cell
                    n={row.issues.overdue}
                    href={levelHref('/issues', row, 'open=1')}
                    tone="danger"
                    title="Past the due date and not closed"
                  />
                  <Cell n={row.issues.total} href={levelHref('/issues', row)} title="Every punch item at this level" />
                  <Percent c={row.issues} />

                  <Cell n={row.tasks.open} href={levelHref('/tasks', row)} title="Tasks not yet done" />
                  <Cell
                    n={row.tasks.flagged}
                    href={levelHref('/tasks', row, 'status=blocked')}
                    tone="warn"
                    title="Blocked, waiting on somebody"
                  />
                  <Cell
                    n={row.tasks.overdue}
                    href={levelHref('/tasks', row)}
                    tone="danger"
                    title="Past the due date and not done"
                  />
                  <Cell n={row.tasks.total} href={levelHref('/tasks', row)} title="Every task at this level" />
                  <Percent c={row.tasks} />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  <strong>Whole project</strong>
                </td>
                <Total n={summary.totals.issues.open} />
                <Total n={summary.totals.issues.flagged} />
                <Total n={summary.totals.issues.overdue} />
                <Total n={summary.totals.issues.total} />
                <Percent c={summary.totals.issues} />
                <Total n={summary.totals.tasks.open} />
                <Total n={summary.totals.tasks.flagged} />
                <Total n={summary.totals.tasks.overdue} />
                <Total n={summary.totals.tasks.total} />
                <Percent c={summary.totals.tasks} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p className="text-secondary" style={{ fontSize: 12.5, margin: '12px 0 0' }}>
        {summary.note}
      </p>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 className="section-title">What the columns mean</h2>
        <dl className="lv-legend">
          <div>
            <dt>Serious open</dt>
            <dd>
              Critical or high severity and NOT closed. A closed critical defect is history; an open one is the
              reason the level is not finished, which is why only the second gets a column.
            </dd>
          </div>
          <div>
            <dt>Late</dt>
            <dd>Past its due date and not closed. An item with no due date is never late — it is just undated.</dd>
          </div>
          <div>
            <dt>Closed / Done</dt>
            <dd>
              A dash rather than a percentage means nothing has been recorded at that level. Zero of zero is not
              nought per cent, and it is not a hundred either.
            </dd>
          </div>
          <div>
            <dt>Empty levels are still shown</dt>
            <dd>
              A level with nothing against it is information — nobody has raised an L4 defect because nobody has
              started L4. Hiding the row would make untouched and finished look the same.
            </dd>
          </div>
        </dl>
      </div>
    </>
  )
}
