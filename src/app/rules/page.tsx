import Link from 'next/link'
import { getCurrentProject } from '@/lib/project'
import { loadRuleInputs } from '@/data/site-rules'
import { loadCheckLinkInputs } from '@/data/check-links'
import { checkLinkFindings } from '@/lib/check-links'
import {
  punchFindings,
  scheduleFindings,
  countBy,
  headline,
  SITE_RULES_NOTE,
  type SiteFinding,
} from '@/lib/site-rules'

export const dynamic = 'force-dynamic'

const TONE: Record<string, { color: string; label: string }> = {
  blocking: { color: 'var(--color-danger)', label: 'Would not stand up at handover' },
  warning: { color: 'var(--color-warning, #a35700)', label: 'Worth a look' },
  note: { color: 'var(--color-text-secondary)', label: 'Noted' },
}

const AREA: Record<string, string> = {
  checks: 'Checks and what they depend on',
  photos: 'Photographs',
  punch: 'Punch list',
  schedule: 'Dates and progress',
}

function Finding({ f }: { f: SiteFinding }) {
  const tone = TONE[f.level]
  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderLeft: `4px solid ${tone.color}`,
        borderRadius: 8,
        padding: 14,
        background: 'var(--color-surface)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: tone.color }}>{f.title}</div>
        <span className="badge" style={{ fontSize: 11 }}>
          {f.count} record{f.count === 1 ? '' : 's'}
        </span>
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 13 }}>{f.detail}</p>

      <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5 }}>
        {f.examples.map((e, i) => (
          <li key={i} className="text-secondary">
            {e}
          </li>
        ))}
        {f.count > f.examples.length && (
          <li className="text-secondary">and {f.count - f.examples.length} more</li>
        )}
      </ul>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 10, alignItems: 'center' }}>
        <span className="text-secondary mono" style={{ fontSize: 10.5 }}>
          rule: {f.rule}
        </span>
        <Link href={f.href} className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}>
          Go and look
        </Link>
      </div>
    </div>
  )
}

export default async function RulesPage() {
  const project = await getCurrentProject()
  const [inputs, checkInputs] = await Promise.all([
    loadRuleInputs(project?.id ?? null, project ?? null),
    loadCheckLinkInputs(project?.id ?? null),
  ])
  const today = new Date()

  const findings = [
    ...punchFindings(inputs.punch, inputs.checks, today),
    ...scheduleFindings(
      {
        project: inputs.project,
        milestones: inputs.milestones,
        tasks: inputs.tasks,
        obligations: inputs.obligations,
        checks: inputs.checks,
        openPunch: inputs.punch.filter((p) => p.status !== 'closed' && p.status !== 'verified').length,
      },
      today
    ),
    // The link findings come from a different shape — they are about pairs of
    // checks rather than about one register — so they are widened here rather
    // than bending either model to fit the other. Written out in full because
    // the first version padded the examples list with empty strings to make
    // the count come out right, which is the kind of thing that renders as a
    // row of blank bullet points six months later.
    ...checkLinkFindings(checkInputs).map(
      (f): SiteFinding => ({
        area: 'checks',
        level: f.level,
        rule: f.rule,
        title: f.title,
        detail: f.detail,
        count: f.count,
        examples: f.examples,
        href: '/checklists',
      })
    ),
  ]

  const n = countBy(findings)
  const order: SiteFinding['level'][] = ['blocking', 'warning', 'note']
  const areas: SiteFinding['area'][] = ['checks', 'photos', 'punch', 'schedule']

  return (
    <>
      <h1 className="page-title">Rule checks</h1>
      <p className="page-subtitle">
        Every check on this page is free. No model reads anything, no key is needed, and nothing is stored —
        the answer is worked out from the records each time you open it, so it is never out of date.
      </p>

      <div className="card">
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, color: n.blocking > 0 ? 'var(--color-danger)' : 'inherit' }}>
              {n.blocking}
            </div>
            <div className="text-secondary" style={{ fontSize: 11.5 }}>
              would not stand up at handover
            </div>
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{n.warning}</div>
            <div className="text-secondary" style={{ fontSize: 11.5 }}>
              worth a look
            </div>
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{n.note}</div>
            <div className="text-secondary" style={{ fontSize: 11.5 }}>
              noted
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{headline(findings)}</div>
            <div className="text-secondary" style={{ fontSize: 11.5 }}>
              across {inputs.punch.length} punch items, {inputs.checks.length} checks and{' '}
              {inputs.milestones.length + inputs.tasks.length + inputs.obligations.length} dated commitments
            </div>
          </div>
        </div>
      </div>

      {!inputs.photosReady && (
        <div className="alert alert-danger" style={{ marginTop: 16 }}>
          <strong>Photograph checks could not run.</strong> The photographs table is not there yet — run SQL
          part 21. Everything else on this page is unaffected.
        </div>
      )}

      {findings.length === 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="section-title">Every rule passed</h2>
          <p className="text-secondary" style={{ fontSize: 13, margin: 0 }}>
            Nothing to report. Every closed defect carries a photograph of the repair, every dated commitment is
            either met or still ahead of its date, and no level reads complete while work is open against it.
          </p>
        </div>
      )}

      {areas.map((area) => {
        const mine = order.flatMap((lvl) => findings.filter((f) => f.area === area && f.level === lvl))
        if (mine.length === 0) return null
        return (
          <div key={area} style={{ marginTop: 20 }}>
            <h2 className="section-title" style={{ marginBottom: 10 }}>
              {AREA[area]}
            </h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {mine.map((f) => (
                <Finding key={f.rule} f={f} />
              ))}
            </div>
          </div>
        )
      })}

      <p className="text-secondary" style={{ margin: '22px 0 0', fontSize: 11.5, fontStyle: 'italic' }}>
        {SITE_RULES_NOTE}
      </p>
    </>
  )
}
