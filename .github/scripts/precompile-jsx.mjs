// Transpile the .jsx files ahead of time, for the deploy artifact only.
//
// The site loads @babel/standalone from a CDN and compiles its JSX in the
// browser on every visit. That costs about a second of main thread before
// anything renders, measured on a 4x-throttled CPU (Lighthouse's mobile
// default) — and it costs it on repeat visits too, because the HTTP cache
// removes the download but not the parse-and-compile:
//
//                        cold visit        repeat visit
//   React mounted      1515 -> 343 ms     1145 -> 137 ms
//   main thread block  1210 -> 217 ms     1046 -> 189 ms
//
// Core Web Vitals is a ranking signal and this is the largest single lever on
// the page, so it is worth removing.
//
// WHAT THIS DELIBERATELY DOES NOT DO: introduce a build step to the repo.
// AGENTS.md forbids one and that constraint has kept this project simple. The
// repo keeps its .jsx files and its Babel script tag, `python3 -m http.server`
// still works with no tooling, and nothing generated is ever committed. This
// runs against the staged _site directory during the Pages deploy and nowhere
// else — the same place the sitemap gets stamped.
//
// FAIL-SAFE: index.html is rewritten LAST and is the only thing that switches
// behaviour. If anything before that throws, _site still contains the original
// index.html pointing at the .jsx files and the CDN Babel tag — in other words
// exactly what ships today. The worst case for this script failing is that the
// site keeps its current performance, never that it breaks.
//
// The Babel build is pinned by index.html itself — the CDN URL and its SRI
// hash — rather than duplicated here, so CI cannot drift from what the browser
// would have used. The hash is verified before the bundle is executed.
//
// usage: node .github/scripts/precompile-jsx.mjs <site-dir>

import { readFile, writeFile, rm, mkdtemp } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const run = promisify(execFile)

/**
 * Pull the Babel tag and the JSX script tags out of index.html.
 * Pure, so the parsing can be tested without a network or a browser.
 */
export function parseIndex(html) {
  const babelTag = (html.match(/<script[^>]*@babel\/standalone[^>]*><\/script>/) || [])[0] || null
  const babelUrl = babelTag ? (babelTag.match(/src="([^"]+)"/) || [])[1] : null
  const integrity = babelTag ? (babelTag.match(/integrity="([^"]+)"/) || [])[1] : null

  // Order matters: index.html's script order IS the dependency graph.
  const jsx = [...html.matchAll(/<script[^>]*type="text\/babel"[^>]*src="([^"]+)"[^>]*><\/script>/g)]
    .map((m) => ({ tag: m[0], src: m[1] }))

  return { babelTag, babelUrl, integrity, jsx }
}

/** `App.jsx` -> `App.js`. */
export const compiledName = (src) => src.replace(/\.jsx$/, '.js')

/**
 * Swap the Babel tag out and the compiled scripts in. Pure.
 * Preserves the original order, which the dependency graph depends on.
 */
export function rewriteIndex(html, { babelTag, jsx }) {
  let out = html
  if (babelTag) {
    // Take the surrounding whitespace with it so the output stays tidy.
    out = out.replace(new RegExp(`\\n?[ \\t]*${escapeRe(babelTag)}`), '')
  }
  for (const { tag, src } of jsx) {
    out = out.replace(tag, `<script src="${compiledName(src)}"></script>`)
  }
  return out
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Verify the CDN bundle against the SRI hash index.html already pins it to.
// Same guarantee the browser gets, and it means a compromised or truncated
// download cannot silently produce different JavaScript than production serves.
export function sriMatches(buf, integrity) {
  if (!integrity) return { ok: false, reason: 'index.html pins no integrity hash' }
  const [algo, expected] = integrity.split('-')
  if (!['sha256', 'sha384', 'sha512'].includes(algo)) {
    return { ok: false, reason: `unsupported hash algorithm ${algo}` }
  }
  const actual = createHash(algo).update(buf).digest('base64')
  return actual === expected
    ? { ok: true }
    : { ok: false, reason: `${algo} mismatch — expected ${expected.slice(0, 16)}…, got ${actual.slice(0, 16)}…` }
}

async function loadBabel(url, integrity) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetching Babel returned ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())

  const check = sriMatches(buf, integrity)
  if (!check.ok) throw new Error(`Babel bundle failed its integrity check: ${check.reason}`)

  // @babel/standalone is a UMD bundle: requiring it in Node yields the same
  // Babel object the browser puts on window, so the transform is identical.
  const dir = await mkdtemp(join(tmpdir(), 'babel-'))
  const file = join(dir, 'babel.cjs')
  await writeFile(file, buf)
  try {
    const Babel = createRequire(import.meta.url)(file)
    if (typeof Babel.transform !== 'function') throw new Error('bundle did not export transform()')
    return { Babel, cleanup: () => rm(dir, { recursive: true, force: true }) }
  } catch (err) {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
    throw err
  }
}

