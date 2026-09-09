import Link from 'next/link'
import { MANUAL_GROUPS, type ScreenEntry, type ManualGroup } from '@/lib/manual'

export const metadata = { title: 'Manual — CxSentinel' }

// The manual, inside the application.
//
// Public on purpose. A client who has been sent an invitation, or an engineer
// standing in a switchroom who has not signed in yet, should be able to read
// how the thing works without a password — so this route sits beside /about in
// the list of pages a signed-out visitor may see, in src/proxy.ts.
//
// The screen entries come from src/lib/manual.ts rather than being written
// here, so an assertion can walk the navigation and fail when a screen has
// been added to the application and not written down. The prose and the
// diagrams below are the parts that are genuinely one-off.
//
// The diagrams are hand-written inline SVG: no library, no images, no network.
// They use currentColor and the project's own CSS variables, so they follow the
// theme and print correctly rather than being a picture of one theme.

const STYLES = `
.mn-wrap { max-width: 880px; margin: 0 auto; }
.mn-toc { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12.5px; margin: 10px 0 4px; }
.mn-h2 { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 4px;
         padding-top: 18px; border-top: 1.5px solid var(--color-text); }
.mn-stand { color: var(--color-text-secondary); font-size: 14px; margin: 0 0 18px; max-width: 62ch; }
.mn-p { font-size: 13.5px; line-height: 1.62; margin: 0 0 12px; max-width: 66ch; }
.mn-entry { border-top: 1px solid var(--color-border); padding: 16px 0 14px; }
.mn-entry:first-of-type { border-top: 1px solid var(--color-text); }
.mn-entry-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 5px 11px; margin-bottom: 6px; }
.mn-entry-head h3 { font-size: 16px; font-weight: 700; margin: 0; letter-spacing: -0.01em; }
.mn-route { font-size: 11.5px; font-weight: 500; color: var(--color-primary);
            background: var(--color-primary-light); padding: 2px 7px; border-radius: 3px; white-space: nowrap; }
.mn-facts { display: grid; grid-template-columns: 92px minmax(0,1fr); gap: 4px 15px;
            max-width: 66ch; font-size: 13.5px; line-height: 1.55; }
.mn-facts dt { font-size: 9.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
               color: var(--color-text-secondary); padding-top: 4px; }
.mn-facts dd { margin: 0; }
.mn-fig { margin: 4px 0 22px; }
.mn-fig-scroll { overflow-x: auto; }
.mn-fig svg { display: block; width: 100%; max-width: 880px; height: auto;
              min-width: 600px; color: var(--color-text); overflow: visible; }
.mn-cap { font-size: 12px; line-height: 1.5; color: var(--color-text-secondary);
          margin-top: 9px; padding-left: 11px; border-left: 2px solid var(--color-border); max-width: 66ch; }
.mn-rung { display: grid; grid-template-columns: 54px minmax(0,1fr) 116px; gap: 16px;
           padding: 11px 0; border-top: 1px solid var(--color-border); align-items: start; }
.mn-rung:last-child { border-bottom: 1px solid var(--color-border); }
.mn-rung-code { font-size: 18px; font-weight: 700; color: var(--color-primary); }
.mn-rung-name { font-weight: 700; font-size: 14.5px; margin-bottom: 2px; }
.mn-rung p { margin: 0; font-size: 13px; color: var(--color-text-secondary); }
.mn-rung-owner { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
                 color: var(--color-text-secondary); padding-top: 3px; }
.mn-note { max-width: 66ch; border-left: 3px solid var(--color-primary); background: var(--color-primary-light);
           padding: 11px 15px; margin: 0 0 18px; font-size: 13.5px; line-height: 1.6; }
.mn-note b { display: block; font-size: 10.5px; font-weight: 700; letter-spacing: 0.09em;
             text-transform: uppercase; margin-bottom: 3px; color: var(--color-primary-dark); }
.mn-note.warn { border-left-color: var(--color-warning); background: var(--color-warning-bg); }
.mn-note.warn b { color: var(--color-warning); }
.mn-note.danger { border-left-color: var(--color-danger); background: var(--color-danger-bg); }
.mn-note.danger b { color: var(--color-danger); }
.mn-note p { margin: 0; }
.mn-note p + p { margin-top: 7px; }
.mn-steps { counter-reset: mns; list-style: none; padding-left: 0; margin: 0 0 18px; max-width: 66ch; }
.mn-steps > li { counter-increment: mns; position: relative; padding-left: 36px;
                 margin-bottom: 13px; font-size: 13.5px; line-height: 1.6; }
.mn-steps > li::before { content: counter(mns, decimal-leading-zero); position: absolute; left: 0; top: 1px;
                         font-size: 11.5px; font-weight: 700; color: var(--color-primary); }
.mn-ul { max-width: 66ch; font-size: 13.5px; line-height: 1.6; padding-left: 19px; margin: 0 0 16px; }
.mn-ul li { margin-bottom: 5px; }
.mn-table { min-width: 0; table-layout: auto; }
.d-box { fill: var(--color-surface, #fff); stroke: currentColor; stroke-width: 1.4; }
.d-lead { fill: var(--color-primary-light); stroke: var(--color-primary); stroke-width: 1.6; }
.d-stop { fill: var(--color-danger-bg); stroke: var(--color-danger); stroke-width: 1.6; }
.d-ok { fill: var(--color-success-bg); stroke: var(--color-success); stroke-width: 1.6; }
.d-ghost { fill: none; stroke: currentColor; stroke-width: 1.1; stroke-dasharray: 4 3; opacity: 0.55; }
.d-line { stroke: currentColor; stroke-width: 1.4; fill: none; }
.d-line-lead { stroke: var(--color-primary); stroke-width: 1.8; fill: none; }
.d-t { font-size: 12.5px; font-weight: 700; fill: currentColor; }
.d-t-sm { font-size: 10.5px; font-weight: 500; fill: var(--color-text-secondary); }
.d-t-lead { font-size: 12.5px; font-weight: 700; fill: var(--color-primary-dark); }
.d-t-stop { font-size: 11px; font-weight: 700; fill: var(--color-danger); }
.d-hdr { font-size: 10px; font-weight: 700; letter-spacing: 0.11em; fill: var(--color-text-secondary); }
.d-lbl { font-size: 10px; fill: var(--color-text-secondary); }
@media (max-width: 700px) {
  .mn-facts { grid-template-columns: 1fr; gap: 1px; }
  .mn-facts dt { padding-top: 7px; }
  .mn-rung { grid-template-columns: 44px minmax(0,1fr); }
  .mn-rung-owner { grid-column: 2; padding-top: 0; }
}
@media print {
  .mn-h2 { break-before: page; break-after: avoid; }
  .mn-entry, .mn-fig, .mn-note, .mn-rung { break-inside: avoid; }
  .mn-fig svg { min-width: 0; }
  .mn-fig-scroll { overflow: visible; }
}
`

const LEVELS: [string, string, string, string][] = [
  ['L1', 'Factory Acceptance (FAT)', 'Proved at the works, before it ships. What the vendor tested before delivery.', 'A device'],
  ['L2', 'Installation Verification (IV)', 'What arrived was installed as designed, in the right place, the right way up, correctly terminated.', 'A device'],
  ['L3', 'Pre-functional / Static', 'The static checks that make it safe to energise and drive.', 'A device'],
  ['L4', 'Functional Performance Test (FPT)', 'The assembly works on its own — interlocks, sequences, changeover, protection operation.', 'A system'],
  ['L5', 'Integrated Systems Test (IST)', 'The assembly works with the systems around it — the full black-building, the load bank, the transfer.', 'A system'],
]

