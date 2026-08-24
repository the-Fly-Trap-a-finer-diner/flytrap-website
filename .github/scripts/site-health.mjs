// Probe the live site and report whether it actually works.
//
// Written after the 2026-08-21 outage, where a bare CR in a Toast description
// made data.js unparseable. The site returned HTTP 200 for every file, the
// bytes were all served correctly, and the page rendered blank for 25 hours —
// so an uptime check that only looks at status codes would have reported the
// site healthy the entire time. That is the bar this has to clear.
//
// Six checks, all of which run even after one fails, so a single run tells you
// everything that is wrong rather than just the first thing:
//
//   1. index      — / returns HTML with the #root mount point
//   2. assets     — every local script, stylesheet, preload and icon returns 200
//   3. data.js    — parses as JavaScript and assigns window.FT_DATA
//   4. photos     — every photo: path in the live data.js returns 200
//   5. render     — headless Chrome loads the page and React actually mounts
//   6. freshness  — the live data.js is the one we just deployed (opt-in)
//
// Check 3 is the one that catches this specific outage class; check 5 is the one
// that catches everything else, because it runs the real page in a real browser
// and looks at what came out.
//
// No dependencies, no install: Node built-ins plus the Chrome that is already on
// the GitHub runner image. If no Chrome is found the render check reports SKIP
// rather than failing, so this still works somewhere without one.
//
// Env:
//   SITE_URL              base URL to probe        (default https://theflytrapferndale.com)
//   EXPECT_DATA_JS_SHA    git blob sha data.js must match to pass check 6 (optional)
//   ATTEMPTS              tries before giving up   (default 1)
//   RETRY_DELAY_MS        wait between tries       (default 15000)
//   RENDER_TIMEOUT_MS     how long to wait for React to mount (default 45000)
//
// Exit: 0 = every check passed, 1 = at least one failed.
//
// Local run:
//   SITE_URL=https://theflytrapferndale.com node .github/scripts/site-health.mjs

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { writeFile, mkdtemp, appendFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { renderPage } from './lib/headless.mjs'

const run = promisify(execFile)

const SITE_URL = (process.env.SITE_URL || 'https://theflytrapferndale.com').replace(/\/+$/, '')
const EXPECT_SHA = process.env.EXPECT_DATA_JS_SHA || ''
const ATTEMPTS = Math.max(1, Number(process.env.ATTEMPTS || 1))
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS || 15000)
const RENDER_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS || 45000)

// Pages serves from a CDN that caches aggressively. Every request carries a
// cache-buster and no-cache headers so a green result means the origin is
// healthy, not that some edge node still holds a good copy from an hour ago.
const NOCACHE = { 'cache-control': 'no-cache', pragma: 'no-cache' }
let bust = 0
const cacheBust = (url) => `${url}${url.includes('?') ? '&' : '?'}_hc=${Date.now()}-${bust++}`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(path, { text = true } = {}) {
  const url = path.startsWith('http') ? path : `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
  const res = await fetch(cacheBust(url), { headers: NOCACHE, redirect: 'follow' })
  return { url, status: res.status, ok: res.ok, body: text && res.ok ? await res.text() : '' }
}

// git's blob id for some bytes: sha1("blob <len>\0" + bytes). Same value
// `git hash-object` prints, so the workflow can compare the live file against
// the committed one without a second checkout.
const gitBlobSha = (buf) =>
  createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`, 'utf8'), buf])).digest('hex')

// ---------------------------------------------------------------- the checks

// 1. The document itself. A 404 or an HTML page with no mount point means
//    nothing downstream is worth checking.
async function checkIndex(state) {
  const r = await get('/')
  if (!r.ok) return fail(`GET / returned ${r.status}`)
  if (!/<div id="root">|<div id='root'>/.test(r.body)) return fail('index.html has no #root mount point')
  state.indexHtml = r.body
  return pass(`index.html served (${r.body.length} bytes) with #root present`)
}

