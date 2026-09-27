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

console.log(`${pass} passed, ${fail} failed`)
if (fail) process.exitCode = 1
