import Link from 'next/link'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { loadValidityInput } from '@/data/validity'
import { review, summarise, verdict, severityBadge, type Finding, type Severity } from '@/lib/validity'
import { LEVELS } from '@/lib/checklist'
import { aiConfigured, ask, extractJsonArray } from '@/lib/ai'

export const dynamic = 'force-dynamic'

const TONE: Record<Severity | 'ok', string> = {
  critical: 'var(--color-danger-solid)',
  high: 'var(--color-warning-solid, #d97706)',
  medium: 'var(--color-primary)',
  low: 'var(--color-neutral-solid)',
  ok: 'var(--color-success-solid)',
}

type Gap = { level?: string; missing?: string; why?: string }

// What Claude is asked, and the fence it is asked inside.
//
// It is given the wording of the checks and nothing else — no results, no
// names, no client information — and asked one question the arithmetic
// cannot answer: what would a commissioning engineer expect to see here that
// is not here. It is told to say nothing rather than pad the list, because a
// list of invented gaps is worse than a short one.
const SYSTEM = [
  'You are reviewing a commissioning checklist for an electrical substation, data centre or power plant.',
  'You are given the wording of the checks that exist at one commissioning level, for one piece of plant.',
  'Name only checks a competent commissioning engineer would expect at that level and which are genuinely absent from the list.',
  'Do not restate checks that are already there in different words. Do not invent project-specific requirements you cannot know.',
  'If the list looks adequate, return an empty array. A short honest answer is correct; padding is not.',
  'Reply with nothing but a JSON array of objects: [{"missing": "...", "why": "..."}]. "why" is one sentence on what the gap risks.',
].join(' ')