// 2. Every file index.html pulls in. A missing script is a blank page, and the
//    load order in index.html IS the dependency graph, so one 404 breaks the rest.
// Every local file index.html points at, whatever tag points at it.
//
// Exported and pure so the tag coverage can be tested without a live site —
// this started as scripts and stylesheets only, and #142 quietly added three
// <link rel="preload"> tags that nothing was checking. A preload pointing at a
// 404 costs a wasted round trip and a console warning, and it is invisible
// until someone opens devtools.
//
// Only same-origin references. A CDN going down is real but it is not ours to
// fix, and failing the health check on unpkg's availability would page someone
// who can do nothing about it.
export function extractLocalRefs(html) {
  const refs = []

  for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)) {
    refs.push({ ref: m[1], kind: 'script' })
  }

  // One pass over <link> tags rather than a regex per rel: rel and href appear
  // in either order, and a per-rel pattern silently misses the ones nobody
  // thought to add.
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0]
    const href = tag.match(/\bhref="([^"]+)"/i)
    const rel = tag.match(/\brel="([^"]+)"/i)
    if (!href || !rel) continue
    const kind = rel[1].trim().toLowerCase()
    if (['stylesheet', 'preload', 'icon', 'apple-touch-icon'].includes(kind)) {
      refs.push({ ref: href[1], kind })
    }
  }

  return refs.filter((r) => !/^https?:|^\/\//i.test(r.ref) && !r.ref.startsWith('data:'))
}

// 2. Every file index.html pulls in. A missing script is a blank page, and the
//    load order in index.html IS the dependency graph, so one 404 breaks the rest.
//    Stylesheets, preloads and icons ride along — cheap to check, and a 404 on
//    any of them is a real defect even when the page still renders.
async function checkAssets(state) {
  const html = state.indexHtml || ''
  if (!html) return skip('index.html was not fetched')
  const refs = extractLocalRefs(html)
  if (!refs.length) return fail('index.html references no local scripts or stylesheets')

  const bad = []
  for (const { ref, kind } of refs) {
    const r = await get(ref, { text: false })
    if (!r.ok) bad.push(`${ref} (${kind}) -> ${r.status}`)
  }

  const byKind = refs.reduce((acc, r) => ({ ...acc, [r.kind]: (acc[r.kind] || 0) + 1 }), {})
  const tally = Object.entries(byKind).map(([k, n]) => `${n} ${k}`).join(', ')
  return bad.length
    ? fail(`${bad.length}/${refs.length} referenced files missing: ${bad.join(', ')}`)
    : pass(`all ${refs.length} local references return 200 (${tally})`)
}

// 3. THE check for the 2026-08-21 outage. data.js is loaded as a plain <script>;
//    one bad byte anywhere in it is a SyntaxError that takes out window.FT_DATA
//    and every helper beside it, and the page renders blank while still serving
//    a perfectly good HTTP 200.
//
//    `node --check` parses the file and stops — it never runs it, which matters
//    because this is a file fetched off the public internet.
async function checkDataJs(state) {
  const r = await get('/data.js')
  if (!r.ok) return fail(`GET /data.js returned ${r.status}`)
  state.dataJs = r.body
  state.dataJsSha = gitBlobSha(Buffer.from(r.body, 'utf8'))

  const dir = await mkdtemp(join(tmpdir(), 'ft-health-'))
  const tmp = join(dir, 'data.js')
  await writeFile(tmp, r.body)
  try {
    await run('node', ['--check', tmp])
  } catch (err) {
    const detail = String(err.stderr || err.message).split('\n').slice(0, 4).join(' ').trim()
    return fail(`the live data.js is not valid JavaScript — the site is blank: ${detail}`)
  }
  if (!/window\.FT_DATA\s*=/.test(r.body)) return fail('data.js parses but never assigns window.FT_DATA')
  const specials = (r.body.match(/id:\s*"special-\d+"/g) || []).length
  return pass(`data.js parses, assigns window.FT_DATA, carries ${specials} special(s)`)
}

