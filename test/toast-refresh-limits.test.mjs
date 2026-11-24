import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAFF_LIMITS, WEBHOOK_LIMITS, checkLimit, keysMatch, refusalMessage } from '../workers/toast-refresh/src/limits.mjs';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const NOW = Date.UTC(2026, 10, 23, 18, 0, 0);

test('staff: first press is allowed and recorded', () => {
  const r = checkLimit([], NOW, STAFF_LIMITS);
  assert.equal(r.allowed, true);
  assert.deepEqual(r.history, [NOW]);
});

test('staff: a press inside the 5 minute cooldown is refused with the time left', () => {
  const r = checkLimit([NOW - 2 * MIN], NOW, STAFF_LIMITS);
  assert.equal(r.reason, 'cooldown');
  assert.equal(r.retryAfterMs, 3 * MIN);
  assert.equal(checkLimit([NOW - 5 * MIN], NOW, STAFF_LIMITS).allowed, true);
});

test('staff: the fifth press in an hour is refused', () => {
  const r = checkLimit([NOW - 50 * MIN, NOW - 35 * MIN, NOW - 20 * MIN, NOW - 6 * MIN], NOW, STAFF_LIMITS);
  assert.equal(r.reason, 'hourly');
  assert.equal(r.retryAfterMs, 10 * MIN);
});

test('staff: the thirteenth press in 24 hours is refused', () => {
  const history = Array.from({ length: 12 }, (_, i) => NOW - 23 * HOUR + i * HOUR);
  const r = checkLimit(history, NOW, STAFF_LIMITS);
  assert.equal(r.reason, 'daily');
  assert.equal(r.retryAfterMs, HOUR);
});

test('staff: refused presses are not recorded, so mashing the button changes nothing', () => {
  let history = [NOW - 4 * MIN];
  for (let i = 0; i < 1000; i++) history = checkLimit(history, NOW + i, STAFF_LIMITS).history;
  assert.deepEqual(history, [NOW - 4 * MIN]);
});

test('staff: one press a second for a whole day starts exactly the daily cap', () => {
  let history = [];
  let started = 0;
  for (let t = NOW; t < NOW + 24 * HOUR; t += 1000) {
    const r = checkLimit(history, t, STAFF_LIMITS);
    if (r.allowed) started++;
    history = r.history;
  }
  assert.equal(started, STAFF_LIMITS.perDay);
});

test('webhook: back-to-back publishes are all let through (no cooldown)', () => {
  let history = [];
  for (let i = 0; i < 5; i++) {
    const r = checkLimit(history, NOW + i * 1000, WEBHOOK_LIMITS);
    assert.equal(r.allowed, true);
    history = r.history;
  }
});

test('webhook: a runaway is stopped by the hourly and daily caps', () => {
  let history = [];
  let started = 0;
  for (let t = NOW; t < NOW + 24 * HOUR; t += 10 * 1000) {
    const r = checkLimit(history, t, WEBHOOK_LIMITS);
    if (r.allowed) started++;
    history = r.history;
  }
  assert.equal(started, WEBHOOK_LIMITS.perDay);
});

test('old, future and junk timestamps are dropped; missing history is empty', () => {
  const r = checkLimit([NOW - 25 * HOUR, NOW + HOUR, 'x', null, NaN], NOW, STAFF_LIMITS);
  assert.deepEqual(r.history, [NOW]);
  assert.equal(checkLimit(undefined, NOW, STAFF_LIMITS).allowed, true);
  assert.equal(checkLimit('not an array', NOW, STAFF_LIMITS).allowed, true);
});

test('keysMatch accepts only the exact key and never an unset or short stored key', () => {
  const key = 'a'.repeat(16) + 'b'.repeat(16);
  assert.equal(keysMatch(key, key), true);
  assert.equal(keysMatch(key.slice(0, -1), key), false);
  assert.equal(keysMatch(key + 'c', key), false);
  assert.equal(keysMatch('', key), false);
  assert.equal(keysMatch(undefined, key), false);
  assert.equal(keysMatch('', ''), false);
  assert.equal(keysMatch('short', 'short'), false);
  assert.equal(keysMatch('x', undefined), false);
});

test('refusal messages say how long to wait in plain words', () => {
  assert.match(refusalMessage({ reason: 'cooldown', retryAfterMs: 2.5 * MIN }), /3 minutes/);
  assert.match(refusalMessage({ reason: 'cooldown', retryAfterMs: 30 * 1000 }), /1 minute\b/);
  assert.match(refusalMessage({ reason: 'hourly', retryAfterMs: 10 * MIN }), /10 minutes/);
  assert.match(refusalMessage({ reason: 'daily', retryAfterMs: 5 * HOUR }), /5 hours/);
});
