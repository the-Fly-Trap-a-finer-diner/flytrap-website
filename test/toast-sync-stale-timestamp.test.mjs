// Regression guard for the 2026-09-21 staleness: the site kept serving a special
// the restaurant had already pulled, and a soup flavor from three days earlier.
//
// What happened: toast-sync.mjs only pulled /menus when /menus/v2/metadata's
// `lastUpdated` differed from the one recorded in assets/menu.json. Toast moves
// that timestamp when the menu is PUBLISHED, not when it is edited. Kara removed
// "The Matarazzo" from Weekly Specials and changed the Soup O' The Day; Toast
// served the new content on /menus while metadata sat at 2026-09-18T21:12:48Z.
// The gate matched, the pull was skipped, and with it the specials step (which
// reads the payload the menu step shares). Every 15-minute run went green having
// done nothing, for three days.
//
// These tests run BOTH real scripts, in workflow order, against a stubbed Toast
// whose metadata timestamp never moves while its menu content does. The old gate
// makes run 2 a no-op and fails every assertion below.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, cp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Frozen across both runs. This is the whole point: Toast's timestamp lies.
const FROZEN = '2026-09-18T21:12:48.403+0000';

// A standing group is required - buildBase refuses to emit an empty menu, and
// Weekly Specials is excluded from menu.json by design.
const STANDING = {
  name: 'All Things Eggs',
  menuItems: [{ name: 'Two Eggs', price: 9.95, description: 'Any style; browns and toast.' }],
};

const weeklySpecials = (items) => ({ name: 'Weekly Specials', menuItems: items });

// Both specials carry a Toast photo, as the real ones did. This matters: while
// ANY published special sits at photo: "", specialsAwaitingPhoto() bypassed the
// timestamp gate and the sync kept pulling - which is why the outage only showed
// up on a fully-photographed week. A photo-less fixture here would make this test
// pass against the very code it is meant to catch.
const MATARAZZO = {
  name: 'The Matarazzo',
  price: 14.95,
  description: 'A breakfast carbonara? Bucatini pasta, crispy pork lardons, sunny egg.',
  image: 'https://toast.example/matarazzo.jpg',
};
const HONG_CHAU = {
  name: 'The Hong Chau',
  price: 13.95,
  description: 'Burmese tofu, roasted mushrooms, baby yu choy in a tamarind curry.',
  image: 'https://toast.example/hong-chau.jpg',
};
const soupItem = (flavor) => ({
  name: "Soup O' The Day",
  price: 5,
  description: flavor,
});

const payload = (specials, soupFlavor) => ({
  menus: [
    {
      name: 'Fly Trap Food',
      menuGroups: [STANDING, weeklySpecials([...specials, soupItem(soupFlavor)])],
    },
  ],
});

// Before: two specials, the weekend soup message. After: Matarazzo pulled, soup
// changed. Exactly the pair of edits that went missing.
const BEFORE = payload([MATARAZZO, HONG_CHAU], 'Sorry! No soup on the weekend!');
const AFTER = payload([HONG_CHAU], 'Corn Chowder');

// A preload module that swaps globalThis.fetch for a Toast that always reports
// FROZEN from /metadata and serves whatever TOAST_STUB_MENUS points at from
// /menus. Injected with `node --import`, so the scripts run unmodified.
const STUB = `
import { readFileSync } from 'node:fs'
const json = (body) => new Response(JSON.stringify(body), {
  status: 200, headers: { 'Content-Type': 'application/json' },
})
globalThis.fetch = async (url) => {
  const u = String(url)
  if (u.includes('/authentication/')) return json({ token: { accessToken: 'stub-token' } })
  if (u.includes('/menus/v2/metadata')) return json({ lastUpdated: ${JSON.stringify(FROZEN)} })
  if (u.includes('/menus/v2/menus')) return json(JSON.parse(readFileSync(process.env.TOAST_STUB_MENUS, 'utf8')))
  // Any other URL is a special's photo download. Two bytes is enough - nothing
  // in the sync decodes them, it only writes and hashes the file.
  if (u.startsWith('https://toast.example/')) return new Response(new Uint8Array([0xff, 0xd8]))
  throw new Error('unexpected fetch in test: ' + u)
}
`;

