// Fly Trap refresh Worker (Cloudflare Workers, free plan).
//
// Starts the "Toast sync" GitHub workflow two ways, so new specials reach
// theflytrapferndale.com in about 2 minutes instead of whenever GitHub's
// scheduler next fires (often 1 to 4 hours):
//
//   POST /toast-webhook   Toast calls this when the restaurant publishes a menu
//                         change. Signed by Toast; no person involved.
//   GET  /?k=<key>        The staff link: a page with one button, for a change
//   POST /refresh         that did not come with a publish. Rate limited.
//
// Why a Worker: the site is on GitHub Pages, which runs no code, and starting a
// workflow needs a GitHub token that must never reach a browser. Google Apps
// Script cannot receive Toast's webhook (it answers POSTs with a redirect, which
// Toast treats as a failure, and cannot read the signature header).
//
// What this can do in the wrong hands: start the Toast sync on main, within the
// limits in limits.mjs and the GitHub-side cap in .github/scripts/dispatch-guard.mjs.
// The sync only re-reads Toast. The token is limited to Actions on one repo, so
// it cannot change content, code or settings.
//
// Configuration (see docs/TOAST_REFRESH.md):
//   secrets  GITHUB_TOKEN, REFRESH_KEY, TOAST_WEBHOOK_SECRET, TOAST_RESTAURANT_GUID
//   vars     GITHUB_REPO (wrangler.toml)
//   KV       REFRESH_STATE

import { STAFF_LIMITS, WEBHOOK_LIMITS, checkLimit, keysMatch, refusalMessage } from './limits.mjs';
import { verifyToastWebhook } from './toast-webhook.mjs';
import { staffPage, invalidLinkPage } from './page.mjs';

const WORKFLOW_FILE = 'toast-sync.yml';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/toast-webhook' && request.method === 'POST') return await handleWebhook(request, env, ctx);
      if (url.pathname === '/refresh' && request.method === 'POST') return await handleStaffRefresh(request, env);
      if (url.pathname === '/' && request.method === 'GET') return handleStaffPage(url, env);
      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.error('refresh worker error', err && err.stack || err);
      return new Response('Server error', { status: 500 });
    }
  },
};

// Opening the link only shows the page. Chat apps fetch links to build
// previews, so a GET that triggered a sync would fire every time it is shared.
function handleStaffPage(url, env) {
  const key = url.searchParams.get('k') || '';
  if (!keysMatch(key, env.REFRESH_KEY)) return html(invalidLinkPage(), 403);
  return html(staffPage(key));
}

async function handleStaffRefresh(request, env) {
  let key = '';
  try { key = String((await request.json()).k || ''); } catch { /* fall through */ }
  if (!keysMatch(key, env.REFRESH_KEY)) {
    return json({ ok: false, message: 'This link is not valid. Ask Ryan for the current one.' }, 403);
  }
  const limit = await takeSlot(env, 'history:staff', STAFF_LIMITS);
  if (!limit.allowed) return json({ ok: false, message: refusalMessage(limit) }, 429);

  const status = await dispatch(env, 'staff-refresh');
  if (status === 204) {
    return json({ ok: true, message: 'Refresh started. New specials should be on the website in about 2 minutes.' });
  }
  return json({ ok: false, message: `The refresh could not start (GitHub said ${status}). Tell Ryan.` }, 502);
}

async function handleWebhook(request, env, ctx) {
  const rawBody = await request.text();
  const check = await verifyToastWebhook({
    rawBody,
    signature: request.headers.get('Toast-Signature'),
    secret: env.TOAST_WEBHOOK_SECRET,
    restaurantGuid: env.TOAST_RESTAURANT_GUID,
    now: Date.now(),
  });
  if (!check.ok) {
    console.log(`toast webhook not used: ${check.reason}`);
    return new Response(check.status === 200 ? 'ignored' : 'rejected', { status: check.status });
  }

  // Toast may send the same event more than once; act on each event once.
  const seenKey = `seen:${check.event.guid}`;
  if (await env.REFRESH_STATE.get(seenKey)) return new Response('duplicate', { status: 200 });
  await env.REFRESH_STATE.put(seenKey, '1', { expirationTtl: 3600 });

  const limit = await takeSlot(env, 'history:webhook', WEBHOOK_LIMITS);
  if (!limit.allowed) {
    console.warn(`toast webhook over the ${limit.reason} cap; the scheduled sync will catch up`);
    return new Response('over limit', { status: 200 });
  }

  // Toast wants an answer within 2 seconds, so the GitHub call runs after we reply.
  ctx.waitUntil(dispatch(env, 'toast-webhook').then((s) => {
    if (s !== 204) console.error(`GitHub dispatch for toast webhook failed: HTTP ${s}`);
  }));
  return new Response('ok', { status: 200 });
}

// Reads the history, applies the limit, stores the new history before the
// GitHub call, so a call that times out after GitHub accepted it still counts.
// KV is not transactional: two requests in the same instant can both pass.
// That costs at most an extra queued run, and dispatch-guard.mjs caps the day.
async function takeSlot(env, kvKey, limits) {
  let history = [];
  try { history = JSON.parse((await env.REFRESH_STATE.get(kvKey)) || '[]'); } catch { history = []; }
  const result = checkLimit(history, Date.now(), limits);
  if (result.allowed) await env.REFRESH_STATE.put(kvKey, JSON.stringify(result.history));
  return result;
}

async function dispatch(env, source) {
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'flytrap-refresh-worker',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main', inputs: { source } }),
  });
  if (res.status !== 204) console.error(`GitHub dispatch failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.status;
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
    },
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