// 4. A special whose photo 404s renders as a broken tile. Cheap to check and it
//    is the failure mode when a sync commits data.js but the image upload lost a
//    race with the deploy.
async function checkSpecialPhotos(state) {
  if (!state.dataJs) return skip('data.js was not fetched')
  const photos = [...state.dataJs.matchAll(/photo:\s*"([^"]+)"/g)].map((m) => m[1]).filter(Boolean)
  if (!photos.length) return pass('no special photos referenced (text-only cards)')
  const bad = []
  for (const p of photos) {
    const r = await get(p, { text: false })
    if (!r.ok) bad.push(`${p} -> ${r.status}`)
  }
  return bad.length ? fail(`${bad.length}/${photos.length} special photos missing: ${bad.join(', ')}`)
    : pass(`all ${photos.length} special photo(s) return 200`)
}

// GitHub's ubuntu runner images ship Chrome, Chromium and Edge. Take whichever
// is there rather than installing one — this repo has no build step and CI is
// not the place to start.
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  'microsoft-edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

async function findChrome() {
  for (const c of CHROME_CANDIDATES) {
    if (c.includes('/')) {
      try {
        await access(c)
        return c
      } catch {
        continue
      }
    }
    try {
      await run('which', [c])
      return c
    } catch {
      continue
    }
  }
  return null
}

// 5. The check that does not care how the site broke.
//
//    Everything above inspects bytes. This runs the actual page in an actual
//    browser — Babel transpiles the JSX, React mounts, data.js executes — and
//    then looks at the DOM that came out, plus anything the page logged on the
//    way. A blank site fails here no matter what caused it: a bad data.js, a
//    syntax error in any .jsx, a React crash, a CDN that did not answer.
//
//    It polls for the render rather than waiting a fixed interval, because the
//    in-browser Babel step is network-bound and a cold Pages cache is slower
//    than a warm one. Timing out is a real failure; being slow is not.
const READY = "document.getElementById('root') && document.getElementById('root').innerHTML.length > 500"

const PROBES = {
  rootLen: "document.getElementById('root') ? document.getElementById('root').innerHTML.length : 0",
  sections: "['menu','about','retail','press','visit'].filter(id => document.getElementById(id))",
  cards: "document.querySelectorAll('.special-card').length",
  ftData: 'typeof window.FT_DATA',
}

async function checkRender(state) {
  const chrome = await findChrome()
  if (!chrome) return skip('no Chrome/Chromium/Edge on this machine — render check needs one')

  let r
  try {
    r = await renderPage(chrome, cacheBust(SITE_URL + '/'), {
      readyExpression: READY,
      timeoutMs: RENDER_TIMEOUT_MS,
      probes: PROBES,
    })
  } catch (err) {
    return fail(`headless browser could not load the page: ${String(err.message).slice(0, 300)}`)
  }
  state.render = r

  if (!r.ready) {
    const why = r.errors.length ? ` Page errors: ${r.errors.slice(0, 3).join(' | ').slice(0, 400)}` : ''
    return fail(
      `the page loaded but React never rendered — #root held ${r.probes.rootLen} bytes after ` +
        `${Math.round(r.waitedMs / 1000)}s. This is what a blank site looks like.${why}`
    )
  }

  // Rendered something, but check it rendered everything. A partial render — one
  // section throwing while the rest mount — would sail past a length check.
  const sections = Array.isArray(r.probes.sections) ? r.probes.sections : []
  const missing = ['menu', 'about', 'retail', 'press', 'visit'].filter((id) => !sections.includes(id))
  if (missing.length) return fail(`rendered, but these sections are missing: ${missing.join(', ')}`)

  if (r.probes.ftData !== 'object') return fail(`rendered, but window.FT_DATA is ${r.probes.ftData}, not an object`)

  // Uncaught exceptions and console.error on a page that otherwise looks fine.
  // Reported, not fatal: an ad blocker or a flaky third-party script should not
  // page anyone at 3am, but it should show up in the report.
  const noise = r.errors.length ? ` (${r.errors.length} page error(s): ${r.errors.slice(0, 2).join(' | ').slice(0, 200)})` : ''
  return pass(
    `React mounted in ${(r.waitedMs / 1000).toFixed(1)}s — #root ${r.probes.rootLen} bytes, ` +
      `all 5 sections, ${r.probes.cards} special card(s)${noise}`
  )
}