const ROLE_ROWS: [string, boolean, boolean, boolean, boolean, boolean][] = [
  ['Super Admin', true, true, true, true, true],
  ['Project Admin', true, true, true, true, true],
  ['Project Manager', true, true, true, true, true],
  ['Commissioning Manager', true, true, true, true, true],
  ['Discipline Lead', true, true, true, false, false],
  ['QA / QC', true, false, true, true, false],
  ['Engineer', true, true, false, false, false],
  ['Technician', true, true, false, false, false],
  ['HSE', true, false, true, false, false],
  ['Consultant', true, false, true, false, false],
  ['Client / Owner', true, false, false, true, false],
  ['Viewer', true, false, false, false, false],
]

const SQL_STEPS: [string, string, string][] = [
  ['part 20', 'Inspection & Test Plan', 'The ITP renders with nobody holding anything'],
  ['part 21', 'Punch photographs', 'No photograph will save, on punch items or anywhere'],
  ['part 22', 'AI reading of defects', 'No assessment panel on a punch item'],
  ['part 25', 'AI reading of obligations and documents', 'No assessment panel on either'],
  ['part 26', 'Document rule checks and standards', 'The free checks over uploaded documents cannot record what they found'],
  ['part 28', 'Test scripts — structure', 'Sections and answer types are lost; a re-imported script doubles the register'],
  ['part 29', 'Test scripts — number, evidence, links', 'Serial numbers, attachments and Links to are dropped'],
  ['part 30', 'Check library', 'Definitions cannot be created'],
  ['part 31 / 32', 'Floors, buildings, critical flag', 'Those columns are silently dropped from the register'],
  ['part 33', 'Building and floor on a system', 'A systems import cannot save either'],
  ['part 34', 'Components', 'A tag list with Part of tag rows imports nothing at all'],
  ['part 35', 'Equipment type catalogue', 'The catalogue screen cannot be used'],
  ['part 36', 'A level on a task', 'Tasks appear against no level on the Level Summary'],
  ['part 37', 'Project configuration', 'Configuration cannot be saved'],
  ['part 38', 'The file store is closed', 'Every photograph and document can be opened by anybody holding the link'],
]

const PROMISES: [string, string][] = [
  ['It never invents a tag', 'A check recorded against equipment that was never installed is worse than a check that was never imported.'],
  ['An import is all-or-nothing', 'A half-imported file leaves you unable to tell which half. Nothing is saved, and every bad row is named in the audit trail.'],
  ['A blank cell means “I did not say”', 'Never “clear this”. Re-importing a file with columns you left empty does not wipe what is already recorded.'],
  ['Blank is never merged with N/A', '“Not applicable” is a decision somebody can be asked to defend. “Not yet done” is not.'],
  ['There is no percentage of nothing', 'Nought out of nought shows a dash, not 0 per cent and not 100 per cent.'],
  ['L1–L3 and L4–L5 are never summed', 'It would let a switchboard read nearly finished on factory tests alone.'],
  ['Work at the wrong scope is reported, never moved', 'Moving somebody’s signed record without asking is worse than the mistake.'],
  ['Narrowing scope hides nothing', 'Out-of-scope records stay, and stay counted. They are marked, not deleted.'],
  ['A gate is an assessment, not an authorisation', 'It reports whether the records support proceeding. Releasing anybody is a human act.'],
  ['Signatures and notices cannot be altered', 'The database itself refuses it. On a witness point, the notice is the proof the client was invited.'],
  ['Nothing is stored as a percentage', 'Every figure is recomputed from the records, so no number can outlive the record it came from.'],
  ['A key is never shown, logged or stored', 'Not on a screen, not in the audit trail, not in a URL.'],
]

const TROUBLE: [string, React.ReactNode][] = [
  ['A column you filled in is not there', <>A database step has not been run. Open <Link className="link" href="/setup">Setup</Link> — it names the exact file.</>],
  ['An import said it refused the file', <>Open <Link className="link" href="/audit">the audit trail</Link>. Every bad row is listed with its reason and its row number in your own sheet.</>],
  ['The figures on Checklists disagree with the list', <>They are meant to. The figures are the whole project; the list is the twenty-five tags on this page.</>],
  ['A level reads 100 per cent but something feels wrong', <>Look at the Evidence column on <Link className="link" href="/plan">Plan &amp; Progress</Link>, and at the No evidence badges on the level page.</>],
  ['A test will not let you approve it', <>Its instrument is out of calibration or was never recorded. Fix it under <Link className="link" href="/instruments">Test Instruments</Link>.</>],
  ['A handover pack reports gaps the chooser did not', <>Expected. The chooser skips queries to stay fast. The pack is the accurate one.</>],
  ['A red banner says everybody has full access', <>The project has no team members. Add yourself under <Link className="link" href="/team">Project Team</Link> as Project Admin.</>],
  ['Tasks or issues appear against no level', <>They carry no level. <Link className="link" href="/levels">Level Summary</Link> counts them in their own row so they are not invisible.</>],
]

function Fig({ label, caption, children }: { label: string; caption: string; children: React.ReactNode }) {
  return (
    <figure className="mn-fig">
      <div className="mn-fig-scroll">
        <svg viewBox={label} role="img" aria-label={caption}>
          {children}
        </svg>
      </div>
      <figcaption className="mn-cap">{caption}</figcaption>
    </figure>
  )
}

function Arrow({ id, color = 'currentColor' }: { id: string; color?: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 8" refX="9" refY="4" markerWidth="8" markerHeight="7" orient="auto">
        <polygon points="0,0 10,4 0,8" fill={color} />
      </marker>
    </defs>
  )
}

