// Every way into this application, and whether it is guarded.
//
// ── Why this file exists ────────────────────────────────────────────────
//
// There are four ways to reach project data:
//
//   a page             → requirePage()      src/data/require-page.tsx
//   a route handler    → requireAccess()    src/data/require-access.ts
//   a Server Action    → requireActor()     src/data/require-actor.ts
//   the proxy          → signed-in or not   src/proxy.ts
//
// Three of those four were, at one time or another, guarded by something
// that was not actually a guard:
//
//   Route handlers were guarded by nothing until update 90, because the
//   layout's check was assumed to cover them. It does not run for them.
//
//   Pages were guarded by layout.tsx, which renders a refusal INSTEAD OF
//   the page. That is not a door: the page still runs and its output is
//   still inlined into the response. Proved by reproduction on 26 Sep 2026
//   — see the comment at the top of require-page.tsx, which records the
//   exact curl and the exact result.
//
//   Server Actions were guarded by nothing at all, in 37 of 38 files.
//   A Server Action is a POST with a header naming the function; it never
//   reaches a layout, because the function runs before anything re-renders.
//   Also proved by reproduction: 200, and the side effect happened.
//
// Each of those was found by looking at one instance. This file exists so
// the CLASS is held instead of the instance. If somebody adds a screen next
// March and forgets, this goes red with the file name in it.
//
// The allowlists below are the whole of the argument. A file is either
// guarded or it is named here with a reason. There is no third state.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

let pass = 0, fail = 0
function ok(n: string, c: boolean, extra = '') { if (c) pass++; else { fail++; console.log('FAIL: ' + n + (extra ? ' — ' + extra : '')) } }

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const rel = (p: string) => relative(join(SRC, '..'), p).replace(/\\/g, '/')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else out.push(path)
  }
  return out
}
const FILES = walk(SRC)

// The two table lists are read out of the SOURCE, not imported.
//
// Importing them would pull in lib/supabase, which builds a client at module
// load and needs the project's URL in the environment — so the suite would
// only run where the application's secrets are, which is the one place a
// check like this is least useful. Reading the text has a second virtue:
// what is asserted is what somebody editing the file will see.
function listIn(file: string, name: string): string[] {
  const text = readFileSync(join(SRC, file), 'utf8')
  const at = text.indexOf(name)
  const body = text.slice(at, text.indexOf('])', at) >= 0 ? text.indexOf('])', at) : text.indexOf(']', at))
  return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}
const OWNED_TABLES = {
  DIRECT: listIn('data/owned.ts', 'const DIRECT = new Set(['),
  PARENTS: (() => {
    const text = readFileSync(join(SRC, 'data/owned.ts'), 'utf8')
    const at = text.indexOf('const PARENTS')
    const body = text.slice(at, text.indexOf('\n}', at))
    const out: Record<string, { via: string; parent: string }> = {}
    for (const m of body.matchAll(/(\w+):\s*\{\s*via:\s*'(\w+)',\s*parent:\s*'(\w+)'\s*\}/g)) {
      out[m[1]] = { via: m[2], parent: m[3] }
    }
    return out
  })(),
}
const FILE_PATH_TABLES = listIn('data/file-owner.ts', 'const PATH_COLUMNS')

