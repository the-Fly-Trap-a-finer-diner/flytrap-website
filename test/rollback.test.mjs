// Tests for automatic rollback.
//
// This code pushes to main on its own, unattended, in response to an outage. The
// guards are the whole product: every one of them exists to stop it doing
// something worse than the thing it is fixing — reverting a person's merge,
// ping-ponging with the sync, or rolling back off a commit that was never
// deployed. None of them are exercised until an outage, so they are tested here
// instead of being discovered at 3am.
//
// decideRollback is pure and covers the guards. The end-to-end test at the
// bottom runs the real script against real git with a real remote, because the
// git sequence (restore files, commit, rebase, push) is the other half that can
// be wrong.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, realpath, cp, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideRollback, ROLLBACK_SUBJECT, SYNCED_PATHS } from '../.github/scripts/rollback.mjs';

const run = promisify(execFile);
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const BASE = {
  lkgSha: 'a'.repeat(40),
  headSha: 'b'.repeat(40),
  authorName: 'flytrap-toast-bot',
  subject: 'chore(toast): sync menu + specials [skip ci]',
  paused: false,
};

// ------------------------------------------------------------------- guards

test('a bad bot sync with a recorded good commit rolls back', () => {
  const d = decideRollback(BASE);
  assert.equal(d.act, true);
  assert.match(d.reason, /rolling the synced files back/);
});

test('a human-authored commit is never rolled back automatically', () => {
  // The worst thing this code could do is quietly undo someone's merge.
  const d = decideRollback({ ...BASE, authorName: 'ryankolean' });
  assert.equal(d.act, false);
  assert.match(d.reason, /ryankolean/);
  assert.match(d.reason, /reverting a person's merge without asking/);
});

test('an unknown author is treated as human', () => {
  assert.equal(decideRollback({ ...BASE, authorName: '' }).act, false);
});

test('nothing happens when no last-known-good has been recorded', () => {
  const d = decideRollback({ ...BASE, lkgSha: '' });
  assert.equal(d.act, false);
  assert.match(d.reason, /no last-known-good commit/);
});

test('a rollback that is itself failing does not roll back again', () => {
  // Otherwise: rollback, still broken, roll back further, forever.
  const d = decideRollback({ ...BASE, subject: ROLLBACK_SUBJECT });
  assert.equal(d.act, false);
  assert.match(d.reason, /would loop/);
});

test('no rollback when the failing commit is already the last known good', () => {
  // Content did not change, so restoring it changes nothing. The fault is
  // Pages, DNS or the certificate.
  const d = decideRollback({ ...BASE, headSha: BASE.lkgSha });
  assert.equal(d.act, false);
  assert.match(d.reason, /Pages, DNS or the certificate/);
});

test('an uncleared pause blocks a second rollback', () => {
  const d = decideRollback({ ...BASE, paused: true });
  assert.equal(d.act, false);
  assert.match(d.reason, /already paused/);
});

test('the pause check wins over every other guard', () => {
  // Precedence matters: a paused repo must stay hands-off even if some other
  // guard would also have declined, so the reason reported is the real one.
  const d = decideRollback({ ...BASE, paused: true, lkgSha: '', authorName: 'ryankolean' });
  assert.equal(d.act, false);
  assert.match(d.reason, /already paused/);
});

test('the synced paths match what the Toast sync commits', async () => {
  // If these drift, a rollback restores data.js while leaving the photos it
  // references from the bad sync — a half-rolled-back site.
  const wf = await readFile(join(REPO, '.github/workflows/toast-sync.yml'), 'utf8');
  const addLine = wf.split('\n').find((l) => l.trim().startsWith('git add '));
  assert.ok(addLine, 'could not find the git add line in toast-sync.yml');
  const committed = addLine.trim().replace('git add ', '').split(/\s+/).sort();
  assert.deepEqual([...SYNCED_PATHS].sort(), committed);
});

// --------------------------------------------------------------- end to end

// A throwaway repo with a bare "origin", so the real script does real git.
async function scratchRemote() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ft-rollback-')));
  const remote = join(root, 'origin.git');
  const work = join(root, 'work');
  await mkdir(remote, { recursive: true });
  await run('git', ['init', '--bare', '-b', 'main', remote]);
  await run('git', ['clone', remote, work]);

  const g = (...a) => run('git', ['-C', work, ...a]);
  await g('config', 'user.name', 'seed');
  await g('config', 'user.email', 'seed@example.com');
  await g('config', 'commit.gpgsign', 'false');

  await mkdir(join(work, 'assets', 'specials'), { recursive: true });
  await mkdir(join(work, 'docs'), { recursive: true });
  await mkdir(join(work, '.github', 'scripts'), { recursive: true });
  await cp(join(REPO, '.github', 'scripts', 'rollback.mjs'), join(work, '.github', 'scripts', 'rollback.mjs'));

  // The good state.
  await writeFile(join(work, 'data.js'), 'window.FT_DATA = { specials: ["good"] };\n');
  await writeFile(join(work, 'assets', 'menu.json'), '{"menu":"good"}\n');
  await writeFile(join(work, 'assets', 'specials', 'toast-good.jpg'), 'good-image');
  await writeFile(join(work, 'docs', 'specials-history.json'), '[{"n":"good"}]\n');
  // Not a synced path: the Pages deploy owns the sitemap. Present so the test
  // below can prove a rollback leaves everything outside SYNCED_PATHS alone.
  await writeFile(join(work, 'sitemap.xml'), '<lastmod>2026-01-01</lastmod>\n');
  await g('add', '-A');
  await g('commit', '-m', 'good state');
  const lkgSha = (await g('rev-parse', 'HEAD')).stdout.trim();
  await g('push', 'origin', 'main');

  return { root, work, remote, lkgSha, g };
}

