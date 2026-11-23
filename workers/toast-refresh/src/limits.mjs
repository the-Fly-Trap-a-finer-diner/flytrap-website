// Pure rate-limit and key logic for the refresh Worker. No Cloudflare APIs here,
// so test/toast-refresh-*.test.mjs can run it under plain node.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Staff link: someone pressing a button. Strict, because a person can wait.
export const STAFF_LIMITS = { cooldownMs: 5 * 60 * 1000, perHour: 4, perDay: 12 };

// Toast webhook: only Toast can send these (they are signed), and every publish
// should reach the site, so there is no cooldown. Bursts are fine: the workflow's
// concurrency group keeps one run going and one queued, and the queued run always
// reads the newest menu. The daily cap only stops a runaway.
export const WEBHOOK_LIMITS = { cooldownMs: 0, perHour: 20, perDay: 40 };

// history: timestamps (ms) of earlier accepted requests. Returns
// { allowed, reason, retryAfterMs, history } where history is what to store.
// A refused request is never added, so hammering a refused button does not
// extend the wait.
export function checkLimit(history, now, limits) {
  const recent = (Array.isArray(history) ? history : [])
    .map(Number)
    .filter((t) => Number.isFinite(t) && t <= now && now - t < DAY_MS)
    .sort((a, b) => a - b);

  if (limits.cooldownMs > 0 && recent.length) {
    const last = recent[recent.length - 1];
    if (now - last < limits.cooldownMs) return refuse('cooldown', last + limits.cooldownMs - now, recent);
  }
  const lastHour = recent.filter((t) => now - t < HOUR_MS);
  if (lastHour.length >= limits.perHour) {
    return refuse('hourly', lastHour[lastHour.length - limits.perHour] + HOUR_MS - now, recent);
  }
  if (recent.length >= limits.perDay) {
    return refuse('daily', recent[recent.length - limits.perDay] + DAY_MS - now, recent);
  }
  return { allowed: true, reason: 'ok', retryAfterMs: 0, history: recent.concat([now]) };
}

function refuse(reason, retryAfterMs, recent) {
  return { allowed: false, reason, retryAfterMs: Math.max(0, retryAfterMs), history: recent };
}

// Constant-time compare. A missing or short stored key never matches, so a
// half-configured Worker refuses everyone instead of accepting an empty key.
export function keysMatch(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') return false;
  if (expected.length < 24) return false;
  let diff = given.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= (given.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  return diff === 0;
}

// What staff see when a press is refused.
export function refusalMessage(result) {
  const mins = Math.max(1, Math.ceil(result.retryAfterMs / 60000));
  const wait = mins >= 90 ? `${Math.ceil(mins / 60)} hours` : `${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
  if (result.reason === 'cooldown') {
    return `The website was refreshed a moment ago and is already updating. Try again in ${wait} if it still looks wrong.`;
  }
  if (result.reason === 'hourly') return `The refresh limit for this hour is used up. Try again in ${wait}.`;
  return `The refresh limit for today is used up. Try again in ${wait}, or ask Ryan.`;
}
