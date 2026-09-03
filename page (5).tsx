import Link from 'next/link'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { loadProjectRollup, rollupFor } from '@/data/rollup'
import { refKey, subjectLabel, subjectBadgeClass, type Subject } from '@/lib/subjects'
import { releaseBlocks } from '@/lib/inspection'
import { gapsIn, verdict, SECTIONS, SIGNATURE_BLOCKS, type DossierInput } from '@/lib/dossier'

export const dynamic = 'force-dynamic'

const TONE: Record<string, string> = {
  blocking: 'var(--color-danger-solid)',
  gap: 'var(--color-warning-solid, #d97706)',
  ready: 'var(--color-success-solid)',
  empty: 'var(--color-neutral-solid)',
}

const BADGE: Record<string, string> = {
  blocking: 'badge badge-danger',
  gap: 'badge badge-warning',
  ready: 'badge badge-success',
  empty: 'badge badge-neutral',
}

export default async function DossierPage() {
  const project = await getCurrentProject()
  const index = await loadSubjectIndex(project?.id ?? null)
  const rollup = await loadProjectRollup(project?.id ?? null, index)

  // A pack is handed over for a system, an area or the whole project — never
  // for a single tag, because nobody hands over one breaker.
  const packable: Subject[] = [...index.byKey.values()]
    .filter((s) => s.type === 'project' || s.type === 'site' || s.type === 'area' || s.type === 'system' || s.type === 'subsystem')
    .sort((a, b) => {
      const order = ['project', 'site', 'area', 'system', 'subsystem']
      const d = order.indexOf(a.type) - order.indexOf(b.type)
      return d !== 0 ? d : (a.code ?? a.name).localeCompare(b.code ?? b.name)
    })

  // The figures each row needs come straight off the roll-up, which is already
  // scoped to a subject's whole subtree. Gates and obligations are left to the
  // pack itself — this list is a chooser, not a second dossier.
  const rows = packable.map((subject) => {
    const r = rollupFor(rollup, { type: subject.type, id: subject.id })
    const open = r.issues.filter((i) => i.status !== 'verified' && i.status !== 'closed')
    const holds = [
      ...r.checks.filter((c) => c.inspection_type === 'hold'),
      ...r.tests.filter((t) => t.inspection_type === 'hold'),
    ]
    const unreleased = holds.filter((h) => releaseBlocks(h.inspection_type, h.release)).length

    const input: DossierInput = {
      requirements: { verified: r.requirementsVerified, total: r.requirements.length },
      checks: {
        done: r.checks.filter((c) => c.status === 'pass' || c.status === 'na').length,
        failed: r.checks.filter((c) => c.status === 'fail').length,
        total: r.checks.length,
      },
      tests: {
        passed: r.tests.filter((t) => t.result === 'pass').length,
        failed: r.tests.filter((t) => t.result === 'fail').length,
        total: r.tests.length,
      },
      holdPoints: { released: holds.length - unreleased, unreleased, total: holds.length },
      punch: {
        openA: open.filter((i) => i.category === 'A').length,
        openOther: open.filter((i) => i.category !== 'A').length,
        closed: r.issues.length - open.length,
        total: r.issues.length,
      },
      // The chooser does not load gates, obligations or documents — those are
      // per-pack queries and would turn one page into forty. It reports what
      // the roll-up knows and says so.
      obligations: { outstanding: 0, total: 0 },
      gates: { signed: 0, unmet: 0, total: 0 },
      documents: 0,
    }

    const gaps = gapsIn(input).filter((g) => g.severity === 'blocking')
    return { subject, rollup: r, input, blocking: gaps.length, reading: verdict(input, gapsIn(input)) }
  })

  const ready = rows.filter((r) => r.reading.tone === 'ready').length
  const blocked = rows.filter((r) => r.reading.tone === 'blocking').length

  return (
    <>
      <h1 className="page-title">Handover Packs</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — the pack you hand over when a system is finished, that
        proves it was commissioned rather than merely built. Everything else in CxSentinel was recorded for this.
      </p>

      <div className="card">
        <p style={{ margin: 0, fontSize: 14 }}>
          A pack assembles every record held against a system and everything beneath it: requirements, checks by
          level, tests, hold and witness points with their signatures, the punch list, obligations, gates and the
          documents cited. It is generated fresh each time and nothing in it is stored.
        </p>
        <p className="text-secondary" style={{ margin: '10px 0 0', fontSize: 12.5 }}>
          <strong>It does not certify anything.</strong> It states what the record shows and prints the signature
          blocks for the four people entitled to decide — {SIGNATURE_BLOCKS.map((b) => b.role).join(', ')} — each
          putting their name to a different statement, because &ldquo;the work is complete&rdquo;, &ldquo;it was
          commissioned per the plan&rdquo; and &ldquo;we accept it&rdquo; are three different claims.
        </p>
      </div>

      <div className="stat-grid" style={{ marginTop: 18 }}>
        <div className="stat">
          <div className="stat-label">Packs available</div>
          <div className="stat-value">{rows.length}</div>
          <div className="stat-note">Systems, areas and the project</div>
        </div>
        <div className="stat">
          <div className="stat-label">Records support handover</div>
          <div className="stat-value" style={{ color: ready > 0 ? 'var(--color-success)' : undefined }}>
            {ready}
          </div>
          <div className="stat-note">Nothing outstanding in the record</div>
        </div>
        <div className="stat">
          <div className="stat-label">Blocked</div>
          <div className="stat-value" style={{ color: blocked > 0 ? 'var(--color-danger)' : undefined }}>
            {blocked}
          </div>
          <div className="stat-note">Something in the pack stops handover</div>
        </div>
        <div className="stat">
          <div className="stat-label">Sections per pack</div>
          <div className="stat-value">{SECTIONS.length}</div>
          <div className="stat-note">Every one printed, empty or not</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card" style={{ marginTop: 18 }}>
          <p className="text-secondary" style={{ fontSize: 14, marginBottom: 0 }}>
            Nothing to hand over yet. Add areas and systems on the{' '}
            <Link href="/systems" className="link">
              Systems
            </Link>{' '}
            page and a pack becomes available for each of them.
          </p>
        </div>
      ) : (
        rows.map(({ subject, rollup: r, input, reading }) => (
          <div
            key={refKey(subject)}
            className="card"
            style={{ marginTop: 14, borderLeft: `4px solid ${TONE[reading.tone]}` }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <span className={subjectBadgeClass(subject.type)} style={{ fontSize: 10 }}>
                {subjectLabel(subject.type)}
              </span>
              <span style={{ fontWeight: 600, fontSize: 15.5 }}>
                {subject.code && <span className="mono">{subject.code}</span>}
                {subject.code && subject.name !== subject.code ? ' — ' : ''}
                {subject.name !== subject.code ? subject.name : ''}
              </span>
              <span className={BADGE[reading.tone]}>{reading.label}</span>
              {/* Not a bare percentage. The readiness figure counts resolved
                  checks and passed tests and nothing else, so printing "100%"
                  beside "NOT READY" reads as a contradiction when it is not
                  one — it says what it counts instead. */}
              <span className="text-secondary mono" style={{ fontSize: 11.5 }}>
                {r.readiness.requirementsMet}/{r.readiness.requirementsTotal} checks &amp; tests resolved
              </span>
            </div>

            <p className="text-secondary" style={{ fontSize: 13, margin: '0 0 10px' }}>
              {reading.detail}
            </p>

            <p className="text-secondary" style={{ fontSize: 12, margin: '0 0 12px' }}>
              {input.checks.total} check{input.checks.total === 1 ? '' : 's'} · {input.tests.total} test
              {input.tests.total === 1 ? '' : 's'} · {input.requirements.total} requirement
              {input.requirements.total === 1 ? '' : 's'} · {input.punch.openA + input.punch.openOther} open punch
              item{input.punch.openA + input.punch.openOther === 1 ? '' : 's'}
              {input.holdPoints.total > 0
                ? ` · ${input.holdPoints.total} hold point${input.holdPoints.total === 1 ? '' : 's'}, ${input.holdPoints.unreleased} unreleased`
                : ''}
            </p>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a href={`/dossier/${subject.type}/${subject.id}/pdf`} className="btn btn-primary btn-sm">
                Handover pack (PDF)
              </a>
              <a href={`/dossier/${subject.type}/${subject.id}/word`} className="btn btn-secondary btn-sm">
                Word
              </a>
              <a href={`/dossier/${subject.type}/${subject.id}/pdf?full=1`} className="btn btn-secondary btn-sm">
                Full pack, with closed punch items
              </a>
              <a
                href={`/dossier/${subject.type}/${subject.id}/pdf?full=1&photos=1`}
                className="btn btn-secondary btn-sm"
              >
                Full pack, with photographs
              </a>
              <Link href={`/assets/${subject.type}/${subject.id}`} className="btn btn-secondary btn-sm">
                Open the asset
              </Link>
            </div>
          </div>
        ))
      )}

      <p className="text-secondary" style={{ fontSize: 12.5, marginTop: 18 }}>
        The readings on this page are worked out from the checks, tests, punch items and requirements held against
        each system. The pack itself also reads the gates, the obligations and the documents cited, so a pack can
        report a gap this list does not show — generate it before you rely on the line above.
      </p>
    </>
  )
}
