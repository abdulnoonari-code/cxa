import Link from 'next/link'
import { cookies } from 'next/headers'
import { getCurrentProject } from '@/lib/project'
import { loadProjectConfig, recordsByLevel } from '@/data/project-config'
import { scopeWarnings, configNote, isUnconfigured, levelLabel, RESULT_COOKIE } from '@/lib/project-config'
import { LEVELS } from '@/lib/checklist'
import { levelTone, levelCode } from '@/lib/levels'
import { CATEGORIES } from '@/app/equipment/styles'
import { saveConfiguration } from './actions'

export const dynamic = 'force-dynamic'

/**
 * What this project actually commissions.
 *
 * Not the Setup screen. Setup answers "is the database wired up"; this
 * answers "what are we doing on this job" — which levels, which
 * disciplines, against which standards. They were the same screen for
 * three weeks and it was the wrong shape: one is a plumbing check a person
 * runs once, the other is a decision a commissioning manager makes and
 * revisits.
 */

const RESULT: Record<string, { cls: string; text: string }> = {
  saved: { cls: 'alert alert-success', text: 'Saved. Every screen that counts levels is now counting these ones.' },
  'no-column': {
    cls: 'alert alert-warning',
    text: 'NOT saved. This database does not have the projects.config column yet — run Step 37 on the Setup page and try again. Nothing was changed.',
  },
  failed: { cls: 'alert alert-danger', text: 'NOT saved. The database refused the change and nothing was altered.' },
}

