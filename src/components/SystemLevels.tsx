import Link from 'next/link'
import { TAG_LEVELS, SYSTEM_LEVELS, pct, systemHeadline, type Cell, type SystemView } from '@/lib/scope'
import { levelCode, levelTone } from '@/lib/levels'
import { categoryShort } from '@/lib/punchlist'

/**
 * A system's work, at both scopes, on one screen.
 *
 * The gap this closes: a system was showing a single level badge and a single
 * punch list, as though the whole switchboard were one thing that gets tested
 * once. Twenty breakers each carry their own L1, L2 and L3; the board itself
 * carries L4 and L5. One number over the top of that hides whichever half is
 * behind, and it is nearly always the half that matters.
 *
 * So: a matrix, one row per tag, three columns. Then the system's own two
 * levels underneath. They are never added together.
 */

function CellBox({ cell, level }: { cell: Cell; level: string }) {
  const p = pct(cell)
  const tone = levelTone(level)

  if (cell.total === 0) {
    return (
      <span className="text-secondary" style={{ fontSize: 12 }}>
        —
      </span>
    )
  }

  return (
    <span
      title={`${cell.done} of ${cell.total} done${cell.failed > 0 ? `, ${cell.failed} failed` : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 5,
        padding: '2px 7px',
        borderRadius: 6,
        border: `1px solid ${cell.failed > 0 ? 'var(--color-danger)' : tone.border}`,
        background: cell.failed > 0 ? 'var(--color-danger-bg)' : tone.bg,
        color: cell.failed > 0 ? 'var(--color-danger)' : tone.text,
        fontSize: 12,
        whiteSpace: 'nowrap',
      }}
    >
      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{p}%</strong>
      <span style={{ fontSize: 10.5 }}>
        {cell.done}/{cell.total}
        {cell.failed > 0 ? ` · ${cell.failed} failed` : ''}
      </span>
    </span>
  )
}

export default function SystemLevels({ view }: { view: SystemView }) {
  const { picture } = view
  const head = systemHeadline(picture)
  const openOwn = view.own.filter((i) => i.status !== 'closed' && i.status !== 'verified')
  const openTags = view.fromTags.filter((i) => i.status !== 'closed' && i.status !== 'verified')

  return (
    <>
      <div className="card">
        <h2 className="section-title">Levels, at both scopes</h2>
        <p className="text-secondary" style={{ fontSize: 12.5, margin: '0 0 4px' }}>
          L1 to L3 are done on a device — this breaker was factory tested, installed, made safe to energise. L4
          and L5 are done on the assembly. The two are never added together: one figure over both would let a
          board read most of the way finished because every device passed its factory test, with no functional
          test run at all.
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 600 }}>{head.devices}</p>
        <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 600 }}>{head.system}</p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title">Each device — L1 to L3</h2>
        {picture.tags.length === 0 ? (
          <p className="text-secondary" style={{ fontSize: 13, margin: 0 }}>
            No equipment is assigned to this system yet, so there is nothing to check at device level.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 150 }}>Tag</th>
                  {TAG_LEVELS.map((l) => (
                    <th key={l} style={{ minWidth: 120 }}>
                      {levelCode(l)}
                    </th>
                  ))}
                  <th style={{ minWidth: 110 }}>Off scope</th>
                </tr>
              </thead>
              <tbody>
                {picture.tags.map((t) => (
                  <tr key={t.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {t.code}
                    </td>
                    {TAG_LEVELS.map((l) => (
                      <td key={l}>
                        <CellBox cell={t.cells[l]} level={l} />
                      </td>
                    ))}
                    <td>
                      {t.offScope.total > 0 ? (
                        <span
                          className="text-secondary"
                          style={{ fontSize: 11.5 }}
                          title="Checks at a system level recorded against this one tag. Reported, never moved."
                        >
                          {t.offScope.total} system-level
                        </span>
                      ) : (
                        <span className="text-secondary" style={{ fontSize: 12 }}>
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight: 700 }}>All devices</td>
                  {TAG_LEVELS.map((l) => (
                    <td key={l}>
                      <CellBox cell={picture.tagTotals[l]} level={l} />
                    </td>
                  ))}
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title">The system itself — L4 and L5</h2>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
          {SYSTEM_LEVELS.map((l) => (
            <div key={l} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="mono text-secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                {levelCode(l)}
              </span>
              <CellBox cell={picture.own[l]} level={l} />
            </div>
          ))}
        </div>
        {picture.systemHoldingTagWork.total > 0 && (
          <p
            className="text-secondary"
            style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--color-warning, #a35700)' }}
          >
            {picture.systemHoldingTagWork.total} device-level check
            {picture.systemHoldingTagWork.total === 1 ? ' is' : 's are'} recorded against this system rather than
            against a tag. They still count, and nothing has been moved — but which device was checked cannot be
            told from which was not.
          </p>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title">Defects</h2>
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              On the system itself — {openOwn.length} open
            </div>
            <p className="text-secondary" style={{ fontSize: 12, margin: '0 0 8px' }}>
              Faults with no single device to blame: an interlock, a changeover, a sequence.
            </p>
            {openOwn.length === 0 ? (
              <p className="text-secondary" style={{ fontSize: 12.5, margin: 0 }}>
                None open.
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
                {openOwn.slice(0, 6).map((i) => (
                  <li key={i.id}>
                    <span className="mono">{i.ref}</span> {(i.title ?? '').slice(0, 60)}{' '}
                    <span className="text-secondary">· {categoryShort(i.category)}</span>
                  </li>
                ))}
                {openOwn.length > 6 && (
                  <li className="text-secondary">and {openOwn.length - 6} more</li>
                )}
              </ul>
            )}
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              On its equipment — {openTags.length} open
            </div>
            <p className="text-secondary" style={{ fontSize: 12, margin: '0 0 8px' }}>
              Shown here because nobody hands a board over with an open Category A on one of its breakers.
            </p>
            {openTags.length === 0 ? (
              <p className="text-secondary" style={{ fontSize: 12.5, margin: 0 }}>
                None open.
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
                {openTags.slice(0, 6).map((i) => (
                  <li key={i.id}>
                    <span className="mono">{i.ref}</span> {(i.title ?? '').slice(0, 50)}{' '}
                    <span className="text-secondary">
                      · {view.codeOf(i.subjectId)} · {categoryShort(i.category)}
                    </span>
                  </li>
                ))}
                {openTags.length > 6 && (
                  <li className="text-secondary">and {openTags.length - 6} more</li>
                )}
              </ul>
            )}
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <Link href="/issues" className="btn btn-secondary btn-sm">
            Open the punch list
          </Link>
        </div>
      </div>
    </>
  )
}
