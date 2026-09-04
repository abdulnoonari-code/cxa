import { runRulesOnAttachment } from '@/app/documents/rules-actions'
import { RULES_NOTE, type Finding, type Measurement } from '@/lib/doc-rules'
import { CITATION_NOTE, bodyOf, type Citation } from '@/lib/standards'

export type RulesFields = {
  id: string
  rules_run_at?: string | null
  rules_verdict?: string | null
  rules_findings?: unknown
  rules_measurements?: unknown
  rules_citations?: unknown
  rules_tag_found?: boolean | null
}

const LEVEL: Record<string, { color: string; label: string }> = {
  blocking: { color: 'var(--color-danger)', label: 'Stops this being evidence' },
  warning: { color: 'var(--color-warning, #a35700)', label: 'Worth a look' },
  note: { color: 'var(--color-text-secondary)', label: 'Noted' },
}

function asFindings(raw: unknown): Finding[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (f): f is Finding =>
      !!f && typeof f === 'object' && typeof (f as Finding).title === 'string' && typeof (f as Finding).level === 'string'
  )
}

function asMeasurements(raw: unknown): Measurement[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (m): m is Measurement => !!m && typeof m === 'object' && typeof (m as Measurement).value === 'string'
  )
}

function asCitations(raw: unknown): Citation[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((c): c is Citation => !!c && typeof c === 'object' && typeof (c as Citation).raw === 'string')
}

/**
 * The free rule checks on a document.
 *
 * Deliberately a SOLID panel, where the AI reading is dashed. That is not
 * decoration: a rule result is repeatable and checkable, and it is entitled
 * to look more like a record than a suggestion does. The two must never be
 * mistaken for each other in either direction.
 */
export default function RulesCheck({ row }: { row: RulesFields }) {
  const has = !!row.rules_run_at
  const findings = asFindings(row.rules_findings)
  const measurements = asMeasurements(row.rules_measurements)
  const citations = asCitations(row.rules_citations)
  const blocking = row.rules_verdict === 'blocking'

  return (
    <div
      style={{
        border: `1px solid ${blocking ? 'var(--color-danger)' : 'var(--color-border)'}`,
        borderLeft: `4px solid ${blocking ? 'var(--color-danger)' : 'var(--color-neutral-solid, #b9c8e0)'}`,
        borderRadius: 8,
        padding: 12,
        marginTop: 10,
        background: 'var(--color-surface)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>
          Rule checks — free, no AI
        </span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {has && (
            <span className="text-secondary" style={{ fontSize: 11 }}>
              checked {(row.rules_run_at ?? '').slice(0, 10)}
            </span>
          )}
          <form action={runRulesOnAttachment}>
            <input type="hidden" name="id" value={row.id} />
            <button
              type="submit"
              className={has ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
              style={{ fontSize: 11 }}
            >
              {has ? 'Check again' : 'Check this document'}
            </button>
          </form>
        </div>
      </div>

      {!has && (
        <p className="text-secondary" style={{ margin: '8px 0 0', fontSize: 12.5 }}>
          Costs nothing and needs no key. Checks whether the document mentions the tag it is filed against, whether it
          carries a date and a signature block, what numbers with units are on it, and which standards it cites.
        </p>
      )}

      {has && (
        <>
          {findings.length === 0 && (
            <p style={{ margin: '8px 0 0', fontSize: 12.5 }}>Nothing to report — every check passed.</p>
          )}

          {findings.map((f, i) => (
            <div key={i} style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: LEVEL[f.level]?.color ?? 'inherit' }}>
                {f.title}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 12.5 }}>{f.detail}</p>
              <span className="text-secondary mono" style={{ fontSize: 10.5 }}>
                rule: {f.rule}
              </span>
            </div>
          ))}

          {citations.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 0.3,
                  color: 'var(--color-text-secondary)',
                }}
              >
                Standards cited — {citations.length}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {citations.map((c, i) => (
                  <span
                    key={i}
                    className="badge badge-info"
                    style={{ fontSize: 11.5 }}
                    title={c.scope ? `${bodyOf(c.body)?.publisher ?? ''} — ${c.scope}` : bodyOf(c.body)?.publisher ?? ''}
                  >
                    <span className="mono">{c.raw}</span>
                    {c.scope ? ` · ${c.scope}` : ''}
                  </span>
                ))}
              </div>
              <p className="text-secondary" style={{ margin: '6px 0 0', fontSize: 11, fontStyle: 'italic' }}>
                {CITATION_NOTE}
              </p>
            </div>
          )}

          {measurements.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 0.3,
                  color: 'var(--color-text-secondary)',
                }}
              >
                Numbers with units — {measurements.length}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ marginTop: 6, fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 140 }}>Label found before it</th>
                      <th style={{ minWidth: 90 }}>Value</th>
                      <th>In context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {measurements.slice(0, 20).map((m, i) => (
                      <tr key={i}>
                        <td className="text-secondary">{m.label}</td>
                        <td className="mono">
                          {m.value} {m.unit}
                        </td>
                        <td className="text-secondary" style={{ fontSize: 11 }}>
                          …{m.where}…
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-secondary" style={{ margin: '6px 0 0', fontSize: 11, fontStyle: 'italic' }}>
                Found by pattern, not read for meaning. These are not test results, nothing is written into any
                record, and no value here is compared against an acceptance criterion.
              </p>
            </div>
          )}

          <p className="text-secondary" style={{ margin: '12px 0 0', fontSize: 11, fontStyle: 'italic' }}>
            {RULES_NOTE}
          </p>
        </>
      )}
    </div>
  )
}