async function main() {
  const siteDir = resolve(process.argv[2] || '_site')
  const indexPath = join(siteDir, 'index.html')
  const html = await readFile(indexPath, 'utf8')

  const parsed = parseIndex(html)
  if (!parsed.jsx.length) {
    console.log('No text/babel script tags — nothing to precompile.')
    return
  }
  if (!parsed.babelUrl) throw new Error('found JSX tags but no @babel/standalone tag to pin the version')

  console.log(`Babel: ${parsed.babelUrl}`)
  const { Babel, cleanup } = await loadBabel(parsed.babelUrl, parsed.integrity)
  console.log(`Loaded @babel/standalone ${Babel.version}, integrity verified.\n`)

  try {
    let bytesIn = 0
    let bytesOut = 0
    const written = []

    for (const { src } of parsed.jsx) {
      const source = await readFile(join(siteDir, src), 'utf8')
      const { code } = Babel.transform(source, { presets: ['react'], filename: src })
      const outName = compiledName(src)
      const outPath = join(siteDir, outName)
      await writeFile(outPath, code)

      // Compile-check the output before it is allowed to matter. A transform
      // that emits something unparseable would blank the site exactly the way
      // a bad data.js does.
      await run('node', ['--check', outPath])

      bytesIn += Buffer.byteLength(source)
      bytesOut += Buffer.byteLength(code)
      written.push({ src, outName })
      console.log(`  ${src} -> ${outName}  ${Buffer.byteLength(source)} -> ${Buffer.byteLength(code)} bytes`)
    }

    // The switch. Everything above is additive; until this line _site still
    // serves exactly what it does today.
    const next = rewriteIndex(html, parsed)
    if (/text\/babel/.test(next)) throw new Error('rewrite left a text/babel tag behind')
    if (/@babel\/standalone/.test(next)) throw new Error('rewrite left the Babel CDN tag behind')
    await writeFile(indexPath, next)

    // The .jsx sources are dead weight in the artifact once nothing loads them.
    for (const { src } of parsed.jsx) await rm(join(siteDir, src), { force: true })

    console.log(`\n${written.length} files precompiled: ${bytesIn} -> ${bytesOut} bytes.`)
    console.log('Babel CDN tag removed from index.html; ~639 KB gzip no longer downloaded, ~3 MB no longer parsed per visit.')

    if (process.env.GITHUB_STEP_SUMMARY) {
      const { appendFile } = await import('node:fs/promises')
      await appendFile(
        process.env.GITHUB_STEP_SUMMARY,
        `### JSX precompiled\n\n${written.length} files, ${bytesIn} → ${bytesOut} bytes. ` +
          `Babel ${Babel.version} removed from the page.\n`
      )
    }
  } finally {
    await cleanup()
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    // Never fail the deploy. index.html is untouched unless everything above
    // succeeded, so the artifact still holds the in-browser-Babel version —
    // today's behaviour, which works.
    console.error(`::warning::Precompiling JSX failed, shipping the in-browser Babel version instead: ${err.message}`)
    process.exit(0)
  })
}
