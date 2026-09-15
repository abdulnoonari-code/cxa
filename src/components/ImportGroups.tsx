import { deleteRegisterGroupAction, deletePickedRegisterAction } from '@/app/registers/actions'
import { type RegisterSummary } from '@/data/register-groups'
import { REGISTER_LABEL, type RegisterKind } from '@/lib/registers'

/**
 * What came from which file, on a register — and how to take a file back out.
 *
 * ── One component, three screens ────────────────────────────────────────
 *
 * Tags, systems and equipment types all needed the same two things and the
 * same warning. Writing it three times would be three places for the
 * warning to drift, and the warning is the part that matters: deleting a
 * TAG is not like deleting a check. Four foreign keys say ON DELETE
 * CASCADE, so the tag's checklist, its test records, its punch items and
 * its parts all go with it, in the same instant, without a word.
 *
 * So the consequence is spelled out per register, in the sentence above
 * the button, before anything is pressed. The exact counts go to the audit
 * trail; counting them here would be a query per group on every page load
 * of a screen people open all day.
 *
 * ── The tick boxes ──────────────────────────────────────────────────────
 *
 * They live in the rows of the page that renders this, not inside this
 * component, and they carry form="pickrows" — the form below. Register
 * rows already contain their own edit and delete forms, and HTML forms
 * cannot nest.
 */

const CONSEQUENCE: Record<RegisterKind, string> = {
  equipment:
    'Deleting a tag also deletes everything recorded against it — its checks at every level, its test records, its punch items and their photographs, and any parts inside it. That is the database doing what it was told, and it cannot be undone from this screen.',
  systems:
    'Tags assigned to these systems SURVIVE and become unassigned; their checks, tests and punch items are untouched. Subsystems under them are deleted.',
  equipment_types:
    'Tags of these types SURVIVE and simply stop naming a type. Nothing else about them changes.',
}

export default function ImportGroups({
  kind,
  summary,
  sqlFile = 'week5-part41-import-source.sql',
}: {
  kind: RegisterKind
  summary: RegisterSummary
  sqlFile?: string
}) {
  const label = REGISTER_LABEL[kind]

  // The column does not exist yet. Say so and name the file — an empty
  // section here would read as "nothing has ever been imported", and
  // somebody would import the same file again to fix it.
  if (summary.columnMissing) {
    return (
      <div className="alert alert-warning" style={{ marginTop: 20 }}>
        <strong>Imports are not grouped on this database yet.</strong> Run{' '}
        <code className="mono">{sqlFile}</code> in Supabase and every file imported after that is gathered
        under its own heading here, with its own Delete button. Importing works exactly as it does now in the
        meantime — nothing is lost, it simply cannot be taken back out in one piece.
      </div>
    )
  }

  return (
    <>
      {summary.groups.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2 className="section-title" style={{ marginBottom: 4 }}>
            Imported {label.many}
          </h2>
          <p className="text-secondary" style={{ fontSize: 12.5, margin: '0 0 14px', maxWidth: '84ch' }}>
            Every {label.one} that arrived in a file, gathered under the file it arrived in. Nothing typed in by
            hand belongs to a group, so nothing typed in can be removed by one of these buttons.
            {summary.typedIn > 0 && (
              <>
                {' '}
                <strong>{summary.typedIn}</strong> {summary.typedIn === 1 ? label.one : label.many}{' '}
                {summary.typedIn === 1 ? 'was' : 'were'} typed in or imported before grouping existed, and
                {summary.typedIn === 1 ? ' is' : ' are'} not listed here.
              </>
            )}
          </p>

          <div style={{ display: 'grid', gap: 10 }}>
            {summary.groups.map((g) => (
              <div
                key={g.key}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 9,
                  padding: '12px 14px',
                  display: 'flex',
                  gap: 14,
                  flexWrap: 'wrap',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5, wordBreak: 'break-word' }}>{g.name}</div>
                  <div className="text-secondary" style={{ fontSize: 12.5, marginTop: 3 }}>
                    {g.total} {g.total === 1 ? label.one : label.many}
                  </div>
                </div>

                <details>
                  <summary className="btn-link" style={{ cursor: 'pointer', fontSize: 12.5 }}>
                    Delete these {g.total} {g.total === 1 ? label.one : label.many}
                  </summary>
                  <form action={deleteRegisterGroupAction} style={{ marginTop: 8, maxWidth: 460 }}>
                    <input type="hidden" name="register" value={kind} />
                    <input type="hidden" name="group" value={g.key} />
                    <p style={{ margin: 0, fontSize: 12.5 }}>
                      Removes the <strong>{g.total}</strong> {g.total === 1 ? label.one : label.many} that came
                      from <strong>{g.name}</strong>.
                    </p>
                    <p style={{ margin: '8px 0 0', fontSize: 12.5, fontWeight: 600 }}>{CONSEQUENCE[kind]}</p>
                    <p className="text-secondary" style={{ margin: '8px 0 0', fontSize: 12 }}>
                      The audit trail records exactly what went.
                    </p>
                    <button type="submit" className="btn btn-danger btn-sm" style={{ marginTop: 10 }}>
                      Delete {g.total} {g.total === 1 ? label.one : label.many}
                    </button>
                  </form>
                </details>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.total > 0 && (
        <form action={deletePickedRegisterAction} id="pickrows" className="card" style={{ marginTop: 16 }}>
          <input type="hidden" name="register" value={kind} />
          <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-danger btn-sm">
              Delete ticked {label.many}
            </button>
            <span className="text-secondary" style={{ fontSize: 12.5, maxWidth: '78ch' }}>
              Tick the box beside any row below and press this. {CONSEQUENCE[kind]}
            </span>
          </div>
        </form>
      )}
    </>
  )
}
