// Pure helpers shared by Apps Script (clasp-pushed) and the local test runner.
// No GAS or Node APIs — string in, string out. The module.exports block is
// guarded so it is a no-op in Apps Script (where `module` is undefined) and
// active in Node (CommonJS), which the .mjs tests import via ESM/CJS interop.

// Serialize a value as the INNER text of a double-quoted JS string literal.
//
// data.js is loaded by the browser as a plain <script>, so this output has to be
// a legal string-literal body no matter what Toast puts in a description. The
// characters that matter are the two delimiters (\ and ") and the four JS
// LineTerminators — LF, CR, U+2028, U+2029. A raw CR is the one that has already
// bitten us: Toast returns CRLF in some descriptions, the old escaper only
// handled LF, and the surviving CR terminated the string mid-line, turned all of
// data.js into a SyntaxError and blanked the site (fixed by e0b8d07, Aug 2026).
//
// JSON.stringify is the spec-complete escaper for all of that: it escapes both
// delimiters and every C0 control, CR and LF included. Slicing off its quotes
// leaves the literal body. It leaves U+2028/U+2029 bare — legal inside a string
// literal since ES2019, so they no longer break parsing, but they are invisible
// line breaks in the rendered text, so escape them too.
function jsStr(s) {
  return JSON.stringify(String(s == null ? '' : s))
    .slice(1, -1)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function buildSpecialsBlock(input) {
  var weekOf = input.weekOf;
  var specials = input.specials || [];
  var lines = specials.map(function (s, i) {
    var parts = [
      'id: "special-' + (i + 1) + '"',
      'name: "' + jsStr(s.name) + '"',
      'desc: "' + jsStr(s.desc) + '"',
      'veg: ' + (s.veg ? 'true' : 'false'),
      'photo: "' + jsStr(s.photo) + '"',
    ];
    // Strip a leading "$" — Sections.jsx renders `${s.price}`, so a stored
    // "$15.95" would show as "$$15.95".
    var price = String(s.price == null ? '' : s.price).trim().replace(/^\$+/, '').trim();
    if (price) parts.push('price: "' + jsStr(price) + '"');
    return '    { ' + parts.join(', ') + ' },';
  });
  var head = [
    '  /* SPECIALS:START */',
    '  sourcePost: "",',
    '  weekOf: "' + jsStr(weekOf) + '",',
  ];
  var body = lines.length
    ? ['  specials: ['].concat(lines).concat(['  ],'])
    : ['  specials: [],'];
  return head.concat(body).concat(['  /* SPECIALS:END */']).join('\n');
}

function spliceSpecials(dataJsText, newBlock) {
  var start = dataJsText.indexOf('/* SPECIALS:START */');
  var endMark = '/* SPECIALS:END */';
  var endIdx = dataJsText.indexOf(endMark);
  if (start < 0 || endIdx < 0) {
    throw new Error('data.js is missing SPECIALS markers');
  }
  var lineStart = dataJsText.lastIndexOf('\n', start) + 1;
  var end = endIdx + endMark.length;
  return dataJsText.slice(0, lineStart) + newBlock + dataJsText.slice(end);
}

// "$5" / 5 / "6.0" -> "5.00" / "5.00" / "6.00". Blank/non-numeric -> "".
function fmtMoney(v) {
  if (v == null || v === '') return '';
  var n = Number(String(v).replace(/^\$+/, '').trim());
  return isFinite(n) ? n.toFixed(2) : '';
}

// Read a double-quoted string field out of an object-literal snippet, decoding
// its escapes back to the real value.
//
// The regex captures SOURCE text, so a stored `He said \"hi\"` comes back with
// the backslashes still in it. Returning that raw meant a preserved field was
// re-escaped by jsStr on the next write, doubling its backslashes on every
// single no-op sync run (`\"` -> `\\\"` -> `\\\\\\"`) until the flavor text on the
// site was unreadable. Decode here so the value round-trips unchanged.
//
// JSON.parse is the exact inverse of the JSON.stringify jsStr writes with. The
// fallback covers a hand-edited value using a JS escape JSON does not accept
// (\', \v, \xNN) — better to return it verbatim than to blank the field.
function pickField(objText, key) {
  var mm = new RegExp(key + ':\\s*"((?:[^"\\\\]|\\\\.)*)"').exec(objText);
  if (!mm) return '';
  try {
    return JSON.parse('"' + mm[1] + '"');
  } catch (e) {
    return mm[1];
  }
}

// Read an unquoted boolean field (key: true|false) out of an object-literal
// snippet. Returns null when the field is absent (so the caller can fall back to
// a default instead of assuming false).
function pickBool(objText, key) {
  var mm = new RegExp(key + ':\\s*(true|false)\\b').exec(objText);
  return mm ? mm[1] === 'true' : null;
}

// Rewrite one hand-maintained EXTRAS object (soupSpecial / muffinSpecial) in
// data.js, merging Toast-sourced `fields` over the existing values. `keys` lists
// the object's fields in output order and tags each as text, money, or bool; a
// field not in `fields` is preserved from the current object, an empty money
// field is dropped so the object never carries an empty price, and a bool field
// falls back to its `default` when neither the update nor the current object
// carry it. Only the matched object is touched. Throws if it is absent
// (structural invariant).
function updateExtra(dataJsText, objKey, keys, fields) {
  fields = fields || {};
  var m = new RegExp(objKey + ':\\s*\\{[^}]*\\}').exec(dataJsText);
  if (!m) throw new Error('data.js is missing the ' + objKey + ' object');
  var cur = m[0];
  var parts = [];
  keys.forEach(function (k) {
    if (k.bool) {
      var bv = fields[k.name] != null ? !!fields[k.name] : pickBool(cur, k.name);
      if (bv == null) bv = !!k.default;
      parts.push(k.name + ': ' + (bv ? 'true' : 'false'));
      return;
    }
    var raw = fields[k.name] != null ? fields[k.name] : pickField(cur, k.name);
    var val = k.money ? fmtMoney(raw) : String(raw == null ? '' : raw);
    if (k.money && !val) return; // drop empty prices
    parts.push(k.name + ': "' + jsStr(val) + '"');
  });
  var rebuilt = objKey + ': { ' + parts.join(', ') + ' }';
  return dataJsText.slice(0, m.index) + rebuilt + dataJsText.slice(m.index + cur.length);
}

// soupSpecial: name + flavor preserved unless passed (the flavor keeps its 🥬 veg
// glyph verbatim); availability is a boolean that defaults to true; cup/bowl
// money-formatted and dropped when empty — so an out-of-stock day
// (available:false, no prices) renders the flavor/message alone, with no stale
// price hanging off it.
function updateSoupSpecial(dataJsText, soup) {
  return updateExtra(dataJsText, 'soupSpecial', [
    { name: 'name' }, { name: 'flavor' },
    { name: 'available', bool: true, default: true },
    { name: 'cup', money: true }, { name: 'bowl', money: true },
  ], soup);
}

// muffinSpecial: name (site label) + flavor preserved unless passed; price money-
// formatted and dropped when empty.
function updateMuffinSpecial(dataJsText, muffin) {
  return updateExtra(dataJsText, 'muffinSpecial', [
    { name: 'name' }, { name: 'flavor' }, { name: 'price', money: true },
  ], muffin);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildSpecialsBlock: buildSpecialsBlock,
    spliceSpecials: spliceSpecials,
    updateSoupSpecial: updateSoupSpecial,
    updateMuffinSpecial: updateMuffinSpecial,
  };
}
