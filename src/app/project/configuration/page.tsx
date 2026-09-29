import { requirePage } from '@/data/require-page'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { getCurrentProject } from '@/lib/project'
import { loadProjectConfig, recordsByLevel } from '@/data/project-config'
import { scopeWarnings, configNote, isUnconfigured, levelLabel, RESULT_COOKIE } from '@/lib/project-config'
import { LEVELS } from '@/lib/checklist'
import { levelTone, levelCode } from '@/lib/levels'
import { CATEGORIES } from '@/app/equipment/styles'
import { saveConfiguration } from './actions'
import { SETUP_SHEETS, ASSET_SHEET, HIERARCHY_LEVELS, HIERARCHY_COLUMNS } from '@/lib/setup-sheets'
import { loadAssetCounts } from '@/data/asset-counts'

// Every importer on the job, wired to the table below. They are all the
// same shape — one FormData carrying a `file` — which is the only reason
// gathering them onto one page is a table and not a rewrite.
//
// Each one redirects to its OWN screen when it finishes, which is exactly
// "then we look each page": you import here and land where the records are.
import { importHierarchy } from '../actions'
import { importTypes } from '@/app/equipment-types/actions'
import { importSystems } from '@/app/systems/actions'
import { importEquipment } from '@/app/equipment/actions'
import { importProjectChecklist } from '@/app/checklists/actions'
import { importItp } from '@/app/itp/actions'
import { importTests } from '@/app/tests/actions'
import { importObligations } from '@/app/obligations/actions'
import { importRoles } from '@/app/roles/actions'
import { importPunchList } from '@/app/issues/actions'

