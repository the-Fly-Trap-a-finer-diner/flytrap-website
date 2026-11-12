// What the health check considers "a page search engines can actually index".
//
// The four conditions here are the ones SUMMIT-252's launch gate names, and
// each has shipped to production on some site in this framework: a preview
// `Disallow: /` that went live (and took the site out of the index until
// someone noticed), a canonical left pointing at a dead staging URL, an
// og:image renamed without updating the meta, JSON-LD broken by an unescaped
// quote in a synced field.
//
// None of them break the page. Every check in site-health.mjs above this one
// stays green while all four are wrong, which is exactly why they need their
// own check — and why the parsing is tested against the real index.html, so a
// head-tag change that moves an attribute around shows up here rather than as
// a silent green.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractRobotsMeta,
  findNoindex,
  robotsTxtBlocksAll,
  extractCanonical,
  extractOgImage,
  parseJsonLd,
} from '../.github/scripts/site-health.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFile(resolve(REPO, f), 'utf8');

// ------------------------------------------------------------ robots meta

test('reads robots, googlebot and bingbot directives whatever the attribute order', () => {
  const html = `
    <meta name="robots" content="index, follow, max-image-preview:large">
    <meta content="noindex" name="googlebot">
    <meta name="viewport" content="width=device-width">
  `;
  assert.deepEqual(extractRobotsMeta(html), [
    { name: 'robots', directives: ['index', 'follow', 'max-image-preview:large'] },
    { name: 'googlebot', directives: ['noindex'] },
  ]);
});

test('noindex and none are blockers; nofollow alone is not', () => {
  assert.deepEqual(findNoindex('<meta name="robots" content="index, follow">'), []);
  assert.deepEqual(findNoindex('<meta name="robots" content="nofollow">'), []);
  assert.equal(findNoindex('<meta name="robots" content="noindex, follow">').length, 1);
  assert.equal(findNoindex('<meta name="robots" content="none">').length, 1);
  assert.equal(findNoindex('<meta name="ROBOTS" content="NOINDEX">').length, 1);
});

test('a crawler-specific noindex is caught even when the generic meta is fine', () => {
  const html = `
    <meta name="robots" content="index, follow">
    <meta name="googlebot" content="noindex">
  `;
  const blocking = findNoindex(html);
  assert.equal(blocking.length, 1);
  assert.match(blocking[0], /googlebot/);
});

// ------------------------------------------------------------- robots.txt

test('blanket Disallow: / for every crawler is a blocker', () => {
  assert.ok(robotsTxtBlocksAll('User-agent: *\nDisallow: /'));
  assert.ok(robotsTxtBlocksAll('user-agent:*\ndisallow:/'));
});

test('a narrower disallow, or one aimed at a named bot, is not', () => {
  assert.equal(robotsTxtBlocksAll('User-agent: *\nDisallow: /admin'), null);
  assert.equal(robotsTxtBlocksAll('User-agent: GPTBot\nDisallow: /'), null);
  assert.equal(robotsTxtBlocksAll('User-agent: *\nAllow: /'), null);
  assert.equal(robotsTxtBlocksAll(''), null);
});

test('comments and blank lines do not confuse the group parser', () => {
  const txt = `
    # staging leftovers
    User-agent: GPTBot
    Disallow: /

    User-agent: *
    Allow: /
  `;
  assert.equal(robotsTxtBlocksAll(txt), null);
});

test('one group naming several agents including * still counts', () => {
  assert.ok(robotsTxtBlocksAll('User-agent: GPTBot\nUser-agent: *\nDisallow: /'));
});

test('the committed robots.txt allows crawling', async () => {
  assert.equal(robotsTxtBlocksAll(await read('robots.txt')), null);
});

// ----------------------------------------------------- canonical, og:image

test('canonical is read in either attribute order, and absent reads as empty', () => {
  assert.equal(
    extractCanonical('<link rel="canonical" href="https://example.com/">'),
    'https://example.com/'
  );
  assert.equal(
    extractCanonical('<link href="https://example.com/x" rel="canonical">'),
    'https://example.com/x'
  );
  assert.equal(extractCanonical('<link rel="stylesheet" href="site.css">'), '');
});

test('og:image is not confused by og:image:width or og:image:alt', () => {
  const html = `
    <meta property="og:image" content="https://example.com/og.jpg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:alt" content="alt text">
  `;
  assert.equal(extractOgImage(html), 'https://example.com/og.jpg');
});

// ---------------------------------------------------------------- JSON-LD

test('valid JSON-LD reports its types and no errors', () => {
  const html = `<script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Restaurant","name":"The Fly Trap"}
  </script>`;
  const ld = parseJsonLd(html);
  assert.equal(ld.count, 1);
  assert.deepEqual(ld.errors, []);
  assert.deepEqual(ld.types, ['Restaurant']);
});

test('an unescaped quote in a synced field is an error, not a crash', () => {
  const html = `<script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Restaurant","name":"Shannon"s"}
  </script>`;
  const ld = parseJsonLd(html);
  assert.equal(ld.count, 1);
  assert.equal(ld.errors.length, 1);
  assert.match(ld.errors[0], /not valid JSON/);
});

test('JSON that parses but carries no @type or @context is still an error', () => {
  const ld = parseJsonLd('<script type="application/ld+json">{}</script>');
  assert.equal(ld.errors.length, 2);
});

test('an array of nodes is walked, and one bad node does not hide the good ones', () => {
  const html = `<script type="application/ld+json">
    [{"@context":"https://schema.org","@type":"Restaurant"},{"@context":"https://schema.org"}]
  </script>`;
  const ld = parseJsonLd(html);
  assert.deepEqual(ld.types, ['Restaurant']);
  assert.equal(ld.errors.length, 1);
  assert.match(ld.errors[0], /no @type/);
});

test('no ld+json block at all is reported as zero, not as valid', () => {
  assert.equal(parseJsonLd('<html><head></head></html>').count, 0);
});

// --------------------------------------------- the real index.html passes

test('the committed index.html is indexable by all four conditions', async () => {
  const html = await read('index.html');

  assert.deepEqual(findNoindex(html), []);

  const canonical = extractCanonical(html);
  assert.match(canonical, /^https:\/\/theflytrapferndale\.com\//);

  const ogImage = extractOgImage(html);
  assert.match(ogImage, /^https:\/\/theflytrapferndale\.com\/assets\//);

  const ld = parseJsonLd(html);
  assert.deepEqual(ld.errors, []);
  assert.ok(ld.count >= 1, 'index.html carries at least one JSON-LD block');
  assert.ok(ld.types.includes('Restaurant'), `expected a Restaurant node, got ${ld.types.join(', ')}`);
});
