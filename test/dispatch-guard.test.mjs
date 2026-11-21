import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, decideDispatch } from '../.github/scripts/dispatch-guard.mjs';

const MIN = 60 * 1000;
const NOW = Date.UTC(2026, 10, 21, 18, 0, 0);
const run = (id, msAgo) => ({ id, created_at: new Date(NOW - msAgo).toISOString() });

test('a manual run with nothing recent is allowed', () => {
  assert.equal(decideDispatch([], NOW, 1).allowed, true);
});

test('the current run is not counted against itself', () => {
  assert.equal(decideDispatch([run(1, 0)], NOW, 1).allowed, true);
  assert.equal(decideDispatch([run(1, 0)], NOW, '1').allowed, true);
});

test('another manual run inside the gap is throttled', () => {
  const d = decideDispatch([run(2, 0), run(1, 30 * 1000)], NOW, 2);
  assert.equal(d.allowed, false);
  assert.match(d.reason, /less than 2 minutes/);
});

test('a run just past the gap is allowed', () => {
  assert.equal(decideDispatch([run(1, LIMITS.minGapMs)], NOW, 2).allowed, true);
});

test('the daily cap includes this run', () => {
  const runs = Array.from({ length: LIMITS.perDay - 1 }, (_, i) => run(i + 10, (i + 1) * 30 * MIN));
  assert.equal(decideDispatch(runs, NOW, 1).allowed, true);
  runs.push(run(99, 23 * 60 * MIN));
  const d = decideDispatch(runs, NOW, 1);
  assert.equal(d.allowed, false);
  assert.match(d.reason, /limit 30/);
});

test('runs older than 24 hours and junk entries are ignored', () => {
  const runs = [run(5, 25 * 60 * MIN), { id: 6, created_at: 'nope' }, null, { id: 7 }];
  assert.equal(decideDispatch(runs, NOW, 1).allowed, true);
});