const SETUP_ACTIONS: Record<string, (formData: FormData) => Promise<void>> = {
  hierarchy: importHierarchy,
  'equipment-types': importTypes,
  systems: importSystems,
  equipment: importEquipment,
  checklists: importProjectChecklist,
  itp: importItp,
  tests: importTests,
  obligations: importObligations,
  roles: importRoles,
  issues: importPunchList,
}

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
  // See src/data/require-page.tsx: the layout does not stop this page
  // running, nor its output being sent. This is the door.
  const refused = await requirePage()
  if (refused) return refused

  const project = await getCurrentProject()
  const [{ config, columnMissing }, counts, assetCounts] = await Promise.all([
    loadProjectConfig(project?.id ?? null),
    recordsByLevel(project?.id ?? null),
    loadAssetCounts(project?.id ?? null),
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

      {/* ── THE PROJECT ASSET LIST. ONE FILE. ───────────────────────────
          "go configuration page you have the project asset list on one
          file." It was row 1 of a table of eleven, which put it on a
          level with the punch list. It is not one of eleven — it is THE
          file, the one that has to exist before any of the others mean
          anything, because every one of them attaches to tags this file
          creates.

          "but i donot look beautiful" — also true, and the cause was that
          I built it out of inline styles while the application already had
          `.io-file` and `.stat`. It is on the house system now, and the
          card that matters is lifted off the page instead of being one
          more grey box among grey boxes. */}
      <section className="setup-hero">
        {/* Title, then what it is, THEN the buttons on a line of their
            own. They were on the title line, and on any width where the
            title and the picker did not both fit the row broke in half
            and put Export above Import — which reads as two unrelated
            controls rather than one out-and-back-in. */}
        <h2 className="setup-hero-title">{ASSET_SHEET.title}</h2>

        <p className="text-secondary" style={{ fontSize: 13.5, margin: '6px 0 0', maxWidth: 660 }}>
          One file builds the whole tree. Export first — an empty project comes back with worked example rows to
          type over, so there is never a format to guess at. Importing the same file twice changes nothing.
        </p>

        <div className="io-bar setup-hero-io">
          <a href={ASSET_SHEET.exportHref!} className="btn btn-secondary">Export</a>
          <form action={SETUP_ACTIONS[ASSET_SHEET.key]}>
            <input type="file" name="file" accept=".xlsx" required className="io-file" disabled={!project} />
            <button type="submit" className="btn btn-primary" disabled={!project}>Import</button>
          </form>
        </div>

        {/* The six columns drawn as the sheet's own header row. A sentence
            with six bold words in it describes the file; this looks like
            it. Equipment Type is marked apart because it is a column of
            the sheet but not a level of the tree. */}
        <div className="setup-columns">
          {HIERARCHY_COLUMNS.map((c) => (
            <span key={c.name} className={c.level ? 'setup-column' : 'setup-column setup-column-aside'}>
              {c.name}
            </span>
          ))}
        </div>

        {/* What is in it right now — the answer to "did that import work?".
            Until this existed the question meant opening four screens and
            adding up, and the Export button on its own says nothing. */}
        <div className="setup-counts">
          {assetCounts.map((c) => (
            <div key={c.label} className={c.n === 0 ? 'setup-count setup-count-empty' : 'setup-count'}>
              <div className="setup-count-value">{c.n}</div>
              <div className="setup-count-label">{c.label}</div>
            </div>
          ))}
        </div>

        {assetCounts.every((c) => c.n === 0) && (
          <p className="io-note">
            Nothing in the asset list yet. Press <strong>Export</strong> — the file comes back with example rows
            showing the shape, and you type your job over them.
          </p>
        )}
      </section>

      {/* ── THE HIERARCHY, STATED ONCE ──────────────────────────────────
          "i want clear hirarchy". Under the file rather than in front of
          it: it explains the six columns the card above just named, and
          reference belongs beneath the thing it explains. */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title" style={{ marginTop: 0, marginBottom: 6 }}>The hierarchy</h2>
        <p className="text-secondary" style={{ fontSize: 13, margin: '0 0 12px' }}>
          Five levels. Only the middle three are columns in the sheet — the project is the job you are already
          inside, and the tag is what the checklists attach to.
        </p>
        <div>
          {HIERARCHY_LEVELS.map((l) => (
            <div key={l.label} style={{ marginLeft: l.depth * 20 }}>
              <div className={l.depth === 0 ? 'setup-level setup-level-root' : 'setup-level'}>
                <span className="setup-level-name">{l.label}</span>
                <span className="setup-level-example">{l.example}</span>
                <span className="setup-level-note">{l.note}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="io-note">
          <strong>Equipment Type</strong> is deliberately not one of these. It is a fact about a tag
          (&ldquo;this one is an MV Panel&rdquo;), which is how one checklist will reach every panel on the job.
        </p>
      </div>

      {/* ── EVERYTHING ELSE ────────────────────────────────────────────
          "like one page with setup all project and then we look each
          page." Every register grew its own screen and its own Export
          button, and setting up a job meant knowing which ten screens to
          visit and in what order. That knowledge existed nowhere except
          in my head.

          CARDS, NOT TABLE ROWS. Ten file pickers stacked in a table read
          as one long form somebody has to fill in today. Ten cards read
          as a list of jobs — you do one, and come back another day and do
          the next, which is how this work actually happens.

          The screens keep their own buttons. Nothing was taken away —
          this is a table of contents. */}
      <div className="card" style={{ marginBottom: 18 }}>
        <h2 className="section-title" style={{ marginTop: 0, marginBottom: 6 }}>The other sheets</h2>
        <p className="text-secondary" style={{ fontSize: 13, margin: '0 0 16px', maxWidth: 680 }}>
          Everything else on the job, in the order it is done — all of it attaching to tags, so do the asset list
          first. <strong>Export</strong> gives you your own data back, <strong>Blank</strong> an empty sheet with
          the right columns. After an import you land on the screen that owns that register, so you can see it
          went in.
        </p>

        <div className="setup-sheets">
          {SETUP_SHEETS.map((s) => (
            <div key={s.key} className="setup-sheet">
              <div className="setup-sheet-head">
                <span className="setup-sheet-step">{s.step}</span>
                <Link href={s.page} className="link setup-sheet-title">{s.title}</Link>
              </div>
              <p className="setup-sheet-builds">{s.builds}</p>
              <div className="setup-sheet-io">
                {s.exportHref && <a href={s.exportHref} className="btn btn-secondary btn-sm">Export</a>}
                {s.templateHref && <a href={s.templateHref} className="btn btn-secondary btn-sm">Blank</a>}
                {s.linkOnly ? (
                  <Link href={s.page} className="btn btn-secondary btn-sm">Upload files →</Link>
                ) : (
                  <form action={SETUP_ACTIONS[s.key]} style={{ display: 'flex', gap: 7, alignItems: 'center', flex: '1 1 150px', minWidth: 0 }}>
                    <input type="file" name="file" accept=".xlsx,.xls,.csv" required className="io-file" disabled={!project} />
                    <button type="submit" className="btn btn-primary btn-sm" disabled={!project}>Import</button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

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

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
          <button type="submit" className="btn btn-primary" disabled={!project || columnMissing}>
            Save configuration
          </button>
          <span className="text-secondary" style={{ fontSize: 12.5 }}>
            {configNote(config)}
          </span>
        </div>

        {/*
          The next step, for somebody who has just made this project and does
          not yet know what this application expects of them.

          These are submit buttons and not links, and that is the whole point
          of them. This card sits at the bottom of a long form; a link here
          would be an invitation to throw away everything typed above it, one
          click, no warning. A submit button saves the page and then moves on.
          And if the save fails, it does not move on — see nextAfterSave.
        */}
        {project && !columnMissing && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h2 className="section-title" style={{ marginBottom: 4 }}>
              Next: systems and equipment
            </h2>
            <p className="text-secondary" style={{ fontSize: 12.5, margin: '0 0 12px', maxWidth: '84ch' }}>
              This page settles what the job is measured against. Systems are the things being
              commissioned; equipment and tags are what sits inside them. Either button saves this
              page first, so nothing typed above is lost on the way.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button type="submit" name="next" value="systems" className="btn btn-secondary">
                Save and set up systems →
              </button>
              <button type="submit" name="next" value="equipment" className="btn btn-secondary">
                Save and set up equipment →
              </button>
            </div>
          </div>
        )}
      </form>
    </>
  )
}