export default async function ConfigurationPage() {
  const project = await getCurrentProject()
  const [{ config, columnMissing }, counts] = await Promise.all([
    loadProjectConfig(project?.id ?? null),
    recordsByLevel(project?.id ?? null),
  ])
  const warnings = scopeWarnings(config, counts)
  const jar = await cookies()
  const result = jar.get(RESULT_COOKIE)?.value
  const banner = result ? RESULT[result] : null

  return (
    <>
      <h1 className="page-title">Project Configuration</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — what this job actually commissions. The application
        ships with the full ladder because that is the full ladder; almost no real job runs all of it. A
        switchroom retrofit has no Factory Acceptance, the gear is already on site. Telling it so here stops every
        other screen scoring the job against rungs nobody is going to climb.
      </p>

      <div className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <Link href="/project" className="btn btn-secondary">
          ← Project Details
        </Link>
        <Link href="/levels" className="btn btn-secondary">
          Level Summary
        </Link>
        <Link href="/setup" className="btn btn-secondary">
          Setup &amp; diagnostics
        </Link>
      </div>

      {banner && (
        <div className={banner.cls} role="alert" style={{ marginBottom: 18 }}>
          {banner.text}
        </div>
      )}

      {columnMissing && (
        <div className="alert alert-warning" role="alert" style={{ marginBottom: 18 }}>
          This database does not have the <span className="mono">projects.config</span> column yet, so nothing can
          be saved here. Run <strong>Step 37 — Project configuration</strong> on the Setup page. Until then every
          level and every discipline is treated as in scope, which is the safe direction: nothing is hidden.
        </div>
      )}

      {!columnMissing && isUnconfigured(config) && (
        <div className="alert alert-info" role="alert" style={{ marginBottom: 18 }}>
          Nobody has configured this project yet, so it is running the full ladder — all five levels, every
          discipline. That is the right default and it may well be right for this job. It is worth two minutes to
          say so deliberately.
        </div>
      )}

      {/* The narrowing rule, made visible. An out-of-scope level with
          records in it is never quietly hidden. */}
      {warnings.map((w) => (
        <div key={w.level} className="alert alert-warning" role="alert" style={{ marginBottom: 12 }}>
          {w.message}
        </div>
      ))}

      <form action={saveConfiguration}>
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 className="section-title" style={{ marginBottom: 4 }}>
            Commissioning levels
          </h2>
          <p className="text-secondary" style={{ fontSize: 12.5, margin: '0 0 14px', maxWidth: '84ch' }}>
            The levels this project plans to do. Turning one off does <strong>not</strong> delete anything and does
            not hide anything that already exists — records at that level stay open, stay counted, and are flagged
            above. It only stops the level being counted as work this job plans to carry out.
          </p>
          <div className="cfg-levels">
            {LEVELS.map((l) => {
              const tone = levelTone(l.value)
              const on = config.levels.includes(l.value)
              const n = counts[l.value] ?? 0
              return (
                <label key={l.value} className={on ? 'cfg-level cfg-on' : 'cfg-level'}>
                  <input type="checkbox" name="levels" value={l.value} defaultChecked={on} />
                  <span
                    className="lv-chip"
                    style={{ background: tone.bg, borderColor: tone.border, color: tone.text }}
                  >
                    {levelCode(l.value)}
                  </span>
                  <span className="cfg-level-text">
                    <span className="cfg-level-name">{levelLabel(l.value).split('—')[1]?.trim() ?? l.label}</span>
                    <span className="cfg-level-note">
                      {n === 0 ? 'Nothing recorded at this level yet' : `${n} record${n === 1 ? '' : 's'} already at this level`}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
          <p className="text-secondary" style={{ fontSize: 12, margin: '12px 0 0' }}>
            {/* Not a validation message — a statement of what the form will
                do. Unchecking everything is a mistake worth naming before
                it is made, not after. */}
            At least one level has to be in scope. Untick them all and the full ladder is restored, because a
            project with nothing to commission is not what anybody meant.
          </p>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h2 className="section-title" style={{ marginBottom: 4 }}>
            Disciplines in scope
          </h2>
          <p className="text-secondary" style={{ fontSize: 12.5, margin: '0 0 14px', maxWidth: '84ch' }}>
            Tick none and every discipline is in scope, which is the default and is correct for most jobs. Tick
            some and the ones you did not tick are marked as outside this contract — again without deleting or
            hiding a single record.
          </p>
          <div className="cfg-chips">
            {CATEGORIES.map((c) => (
              <label
                key={c.value}
                className={config.disciplines.includes(c.value) ? 'cfg-chip cfg-on' : 'cfg-chip'}
              >
                <input
                  type="checkbox"
                  name="disciplines"
                  value={c.value}
                  defaultChecked={config.disciplines.includes(c.value)}
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h2 className="section-title" style={{ marginBottom: 4 }}>
            Standards and specifications
          </h2>
          <p className="text-secondary" style={{ fontSize: 12.5, margin: '0 0 12px', maxWidth: '84ch' }}>
            What this plant is commissioned <em>against</em>. One per line. This is the list somebody will ask for
            at handover, and the one that is always reconstructed from memory six months late.
          </p>
          <textarea
            name="standards"
            rows={6}
            className="input"
            defaultValue={config.standards}
            placeholder={
              'IEC 62271-200 — AC metal-enclosed switchgear\nIEEE C57.12.00 — Liquid-immersed transformers\nProject specification 4700-EL-SPC-001 Rev C\nClient commissioning procedure CP-14'
            }
          />
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h2 className="section-title" style={{ marginBottom: 4 }}>
            What &ldquo;ready&rdquo; means on this job
          </h2>
          <p className="text-secondary" style={{ fontSize: 12.5, margin: '0 0 12px', maxWidth: '84ch' }}>
            In the client&rsquo;s own words, not the application&rsquo;s. Every argument at handover is about this
            sentence, and it is almost never written down anywhere before it is needed.
          </p>
          <textarea
            name="ready_means"
            rows={4}
            className="input"
            defaultValue={config.readyMeans}
            placeholder={
              'Energised, all L4 functional tests witnessed by the client, no open critical or high punch items, O&M manuals accepted, operator training delivered.'
            }
          />
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
          <button type="submit" className="btn btn-primary" disabled={!project || columnMissing}>
            Save configuration
          </button>
          <span className="text-secondary" style={{ fontSize: 12.5 }}>
            {configNote(config)}
          </span>
        </div>
      </form>
    </>
  )
}