async function scratchRepo() {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'flytrap-stale-')));
  await mkdir(join(dir, '.github', 'scripts'), { recursive: true });
  await mkdir(join(dir, 'apps-script', 'lib'), { recursive: true });
  await mkdir(join(dir, 'assets', 'specials'), { recursive: true });
  await mkdir(join(dir, 'docs'), { recursive: true });
  await cp(join(REPO, '.github', 'scripts'), join(dir, '.github', 'scripts'), { recursive: true });
  await cp(join(REPO, 'apps-script', 'lib'), join(dir, 'apps-script', 'lib'), { recursive: true });
  await cp(join(REPO, 'data.js'), join(dir, 'data.js'));
  await writeFile(join(dir, 'stub-toast.mjs'), STUB);
  return dir;
}

// One pass of the workflow's sync job: menu step, then specials step reading the
// payload the menu step shared. Returns both steps' stdout.
async function syncOnce(dir, menus) {
  const menusPath = join(dir, 'toast-menus.stub.json');
  await writeFile(menusPath, JSON.stringify(menus));
  const env = {
    ...process.env,
    TOAST_CLIENT_ID: 'id',
    TOAST_CLIENT_SECRET: 'secret',
    TOAST_RESTAURANT_GUID: 'guid',
    TOAST_STUB_MENUS: menusPath,
    TOAST_PAYLOAD_OUT: join(dir, 'shared-payload.json'),
    TOAST_PAYLOAD_IN: join(dir, 'shared-payload.json'),
    // Inherited from a real shell this would skip the pull outright.
    TOAST_DRY_RUN: '',
    TOAST_MENUS_FIXTURE: '',
  };
  const node = ['--import', join(dir, 'stub-toast.mjs')];
  const menu = await run('node', [...node, join(dir, '.github', 'scripts', 'toast-sync.mjs')], { env, cwd: dir });
  const specials = await run('node', [...node, join(dir, '.github', 'scripts', 'specials-sync.mjs')], { env, cwd: dir });
  return { menu: menu.stdout, specials: specials.stdout };
}

test('a pulled special and a changed soup sync even when Toast never moves lastUpdated', async () => {
  const dir = await scratchRepo();

  const first = await syncOnce(dir, BEFORE);
  assert.match(first.menu, /Pulled menu from Toast/, 'the first run must pull');
  const seeded = await readFile(join(dir, 'data.js'), 'utf8');
  assert.match(seeded, /name: "The Matarazzo"/, 'seed run did not publish both specials');
  assert.match(seeded, /No soup on the weekend!/, 'seed run did not publish the soup message');

  // Same frozen timestamp, different menu. This is the run that used to log
  // "Menu unchanged - skipping the /menus pull" and do nothing.
  const second = await syncOnce(dir, AFTER);
  assert.doesNotMatch(second.menu, /skipping the \/menus pull/, 'the sync skipped a pull on changed content');
  assert.doesNotMatch(
    second.specials,
    /No shared Toast payload/,
    'the specials step was starved of the payload by the menu step'
  );

  const after = await readFile(join(dir, 'data.js'), 'utf8');
  assert.doesNotMatch(after, /The Matarazzo/, 'the removed special is still on the site');
  assert.match(after, /name: "The Hong Chau"/, 'the surviving special was dropped');
  assert.match(after, /flavor: "Corn Chowder"/, 'the soup flavor did not update');
  assert.doesNotMatch(after, /No soup on the weekend!/, 'the stale soup message is still on the site');

  // The file the browser loads still parses.
  await run('node', ['--check', join(dir, 'data.js')]);
});

test('an unchanged menu still commits nothing, so the pull costs no churn', async () => {
  const dir = await scratchRepo();

  await syncOnce(dir, AFTER);
  const menuJson = await readFile(join(dir, 'assets', 'menu.json'), 'utf8');
  const dataJs = await readFile(join(dir, 'data.js'), 'utf8');

  const again = await syncOnce(dir, AFTER);
  assert.match(again.menu, /already current/, 'menu.json was rewritten with identical content');
  assert.match(again.specials, /Specials \+ extras unchanged/, 'data.js was rewritten with identical content');

  assert.equal(await readFile(join(dir, 'assets', 'menu.json'), 'utf8'), menuJson);
  assert.equal(await readFile(join(dir, 'data.js'), 'utf8'), dataJs);
});
