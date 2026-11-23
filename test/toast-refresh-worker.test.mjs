import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../workers/toast-refresh/src/worker.mjs';
import { verifyToastWebhook } from '../workers/toast-refresh/src/toast-webhook.mjs';

const SECRET = 'toast-webhook-secret-for-tests';
const GUID = '11111111-2222-3333-4444-555555555555';
const KEY = 'k'.repeat(32);

// Signed with node's own HMAC, independent of the Worker's Web Crypto code.
const toastSign = (msg) => createHmac('sha256', SECRET).update(msg, 'utf8').digest('base64');

function menusEvent(overrides = {}) {
  return {
    timestamp: new Date().toISOString(),
    eventCategory: 'menus',
    eventType: 'menus_updated',
    guid: `evt-${Math.random()}`,
    details: { restaurantGuid: GUID, publishedDate: new Date().toISOString() },
    ...overrides,
  };
}

function fakeEnv() {
  const store = new Map();
  return {
    GITHUB_REPO: 'owner/repo',
    GITHUB_TOKEN: 'gh-token',
    REFRESH_KEY: KEY,
    TOAST_WEBHOOK_SECRET: SECRET,
    TOAST_RESTAURANT_GUID: GUID,
    REFRESH_STATE: {
      store,
      async get(k) { return store.has(k) ? store.get(k) : null; },
      async put(k, v) { store.set(k, v); },
    },
  };
}

function withFakeGitHub(status = 204) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response(null, { status }); };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

function fakeCtx() {
  const pending = [];
  return { pending, waitUntil: (p) => pending.push(p) };
}

async function postWebhook(env, event, { sign = 'body+timestamp', ctx = fakeCtx() } = {}) {
  const raw = JSON.stringify(event);
  const sig = sign === 'body+timestamp' ? toastSign(raw + event.timestamp) : sign === 'body' ? toastSign(raw) : sign;
  const headers = sig ? { 'Toast-Signature': sig } : {};
  const res = await worker.fetch(new Request('https://w.example/toast-webhook', { method: 'POST', body: raw, headers }), env, ctx);
  await Promise.all(ctx.pending);
  return res;
}

test('a signed menus_updated webhook starts the sync, labelled toast-webhook', async () => {
  const gh = withFakeGitHub();
  try {
    const res = await postWebhook(fakeEnv(), menusEvent());
    assert.equal(res.status, 200);
    assert.equal(gh.calls.length, 1);
    assert.equal(gh.calls[0].url, 'https://api.github.com/repos/owner/repo/actions/workflows/toast-sync.yml/dispatches');
    assert.equal(gh.calls[0].init.headers.Authorization, 'Bearer gh-token');
    assert.deepEqual(JSON.parse(gh.calls[0].init.body), { ref: 'main', inputs: { source: 'toast-webhook' } });
  } finally { gh.restore(); }
});

test('a signature over the body alone is also accepted', async () => {
  const gh = withFakeGitHub();
  try {
    assert.equal((await postWebhook(fakeEnv(), menusEvent(), { sign: 'body' })).status, 200);
    assert.equal(gh.calls.length, 1);
  } finally { gh.restore(); }
});

test('unsigned or wrongly signed webhooks are rejected and start nothing', async () => {
  const gh = withFakeGitHub();
  try {
    assert.equal((await postWebhook(fakeEnv(), menusEvent(), { sign: null })).status, 401);
    assert.equal((await postWebhook(fakeEnv(), menusEvent(), { sign: toastSign('something else') })).status, 401);
    const wrongSecret = createHmac('sha256', 'other').update('x').digest('base64');
    assert.equal((await postWebhook(fakeEnv(), menusEvent(), { sign: wrongSecret })).status, 401);
    assert.equal(gh.calls.length, 0);
  } finally { gh.restore(); }
});

test('a tampered body fails the signature', async () => {
  const event = menusEvent();
  const raw = JSON.stringify(event);
  const sig = toastSign(raw + event.timestamp);
  const tampered = raw.replace('menus_updated', 'menus_updatex');
  const r = await verifyToastWebhook({ rawBody: tampered, signature: sig, secret: SECRET, restaurantGuid: GUID, now: Date.now() });
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});

