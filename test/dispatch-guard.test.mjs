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

test('back-to-back manual runs are allowed (publishes come in bursts)', () => {
  assert.equal(decideDispatch([run(2, 0), run(1, 10 * 1000)], NOW, 2).allowed, true);
});

test('runs GitHub cancelled do not count toward the cap', () => {
  const runs = Array.from({ length: 100 }, (_, i) => ({ ...run(i + 10, (i + 1) * MIN), conclusion: 'cancelled' }));
  assert.equal(decideDispatch(runs, NOW, 1).allowed, true);
});

test('the daily cap includes this run', () => {
  const runs = Array.from({ length: LIMITS.perDay - 1 }, (_, i) => run(i + 10, (i + 1) * 30 * MIN));
  assert.equal(decideDispatch(runs, NOW, 1).allowed, true);
  runs.push(run(99, 23 * 60 * MIN));
  const d = decideDispatch(runs, NOW, 1);
  assert.equal(d.allowed, false);
  assert.match(d.reason, /limit 48/);
});

test('runs older than 24 hours and junk entries are ignored', () => {
  const runs = [run(5, 25 * 60 * MIN), { id: 6, created_at: 'nope' }, null, { id: 7 }];
  assert.equal(decideDispatch(runs, NOW, 1).allowed, true);
});