// 6. Post-deploy only: is the file being served the one we just pushed? Pages
//    can lag or a deploy can fail silently, and "the site is fine" is not the
//    same answer as "the update went live".
async function checkFreshness(state) {
  if (!EXPECT_SHA) return skip('no EXPECT_DATA_JS_SHA given (not a post-deploy run)')
  if (!state.dataJsSha) return skip('data.js was not fetched')
  return state.dataJsSha === EXPECT_SHA
    ? pass(`the live data.js is the committed one (${EXPECT_SHA.slice(0, 12)})`)
    : fail(`the deploy has not gone live — serving ${state.dataJsSha.slice(0, 12)}, expected ${EXPECT_SHA.slice(0, 12)}`)
}

// ------------------------------------------------------------------- harness

const pass = (msg) => ({ status: 'pass', msg })
const fail = (msg) => ({ status: 'fail', msg })
const skip = (msg) => ({ status: 'skip', msg })

const CHECKS = [
  ['index', checkIndex],
  ['assets', checkAssets],
  ['data.js', checkDataJs],
  ['photos', checkSpecialPhotos],
  ['render', checkRender],
  ['freshness', checkFreshness],
]

async function runOnce() {
  const state = {}
  const results = []
  for (const [name, fn] of CHECKS) {
    try {
      results.push({ name, ...(await fn(state)) })
    } catch (err) {
      // An unexpected throw is a failed check, not a crashed monitor. A monitor
      // that dies on a network blip is worse than no monitor.
      results.push({ name, status: 'fail', msg: `check threw: ${String(err.message).slice(0, 200)}` })
    }
  }
  return results
}

const ICON = { pass: '✅', fail: '❌', skip: '⏭️' }

async function main() {
  let results = []
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    results = await runOnce()
    if (!results.some((r) => r.status === 'fail')) break
    if (attempt < ATTEMPTS) {
      const failed = results.filter((r) => r.status === 'fail').map((r) => r.name).join(', ')
      console.log(`Attempt ${attempt}/${ATTEMPTS} failed (${failed}) — retrying in ${RETRY_DELAY_MS}ms`)
      await sleep(RETRY_DELAY_MS)
    }
  }

  const failed = results.filter((r) => r.status === 'fail')
  const lines = [
    `## Site health — ${SITE_URL}`,
    '',
    failed.length ? `**${failed.length} check(s) FAILED.**` : '**All checks passed.**',
    '',
    '| Check | Result | Detail |',
    '| --- | --- | --- |',
    ...results.map((r) => `| \`${r.name}\` | ${ICON[r.status]} ${r.status} | ${r.msg.replace(/\|/g, '\\|')} |`),
  ]
  const report = lines.join('\n')

  console.log(report)
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report + '\n')
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `ok=${failed.length ? 'false' : 'true'}\n` +
        `failed=${failed.map((r) => r.name).join(',')}\n` +
        `summary<<HEALTH_EOF\n${report}\nHEALTH_EOF\n`
    )
  }

  if (failed.length) {
    for (const f of failed) console.error(`::error::[${f.name}] ${f.msg}`)
    process.exit(1)
  }
}

// Only probe when run as a command. extractLocalRefs is imported by the tests,
// and without this guard importing the module fires a full live health check —
// 35 seconds and a real request to production on every test run.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error(String(err?.stack || err))
    process.exit(1)
  })
}