// ════════ PAGES ════════
//
// Every page.tsx either calls requirePage() or is named below.
{
  // Deliberately reachable without an account. Each one is also in the
  // public list in proxy.ts, and the two lists are checked against each
  // other further down — a page that is public here and private there would
  // be a screen nobody can open, and the reverse would be a hole.
  const PUBLIC: Record<string, string> = {
    'src/app/page.tsx': 'redirects to /projects and renders nothing',
    'src/app/login/page.tsx': 'the sign-in form. A gate here locks everybody out.',
    'src/app/signup/page.tsx': 'the sign-up form, same reason',
    'src/app/about/page.tsx': 'what this application is. No project data.',
    'src/app/manual/page.tsx': 'how it works. Describes the app, holds no job.',
    'src/app/knowledge/page.tsx': 'arithmetic and standards. Nobody should have to sign in to size a load bank in a switchroom.',
    'src/app/knowledge/planner/page.tsx': 'the same, with a canvas',
    'src/app/site/offline/page.tsx': 'force-static, kept on the phone by the service worker. It contains no server data BY CONSTRUCTION — that is the point of it.',
    'src/app/functional-tests/page.tsx': 'redirect only, for old bookmarks',
    'src/app/integrated-tests/page.tsx': 'redirect only, for old bookmarks',
  }

  const pages = FILES.filter((p) => p.endsWith('/page.tsx'))
  ok('there are pages to check', pages.length > 40, `${pages.length}`)

  const ungated: string[] = []
  for (const path of pages) {
    const name = rel(path)
    const text = readFileSync(path, 'utf8')
    if (name in PUBLIC) {
      // A public page must not accidentally start carrying project data.
      // This is the weakest of the checks here and it is honest about it:
      // it catches the obvious case of somebody adding a query to /about.
      ok(`${name} is public on purpose: ${PUBLIC[name]}`, true)
      ok(`  …and still queries nothing`, !/\.from\(['"]/.test(text), 'it now queries the database')
      continue
    }
    if (!/requirePage\(\)/.test(text)) { ungated.push(name); continue }
    // Placement matters as much as presence: a gate after a query has
    // already made the query.
    const body = text.slice(text.search(/export default async function/))
    const gateAt = body.indexOf('requirePage()')
    const firstQuery = body.search(/\.from\(['"]|await load|getCurrentProject\(/)
    ok(`${name} gates before it reads anything`,
       gateAt >= 0 && (firstQuery === -1 || gateAt < firstQuery),
       `gate at ${gateAt}, first read at ${firstQuery}`)
  }
  ok('every page is gated or named public', ungated.length === 0, ungated.join(', '))
}

// ════════ SERVER ACTIONS ════════
{
  // The sign-in path, and nothing else. If this list ever grows, read the
  // reason twice: an action that cannot be gated is usually an action that
  // should not exist.
  const EXEMPT: Record<string, string> = {
    'src/app/login/actions.ts': 'log in, sign up and log out. Gating the door on being through the door.',
  }

  const actionFiles = FILES.filter((p) => /\.tsx?$/.test(p) && readFileSync(p, 'utf8').trimStart().startsWith("'use server'"))
  ok('there are action files to check', actionFiles.length > 30, `${actionFiles.length}`)

  const ungated: string[] = []
  for (const path of actionFiles) {
    const name = rel(path)
    const text = readFileSync(path, 'utf8')
    if (name in EXEMPT) { ok(`${name} is exempt: ${EXEMPT[name]}`, true); continue }

    for (const m of text.matchAll(/export async function\s+(\w+)\s*\(/g)) {
      const fn = m[1]
      // The first 240 characters of the body. Far enough in to allow a
      // comment above the call, not far enough to allow a query before it.
      const head = text.slice(m.index!, m.index! + 400)
      const brace = head.indexOf('{')
      const opening = head.slice(brace, brace + 260)
      if (!/requireActor\(\)/.test(opening)) ungated.push(`${name}:${fn}`)
    }
  }
  ok('every exported action calls requireActor() as its first act',
     ungated.length === 0, ungated.slice(0, 8).join(', ') + (ungated.length > 8 ? ` …and ${ungated.length - 8} more` : ''))
}

// ════════ ROUTE HANDLERS ════════
//
// This was update 90's rule. It is re-asserted here so all four doors are
// held in one place rather than in whichever suite happened to be written
// at the time.
{
  const EXEMPT: Record<string, string> = {
    'src/app/file/[...path]/route.ts': 'guards itself inline with accessVerdict/mayUseApp, because it answers a refusal with a 404 rather than a 403 — whether a file exists is exactly what a refused caller must not learn.',
    'src/app/api/site/queue/route.ts': 'the phone queue drain. It does its own check — a phone in a basement posts with the account that raised the defect, and the contract with the service worker is 200/4xx/5xx rather than a redirect.',
  }
  const routes = FILES.filter((p) => /\/route\.tsx?$/.test(p))
  ok('there are route handlers to check', routes.length > 30, `${routes.length}`)

  const ungated: string[] = []
  for (const path of routes) {
    const name = rel(path)
    const text = readFileSync(path, 'utf8')
    if (name in EXEMPT) {
      ok(`${name} is exempt: ${EXEMPT[name]}`, true)
      ok('  …and does check something itself', /accessVerdict|mayUseApp|requireAccess|getUser/.test(text), name)
      continue
    }
    if (!/requireAccess\(\)/.test(text)) ungated.push(name)
  }
  ok('every route handler calls requireAccess()', ungated.length === 0, ungated.join(', '))
}

// ════════ THE TWO PUBLIC LISTS AGREE ════════
//
// proxy.ts decides who may reach a URL without signing in. The page list
// above decides which pages do not gate themselves. If those two disagree,
// one of them is wrong, and which one it is depends on the direction:
//
//   public in proxy, gated in the page  → a screen nobody can open
//   public in the page, private in proxy → nothing, today. But it is one
//   edit to proxy.ts away from being a hole, and the edit would look safe.
{
  const proxy = readFileSync(join(SRC, 'proxy.ts'), 'utf8')
  for (const route of ['/login', '/signup', '/about', '/manual', '/knowledge']) {
    ok(`proxy.ts lets ${route} through without an account`,
       proxy.includes(`'${route}'`), route)
  }
  // And the ones that must NOT be there.
  for (const route of ['/issues', '/equipment', '/dossier', '/projects', '/site']) {
    ok(`proxy.ts does NOT let ${route} through`,
       !new RegExp(`startsWith\\('${route}'\\)`).test(proxy), route)
  }
}

// ════════ THE LAYOUT IS NOT THE DOOR, AND SAYS SO ════════
//
// The layout still renders <NoAccess/>, and should: it is the right thing
// for the common case of somebody who followed a link. What it must not do
// is go on claiming to be the security boundary, because the next person to
// read it will believe it.
{
  const layout = readFileSync(join(SRC, 'app/layout.tsx'), 'utf8')
  ok('layout.tsx still refuses a blocked account on screen', /NoAccess/.test(layout))
  ok('  …and no longer claims to be the only check',
     /require-page|not the door|does not stop/i.test(layout),
     'the comment still says a gate here is enough. It is not — see require-page.tsx.')
}


// ════════ THE SECOND QUESTION: IS THIS RECORD YOURS? ════════
//
// Update 116 put a gate on every page, action and route handler. It answers
// "may this account use the application at all?" — and it does answer that.
//
// It cannot answer "may this account touch THIS RECORD", and about fifty
// actions needed that answer. They took a record id straight out of the
// submitted form and did `.eq('id', id)` with it. The id is whatever the
// caller typed, so anybody on the team of any one job could rename another
// job, delete its tags, forge a measured value on its test records, confirm
// its readiness gates, or — the worst one — post another project's
// project_members row id to updateMemberRole and make themselves an admin
// there.
//
// The gate was working. It was answering the wrong question.
//
// This block holds the second question. It is written as a sweep rather
// than a list because the first version of this audit, done by reading,
// missed eight of them — addRevision, unlinkVerification, giveNotice and
// the five AI actions. The sweep found those the same afternoon.
{
  const actionFiles = FILES.filter((p) => /\.tsx?$/.test(p) && readFileSync(p, 'utf8').trimStart().startsWith("'use server'"))

  // A function is exempt only if it cannot act on a caller-supplied id at
  // all. There is no "this one is fine" exemption, because "this one is
  // fine" is what was believed about all fifty.
  const EXEMPT: Record<string, string> = {
    'src/app/login/actions.ts': 'sign in, sign up, sign out — no project records',
  }

  const unguarded: string[] = []
  let swept = 0
  for (const path of actionFiles) {
    const name = rel(path)
    if (name in EXEMPT) continue
    const text = readFileSync(path, 'utf8')

    for (const m of text.matchAll(/export async function\s+(\w+)\s*\(/g)) {
      // The function body, by brace matching. A regex window would stop
      // short of the mutation in the longer importers.
      let i = m.index! + m[0].length - 1, depth = 0
      while (i < text.length) {
        if ('([{'.includes(text[i])) depth++
        else if (')]}'.includes(text[i])) { depth--; if (depth === 0) break }
        i++
      }
      const start = text.indexOf('{', i)
      let j = start
      depth = 0
      while (j < text.length) {
        if (text[j] === '{') depth++
        else if (text[j] === '}') { depth--; if (depth === 0) break }
        j++
      }
      const body = text.slice(start, j)

      const takesId = /str\(formData, '(id|\w+_id)'\)|formData\.getAll\('ids'\)/.test(body)
      // INSERT IS A WRITE. It was left out of this list, and that one
      // omission hid fourteen actions — createTest, addChecklistItem,
      // uploadAttachment, addRule, linkVerification among them — each of
      // which takes a caller-supplied id and writes a row with it. An
      // insert keyed on someone else's record does not corrupt their
      // data, it ADDS to it: a forged test record, a forged check, a
      // forged prerequisite on their readiness gate. That is worse than a
      // bad update, because nothing about it looks wrong afterwards.
      const mutates = /\.(insert|update|delete|upsert)\(/.test(body)
      if (!takesId || !mutates) continue
      swept++

      // Any of the five ways a record is proved to be this project's:
      //   ownedBy / ownedAllBy   the lookup, for a posted row id
      //   mayOpenProject         for a posted PROJECT id
      //   pickedIds / idsFor     intersect posted ids with this project's
      const guarded = /ownedBy\(|ownedAllBy\(|mayOpenProject\(|pickedIds\(|idsFor\(/.test(body)
      if (!guarded) unguarded.push(`${name}:${m[1]}`)
    }
  }

  ok('there are id-taking mutations to sweep', swept > 40, `${swept}`)
  ok('every action that mutates by a posted id proves the record is this project’s',
     unguarded.length === 0,
     unguarded.slice(0, 40).join(', ') + (unguarded.length > 40 ? ` …and ${unguarded.length - 40} more` : ''))
}

// ════════ THE TABLE LISTS MATCH THE SCHEMA ════════
//
// owned.ts carries two lists: tables with project_id, and tables that reach
// a project through a parent. Both are copies of what schema.sql says, and
// a copy drifts. A table that GAINS project_id and stays in the parent list
// is only slow; a table that LOSES it and stays in the direct list is a
// check that silently matches nothing.
{
  const schema = readFileSync(join(SRC, '..', 'schema.sql'), 'utf8')
  const withPid = new Set<string>()
  const without = new Set<string>()
  for (const block of schema.split(/(?=CREATE TABLE )/)) {
    const m = /^CREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)/.exec(block)
    if (!m) continue
    const body = block.slice(0, block.indexOf(');'))
    ;(/\bproject_id\b/.test(body) ? withPid : without).add(m[1])
  }
  ok('schema.sql was read', withPid.size > 20, `${withPid.size} with, ${without.size} without`)

  for (const t of OWNED_TABLES.DIRECT) {
    ok(`owned.ts: ${t} really does carry project_id`, withPid.has(t), t)
  }
  for (const [t, step] of Object.entries(OWNED_TABLES.PARENTS)) {
    ok(`owned.ts: ${t} really has no project_id`, without.has(t), t)
    ok(`  …and its parent ${step.parent} does`, withPid.has(step.parent), step.parent)
  }

  // Every table with project_id should be listed, or ownedBy throws on it
  // the first time somebody uses it — which is the safe direction, but a
  // throw in front of a person doing their job is still a fault.
  const missing = [...withPid].filter((t) => !OWNED_TABLES.DIRECT.includes(t) && t !== 'projects')
  ok('owned.ts lists every project-scoped table', missing.length === 0, missing.join(', '))
}

// ════════ EVERY STORED-PATH COLUMN IS GUARDED ════════
//
// /file/[...path] signs a URL for a path. Before this, being allowed into
// the application was the whole check, and every path is built by this
// application and therefore guessable. The fix asks whether a record on a
// project you may open points at that file — so the list of tables holding
// a path has to be complete.
{
  const schema = readFileSync(join(SRC, '..', 'schema.sql'), 'utf8')
  const holders = new Set<string>()
  for (const block of schema.split(/(?=CREATE TABLE )/)) {
    const m = /^CREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)/.exec(block)
    if (!m) continue
    if (/^\s*file_path\s+text/m.test(block.slice(0, block.indexOf(');')))) holders.add(m[1])
  }
  ok('schema.sql has file_path columns', holders.size > 0, [...holders].join(', '))
  const unchecked = [...holders].filter((t) => !FILE_PATH_TABLES.includes(t))
  ok('every table holding a storage path is checked by mayReadStoredFile',
     unchecked.length === 0, unchecked.join(', '))

  // And a path must never be taken from the caller and handed to storage.
  const offenders: string[] = []
  for (const path of FILES.filter((p) => /\.tsx?$/.test(p))) {
    const text = readFileSync(path, 'utf8')
    if (!/storage\.from\([^)]*\)\.remove\(/.test(text)) continue
    // The path handed to remove() must come from a row, not from FormData.
    if (/const file_path = str\(formData/.test(text)) offenders.push(rel(path))
  }
  ok('nothing deletes a storage object at a path the caller supplied',
     offenders.length === 0, offenders.join(', '))
}

// ════════ NO ACTION READS A TABLE WITHOUT SAYING WHICH PROJECT ════════
//
// The hole this closes was written BY ME, the day after writing the sweep
// that was supposed to make this class impossible.
//
// The job-sheet importer had:
//
//     await supabase.from('subsystems').select('id, name, system_id')
//
// No filter. Every subsystem on the database, and then a name match
// against that set — so "Incomer" on another job could be matched and one
// project's tag filed under another project's bay. A cross-project WRITE,
// arrived at through an unscoped READ.
//
// Update 117's sweep did not see it, and could not: that one looks for
// mutations keyed on an id the caller posted. This is a read with no key
// at all. Different shape, same consequence, and it slipped through a
// suite written specifically to stop it happening.
//
// So: in any 'use server' file, a select on a project table must be
// CONSTRAINED BY SOMETHING. Either project_id, or an id that a guard has
// already proved — `.eq('id', …)` after ownedBy is safe, because ownedBy
// is what made it safe.
//
// What is refused is a select with NO filter at all. That is the shape
// that returns another job's rows, and it is the shape I wrote. An
// assertion demanding project_id on every read would fail thirty-odd
// legitimate reads-by-proved-id, and an assertion that fails on correct
// code gets loosened until it means nothing.
{
  const actionFiles = FILES.filter((p) => /\.tsx?$/.test(p) && readFileSync(p, 'utf8').trimStart().startsWith("'use server'"))

  // EVERY table that belongs to a project — the ones carrying project_id
  // AND the ones reaching it through a parent. The first version of this
  // exempted the parent-scoped six outright, which meant THE BUG THAT
  // PROMPTED THE WHOLE CHECK WOULD NOT HAVE BEEN CAUGHT: `subsystems` is
  // one of the six. An exemption written while fixing a bug, that exempts
  // the bug, is worth more attention than the bug.
  const scoped = new Set([...OWNED_TABLES.DIRECT, ...Object.keys(OWNED_TABLES.PARENTS)])

  const EXEMPT: Record<string, string> = {
    profiles: 'not project data — one row per account',
    projects: 'the project list itself, scoped by mayOpenProject',
  }

  const unscoped: string[] = []
  let swept = 0
  for (const path of actionFiles) {
    const name = rel(path)
    const text = readFileSync(path, 'utf8')

    for (const m of text.matchAll(/\.from\('(\w+)'\)/g)) {
      const table = m[1]
      if (!scoped.has(table) || table in EXEMPT) continue

      // The chain that follows, to the end of the statement. Long enough
      // to reach the filters, short enough not to borrow the next
      // statement's.
      const stmt = text.slice(m.index!, m.index! + 400).split(/\n\s*\n|\n  (?:const|await|return|if|for) /)[0]

      // Only reads. `.select()` after `.insert()` is a RETURNING clause,
      // not a read — the first version of this counted those and reported
      // seventeen false positives, which is how an assertion gets
      // switched off rather than fixed.
      const sel = stmt.indexOf('.select(')
      if (sel === -1) continue
      const writeAt = ['.insert(', '.update(', '.upsert(', '.delete('].map((w) => stmt.indexOf(w)).filter((i) => i >= 0)
      if (writeAt.some((i) => i < sel)) continue

      // A schema probe — `.select('a_column').limit(1)` — asks whether a
      // column exists and reads nothing out of the row. There are eight of
      // them and they are how this application degrades on a database
      // where a SQL step has not been run. A probe that starts USING the
      // row it got back is a different thing, and this will not catch
      // that; it is a gap, and writing it down beats pretending the
      // pattern covers it.
      if (/\.limit\(1\)/.test(stmt)) continue

      swept++
      const filtered = /\.eq\(|\.in\(|\.match\(|\.filter\(|\.or\(/.test(stmt)
      if (!filtered) unscoped.push(`${name}: .from('${table}').select() with no filter at all`)
    }
  }

  ok('there are project-table reads in actions to sweep', swept > 5, `${swept}`)
  ok('no action reads a whole project table unfiltered',
     unscoped.length === 0,
     unscoped.slice(0, 8).join(', ') + (unscoped.length > 8 ? ` …and ${unscoped.length - 8} more` : ''))

}


// ════════ A PAGE OR ROUTE KEYED ON A URL ID PROVES IT IS YOURS ════════
//
// ── The hole this closes ────────────────────────────────────────────────
//
// Both sweeps above begin the same way:
//
//     FILES.filter((p) => readFileSync(p).trimStart().startsWith("'use server'"))
//
// So they look at Server Actions and NOTHING ELSE. Every `page.tsx` and
// every `route.ts` was invisible to them — and a dynamic segment is a
// caller-supplied id just as surely as a posted form field is. The address
// bar is a form anybody can fill in.
//
// Five of them were reading a record straight off that id with no project
// filter: the tag's checklist page and its export route, the equipment
// type page, and the two edit forms. Any signed-in account could change
// the uuid in the address bar and read another job's tag, its complete
// checklist with every engineer's note, or its punch item.
//
// Two of those pages even SELECTED `project_id` and never compared it, so
// the check looked like it was there. That is the specific way this kind
// of bug survives being read.
//
// ── What counts as proof ────────────────────────────────────────────────
//
// Any one of:
//   · ownedBy / isOwnedBy            — asks the question directly
//   · .eq('project_id', …)           — scopes the read itself
//   · mayReadStoredFile              — the file store's own question
//   · a loader taking the project id — loadGate(project.id, id, …), and
//     the subject index, which is built from this project's rows only
//
// The last is why this is a list of shapes rather than one rule: several
// pages are correct by loading through a project-scoped index and then
// finding the id inside it. That is a good pattern and must not be made to
// look like a failure.
{
  const dynamic = FILES.filter((p) => /\[[^\]]+\]/.test(p) && /\/(page\.tsx|route\.ts)$/.test(p))
  ok('there are id-keyed pages and routes to sweep', dynamic.length >= 8, `${dynamic.length}`)

  // Named, with the reason, because "it is fine" is what was believed
  // about the five that were not.
  const SAFE_BY_LOADER: Record<string, string> = {
    'src/app/assets/[type]/[id]/page.tsx': 'loadSubjectIndex(project.id), then finds the id inside it',
    'src/app/gates/[id]/page.tsx': 'loadGate(project?.id, id, rollup) — scoped in the loader',
    'src/app/dossier/[type]/[id]/pdf/route.ts': 'buildDossier → loadPack(project.id, index, ref)',
    'src/app/dossier/[type]/[id]/word/route.ts': 'buildDossier → loadPack(project.id, index, ref)',
    'src/app/issues/photo/[id]/download/route.ts': 'loadPhoto(id, project.id) filters on project_id',
    'src/app/file/[...path]/route.ts': 'mayReadStoredFile — whether any record you may open points at the file',
    'src/app/checklists/[level]/page.tsx': 'the level is not a record id; the register under it is project-scoped',
    'src/app/scripts/[sheet]/page.tsx': 'the sheet name is not a record id; the checks under it are project-scoped',
  }

  const unproven: string[] = []
  for (const path of dynamic) {
    const rel = path.replace(process.cwd() + '/', '')
    const text = readFileSync(path, 'utf8')

    // ONLY the shapes that ask about THIS record. An earlier draft also
    // accepted "calls some loader with project.id" and "mentions
    // project_id somewhere" — and both are true of pages that then read a
    // DIFFERENT record straight off the URL id. Planting the bug back
    // proved it: the issues edit page passed this sweep with its guard
    // removed, because it happens to load the project further down for an
    // unrelated dropdown.
    //
    // A page that is safe because of a project-scoped loader is named in
    // the list below, by hand, with the loader written out. A general
    // pattern for that cannot tell "scoped by the loader" from "calls a
    // loader and then does something else".
    const proves =
      /\bownedBy\s*\(|\bisOwnedBy\s*\(/.test(text) ||
      /\bmayReadStoredFile\s*\(/.test(text)

    if (proves) continue
    if (SAFE_BY_LOADER[rel]) continue
    unproven.push(rel)
  }

  ok('every page and route keyed on a URL id proves the record is this project\u2019s',
     unproven.length === 0, unproven.join(', '))

  // The exemption list must not outlive the files it names. An entry for a
  // file that no longer exists is an entry nobody will re-examine, and the
  // next file to take that path inherits a waiver it never earned.
  for (const rel of Object.keys(SAFE_BY_LOADER)) {
    ok(`the exemption for ${rel} still names a real file`,
       dynamic.some((p) => p.replace(process.cwd() + '/', '') === rel))
  }
}

console.log(`${pass} passed, ${fail} failed`)
if (fail) process.exitCode = 1
