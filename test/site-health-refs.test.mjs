// What the health check considers "a file the page depends on".
//
// This is the part that silently under-covers. It began as scripts and
// stylesheets, and #142 added three <link rel="preload"> tags that nothing was
// checking — a preload aimed at a 404 costs a wasted round trip and a console
// warning, and stays invisible until someone opens devtools. A check that
// quietly stops covering new tags reports green for the wrong reason, which is
// worse than not having it.
//
// Tested against the real index.html as well as synthetic cases, so adding a
// tag to the page without teaching the checker about it shows up here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractLocalRefs } from '../.github/scripts/site-health.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kinds = (html) => extractLocalRefs(html).map((r) => r.kind);
const paths = (html) => extractLocalRefs(html).map((r) => r.ref);

test('picks up scripts, stylesheets, preloads and icons', () => {
  const html = `
    <script src="data.js"></script>
    <script type="text/babel" src="App.jsx"></script>
    <link rel="stylesheet" href="site.css">
    <link rel="preload" as="image" href="assets/brand/logo.png" fetchpriority="high">
    <link rel="preload" as="font" type="font/woff2" href="fonts/inter.woff2" crossorigin>
    <link rel="icon" type="image/png" sizes="192x192" href="favicon.png">
    <link rel="apple-touch-icon" href="favicon.png">
  `;
  assert.deepEqual(paths(html), [
    'data.js',
    'App.jsx',
    'site.css',
    'assets/brand/logo.png',
    'fonts/inter.woff2',
    'favicon.png',
    'favicon.png',
  ]);
  assert.deepEqual(kinds(html), [
    'script',
    'script',
    'stylesheet',
    'preload',
    'preload',
    'icon',
    'apple-touch-icon',
  ]);
});

test('reads rel and href in either order', () => {
  // A per-rel regex anchored on attribute order misses these.
  const html = `
    <link href="site.css" rel="stylesheet">
    <link as="font" href="fonts/x.woff2" crossorigin rel="preload">
  `;
  assert.deepEqual(kinds(html), ['stylesheet', 'preload']);
});

test('skips cross-origin references', () => {
  // A CDN outage is real, but not ours to fix, and paging someone over unpkg
  // being down helps nobody.
  const html = `
    <script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script>
    <script src="//cdn.example.com/x.js"></script>
    <link rel="stylesheet" href="https://fonts.example.com/x.css">
    <script src="data.js"></script>
  `;
  assert.deepEqual(paths(html), ['data.js']);
});

test('skips data: URIs', () => {
  const html = '<link rel="icon" href="data:image/png;base64,iVBORw0KGgo=">';
  assert.deepEqual(extractLocalRefs(html), []);
});

test('ignores link rels that are not fetched resources', () => {
  const html = `
    <link rel="canonical" href="https://theflytrapferndale.com/">
    <link rel="manifest" href="site.webmanifest">
    <link rel="stylesheet" href="site.css">
  `;
  assert.deepEqual(kinds(html), ['stylesheet']);
});

test('a link with no href or no rel is ignored rather than throwing', () => {
  const html = '<link rel="preload" as="font"><link href="x.css"><link>';
  assert.deepEqual(extractLocalRefs(html), []);
});

test('empty html yields nothing', () => {
  assert.deepEqual(extractLocalRefs(''), []);
});

// The regression guard: the shipped page's own tags.
test('covers every local reference in the real index.html', async () => {
  const html = await readFile(resolve(REPO, 'index.html'), 'utf8');
  const found = extractLocalRefs(html);

  // The seven scripts index.html loads, in the order guardrails enforces.
  const scripts = found.filter((r) => r.kind === 'script').map((r) => r.ref);
  assert.deepEqual(scripts, [
    'data.js',
    'image-slot.js',
    'tweaks-panel.jsx',
    'Nav.jsx',
    'Menu.jsx',
    'Sections.jsx',
    'App.jsx',
  ]);

  assert.ok(
    found.filter((r) => r.kind === 'stylesheet').length >= 2,
    'colors_and_type.css and site.css must both be covered'
  );

  // The LCP work in #142 — the gap that prompted this test.
  const preloads = found.filter((r) => r.kind === 'preload').map((r) => r.ref);
  assert.equal(preloads.length, 3, `expected 3 preloads, saw ${preloads.join(', ')}`);
  assert.ok(preloads.some((p) => /logo/.test(p)), 'the hero wordmark preload');
  assert.ok(preloads.filter((p) => /\.woff2$/.test(p)).length === 2, 'both above-the-fold fonts');
});

test('every local reference in the real index.html exists on disk', async () => {
  // Catches a typo'd href at commit time rather than on the live site.
  const { access } = await import('node:fs/promises');
  const html = await readFile(resolve(REPO, 'index.html'), 'utf8');
  const missing = [];
  for (const { ref, kind } of extractLocalRefs(html)) {
    await access(resolve(REPO, ref.split('?')[0])).catch(() => missing.push(`${ref} (${kind})`));
  }
  assert.deepEqual(missing, [], 'index.html references files that are not in the repo');
});