export default async function ValidityPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; ai?: string; level?: string; subject?: string }>
}) {
  const sp = await searchParams
  const project = await getCurrentProject()
  const index = await loadSubjectIndex(project?.id ?? null)
  const input = await loadValidityInput(project?.id ?? null, index)

  const findings = review(input)
  const recordsExamined = input.checks.length + input.tests.length + input.punch.length
  const summary = summarise(findings, recordsExamined)
  const reading = verdict(summary)

  const shown: Finding[] = sp.severity ? findings.filter((f) => f.severity === sp.severity) : findings

  // ── The Claude pass, only when asked for ───────────────────────────────
  const configured = aiConfigured()
  const wantsAi = sp.ai === '1'
  const level = sp.level ?? LEVELS[1].value
  const subjectKey = sp.subject ?? null

  // Which subjects have checks at the chosen level, so the picker offers
  // things that exist rather than the whole tree.
  const candidates = [
    ...new Map(
      input.checks
        .filter((c) => c.level === level && c.subjectKey)
        .map((c) => [c.subjectKey as string, c.subjectLabel])
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]))

  const chosen = subjectKey ?? candidates[0]?.[0] ?? null
  const chosenLabel = candidates.find(([k]) => k === chosen)?.[1] ?? null
  const scope = input.checks.filter((c) => c.subjectKey === chosen && c.level === level)

  let aiGaps: Gap[] | null = null
  let aiRaw: string | null = null
  let aiError: { reason: string; hint: string | null } | null = null
  let aiCost: { model: string; inputTokens: number; outputTokens: number } | null = null

  if (wantsAi && configured && chosen && scope.length > 0) {
    const levelLabel = LEVELS.find((l) => l.value === level)?.label ?? level
    const outcome = await ask({
      system: SYSTEM,
      maxTokens: 1500,
      prompt: [
        `Commissioning level: ${levelLabel}`,
        `Plant item: ${chosenLabel ?? 'unnamed'}`,
        '',
        'Checks currently on the list:',
        ...scope.map((c, i) => `${i + 1}. ${c.item}`),
      ].join('\n'),
    })

    if (outcome.ok) {
      const parsed = extractJsonArray<Gap>(outcome.value)
      aiGaps = parsed.items
      aiRaw = parsed.items ? null : parsed.raw
      aiCost = { model: outcome.model, inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens }
    } else {
      aiError = { reason: outcome.reason, hint: outcome.hint }
    }
  }


  return (
    <>
      <h1 className="page-title">Validity Review</h1>
      <p className="page-subtitle" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>
          {project ? project.name : 'No project selected'} — not what has been done, but whether the record supports
          what it claims.
        </span>
        <span className={severityBadge(reading.tone === 'ok' ? 'low' : reading.tone)}>{reading.label}</span>
      </p>

      <div className="card" style={{ borderLeft: `4px solid ${TONE[reading.tone]}` }}>
        <p style={{ margin: 0, fontSize: 14 }}>{reading.detail}</p>
        <p className="text-secondary" style={{ margin: '8px 0 0', fontSize: 12.5 }}>
          Every finding below is arithmetic on the records you already have — no judgement, nothing stored, nothing
          to dismiss. Fix the cause and the finding is gone next time you open this page. {summary.recordsExamined}{' '}
          record{summary.recordsExamined === 1 ? '' : 's'} examined.
        </p>
      </div>

      <div className="stat-grid" style={{ marginTop: 18 }}>
        <div className="stat">
          <div className="stat-label">Contradictions</div>
          <div className="stat-value" style={{ color: summary.critical > 0 ? 'var(--color-danger)' : undefined }}>
            {summary.critical}
          </div>
          <div className="stat-note">The record argues with itself</div>
        </div>
        <div className="stat">
          <div className="stat-label">Gaps</div>
          <div className="stat-value" style={{ color: summary.high > 0 ? 'var(--color-warning)' : undefined }}>
            {summary.high}
          </div>
          <div className="stat-note">Something required is missing</div>
        </div>
        <div className="stat">
          <div className="stat-label">Worth a look</div>
          <div className="stat-value">{summary.medium + summary.low}</div>
          <div className="stat-note">Would be asked about</div>
        </div>
        <div className="stat">
          <div className="stat-label">Records examined</div>
          <div className="stat-value">{summary.recordsExamined}</div>
          <div className="stat-note">Checks, tests and punch items</div>
        </div>
      </div>

      {summary.byKind.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <h2 className="section-title">What was found</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Finding</th>
                  <th style={{ textAlign: 'right' }}>Count</th>
                </tr>
              </thead>
              <tbody>
                {summary.byKind.map((k) => (
                  <tr key={k.kind}>
                    <td>
                      <span className={severityBadge(k.severity)}>{k.severity}</span>
                    </td>
                    <td style={{ fontSize: 13.5 }}>{k.title}</td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 12.5 }}>
                      {k.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <Link href="/validity" className={sp.severity ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}>
              All {summary.total}
            </Link>
            {(['critical', 'high', 'medium'] as Severity[]).map((s) =>
              summary[s] > 0 ? (
                <Link
                  key={s}
                  href={`/validity?severity=${s}`}
                  className={sp.severity === s ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                >
                  {s} {summary[s]}
                </Link>
              ) : null
            )}
          </div>
        </div>
      )}

      {/* ── The findings ───────────────────────────────────────────────── */}
      {shown.length === 0 ? (
        <div className="card" style={{ marginTop: 18 }}>
          <p className="text-secondary" style={{ fontSize: 14, marginBottom: 0 }}>
            {summary.recordsExamined === 0
              ? 'Nothing has been recorded on this project yet, so there is nothing to read.'
              : sp.severity
                ? 'Nothing at that severity.'
                : 'Nothing on file contradicts anything else on file. That is not a statement that the work is right — only that the records are consistent with each other.'}
          </p>
        </div>
      ) : (
        <div style={{ marginTop: 18 }}>
          {shown.map((f) => (
            <div key={f.key} className="card" style={{ marginBottom: 12, borderLeft: `4px solid ${TONE[f.severity]}` }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                <span className={severityBadge(f.severity)}>{f.severity}</span>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{f.title}</span>
              </div>
              <p style={{ fontSize: 13.5, margin: '4px 0 8px' }}>{f.detail}</p>
              <p className="text-secondary" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
                <strong>Why it matters.</strong> {f.why}
              </p>
              <Link href={f.href} className="link" style={{ fontSize: 13.5 }}>
                Go and deal with it →
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* ── Out ────────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2 className="section-title">Issue this review</h2>
        <p className="text-secondary" style={{ fontSize: 13, marginBottom: 14 }}>
          The document an auditor asks for, and the one worth issuing before they do — every finding with the reason
          it matters written beside it. The severity filter above carries into the file.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href={`/validity/pdf${sp.severity ? `?severity=${sp.severity}` : ''}`} className="btn btn-secondary btn-sm">
            PDF
          </a>
          <a href={`/validity/word${sp.severity ? `?severity=${sp.severity}` : ''}`} className="btn btn-secondary btn-sm">
            Word
          </a>
        </div>
      </div>

      {/* ── The Claude pass ────────────────────────────────────────────── */}
      <h2 className="section-title" style={{ marginTop: 32 }}>
        Ask Claude what is missing
      </h2>
      <p className="text-secondary" style={{ fontSize: 13, marginTop: -6 }}>
        Everything above is arithmetic and costs nothing. This is the one thing arithmetic cannot do: read the
        wording of a checklist and say what a commissioning engineer would expect to see that is not there. It runs
        only when you press the button, on one level of one item at a time, and it never changes a record —
        whatever it says, the list only changes when you change it.
      </p>

      <div className="card">
        {!configured ? (
          <>
            <p style={{ fontSize: 14, marginTop: 0 }}>
              <strong>Not switched on for this deployment.</strong> Everything else on this page works without it.
            </p>
            <p className="text-secondary" style={{ fontSize: 13, marginBottom: 0 }}>
              To switch it on, add an environment variable named <code>ANTHROPIC_API_KEY</code> in Vercel →
              Settings → Environment Variables, then redeploy. Put the key straight into Vercel — never into the
              code, a file in the repo, or a chat message. Optionally set <code>ANTHROPIC_MODEL</code> too; leave it
              unset and the app asks the API which models your key can use.
            </p>
          </>
        ) : candidates.length === 0 ? (
          <p className="text-secondary" style={{ fontSize: 14, marginBottom: 0 }}>
            No checks are recorded at this level yet, so there is nothing to read. Import a checklist first.
          </p>
        ) : (
          <>
            <form method="get" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <input type="hidden" name="ai" value="1" />
              <label className="field" style={{ minWidth: 250 }}>
                Level
                <select name="level" defaultValue={level} className="input">
                  {LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ minWidth: 220 }}>
                Plant item
                <select name="subject" defaultValue={chosen ?? ''} className="input">
                  {candidates.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn btn-primary">
                Read the list
              </button>
            </form>

            <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
              {scope.length} check{scope.length === 1 ? '' : 's'} would be sent — their wording only. No results, no
              names, no client information leaves this deployment.
            </p>
          </>
        )}

        {wantsAi && aiError && (
          <div className="alert alert-danger" style={{ marginTop: 16 }}>
            <strong>Could not ask.</strong> {aiError.reason}
            {aiError.hint ? <div style={{ marginTop: 6, fontSize: 13 }}>{aiError.hint}</div> : null}
          </div>
        )}

        {wantsAi && aiGaps && (
          <div style={{ marginTop: 18 }}>
            <h3 className="section-title" style={{ fontSize: 15 }}>
              {aiGaps.length === 0
                ? 'Nothing obvious missing'
                : `${aiGaps.length} thing${aiGaps.length === 1 ? '' : 's'} a commissioning engineer would expect to see`}
            </h3>
            {aiGaps.length === 0 ? (
              <p className="text-secondary" style={{ fontSize: 13.5 }}>
                Claude read {scope.length} check{scope.length === 1 ? '' : 's'} for {chosenLabel} and did not name a
                gap. That is one opinion on the wording, not a statement that the scope is complete.
              </p>
            ) : (
              <ul style={{ fontSize: 13.5, lineHeight: 1.65, paddingLeft: 20 }}>
                {aiGaps.map((g, i) => (
                  <li key={i} style={{ marginBottom: 8 }}>
                    <strong>{g.missing ?? 'Unnamed'}</strong>
                    {g.why ? <div className="text-secondary" style={{ fontSize: 12.5 }}>{g.why}</div> : null}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-secondary" style={{ fontSize: 12, marginBottom: 0 }}>
              A suggestion, not a finding — nothing here has been added to any checklist, and the list above is
              unchanged. Add what you agree with on the{' '}
              <Link href="/checklists" className="link">
                Checklists
              </Link>{' '}
              page.
              {aiCost
                ? ` · ${aiCost.model} · ${aiCost.inputTokens} in / ${aiCost.outputTokens} out`
                : ''}
            </p>
          </div>
        )}

        {wantsAi && aiRaw && (
          <div style={{ marginTop: 16 }}>
            <p className="text-secondary" style={{ fontSize: 13 }}>
              The reply did not come back in the expected format, so here it is as written:
            </p>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, fontFamily: 'inherit', lineHeight: 1.55 }}>
              {aiRaw}
            </pre>
          </div>
        )}
      </div>

      <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 18 }}>
        This page never authorises anything and never marks anything as satisfied. A clean review means the records
        are consistent with each other — whether the plant is actually fit to energise is decided at its{' '}
        <Link href="/gates" className="link">
          readiness gate
        </Link>
        , against rules, by a named person.
      </p>
    </>
  )
}
