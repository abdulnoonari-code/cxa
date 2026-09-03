import { assessObligation, clearObligationAssessment } from '@/app/obligations/ai-actions'
import {
  claimsDischarged,
  inventsAPeriod,
  obligationCaveat,
  obligationTone,
  type ObligationReading,
} from '@/lib/obligation-review'

/**
 * Every AI field is optional, and that is not laziness.
 *
 * Until SQL part 25 is run these columns do not exist, and the loader drops
 * them from the query rather than letting the whole register fail. The panel
 * then simply shows its "assess this" button and nothing else, which is the
 * correct behaviour for a feature whose storage is not there yet.
 */
export type ObligationAiFields = {
  id: string
  statement: string
  clause: string | null
  ai_model?: string | null
  ai_reviewed_at?: string | null
  ai_reviewed_by_name?: string | null
  ai_confidence?: string | null
  ai_discharge?: string | null
  ai_standing?: string | null
  ai_risk?: string | null
  ai_disagreement?: string | null
  ai_ask?: string | null
}

const TONE: Record<string, { border: string; label: string }> = {
  danger: { border: 'var(--color-danger)', label: 'Read this carefully' },
  warning: { border: 'var(--color-warning-solid, #d97706)', label: 'Could not tell' },
  neutral: { border: 'var(--color-border)', label: 'A reading, not a ruling' },
}

/**
 * An AI reading of one obligation.
 *
 * Rendered in a dashed box, the same as the photograph reading, and for the
 * same reason: it must not look like a field somebody filled in. A solid
 * bordered panel beside real recorded data reads as recorded data.
 */
export default function ObligationAssessment({
  row,
  aiOn,
}: {
  row: ObligationAiFields
  aiOn: boolean
}) {
  const has = !!row.ai_reviewed_at

  const reading: ObligationReading | null = has
    ? {
        confidence:
          row.ai_confidence === 'clear' || row.ai_confidence === 'partial' ? row.ai_confidence : 'cannot_tell',
        problem: row.ai_standing ?? '',
        recommendation: row.ai_discharge ?? '',
        discharge: row.ai_discharge ?? '',
        standing: row.ai_standing ?? '',
        risk: row.ai_risk ?? '',
        disagreement: row.ai_disagreement ?? '',
        ask: row.ai_ask ?? '',
      }
    : null

  const decided = reading ? claimsDischarged(reading) : false
  const invented = reading ? inventsAPeriod(reading, `${row.statement} ${row.clause ?? ''}`) : false
  const tone = reading ? (decided || invented ? 'danger' : obligationTone(reading)) : 'neutral'
  const t = TONE[tone]

  return (
    <div
      style={{
        border: `1px dashed ${t.border}`,
        borderRadius: 8,
        padding: 12,
        marginTop: 10,
        background: 'var(--color-surface-2, #f8fafc)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>
          AI reading of the clause
        </span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {has && (
            <span className="text-secondary" style={{ fontSize: 11 }}>
              {row.ai_model ?? 'no model'} · {(row.ai_reviewed_at ?? '').slice(0, 10)}
              {row.ai_reviewed_by_name ? ` · asked by ${row.ai_reviewed_by_name}` : ''}
            </span>
          )}
          {aiOn && (
            <form action={assessObligation}>
              <input type="hidden" name="id" value={row.id} />
              <button
                type="submit"
                className={has ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
                style={{ fontSize: 11 }}
              >
                {has ? 'Ask again' : 'Assess this obligation'}
              </button>
            </form>
          )}
          {has && (
            <form action={clearObligationAssessment}>
              <input type="hidden" name="id" value={row.id} />
              <button type="submit" className="btn-link" style={{ fontSize: 11 }}>
                Clear
              </button>
            </form>
          )}
        </div>
      </div>

      {/* The empty state must not read as the answer.
          It used to be a paragraph of prose in the same box, in the same
          place the reading appears, and it was identical on every obligation
          — so it looked exactly like an AI that gives everyone the same
          assessment. It now says plainly that nothing has been assessed, and
          the explanation of what the button does is a short line under it,
          visibly a caption rather than a finding. */}
      {!has && aiOn && (
        <div style={{ marginTop: 8 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Not assessed yet — press the button to read this clause.
          </p>
          <p className="text-secondary" style={{ margin: '3px 0 0', fontSize: 11.5, fontStyle: 'italic' }}>
            One reading per obligation, about this clause only. It costs a call each time.
          </p>
        </div>
      )}

      {!aiOn && (
        <div style={{ marginTop: 8 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-warning, #a35700)' }}>
            AI is switched off on this deployment.
          </p>
          <p className="text-secondary" style={{ margin: '3px 0 0', fontSize: 12 }}>
            Add <span className="mono">ANTHROPIC_API_KEY</span> in Vercel → Settings → Environment Variables, then
            redeploy. Nothing else on this screen depends on it.
          </p>
        </div>
      )}

      {has && reading && (
        <>
          {decided && (
            <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--color-danger)', fontWeight: 600 }}>
              This reading claims the obligation has been discharged. Only the parties to the contract may decide
              that. Treat everything below as a description of the record.
            </p>
          )}
          {invented && (
            <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--color-danger)', fontWeight: 600 }}>
              This reading gives a time period that does not appear in the clause. Check it against the contract — a
              plausible invented deadline is worse than none at all.
            </p>
          )}

          {reading.disagreement && (
            <Block
              title="The clause and the record disagree"
              body={reading.disagreement}
              emphasis
            />
          )}
          {reading.discharge && <Block title="What would discharge it" body={reading.discharge} />}
          {reading.standing && <Block title="How the record stands" body={reading.standing} />}
          {reading.risk && <Block title="Where the wording will cause trouble" body={reading.risk} />}
          {reading.ask && <Block title="Worth asking the other party" body={reading.ask} />}

          <p className="text-secondary" style={{ margin: '10px 0 0', fontSize: 11.5, fontStyle: 'italic' }}>
            {obligationCaveat(reading)} It changes no status and is counted in no figure.
          </p>
        </>
      )}
    </div>
  )
}

function Block({ title, body, emphasis }: { title: string; body: string; emphasis?: boolean }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.3,
          color: emphasis ? 'var(--color-danger)' : 'var(--color-text-secondary, #5b6b85)',
        }}
      >
        {title}
      </div>
      <p style={{ margin: '2px 0 0', fontSize: 13 }}>{body}</p>
    </div>
  )
}