async function addBadSync({ work, g }, author = 'flytrap-toast-bot') {
  await g('config', 'user.name', author);
  await g('config', 'user.email', 'bot@theflytrapferndale.com');
  await writeFile(join(work, 'data.js'), 'window.FT_DATA = { specials: ["BROKEN"\n');
  await writeFile(join(work, 'assets', 'menu.json'), '{"menu":"bad"}\n');
  await writeFile(join(work, 'sitemap.xml'), '<lastmod>2026-08-23</lastmod>\n');
  await g('add', '-A');
  await g('commit', '-m', 'chore(toast): sync menu + specials [skip ci]');
  await g('push', 'origin', 'main');
  return (await g('rev-parse', 'HEAD')).stdout.trim();
}

const exists = (p) => access(p).then(() => true).catch(() => false);

const runRollback = (work, env) =>
  run('node', [join(work, '.github', 'scripts', 'rollback.mjs')], {
    cwd: work,
    // PATH is trimmed so the `gh` dispatch fails the way it would if the CLI
    // were missing — the script must still report success for the git half.
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
  });

test('end to end: a bad bot sync is restored, paused and pushed', async () => {
  const ctx = await scratchRemote();
  const headSha = await addBadSync(ctx);

  const { stdout } = await runRollback(ctx.work, { LKG_SHA: ctx.lkgSha, HEAD_SHA: headSha });
  assert.match(stdout, /Automatic rollback: done/);

  // Files are back to the good content.
  assert.equal(await readFile(join(ctx.work, 'data.js'), 'utf8'), 'window.FT_DATA = { specials: ["good"] };\n');
  assert.equal(await readFile(join(ctx.work, 'assets', 'menu.json'), 'utf8'), '{"menu":"good"}\n');
  // And nothing outside SYNCED_PATHS is touched. The rollback restores the
  // sync's own files, not the tree — anything a human landed alongside the bad
  // commit has to survive. sitemap.xml stands in for that here: the Pages deploy
  // owns it, so the rollback must leave the bad sync's value in place.
  assert.equal(
    await readFile(join(ctx.work, 'sitemap.xml'), 'utf8'),
    '<lastmod>2026-08-23</lastmod>\n',
    'a file outside SYNCED_PATHS must not be reverted'
  );

  // The circuit breaker is set and explains itself.
  assert.ok(await exists(join(ctx.work, '.github', 'SYNC_PAUSED')));
  const pause = await readFile(join(ctx.work, '.github', 'SYNC_PAUSED'), 'utf8');
  assert.match(pause, /force=true/);

  // And it actually reached the remote — a rollback that only exists locally is
  // no rollback at all.
  const { stdout: remoteLog } = await run('git', ['-C', ctx.remote, 'log', '-1', '--format=%s%n%an']);
  assert.match(remoteLog, new RegExp(ROLLBACK_SUBJECT.replace(/[()]/g, '\\$&')));
  assert.match(remoteLog, /flytrap-toast-bot/);

  // The bad commit is still in history — restored, not rewritten.
  const { stdout: count } = await run('git', ['-C', ctx.remote, 'rev-list', '--count', 'main']);
  assert.equal(count.trim(), '3');
});