test('other events, other restaurants and stale messages are ignored with a 200', async () => {
  const gh = withFakeGitHub();
  try {
    assert.equal((await postWebhook(fakeEnv(), menusEvent({ eventType: 'stock_updated' }))).status, 200);
    assert.equal((await postWebhook(fakeEnv(), menusEvent({ details: { restaurantGuid: 'other' } }))).status, 200);
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    assert.equal((await postWebhook(fakeEnv(), menusEvent({ timestamp: old }))).status, 200);
    assert.equal(gh.calls.length, 0);
  } finally { gh.restore(); }
});

test('a redelivered event starts only one sync', async () => {
  const gh = withFakeGitHub();
  try {
    const env = fakeEnv();
    const event = menusEvent();
    await postWebhook(env, event);
    await postWebhook(env, event);
    assert.equal(gh.calls.length, 1);
  } finally { gh.restore(); }
});

test('a webhook with no secret configured is refused, never accepted', async () => {
  const gh = withFakeGitHub();
  try {
    const env = fakeEnv();
    env.TOAST_WEBHOOK_SECRET = '';
    assert.equal((await postWebhook(env, menusEvent())).status, 500);
    assert.equal(gh.calls.length, 0);
  } finally { gh.restore(); }
});

test('webhook runaway: past the hourly cap, nothing more is dispatched', async () => {
  const gh = withFakeGitHub();
  try {
    const env = fakeEnv();
    for (let i = 0; i < 45; i++) await postWebhook(env, menusEvent());
    assert.equal(gh.calls.length, 20);
  } finally { gh.restore(); }
});

test('staff page: only the right key shows the button, and opening it starts nothing', async () => {
  const gh = withFakeGitHub();
  try {
    const env = fakeEnv();
    const bad = await worker.fetch(new Request('https://w.example/?k=nope'), env, fakeCtx());
    assert.equal(bad.status, 403);
    const good = await worker.fetch(new Request(`https://w.example/?k=${KEY}`), env, fakeCtx());
    assert.equal(good.status, 200);
    assert.match(await good.text(), /Refresh specials now/);
    assert.equal(gh.calls.length, 0);
  } finally { gh.restore(); }
});

test('staff page escapes the key it echoes', async () => {
  const env = fakeEnv();
  env.REFRESH_KEY = '"><script>x</script>' + 'a'.repeat(24);
  const res = await worker.fetch(new Request(`https://w.example/?k=${encodeURIComponent(env.REFRESH_KEY)}`), env, fakeCtx());
  const body = await res.text();
  assert.ok(!body.includes('"><script>x'));
});

const press = (env, k = KEY) => worker.fetch(new Request('https://w.example/refresh', {
  method: 'POST', body: JSON.stringify({ k }), headers: { 'Content-Type': 'application/json' },
}), env, fakeCtx());

test('staff press: starts the sync once, then the cooldown refuses the next press', async () => {
  const gh = withFakeGitHub();
  try {
    const env = fakeEnv();
    const first = await press(env);
    assert.equal(first.status, 200);
    assert.equal((await first.json()).ok, true);
    assert.deepEqual(JSON.parse(gh.calls[0].init.body).inputs, { source: 'staff-refresh' });
    const second = await press(env);
    assert.equal(second.status, 429);
    assert.match((await second.json()).message, /refreshed a moment ago/);
    assert.equal(gh.calls.length, 1);
  } finally { gh.restore(); }
});

test('staff press with a wrong key is refused and does not use up a slot', async () => {
  const gh = withFakeGitHub();
  try {
    const env = fakeEnv();
    assert.equal((await press(env, 'wrong')).status, 403);
    assert.equal(gh.calls.length, 0);
    assert.equal((await press(env)).status, 200);
  } finally { gh.restore(); }
});

test('staff press reports a GitHub failure plainly', async () => {
  const gh = withFakeGitHub(401);
  try {
    const res = await press(fakeEnv());
    assert.equal(res.status, 502);
    assert.match((await res.json()).message, /GitHub said 401/);
  } finally { gh.restore(); }
});

test('unknown paths and methods are 404', async () => {
  const env = fakeEnv();
  assert.equal((await worker.fetch(new Request('https://w.example/toast-webhook'), env, fakeCtx())).status, 404);
  assert.equal((await worker.fetch(new Request('https://w.example/other'), env, fakeCtx())).status, 404);
});