function Entry({ s }: { s: ScreenEntry }) {
  return (
    <div className="mn-entry">
      <div className="mn-entry-head">
        <h3>{s.title}</h3>
        <Link href={s.href} className="mn-route mono">
          {s.href}
        </Link>
      </div>
      {s.lede ? <p className="mn-p">{s.lede}</p> : null}
      <dl className="mn-facts">
        {s.facts.map((f) => (
          <div key={f.label + f.text} style={{ display: 'contents' }}>
            <dt>{f.label}</dt>
            <dd>{f.text}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function Group({ g, extra }: { g: ManualGroup; extra?: React.ReactNode }) {
  return (
    <section id={g.id} style={{ marginTop: 40, scrollMarginTop: 16 }}>
      <h2 className="mn-h2">{g.title}</h2>
      <p className="mn-stand">{g.standfirst}</p>
      {extra}
      {g.screens.map((s) => (
        <Entry key={s.href} s={s} />
      ))}
    </section>
  )
}

export default function ManualPage() {
  const byId = new Map(MANUAL_GROUPS.map((g) => [g.id, g]))

  return (
    <div className="mn-wrap">
      <style>{STYLES}</style>

      <div className="card">
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          Site Manual
        </h1>
        <p className="text-secondary" style={{ fontSize: 14, margin: '0 0 4px', maxWidth: '62ch' }}>
          How to run a commissioning campaign in CxSentinel — every screen, every spreadsheet, and every
          rule the application applies to your records without being asked.
        </p>
        <div className="mn-toc">
          <a className="link" href="#idea">The one idea</a>
          <a className="link" href="#first">Setting up a project</a>
          <a className="link" href="#levels">The five levels</a>
          <a className="link" href="#roles">Who can do what</a>
          {MANUAL_GROUPS.map((g) => (
            <a className="link" key={g.id} href={`#${g.id}`}>{g.title}</a>
          ))}
          <a className="link" href="#sheets">Spreadsheets</a>
          <a className="link" href="#sql">Database steps</a>
          <a className="link" href="#pack">Handover pack</a>
          <a className="link" href="#ai">Where AI is used</a>
          <a className="link" href="#promises">Rules it will not break</a>
          <a className="link" href="#trouble">When something looks wrong</a>
        </div>
      </div>

      {/* ── The one idea ──────────────────────────────────────────── */}
      <section id="idea" style={{ marginTop: 34, scrollMarginTop: 16 }}>
        <h2 className="mn-h2">The one idea</h2>
        <p className="mn-stand">Everything else in this manual follows from this paragraph.</p>

        <p className="mn-p">
          CxSentinel does not ask you how complete the job is. It holds the records — the equipment
          register, the checks at every level, the test readings, the punch list, the signatures, the
          documents — and it <strong>works out</strong> completion from those records every time a screen
          opens. Nothing is stored as a percentage. Nothing carries forward from yesterday&rsquo;s number.
        </p>
        <p className="mn-p">
          That has one consequence worth understanding before you start: the application will contradict
          you. If a system reads ninety per cent complete but eleven of its checks were marked Pass with no
          attachment, a screen will say so. If a defect was closed with no photograph of the repair, a
          screen will say so. If a level reads finished because nothing was ever recorded against it, a
          screen will say that too.
        </p>

        <div className="mn-note">
          <b>Why this matters commercially</b>
          <p>
            Those are the findings that surface at handover, when they are expensive and when somebody else
            finds them. Finding them yourself, months earlier, is the whole product. A pack that hides what
            is missing gets found out. One that names it gets negotiated.
          </p>
        </div>

        <p className="mn-p">
          A second consequence: <strong>everything lives inside a project.</strong> You choose a project and
          every screen from then on shows that project only. You see the projects your email address has
          been given access to, and nothing else.
        </p>

        <Fig
          label="0 0 900 452"
          caption="The whole application in one picture. You import the registers on the left and record work against them in the middle; everything on the right is recomputed from that work each time a screen opens. The red band is the rule that makes the record defensible — no assessment ever writes a figure back into the records it read, so no number can outlive the evidence behind it."
        >
          <Arrow id="mA" />
          <Arrow id="mAp" color="var(--color-primary)" />

          <text className="d-hdr" x="10" y="16">1 · YOU IMPORT</text>
          <text className="d-hdr" x="306" y="16">2 · YOU RECORD ON SITE</text>
          <text className="d-hdr" x="618" y="16">3 · IT WORKS OUT, LIVE</text>

          <rect className="d-box" x="10" y="32" width="196" height="42" rx="4" />
          <text className="d-t" x="24" y="58">Systems</text>
          <rect className="d-box" x="10" y="86" width="196" height="42" rx="4" />
          <text className="d-t" x="24" y="112">Equipment &amp; tags</text>
          <rect className="d-box" x="10" y="140" width="196" height="42" rx="4" />
          <text className="d-t" x="24" y="160">Checks, scripts, tests</text>
          <text className="d-t-sm" x="24" y="175">the wording, not the answers</text>
          <rect className="d-box" x="10" y="194" width="196" height="42" rx="4" />
          <text className="d-t" x="24" y="214">Requirements</text>
          <text className="d-t-sm" x="24" y="229">and contract obligations</text>

          <line className="d-line" x1="214" y1="134" x2="296" y2="134" markerEnd="url(#mA)" />
          <text className="d-lbl" x="218" y="126">attach to</text>

          <rect className="d-box" x="306" y="32" width="196" height="42" rx="4" />
          <text className="d-t" x="320" y="52">Check results</text>
          <text className="d-t-sm" x="320" y="67">pass · fail · N/A · pending</text>
          <rect className="d-box" x="306" y="86" width="196" height="42" rx="4" />
          <text className="d-t" x="320" y="106">Test readings</text>
          <text className="d-t-sm" x="320" y="121">verdict derived, not typed</text>
          <rect className="d-box" x="306" y="140" width="196" height="42" rx="4" />
          <text className="d-t" x="320" y="166">Punch items</text>
          <rect className="d-box" x="306" y="194" width="196" height="42" rx="4" />
          <text className="d-t" x="320" y="214">Evidence &amp; signatures</text>
          <text className="d-t-sm" x="320" y="229">signatures cannot be altered</text>

          <line className="d-line-lead" x1="510" y1="134" x2="608" y2="134" markerEnd="url(#mAp)" />
          <text className="d-lbl" x="514" y="126">read live</text>

          <rect className="d-lead" x="618" y="32" width="196" height="38" rx="4" />
          <text className="d-t-lead" x="632" y="56">Readiness</text>
          <rect className="d-lead" x="618" y="78" width="196" height="38" rx="4" />
          <text className="d-t-lead" x="632" y="102">Rule checks</text>
          <rect className="d-lead" x="618" y="124" width="196" height="38" rx="4" />
          <text className="d-t-lead" x="632" y="148">Validity review</text>
          <rect className="d-lead" x="618" y="170" width="196" height="38" rx="4" />
          <text className="d-t-lead" x="632" y="194">Gates &amp; level summary</text>
          <rect className="d-lead" x="618" y="216" width="196" height="38" rx="4" />
          <text className="d-t-lead" x="632" y="240">Dashboard &amp; reports</text>

          <path className="d-ghost" d="M 716 262 L 716 300 L 690 300" />
          <rect className="d-stop" x="442" y="286" width="244" height="28" rx="14" />
          <text className="d-t-stop" x="458" y="304">nothing is ever written back</text>
          <line x1="430" y1="286" x2="456" y2="314" stroke="var(--color-danger)" strokeWidth="2" />
          <path className="d-ghost" d="M 438 300 L 404 300 L 404 246" />

          <rect className="d-ok" x="306" y="356" width="508" height="56" rx="5" />
          <text className="d-t" x="326" y="382" fill="var(--color-success)">Handover pack</text>
          <text className="d-t-sm" x="326" y="399">nine sections, generated at the moment you press the button</text>
          <path className="d-line" d="M 370 240 L 370 350" markerEnd="url(#mA)" />
          <path className="d-line" d="M 770 262 L 770 350" markerEnd="url(#mA)" />

          <text className="d-hdr" x="10" y="380">EVERY CHANGE</text>
          <rect className="d-box" x="10" y="390" width="196" height="34" rx="4" />
          <text className="d-t" x="24" y="412">Audit trail</text>
          <path className="d-ghost" d="M 306 400 L 216 400" markerEnd="url(#mA)" />
        </Fig>
      </section>

      {/* ── Setting up ────────────────────────────────────────────── */}
      <section id="first" style={{ marginTop: 40, scrollMarginTop: 16 }}>
        <h2 className="mn-h2">Setting up a project</h2>
        <p className="mn-stand">
          The order below is not a suggestion. Each step needs the one before it — a check has to belong to a
          tag, and a tag has to belong to a system.
        </p>

        <ol className="mn-steps">
          <li>
            <strong>Create the project.</strong> <Link className="link" href="/projects">All Projects</Link> →
            Add or remove a project → name, client, location, start date, target date. Then Open project.
            That choice is remembered in your browser until you change it.
          </li>
          <li>
            <strong>Put the team on it.</strong> <Link className="link" href="/team">Project Team</Link> → Add
            to project. Until at least one person is on a project team,{' '}
            <strong>everybody who can sign in has full access to it</strong> and a red banner says so. Adding
            yourself as Project Admin is the first thing to do on a new project.
          </li>
          <li>
            <strong>Say what the job actually commissions.</strong>{' '}
            <Link className="link" href="/project/configuration">Configuration</Link> — which of the five
            levels apply, which disciplines are in scope, which standards you are working to. A project left
            unconfigured runs the full L1–L5 ladder, which is a safe default but rarely the truth.
          </li>
          <li>
            <strong>Import the systems.</strong> <Link className="link" href="/systems">Systems</Link> →
            Download a blank template, fill it in, then Import. Only System ID is required, and it must match
            exactly the system code your test scripts use — that string is what everything else joins on.
          </li>
          <li>
            <strong>Import the equipment types</strong> (optional but worth it).{' '}
            <Link className="link" href="/equipment-types">Equipment Types</Link> — forty identical breakers
            are forty tags and one type. The catalogue holds the make, model and rating once.
          </li>
          <li>
            <strong>Import the tag list.</strong> <Link className="link" href="/equipment">Equipment &amp;
            Tags</Link> → Download a blank template → fill → Import. The asset tree builds itself from this
            one sheet.
          </li>
          <li>
            <strong>Check the register before you build on it.</strong>{' '}
            <Link className="link" href="/assets/report">Asset Report</Link> runs eleven checks over what you
            just imported. Findings marked <em>Will make another screen wrong</em> are worth fixing now,
            because every count downstream inherits them.
          </li>
          <li>
            <strong>Bring in the checks and the test scripts.</strong>{' '}
            <Link className="link" href="/checklists">Checklists</Link> takes two different shapes of file: a
            flat checklist, and a test script laid out the way a procedure is actually written.
          </li>
          <li>
            <strong>Set up the instruments.</strong>{' '}
            <Link className="link" href="/instruments">Test Instruments</Link> — an out-of-calibration
            instrument blocks acceptance of any reading attributed to it.
          </li>
          <li>
            <strong>Agree who holds the inspection points.</strong>{' '}
            <Link className="link" href="/itp">Inspection &amp; Test Plan</Link> — download the plan, mark it
            up with your client, import it back. Until you do, everything defaults to Surveillance and
            nothing waits for anybody.
          </li>
        </ol>

        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '26px 0 8px' }}>What every screen looks like</h3>
        <p className="mn-p">
          Once you are inside a project, every register screen is built the same way. Learning these parts
          once saves reading the next forty-five entries twice.
        </p>

        <Fig
          label="0 0 900 300"
          caption="Every register screen has the same parts. The one that catches people out is the figures: they always describe the whole project, while the list beneath them is only the page you are looking at."
        >
          <Arrow id="mB" />

          <rect className="d-box" x="10" y="20" width="520" height="264" rx="6" />
          <rect className="d-lead" x="10" y="20" width="120" height="264" rx="6" />
          <text className="d-t-lead" x="22" y="42">Rail</text>
          {[58, 76, 94, 112, 136, 154, 178].map((y, i) => (
            <line key={y} className="d-line" x1={i === 2 || i === 3 ? 30 : 22} y1={y} x2={110 - (i % 3) * 8} y2={y} opacity="0.35" />
          ))}

          <line className="d-line" x1="130" y1="60" x2="530" y2="60" />
          <text className="d-t" x="146" y="44">Screen name</text>
          <text className="d-t-sm" x="146" y="55">one line saying what this register is</text>

          <rect className="d-box" x="146" y="74" width="88" height="42" rx="4" />
          <text className="d-t-sm" x="157" y="91">Open</text>
          <text className="d-t" x="157" y="108">124</text>
          <rect className="d-box" x="244" y="74" width="88" height="42" rx="4" />
          <text className="d-t-sm" x="255" y="91">Failed</text>
          <text className="d-t" x="255" y="108">7</text>
          <rect className="d-box" x="342" y="74" width="88" height="42" rx="4" />
          <text className="d-t-sm" x="353" y="91">Evidence</text>
          <text className="d-t" x="353" y="108">61 %</text>
          <rect className="d-stop" x="440" y="74" width="88" height="42" rx="4" />
          <text className="d-t-sm" x="451" y="91" fill="var(--color-danger)">Cat A open</text>
          <text className="d-t" x="451" y="108" fill="var(--color-danger)">3</text>

          <rect className="d-box" x="146" y="128" width="382" height="28" rx="4" />
          <text className="d-t-sm" x="158" y="146">Import · Export · Template · PDF · Filter</text>

          <line className="d-line" x1="146" y1="178" x2="528" y2="178" strokeWidth="1.6" />
          <text className="d-t-sm" x="146" y="173">TAG</text>
          <text className="d-t-sm" x="268" y="173">CHECK</text>
          <text className="d-t-sm" x="430" y="173">RESULT</text>
          {[200, 224, 248, 272].map((y) => (
            <line key={y} className="d-line" x1="146" y1={y} x2="528" y2={y} opacity="0.3" />
          ))}
          <text className="d-t-sm" x="146" y="195">SUDB-MV-SWGR-01</text>
          <text className="d-t-sm" x="268" y="195">Insulation resistance</text>
          <text className="d-t-sm" x="430" y="195" fill="var(--color-success)">Pass</text>
          <text className="d-t-sm" x="146" y="219">SUDB-MV-SWGR-01</text>
          <text className="d-t-sm" x="268" y="219">Protection settings applied</text>
          <text className="d-t-sm" x="430" y="219" fill="var(--color-danger)">Fail</text>
          <text className="d-t-sm" x="146" y="243">SUDB-MV-SWGR-02</text>
          <text className="d-t-sm" x="268" y="243">Earthing continuity</text>
          <text className="d-t-sm" x="430" y="243">Pending</text>
          <text className="d-t-sm" x="146" y="267">example rows</text>

          <line className="d-line" x1="640" y1="38" x2="560" y2="38" markerEnd="url(#mB)" />
          <text className="d-t" x="652" y="34">Navigation rail</text>
          <text className="d-t-sm" x="652" y="50">Eight groups. Sub-pages appear only</text>
          <text className="d-t-sm" x="652" y="64">when you are in that part of the app.</text>

          <line className="d-line" x1="640" y1="96" x2="560" y2="96" markerEnd="url(#mB)" />
          <text className="d-t" x="652" y="92">The figures</text>
          <text className="d-t-sm" x="652" y="108">Always the whole project — even when</text>
          <text className="d-t-sm" x="652" y="122">the list below is one page of it.</text>

          <line className="d-line" x1="640" y1="146" x2="560" y2="146" markerEnd="url(#mB)" />
          <text className="d-t" x="652" y="142">The action bar</text>
          <text className="d-t-sm" x="652" y="158">Import, export, blank template and</text>
          <text className="d-t-sm" x="652" y="172">the document exports live here.</text>

          <line className="d-line" x1="640" y1="222" x2="560" y2="222" markerEnd="url(#mB)" />
          <text className="d-t" x="652" y="218">The register</text>
          <text className="d-t-sm" x="652" y="234">The records themselves, edited in place</text>
          <text className="d-t-sm" x="652" y="248">where your role allows it.</text>
        </Fig>

        <div className="mn-note warn">
          <b>Before any of it</b>
          <p>
            Open <Link className="link" href="/setup">Setup</Link> once and confirm every database step reads
            In place. That screen exists to answer one question — what still needs running — and a step that
            has not been run does not fail loudly. It fails as a missing column and a screen that quietly
            shows less than it should.
          </p>
        </div>
      </section>

      {/* ── Levels ────────────────────────────────────────────────── */}
      <section id="levels" style={{ marginTop: 40, scrollMarginTop: 16 }}>
        <h2 className="mn-h2">The five levels</h2>
        <p className="mn-stand">
          The ladder every commissioning programme climbs, and the single most important structural rule in
          the application.
        </p>

        <div style={{ marginBottom: 20 }}>
          {LEVELS.map(([code, name, what, owner]) => (
            <div className="mn-rung" key={code}>
              <div className="mn-rung-code mono">{code}</div>
              <div>
                <div className="mn-rung-name">{name}</div>
                <p>{what}</p>
              </div>
              <div className="mn-rung-owner">{owner}</div>
            </div>
          ))}
        </div>

        <Fig
          label="0 0 900 300"
          caption="The dashed line is the most important boundary in the application. A check raised at L1–L3 attaches to a device; a check raised at L4–L5 attaches to a system. Work recorded on the wrong side is reported rather than silently moved, and no screen anywhere produces a single figure spanning both halves."
        >
          <Arrow id="mC" />
          <text className="d-hdr" x="10" y="16">RECORDED AGAINST A DEVICE</text>
          <text className="d-hdr" x="514" y="16">RECORDED AGAINST A SYSTEM</text>

          <rect className="d-box" x="10" y="32" width="144" height="70" rx="4" />
          <text className="d-t" x="24" y="56" fill="var(--color-primary)">L1</text>
          <text className="d-t" x="24" y="76">Factory</text>
          <text className="d-t-sm" x="24" y="92">proved at the works</text>

          <rect className="d-box" x="168" y="32" width="144" height="70" rx="4" />
          <text className="d-t" x="182" y="56" fill="var(--color-primary)">L2</text>
          <text className="d-t" x="182" y="76">Installation</text>
          <text className="d-t-sm" x="182" y="92">installed as designed</text>

          <rect className="d-box" x="326" y="32" width="144" height="70" rx="4" />
          <text className="d-t" x="340" y="56" fill="var(--color-primary)">L3</text>
          <text className="d-t" x="340" y="76">Pre-functional</text>
          <text className="d-t-sm" x="340" y="92">safe to energise</text>

          <rect className="d-box" x="514" y="32" width="176" height="70" rx="4" />
          <text className="d-t" x="528" y="56" fill="var(--color-primary)">L4</text>
          <text className="d-t" x="528" y="76">Functional</text>
          <text className="d-t-sm" x="528" y="92">it works on its own</text>

          <rect className="d-box" x="704" y="32" width="176" height="70" rx="4" />
          <text className="d-t" x="718" y="56" fill="var(--color-primary)">L5</text>
          <text className="d-t" x="718" y="76">Integrated</text>
          <text className="d-t-sm" x="718" y="92">it works with the rest</text>

          <line className="d-line" x1="156" y1="67" x2="166" y2="67" markerEnd="url(#mC)" />
          <line className="d-line" x1="314" y1="67" x2="324" y2="67" markerEnd="url(#mC)" />
          <line className="d-line" x1="692" y1="67" x2="702" y2="67" markerEnd="url(#mC)" />

          <line x1="493" y1="14" x2="493" y2="196" stroke="var(--color-danger)" strokeWidth="2" strokeDasharray="7 4" />
          <rect className="d-stop" x="380" y="122" width="226" height="52" rx="5" />
          <text className="d-t-stop" x="398" y="144">The two halves are</text>
          <text className="d-t-stop" x="398" y="161">never added together</text>

          <line className="d-line" x1="243" y1="106" x2="243" y2="212" markerEnd="url(#mC)" />
          <line className="d-line" x1="700" y1="106" x2="700" y2="212" markerEnd="url(#mC)" />

          <rect className="d-box" x="10" y="218" width="460" height="62" rx="4" />
          <text className="d-t" x="26" y="242">A tag, or a part inside a tag</text>
          <text className="d-t-sm" x="26" y="260">SUDB-MV-SWGR-01 · the CT inside it · the relay inside it</text>

          <rect className="d-box" x="514" y="218" width="366" height="62" rx="4" />
          <text className="d-t" x="530" y="242">A system, or a subsystem</text>
          <text className="d-t-sm" x="530" y="260">SUDB MV SWGR · a bay within it</text>
        </Fig>

        <div className="mn-note danger">
          <b>The two halves are never added together</b>
          <p>
            One figure across all five would let a switchboard read most of the way finished on the strength
            of factory tests alone, with no functional testing carried out at all. The application refuses to
            produce that number anywhere.
          </p>
        </div>

        <p className="mn-p">
          Every check carries one of four results: Pass, Fail, N/A or Pending. Blank means nobody has done
          it, and blank is <strong>never</strong> merged with N/A — &ldquo;not applicable&rdquo; is a decision
          somebody made and can be asked to defend; &ldquo;not yet done&rdquo; is not.
        </p>
      </section>

      {/* ── Roles ─────────────────────────────────────────────────── */}
      <section id="roles" style={{ marginTop: 40, scrollMarginTop: 16 }}>
        <h2 className="mn-h2">Who can do what</h2>
        <p className="mn-stand">Twelve roles, five capabilities.</p>

        <div className="table-wrap">
          <table className="table mn-table" style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th>Role</th>
                <th>View</th>
                <th>Record</th>
                <th>Review</th>
                <th>Approve</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {ROLE_ROWS.map(([label, ...caps]) => (
                <tr key={label}>
                  <td style={{ fontWeight: 600 }}>{label}</td>
                  {caps.map((yes, i) => (
                    <td key={i} style={{ color: yes ? 'var(--color-success)' : 'var(--color-text-secondary)', fontWeight: yes ? 700 : 400 }}>
                      {yes ? '✓' : '·'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mn-p" style={{ marginTop: 14 }}>
          <strong>Client / Owner is deliberately not a superset.</strong> A client may look and may approve.
          A client may not record a test result or edit a register — which is the correct arrangement on a
          contract, and it is why the role is not simply &ldquo;Viewer plus&rdquo;.
        </p>

        <Fig
          label="0 0 900 268"
          caption="The two gates are independent, and the first has no exception: a file, an export and a report are checked exactly as strictly as a screen. The state to watch for is a project with nobody on its team — then the first gate stands open and everybody who can sign in is treated as Project Admin, which is why a red banner says so until you add somebody."
        >
          <Arrow id="mD" />
          <Arrow id="mDd" color="var(--color-danger)" />

          <rect className="d-box" x="10" y="86" width="136" height="52" rx="4" />
          <text className="d-t" x="24" y="110">You sign in</text>
          <text className="d-t-sm" x="24" y="126">email &amp; password</text>
          <line className="d-line" x1="150" y1="112" x2="198" y2="112" markerEnd="url(#mD)" />

          <text className="d-hdr" x="206" y="42">GATE 1 · MAY YOU BE HERE AT ALL</text>
          <rect className="d-lead" x="206" y="54" width="248" height="116" rx="5" />
          <text className="d-t-lead" x="224" y="80">Is your address either</text>
          <text className="d-t-sm" x="224" y="102">· in the owner list on the server</text>
          <text className="d-t-sm" x="224" y="122">· or on this project&rsquo;s team</text>
          <text className="d-t-sm" x="224" y="150">Checked on every single request</text>

          <line className="d-line" x1="458" y1="112" x2="506" y2="112" markerEnd="url(#mD)" />
          <text className="d-lbl" x="462" y="105">yes</text>

          <line className="d-line" x1="330" y1="174" x2="330" y2="216" markerEnd="url(#mDd)" stroke="var(--color-danger)" />
          <text className="d-lbl" x="336" y="196" fill="var(--color-danger)">no</text>
          <rect className="d-stop" x="206" y="220" width="248" height="34" rx="4" />
          <text className="d-t-stop" x="224" y="242">Refused. No screen, no file, no export.</text>

          <text className="d-hdr" x="514" y="42">GATE 2 · WHAT MAY YOU DO</text>
          <rect className="d-lead" x="514" y="54" width="366" height="116" rx="5" />
          <text className="d-t-lead" x="532" y="78">Your role on this project</text>
          <rect className="d-box" x="532" y="90" width="60" height="26" rx="3" />
          <text className="d-t-sm" x="544" y="107">view</text>
          <rect className="d-box" x="600" y="90" width="68" height="26" rx="3" />
          <text className="d-t-sm" x="612" y="107">record</text>
          <rect className="d-box" x="676" y="90" width="68" height="26" rx="3" />
          <text className="d-t-sm" x="688" y="107">review</text>
          <rect className="d-box" x="752" y="90" width="74" height="26" rx="3" />
          <text className="d-t-sm" x="764" y="107">approve</text>
          <rect className="d-box" x="532" y="124" width="74" height="26" rx="3" />
          <text className="d-t-sm" x="544" y="141">manage</text>
          <text className="d-t-sm" x="620" y="141">A project may rename, change or switch off any role.</text>

          <line className="d-line" x1="697" y1="174" x2="697" y2="216" markerEnd="url(#mD)" />
          <rect className="d-ok" x="514" y="220" width="366" height="34" rx="4" />
          <text className="d-t" x="532" y="242" fill="var(--color-success)">Only the buttons your role allows are shown</text>
        </Fig>
      </section>

      {/* ── The screens ───────────────────────────────────────────── */}
      <Group
        g={byId.get('g-project')!}
      />

      <Group
        g={byId.get('g-assets')!}
        extra={
          <Fig
            label="0 0 900 322"
            caption="The whole hierarchy comes out of the tag list. Fill in Building, Area, System and Subsystem on each row and the tree assembles itself; put a parent tag in the Part of tag column and the row is filed as a component inside it rather than as equipment of its own."
          >
            <Arrow id="mE" />
            <text className="d-hdr" x="10" y="16">THE TREE</text>
            <text className="d-hdr" x="396" y="16">BUILT FROM THIS COLUMN</text>
            <text className="d-hdr" x="656" y="16">WHAT ATTACHES HERE</text>

            <rect className="d-box" x="10" y="30" width="196" height="34" rx="4" />
            <text className="d-t" x="24" y="52">Site</text>
            <rect className="d-box" x="34" y="72" width="196" height="34" rx="4" />
            <text className="d-t" x="48" y="94">Area</text>
            <rect className="d-lead" x="58" y="114" width="196" height="34" rx="4" />
            <text className="d-t-lead" x="72" y="136">System</text>
            <rect className="d-box" x="82" y="156" width="196" height="34" rx="4" />
            <text className="d-t" x="96" y="178">Subsystem</text>
            <rect className="d-lead" x="106" y="198" width="196" height="34" rx="4" />
            <text className="d-t-lead" x="120" y="220">Equipment tag</text>
            <rect className="d-box" x="130" y="240" width="196" height="34" rx="4" />
            <text className="d-t" x="144" y="262">Part</text>

            <path className="d-line" d="M 22 64 L 22 89 L 32 89" markerEnd="url(#mE)" />
            <path className="d-line" d="M 46 106 L 46 131 L 56 131" markerEnd="url(#mE)" />
            <path className="d-line" d="M 70 148 L 70 173 L 80 173" markerEnd="url(#mE)" />
            <path className="d-line" d="M 94 190 L 94 215 L 104 215" markerEnd="url(#mE)" />
            <path className="d-line" d="M 118 232 L 118 257 L 128 257" markerEnd="url(#mE)" />

            <text className="d-t-sm" x="396" y="52">the project itself</text>
            <text className="d-t-sm" x="396" y="94">Building / Area</text>
            <text className="d-t-sm" x="396" y="136">System</text>
            <text className="d-t-sm" x="396" y="178">Subsystem (or Bay)</text>
            <text className="d-t-sm" x="396" y="220">Tag</text>
            <text className="d-t-sm" x="396" y="262">Part of tag</text>

            <line className="d-line" x1="640" y1="26" x2="640" y2="278" opacity="0.3" />

            <text className="d-t-sm" x="656" y="136" fill="var(--color-primary)">L4 and L5 checks · gates · readiness</text>
            <text className="d-t-sm" x="656" y="178" fill="var(--color-primary)">L4 and L5 checks</text>
            <text className="d-t-sm" x="656" y="220" fill="var(--color-primary)">L1–L3 checks · tests · punch items</text>
            <text className="d-t-sm" x="656" y="262" fill="var(--color-primary)">L1–L3 checks</text>

            <rect className="d-ok" x="10" y="288" width="870" height="28" rx="4" />
            <text className="d-t-sm" x="28" y="306" fill="var(--color-success)">
              All six levels are created by one spreadsheet — the equipment import. You never build the tree by hand.
            </text>
          </Fig>
        }
      />

      <Group
        g={byId.get('g-testing')!}
        extra={
          <Fig
            label="0 0 900 268"
            caption="Everything defaults to Surveillance until somebody says otherwise, which is why agreeing the ITP with your client early matters — an unmarked hold point stops nothing. Only H and W carry a release, and the notice is what proves the client was invited, so once written it cannot be altered."
          >
            <Arrow id="mF" />
            <Arrow id="mFd" color="var(--color-danger)" />

            <rect className="d-box" x="10" y="98" width="146" height="58" rx="4" />
            <text className="d-t" x="24" y="122">Any check or test</text>
            <text className="d-t-sm" x="24" y="140">an activity on the ITP</text>
            <line className="d-line" x1="160" y1="127" x2="200" y2="127" markerEnd="url(#mF)" />
            <text className="d-lbl" x="164" y="120">you set</text>

            <rect className="d-box" x="204" y="34" width="146" height="46" rx="4" />
            <text className="d-t" x="218" y="54">S · Surveillance</text>
            <text className="d-t-sm" x="218" y="70">watched, no stop</text>
            <rect className="d-box" x="204" y="88" width="146" height="46" rx="4" />
            <text className="d-t" x="218" y="108">R · Review point</text>
            <text className="d-t-sm" x="218" y="124">records looked at</text>
            <rect className="d-lead" x="204" y="142" width="146" height="46" rx="4" />
            <text className="d-t-lead" x="218" y="162">W · Witness point</text>
            <text className="d-t-sm" x="218" y="178">client may attend</text>
            <rect className="d-lead" x="204" y="196" width="146" height="46" rx="4" />
            <text className="d-t-lead" x="218" y="216">H · Hold point</text>
            <text className="d-t-sm" x="218" y="232">client must attend</text>

            <path className="d-line" d="M 354 57 L 392 57 L 392 111 L 430 111" markerEnd="url(#mF)" />
            <path className="d-line" d="M 354 111 L 430 111" markerEnd="url(#mF)" />
            <rect className="d-box" x="434" y="88" width="162" height="46" rx="4" />
            <text className="d-t" x="448" y="116">Just record the result</text>

            <path className="d-line-lead" d="M 354 219 L 382 219 L 382 187 L 410 187" markerEnd="url(#mF)" />
            <path className="d-line-lead" d="M 354 165 L 410 165 L 410 187" />

            <rect className="d-lead" x="414" y="164" width="128" height="46" rx="4" />
            <text className="d-t-lead" x="426" y="184">Give notice</text>
            <text className="d-t-sm" x="426" y="200">to a contact, by email</text>
            <line className="d-line-lead" x1="546" y1="187" x2="570" y2="187" markerEnd="url(#mF)" />
            <rect className="d-lead" x="574" y="164" width="118" height="46" rx="4" />
            <text className="d-t-lead" x="586" y="184">Inspection</text>
            <text className="d-t-sm" x="586" y="200">on the agreed date</text>
            <line className="d-line-lead" x1="696" y1="187" x2="720" y2="187" markerEnd="url(#mF)" />
            <rect className="d-ok" x="724" y="164" width="156" height="46" rx="4" />
            <text className="d-t" x="736" y="184" fill="var(--color-success)">Signature</text>
            <text className="d-t-sm" x="736" y="200">released — work continues</text>

            <rect className="d-stop" x="414" y="228" width="284" height="30" rx="4" />
            <text className="d-t-stop" x="430" y="248">Until it is signed, the point blocks the level</text>
            <line className="d-line" x1="802" y1="214" x2="802" y2="244" markerEnd="url(#mFd)" stroke="var(--color-danger)" />
            <text className="d-t-sm" x="716" y="252" fill="var(--color-danger)">rejected? sign again after rework</text>
          </Fig>
        }
      />

      <Group g={byId.get('g-trace')!} />
      <Group g={byId.get('g-quality')!} />
      <Group g={byId.get('g-manage')!} />

      {/* ── Spreadsheets ──────────────────────────────────────────── */}
      <section id="sheets" style={{ marginTop: 40, scrollMarginTop: 16 }}>
        <h2 className="mn-h2">Every spreadsheet format</h2>
        <p className="mn-stand">
          Six importers. All of them share the same four habits, so learning one teaches you the rest.
        </p>

        <ul className="mn-ul">
          <li><strong>The export is the template.</strong> Download what is there, mark it up, import it back.</li>
          <li><strong>The CXA ID column is identity.</strong> Keep it and the row is updated. Blank it and the row is new. Never edit it by hand.</li>
          <li><strong>A Y in the Remove column deletes that row.</strong> An empty cell means &ldquo;I did not say&rdquo;, never &ldquo;clear this&rdquo;.</li>
          <li><strong>Nothing is half-imported.</strong> One unreadable row and the whole file is refused, with every problem listed by sheet and row number in the audit trail.</li>
        </ul>

        <Fig
          label="0 0 900 296"
          caption="Every importer works this way. The all-or-nothing gate is deliberate: a half-imported file leaves you unable to tell which half went in, whereas a refused file leaves your records exactly as they were and tells you which rows to fix, by their row number in your own sheet."
        >
          <Arrow id="mG" />
          <Arrow id="mGd" color="var(--color-danger)" />
          <Arrow id="mGs" color="var(--color-success)" />

          <rect className="d-box" x="10" y="96" width="146" height="60" rx="4" />
          <text className="d-t" x="24" y="120">Your sheet</text>
          <text className="d-t-sm" x="24" y="138">every tab is read</text>
          <line className="d-line" x1="160" y1="126" x2="204" y2="126" markerEnd="url(#mG)" />

          <rect className="d-box" x="208" y="96" width="162" height="60" rx="4" />
          <text className="d-t" x="222" y="118">Match the headings</text>
          <text className="d-t-sm" x="222" y="136">your own names accepted</text>
          <line className="d-line" x1="374" y1="126" x2="418" y2="126" markerEnd="url(#mG)" />

          <rect className="d-lead" x="422" y="82" width="176" height="88" rx="5" />
          <text className="d-t-lead" x="438" y="106">Check EVERY row</text>
          <text className="d-t-sm" x="438" y="126">before writing anything</text>
          <text className="d-t-sm" x="438" y="146">at all</text>

          <path className="d-line" d="M 510 174 L 510 210 L 600 210" markerEnd="url(#mGs)" stroke="var(--color-success)" />
          <text className="d-lbl" x="518" y="204" fill="var(--color-success)">all rows good</text>
          <rect className="d-ok" x="604" y="192" width="276" height="60" rx="4" />
          <text className="d-t" x="620" y="212" fill="var(--color-success)">Saved</text>
          <text className="d-t-sm" x="620" y="230">CXA ID kept → updated. Blank → new.</text>
          <text className="d-t-sm" x="620" y="245">Y in the Remove column → deleted.</text>

          <path className="d-line" d="M 510 78 L 510 46 L 600 46" markerEnd="url(#mGd)" stroke="var(--color-danger)" />
          <text className="d-lbl" x="518" y="40" fill="var(--color-danger)">one bad row</text>
          <rect className="d-stop" x="604" y="24" width="276" height="60" rx="4" />
          <text className="d-t-stop" x="620" y="46">Nothing is saved</text>
          <text className="d-t-sm" x="620" y="66">every problem listed by row number in the audit trail</text>
        </Fig>

        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '20px 0 6px' }}>Equipment &amp; tags</h3>
        <p className="mn-p">
          Headings are alias-matched, so a contractor&rsquo;s own file usually imports untouched. Tag also
          accepts Tag No, KKS, Asset ID, Item No and Ref. Manufacturer also accepts Vendor, OEM, Make and
          Brand. Floor also accepts Level, Storey, LVL and FL — the one place &ldquo;Level&rdquo; means a
          storey. Part of tag also accepts Parent tag, Installed in and Mounted in.
        </p>
        <div className="mn-note warn">
          <b>Two guards on this import</b>
          <p>
            A part naming a parent tag that does not exist is left unfiled and reported —{' '}
            <strong>the parent is never invented</strong>. And if the file&rsquo;s Project column names a
            different project from the one you have open, nothing is imported at all.
          </p>
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '20px 0 6px' }}>Checklist</h3>
        <p className="mn-p">
          The header row is found anywhere in the first forty rows, and every tab in the workbook is read.
          Status accepts synonyms: P, OK, accepted and satisfactory become pass; F and rejected become fail;
          open and TBC become pending. Blank is Pending. A Tag or System that does not resolve against the
          asset register is an <strong>error, not a guess</strong>. If there is no Level column, a tab named
          L2 or Installation Verification supplies it.
        </p>

        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '20px 0 6px' }}>Test script</h3>
        <p className="mn-p">
          This is the shape a real procedure is written in, so the layout is fixed: <span className="mono">Equipment / System:</span>{' '}
          in cell A2 with its value in B2, <span className="mono">Level:</span> in D2 with its value in E2,
          and the header row on row 4. Only <strong>Content</strong> is required. Every line keeps its serial
          number, so a finding points at a line you can find in your own sheet.
        </p>
        <div className="mn-note">
          <b>How links are treated</b>
          <p>
            The <em>Links to</em> column takes several items separated by a semicolon, comma, pipe or new
            line. A link that <em>can</em> be checked and is wrong stops the import — pointing at line 47 on a
            sheet with 30 lines is an error, not a warning. A link that cannot be checked, such as a drawing
            number, is kept exactly as typed and reported. The application never quietly drops a reference.
          </p>
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '20px 0 6px' }}>Punch list</h3>
        <p className="mn-p">
          The punch number is identity here — a row with no number is new and gets the next free one.
          Category accepts A, Cat A and Category A, and also 1 or P1 for A, 2 for B, 3 for C.{' '}
          <strong>Dates are only accepted unambiguously:</strong> 2026-04-03, or a date with a month name. A
          bare 03/04/2026 is treated as ambiguous rather than guessed, because guessing it wrong by nine
          months on a due date is a real cost.
        </p>
      </section>

      {/* ── SQL ───────────────────────────────────────────────────── */}
      <section id="sql" style={{ marginTop: 40, scrollMarginTop: 16 }}>
        <h2 className="mn-h2">Database steps</h2>
        <p className="mn-stand">
          Each one adds something. A step not run does not break the site — it makes a screen quietly show
          less than it should, which is worse. <Link className="link" href="/setup">Setup</Link> tells you
          which are outstanding.
        </p>

        <div className="table-wrap">
          <table className="table mn-table" style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th>Step</th>
                <th>What it adds</th>
                <th>Without it</th>
              </tr>
            </thead>
            <tbody>
              {SQL_STEPS.map(([step, adds, without]) => (
                <tr key={step}>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>{step}</td>
                  <td>{adds}</td>
                  <td className="text-secondary">{without}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mn-note danger" style={{ marginTop: 16 }}>
          <b>Part 38 is the one to run today</b>
          <p>
            Until it is run, the file store is public. A client&rsquo;s site photographs, their defect record
            and their drawings can be opened by anyone holding a link — no password, no account. The Setup
            page reports this as missing in red rather than as anything softer, because that is exactly what
            it is.
          </p>
        </div>
      </section>

      {/* ── Pack ──────────────────────────────────────────────────── */}
      <section id="pack" style={{ marginTop: 40, scrollMarginTop: 16 }}>
        <h2 className="mn-h2">What is in a handover pack</h2>
        <p className="mn-stand">
          Generated from the records at the moment you press the button. Nine sections, and every one of them
          is printed even when it is empty.
        </p>

        <Fig
          label="0 0 900 344"
          caption="Nothing in the pack is written by hand — each section is drawn straight from the register beside it. A register with no records still gets its section, followed by a sentence saying what that emptiness means, because a missing section reads like a pack somebody forgot to finish while a stated absence is something the client can answer."
        >
          <Arrow id="mH" />
          <text className="d-hdr" x="10" y="16">THE REGISTER</text>
          <text className="d-hdr" x="438" y="16">THE SECTION IT BECOMES</text>

          {[
            ['Requirements', '1  Requirements'],
            ['Checklists, all five levels', '2  Commissioning checks'],
            ['Test records', '3  Test records'],
            ['Hold &  witness points', '4  Hold and witness points'],
            ['Punch list', '5  Punch list'],
            ['Obligations', '6  Obligations'],
            ['Gates &  readiness', '7  Readiness gates'],
            ['Document control', '8  Documents cited'],
            ['Photographs', '9  Photographic evidence'],
          ].map(([left, right], i) => {
            const y = 48 + i * 30
            return (
              <g key={left}>
                <text className="d-t-sm" x="10" y={y}>{left}</text>
                <line
                  className="d-line"
                  x1="260"
                  y1={y - 5}
                  x2="416"
                  y2={y - 5}
                  markerEnd="url(#mH)"
                  strokeDasharray={i === 8 ? '4 3' : undefined}
                />
                <text className="d-t-lead" x="446" y={y}>{right}</text>
              </g>
            )
          })}
          <text className="d-lbl" x="276" y="278">only if you ask</text>
          <rect className="d-lead" x="426" y="26" width="454" height="276" rx="5" fill="none" />

          <rect className="d-ok" x="426" y="310" width="454" height="30" rx="4" />
          <text className="d-t-sm" x="444" y="330" fill="var(--color-success)">
            Four separate signatures: Contractor · Cx Manager · Cx Authority · Client
          </text>
          <rect className="d-box" x="10" y="310" width="250" height="30" rx="4" stroke="var(--color-warning)" />
          <text className="d-t-sm" x="24" y="330" fill="var(--color-warning)">An empty register still prints its section</text>
        </Fig>

        <p className="mn-p">
          Ahead of those sit the signatures table, <em>What is outstanding</em>, the device-level and
          system-level tables, the findings, and a contents index. At the end sit{' '}
          <strong>four different signature statements</strong> — Contractor, Commissioning Manager,
          Commissioning Authority, and Client / Owner — because those four parties are not signing for the
          same thing and should not sign the same words.
        </p>
      </section>

      {/* ── AI ────────────────────────────────────────────────────── */}
      <section id="ai" style={{ marginTop: 40, scrollMarginTop: 16 }}>
        <h2 className="mn-h2">Where AI is used</h2>
        <p className="mn-stand">
          Three screens, three buttons, all optional. Everything else in the application is arithmetic.
        </p>

        <div className="table-wrap">
          <table className="table mn-table" style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th>Screen</th>
                <th>The button</th>
                <th>What it does</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><Link className="link" href="/documents">Document Review</Link></td>
                <td>Read this document</td>
                <td>Reads one attached document and reports what it appears to say.</td>
              </tr>
              <tr>
                <td><Link className="link" href="/obligations">Obligations</Link></td>
                <td>Assess this obligation</td>
                <td>Comments on one obligation and whether the record discharges it.</td>
              </tr>
              <tr>
                <td><Link className="link" href="/validity">Validity Review</Link></td>
                <td>Read the list</td>
                <td>
                  Sends the <strong>wording of the checks only</strong>, at one level for one item, and asks
                  what a competent commissioning engineer would expect that is absent.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mn-p" style={{ marginTop: 14 }}>
          Four rules govern all of it, and they are enforced in one place rather than trusted to habit:
        </p>
        <ul className="mn-ul">
          <li><strong>Nothing AI produces is ever written to a record.</strong> A model&rsquo;s opinion is a suggestion on a screen. Every record still changes only when a person changes it.</li>
          <li><strong>It only runs when somebody presses the button.</strong> Nothing happens in the background, so nothing can quietly spend money.</li>
          <li><strong>With nothing configured, everything degrades to the arithmetic</strong> and the screen says so. No screen breaks.</li>
          <li><strong>It never falls back from one provider to another.</strong> If a model you host yourself cannot be reached, the answer is &ldquo;your model did not answer&rdquo; — not a silent hop to a third party you deliberately configured this to avoid.</li>
        </ul>
        <p className="mn-p">
          Which model answers is a setting, not a commitment. The same application talks to a hosted model,
          to a model running on a server your client owns, or to anything speaking the standard chat format —
          and nothing else in the application changes.
        </p>
      </section>

      {/* ── Promises ──────────────────────────────────────────────── */}
      <section id="promises" style={{ marginTop: 40, scrollMarginTop: 16 }}>
        <h2 className="mn-h2">Rules it will not break</h2>
        <p className="mn-stand">
          Collected here because they explain most of the behaviour that surprises people in their first week.
        </p>
        <div className="table-wrap">
          <table className="table mn-table" style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th>The rule</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {PROMISES.map(([rule, why]) => (
                <tr key={rule}>
                  <td style={{ fontWeight: 600 }}>{rule}</td>
                  <td className="text-secondary">{why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Trouble ───────────────────────────────────────────────── */}
      <section id="trouble" style={{ marginTop: 40, scrollMarginTop: 16 }}>
        <h2 className="mn-h2">When something looks wrong</h2>
        <p className="mn-stand">The eight questions that come up most, and where each one is answered.</p>
        <div className="table-wrap">
          <table className="table mn-table" style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th>What you see</th>
                <th>What it usually is</th>
              </tr>
            </thead>
            <tbody>
              {TROUBLE.map(([what, why], i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{what}</td>
                  <td className="text-secondary">{why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-secondary" style={{ fontSize: 12, marginTop: 26, maxWidth: '66ch' }}>
          This manual describes what the application does. Where it and the application disagree, the
          application is right and this page needs correcting.
        </p>
      </section>
    </div>
  )
}
