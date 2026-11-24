// Toast webhook verification. Toast signs each message: base64 of
// HMAC-SHA256(secret, body + timestamp), sent in the Toast-Signature header
// (doc.toasttab.com/doc/devguide/apiMessageSigning.html). The page's sample
// concatenates the body and "the timestamp" without saying whether that is the
// body's own `timestamp` field, so both that and the bare body are accepted.
// Either still needs the subscription's secret, so neither weakens the check.

const MAX_AGE_MS = 30 * 60 * 1000; // Toast retries after 5 and 10 more minutes

const enc = new TextEncoder();

async function hmacBase64(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
  let bin = '';
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin);
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Returns { ok: true, event } or { ok: false, status, reason }.
// status is what to answer Toast with: 401 for a bad signature (Toast does not
// retry 4xx), 200 for a valid message we deliberately ignore.
export async function verifyToastWebhook({ rawBody, signature, secret, restaurantGuid, now }) {
  if (typeof secret !== 'string' || secret.length < 16) return { ok: false, status: 500, reason: 'webhook secret not configured' };
  if (!signature) return { ok: false, status: 401, reason: 'missing signature' };

  let event;
  try { event = JSON.parse(rawBody); } catch { return { ok: false, status: 400, reason: 'body is not JSON' }; }

  const candidates = [rawBody + (typeof event.timestamp === 'string' ? event.timestamp : ''), rawBody];
  let signed = false;
  for (const msg of candidates) {
    if (safeEqual(await hmacBase64(secret, msg), signature.trim())) { signed = true; break; }
  }
  if (!signed) return { ok: false, status: 401, reason: 'bad signature' };

  if (event.eventType !== 'menus_updated') return { ok: false, status: 200, reason: `ignored event ${event.eventType}` };
  const guid = event.details && event.details.restaurantGuid;
  if (!restaurantGuid || guid !== restaurantGuid) return { ok: false, status: 200, reason: 'other restaurant' };
  const sent = Date.parse(event.timestamp);
  if (!Number.isFinite(sent) || now - sent > MAX_AGE_MS || sent - now > 5 * 60 * 1000) {
    return { ok: false, status: 200, reason: 'stale or future timestamp' };
  }
  return { ok: true, event };
}

// Exported for tests, which sign sample messages the way Toast does.
export { hmacBase64 };
