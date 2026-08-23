// Regression tests for the 2026-08-21 outage: Toast returned a special
// description containing a CRLF, the serializer escaped the LF but not the CR,
// and the surviving raw CR terminated the string literal mid-line. data.js
// stopped parsing, window.FT_DATA never got defined and the site rendered blank
// for 25 hours (broken by f3359d7, patched by hand in e0b8d07).
//
// The contract these lock down: whatever bytes Toast hands the serializer, the
// data.js it produces still parses.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  buildSpecialsBlock,
  spliceSpecials,
  updateSoupSpecial,
  updateMuffinSpecial,
} from '../apps-script/lib/specials.js';
import { classifyVeg, normalizeToastText } from '../.github/scripts/specials-sync.mjs';

const SKELETON = [
  'window.FT_DATA = {',
  '  /* SPECIALS:START */',
  '  sourcePost: "",',
  '  weekOf: "Week of X",',
  '  specials: [],',
  '  /* SPECIALS:END */',
  '  soupSpecial: { name: "Soup O\' The Day", flavor: "x", available: true, cup: "5.00", bowl: "8.00" },',
  '  muffinSpecial: { name: "Mini Muffin", flavor: "y", price: "3.00" },',
  '};',
  '',
].join('\n');

// Compile-only: vm.Script parses and compiles the source and never runs it.
// This is the same check the sync script applies before writing data.js.
const parses = (src) => {
  try {
    new vm.Script(src, { filename: 'data.js' });
    return null;
  } catch (err) {
    return err.message;
  }
};

const withSpecialDesc = (desc) =>
  spliceSpecials(
    SKELETON,
    buildSpecialsBlock({
      weekOf: 'Week of X',
      specials: [{ name: 'n', desc, veg: false, photo: '', price: '1.00' }],
    })
  );

// The four JS LineTerminators plus the control bytes a POS field can pick up.
// CR is the one that caused the outage; the rest ride along so the whole class
// is covered rather than the single byte we happened to get bitten by.
const HOSTILE = {
  'CR (the outage)': '\r',
  CRLF: '\r\n',
  LF: '\n',
  'LS U+2028': '\u2028',
  'PS U+2029': '\u2029',
  'NUL U+0000': '\u0000',
  'VT U+000B': '\u000b',
  'FF U+000C': '\u000c',
  TAB: '\t',
  'NEL U+0085': '\u0085',
  'double quote': '"',
  backslash: '\\',
  'backslash before quote': '\\"',
  'lone high surrogate': '\ud800',
};

for (const [label, ch] of Object.entries(HOSTILE)) {
  test(`data.js still parses with ${label} in a special description`, () => {
    const out = withSpecialDesc(`aioli,${ch}a sunny egg`);
    assert.equal(parses(out), null, `${label} broke the parse`);
  });

  test(`data.js still parses with ${label} in a special name`, () => {
    const out = spliceSpecials(
      SKELETON,
      buildSpecialsBlock({
        weekOf: 'Week of X',
        specials: [{ name: `The${ch}Kowalski`, desc: 'd', veg: false, photo: '', price: '1.00' }],
      })
    );
    assert.equal(parses(out), null, `${label} broke the parse`);
  });

  test(`data.js still parses with ${label} in the soup flavor`, () => {
    assert.equal(parses(updateSoupSpecial(SKELETON, { flavor: `Beef${ch}barley` })), null);
  });
}

test('the exact Stanley Kowalski description that took the site down', () => {
  // Verbatim from the f3359d7 sync, CRLF and all.
  const desc =
    "It's a fried bologna sandwich! House made, smoked thick-cut and green chili " +
    "infused on a bun with cowboy candy, pickled onion, BBQ aioli, 'merican cheese,\r\n" +
    'a sunny egg, lettuce and tomato; pick your side!';
  const out = withSpecialDesc(desc);
  assert.equal(parses(out), null);
  assert.equal(/[\r\u2028\u2029]/.test(out), false, 'a raw line terminator reached data.js');
});

test('no raw carriage return survives into the generated block', () => {
  const out = withSpecialDesc('a\r\nb');
  assert.equal(out.includes('\r'), false);
  assert.match(out, /desc: "a\\r\\nb"/);
});

// Toast text is normalized at ingest as well as escaped at serialization. Both
// layers independently prevent the outage; this covers the ingest one.
test('normalizeToastText collapses every line terminator to a single space', () => {
  assert.equal(normalizeToastText('a\r\nb'), 'a b');
  assert.equal(normalizeToastText('a\rb'), 'a b');
  assert.equal(normalizeToastText('a\u2028b'), 'a b');
  assert.equal(normalizeToastText('  a \t\t b  '), 'a b');
});

test('normalizeToastText strips invisible control bytes', () => {
  assert.equal(normalizeToastText('a\u0000bc'), 'abc');
});

test('normalizeToastText handles null and undefined', () => {
  assert.equal(normalizeToastText(null), '');
  assert.equal(normalizeToastText(undefined), '');
});

// The veg-marker branch already collapsed whitespace; the plain branch passed
// Toast's bytes straight through. That asymmetry is why a meat special was the
// one that broke — this asserts both branches now normalize.
test('classifyVeg normalizes the description with or without the veg marker', () => {
  assert.equal(classifyVeg('fried bologna\r\nsandwich').desc, 'fried bologna sandwich');
  assert.equal(classifyVeg('grilled cheese\r\nsandwich (v)').desc, 'grilled cheese sandwich');
});

// Preserved (not re-supplied) extras fields are read back out of data.js and
// re-serialized on every run. Without decoding on read, jsStr escaped the
// already-escaped text and the backslashes doubled on each no-op sync.
test('a preserved soup flavor survives repeated syncs unchanged', () => {
  const original = 'Beef & "barley" 50% \\ off';
  let src = updateSoupSpecial(SKELETON, { flavor: original });
  const afterFirst = src;
  for (let i = 0; i < 5; i++) src = updateSoupSpecial(src, {});
  assert.equal(src, afterFirst, 'no-op syncs mutated the stored flavor');
  assert.equal(parses(src), null);
});

test('a preserved muffin flavor survives repeated syncs unchanged', () => {
  let src = updateMuffinSpecial(SKELETON, { flavor: 'Blueberry "jumbo" \\ swirl' });
  const afterFirst = src;
  for (let i = 0; i < 5; i++) src = updateMuffinSpecial(src, {});
  assert.equal(src, afterFirst);
});
