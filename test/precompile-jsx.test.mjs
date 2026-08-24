// The parsing and rewriting that decides what the deployed index.html loads.
//
// If this gets it wrong the site ships with a broken script graph — which is a
// blank page, the failure mode this repo has already had twice. The two ways it
// can be wrong are opposites: leaving Babel in place (no benefit, harmless) or
// dropping/reordering a script (blank site). Both are covered here, along with
// the integrity check that stops a tampered CDN bundle being executed in CI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIndex, rewriteIndex, compiledName, sriMatches } from '../.github/scripts/precompile-jsx.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ------------------------------------------------------------------ parsing

test('finds the Babel tag, its URL and its integrity hash', () => {
  const html = '<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-abc" crossorigin="anonymous"></script>';
  const p = parseIndex(html);
  assert.equal(p.babelUrl, 'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js');
  assert.equal(p.integrity, 'sha384-abc');
});

test('finds the JSX scripts in document order', () => {
  const html = `
    <script src="data.js"></script>
    <script type="text/babel" src="tweaks-panel.jsx"></script>
    <script type="text/babel" src="Nav.jsx"></script>
    <script type="text/babel" src="App.jsx"></script>
  `;
  assert.deepEqual(parseIndex(html).jsx.map((j) => j.src), ['tweaks-panel.jsx', 'Nav.jsx', 'App.jsx']);
});

test('plain scripts are left out of the JSX list', () => {
  // data.js and image-slot.js are real JavaScript and must not be transpiled.
  const html = '<script src="data.js"></script><script src="image-slot.js"></script>';
  const p = parseIndex(html);
  assert.deepEqual(p.jsx, []);
  assert.equal(p.babelTag, null);
});

test('compiledName swaps only the extension', () => {
  assert.equal(compiledName('App.jsx'), 'App.js');
  assert.equal(compiledName('tweaks-panel.jsx'), 'tweaks-panel.js');
  assert.equal(compiledName('data.js'), 'data.js');
});

// ---------------------------------------------------------------- rewriting

test('rewriting drops Babel and swaps each JSX tag, preserving order', () => {
  const html = [
    '<script src="data.js"></script>',
    '<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>',
    '<script type="text/babel" src="Nav.jsx"></script>',
    '<script type="text/babel" src="App.jsx"></script>',
  ].join('\n');
  const out = rewriteIndex(html, parseIndex(html));

  assert.doesNotMatch(out, /@babel\/standalone/);
  assert.doesNotMatch(out, /text\/babel/);
  assert.match(out, /<script src="data\.js"><\/script>/, 'plain scripts survive untouched');
  assert.ok(out.indexOf('Nav.js') < out.indexOf('App.js'), 'load order must be preserved');
});

test('rewriting is a no-op when there is nothing to do', () => {
  const html = '<script src="data.js"></script>';
  assert.equal(rewriteIndex(html, parseIndex(html)), html);
});

// -------------------------------------------------- the real shipped page

test('the real index.html rewrites to a complete, correctly ordered script graph', async () => {
  const html = await readFile(resolve(REPO, 'index.html'), 'utf8');
  const parsed = parseIndex(html);

  assert.equal(parsed.jsx.length, 5, 'expected the five .jsx files');
  assert.ok(parsed.babelUrl, 'index.html must pin a Babel URL for CI to reuse');
  assert.ok(parsed.integrity, 'index.html must pin an integrity hash');

  const out = rewriteIndex(html, parsed);
  assert.doesNotMatch(out, /text\/babel/);
  assert.doesNotMatch(out, /@babel\/standalone/);

  // Guardrails enforces this exact order in the committed file; the deployed
  // file has to keep it, with the .jsx entries swapped for their .js output.
  const order = [...out.matchAll(/<script[^>]*src="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((s) => !/^https?:/.test(s));
  assert.deepEqual(order, [
    'data.js',
    'image-slot.js',
    'tweaks-panel.js',
    'Nav.js',
    'Menu.js',
    'Sections.js',
    'App.js',
  ]);
});

// ------------------------------------------------------------- integrity

test('a matching bundle passes the integrity check', () => {
  const buf = Buffer.from('pretend this is babel');
  const hash = createHash('sha384').update(buf).digest('base64');
  assert.equal(sriMatches(buf, `sha384-${hash}`).ok, true);
});

test('a tampered bundle is rejected', () => {
  // The point of the check: CI must not execute a bundle that is not the one
  // the browser would have loaded.
  const hash = createHash('sha384').update(Buffer.from('the real babel')).digest('base64');
  const r = sriMatches(Buffer.from('a malicious babel'), `sha384-${hash}`);
  assert.equal(r.ok, false);
  assert.match(r.reason, /mismatch/);
});

test('a missing or unsupported hash is rejected, not skipped', () => {
  assert.equal(sriMatches(Buffer.from('x'), '').ok, false);
  assert.equal(sriMatches(Buffer.from('x'), undefined).ok, false);
  assert.match(sriMatches(Buffer.from('x'), 'md5-abc').reason, /unsupported/);
});