test('end to end: a human commit is left alone', async () => {
  const ctx = await scratchRemote();
  const headSha = await addBadSync(ctx, 'ryankolean');

  const { stdout } = await runRollback(ctx.work, { LKG_SHA: ctx.lkgSha, HEAD_SHA: headSha });
  assert.match(stdout, /not attempted/);
  assert.match(stdout, /ryankolean/);

  assert.equal(await exists(join(ctx.work, '.github', 'SYNC_PAUSED')), false);
  const { stdout: count } = await run('git', ['-C', ctx.remote, 'rev-list', '--count', 'main']);
  assert.equal(count.trim(), '2', 'nothing should have been pushed');
});

test('end to end: a second failure while paused pushes nothing', async () => {
  const ctx = await scratchRemote();
  const first = await addBadSync(ctx);
  await runRollback(ctx.work, { LKG_SHA: ctx.lkgSha, HEAD_SHA: first });
  const { stdout: after } = await run('git', ['-C', ctx.remote, 'rev-list', '--count', 'main']);

  const { stdout } = await runRollback(ctx.work, {
    LKG_SHA: ctx.lkgSha,
    HEAD_SHA: (await ctx.g('rev-parse', 'HEAD')).stdout.trim(),
  });
  assert.match(stdout, /not attempted/);
  assert.match(stdout, /already paused/);

  const { stdout: now } = await run('git', ['-C', ctx.remote, 'rev-list', '--count', 'main']);
  assert.equal(now.trim(), after.trim(), 'a paused repo must not gain commits');
});

test('end to end: nothing is pushed when the files already match', async () => {
  const ctx = await scratchRemote();
  // Head is the good commit itself but with a bot subject — the files are
  // already correct, so there is nothing to restore.
  const { stdout } = await runRollback(ctx.work, { LKG_SHA: ctx.lkgSha, HEAD_SHA: ctx.lkgSha });
  assert.match(stdout, /not attempted/);
  const { stdout: count } = await run('git', ['-C', ctx.remote, 'rev-list', '--count', 'main']);
  assert.equal(count.trim(), '1');
});

test('end to end: a dry run decides but changes nothing', async () => {
  const ctx = await scratchRemote();
  const headSha = await addBadSync(ctx);

  const { stdout } = await runRollback(ctx.work, { LKG_SHA: ctx.lkgSha, HEAD_SHA: headSha, DRY_RUN: '1' });
  assert.match(stdout, /dry run/i);
  assert.equal(await exists(join(ctx.work, '.github', 'SYNC_PAUSED')), false);
  const { stdout: count } = await run('git', ['-C', ctx.remote, 'rev-list', '--count', 'main']);
  assert.equal(count.trim(), '2');
});

test('end to end: a synced path missing at the good commit does not abort the rollback', async () => {
  // docs/specials-history.json only appeared in #137, so any last-known-good
  // older than that lacks it. A single `git checkout` over the whole list aborts
  // on the first missing path and silently rolls back nothing at all — the exact
  // silent failure this whole mechanism exists to avoid.
  const ctx = await scratchRemote();
  await ctx.g('rm', '-q', 'docs/specials-history.json');
  await ctx.g('commit', '-q', '-m', 'before the specials archive existed');
  await ctx.g('push', '-q', 'origin', 'main');
  const lkgWithoutArchive = (await ctx.g('rev-parse', 'HEAD')).stdout.trim();

  // git rm took the now-empty docs/ with it — git does not track directories.
  await mkdir(join(ctx.work, 'docs'), { recursive: true });
  await writeFile(join(ctx.work, 'docs', 'specials-history.json'), '[{"n":"bad"}]\n');
  const headSha = await addBadSync(ctx);

  const { stdout } = await runRollback(ctx.work, { LKG_SHA: lkgWithoutArchive, HEAD_SHA: headSha });
  assert.match(stdout, /Automatic rollback: done/, 'the rollback must still run');
  assert.match(stdout, /left as-is: docs\/specials-history\.json/, 'and say what it could not restore');
  assert.doesNotMatch(stdout, /Restored[^\n]*specials-history/, 'must not claim to have restored it');

  // The paths that did exist are back.
  assert.equal(await readFile(join(ctx.work, 'data.js'), 'utf8'), 'window.FT_DATA = { specials: ["good"] };\n');
  const { stdout: remoteLog } = await run('git', ['-C', ctx.remote, 'log', '-1', '--format=%s']);
  assert.match(remoteLog, /roll back to the last verified-good site/);
});
