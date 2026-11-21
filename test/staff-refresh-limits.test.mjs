import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LIMITS, checkRefresh, keysMatch, refusalMessage } from '../apps-script/staff-refresh/limits.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const NOW = Date.UTC(2026, 10, 21, 18, 0, 0);

test('first press is allowed and recorded', () => {
  const r = checkRefresh([], NOW);
  assert.equal(r.allowed, true);
  assert.deepEqual(r.history, [NOW]);
});

test('a second press inside the cooldown is refused with the time left', () => {
  const r = checkRefresh([NOW - 2 * MIN], NOW);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'cooldown');
  assert.equal(r.retryAfterMs, 3 * MIN);
});

test('a press right after the cooldown is allowed', () => {
  assert.equal(checkRefresh([NOW - DEFAULT_LIMITS.cooldownMs], NOW).allowed, true);
});

test('hourly cap refuses the fifth press in an hour', () => {
  const history = [NOW - 50 * MIN, NOW - 35 * MIN, NOW - 20 * MIN, NOW - 6 * MIN];
  const r = checkRefresh(history, NOW);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'hourly');
  // The oldest of the four leaves the hour window in 10 minutes.
  assert.equal(r.retryAfterMs, 10 * MIN);
});

test('daily cap refuses the thirteenth press in 24 hours', () => {
  const history = Array.from({ length: 12 }, (_, i) => NOW - (23 * HOUR) + i * HOUR);
  // Newest is at NOW - 12h, so neither cooldown nor hourly applies.
  const r = checkRefresh(history, NOW);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'daily');
  assert.equal(r.retryAfterMs, HOUR);
});

test('refused presses are not recorded, so spamming does not extend the wait', () => {
  let history = [NOW - 4 * MIN];
  for (let i = 0; i < 1000; i++) {
    const r = checkRefresh(history, NOW + i);
    assert.equal(r.allowed, false);
    history = r.history;
  }
  assert.deepEqual(history, [NOW - 4 * MIN]);
  assert.equal(checkRefresh(history, NOW + MIN).allowed, true);
});

test('a burst of a million presses starts at most the daily cap in 24 hours', () => {
  let history = [];
  let started = 0;
  for (let t = NOW; t < NOW + 24 * HOUR; t += 1000) {
    const r = checkRefresh(history, t);
    if (r.allowed) started++;
    history = r.history;
  }
  assert.equal(started, DEFAULT_LIMITS.perDay);
});

test('old, future and junk timestamps are dropped from history', () => {
  const r = checkRefresh([NOW - 25 * HOUR, NOW + HOUR, 'x', null, NaN], NOW);
  assert.equal(r.allowed, true);
  assert.deepEqual(r.history, [NOW]);
});

test('missing history is treated as empty', () => {
  assert.equal(checkRefresh(undefined, NOW).allowed, true);
  assert.equal(checkRefresh(null, NOW).allowed, true);
});

test('keysMatch accepts only the exact key', () => {
  const key = 'a'.repeat(16) + 'b'.repeat(16);
  assert.equal(keysMatch(key, key), true);
  assert.equal(keysMatch(key.slice(0, -1), key), false);
  assert.equal(keysMatch(key + 'c', key), false);
  assert.equal(keysMatch(key.replace(/b$/, 'c'), key), false);
  assert.equal(keysMatch(undefined, key), false);
  assert.equal(keysMatch('', key), false);
});

test('keysMatch never matches when the stored key is missing or short', () => {
  assert.equal(keysMatch('', ''), false);
  assert.equal(keysMatch('short', 'short'), false);
  assert.equal(keysMatch('x', undefined), false);
  assert.equal(keysMatch(null, null), false);
});

test('refusal messages say how long to wait in plain words', () => {
  assert.match(refusalMessage({ reason: 'cooldown', retryAfterMs: 2.5 * MIN }), /3 minutes/);
  assert.match(refusalMessage({ reason: 'cooldown', retryAfterMs: 30 * 1000 }), /1 minute\b/);
  assert.match(refusalMessage({ reason: 'hourly', retryAfterMs: 10 * MIN }), /10 minutes/);
  assert.match(refusalMessage({ reason: 'daily', retryAfterMs: 5 * HOUR }), /5 hours/);
});
