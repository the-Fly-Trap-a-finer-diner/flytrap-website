// Rate limits and key check for the staff refresh link.
//
// Pure functions, no Apps Script APIs, so the same file runs in two places:
//   - Google Apps Script, pasted in as limits.gs next to Code.gs (Apps Script
//     has no modules; every top-level function is global)
//   - node --test, through the module.exports guard at the bottom
//
// The limits are the whole point of this file. A staff link is a link: it gets
// forwarded, screenshotted and left open on the kitchen tablet. However it
// leaks, it must never be able to fire more than a handful of Toast syncs.

var DEFAULT_LIMITS = {
  // Minimum gap between two accepted refreshes, from anyone.
  cooldownMs: 5 * 60 * 1000,
  // At most this many accepted refreshes in any rolling hour ...
  perHour: 4,
  // ... and in any rolling 24 hours.
  perDay: 12,
};

var HOUR_MS = 60 * 60 * 1000;
var DAY_MS = 24 * HOUR_MS;

// Decide whether a refresh requested at `now` may go ahead.
//
// `history` is the list of epoch-ms times of earlier ACCEPTED refreshes (any
// order, may hold junk). Refused requests are never recorded, so hammering the
// button cannot push the next allowed time further out.
//
// Returns { allowed, reason, retryAfterMs, history } where `history` is what to
// store next: pruned to the last 24 hours, plus `now` when allowed.
function checkRefresh(history, now, limits) {
  var l = limits || DEFAULT_LIMITS;
  var recent = (history || [])
    .map(Number)
    .filter(function (t) { return isFinite(t) && t <= now && now - t < DAY_MS; })
    .sort(function (a, b) { return a - b; });

  if (recent.length) {
    var last = recent[recent.length - 1];
    if (now - last < l.cooldownMs) {
      return refuse('cooldown', last + l.cooldownMs - now, recent);
    }
  }

  var lastHour = recent.filter(function (t) { return now - t < HOUR_MS; });
  if (lastHour.length >= l.perHour) {
    return refuse('hourly', lastHour[lastHour.length - l.perHour] + HOUR_MS - now, recent);
  }

  if (recent.length >= l.perDay) {
    return refuse('daily', recent[recent.length - l.perDay] + DAY_MS - now, recent);
  }

  return { allowed: true, reason: 'ok', retryAfterMs: 0, history: recent.concat([now]) };
}

function refuse(reason, retryAfterMs, recent) {
  return { allowed: false, reason: reason, retryAfterMs: Math.max(0, retryAfterMs), history: recent };
}

// Compare the key from the link with the stored one without returning early on
// the first wrong character, so response time says nothing about how much of a
// guess was right. An empty or missing stored key never matches: a refresh app
// set up without a key must refuse everyone, not accept everyone.
function keysMatch(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') return false;
  if (expected.length < 24) return false;
  var diff = given.length ^ expected.length;
  for (var i = 0; i < expected.length; i++) {
    diff |= (given.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// What staff see when a refresh is refused. Plain words, rounded up to whole
// minutes, because "retry in 247 seconds" helps nobody on a lunch rush.
function refusalMessage(result) {
  var mins = Math.max(1, Math.ceil(result.retryAfterMs / 60000));
  var wait = mins >= 90 ? Math.ceil(mins / 60) + ' hours' : mins + (mins === 1 ? ' minute' : ' minutes');
  if (result.reason === 'cooldown') {
    return 'The website was refreshed a moment ago and is already updating. Try again in ' + wait + ' if it still looks wrong.';
  }
  if (result.reason === 'hourly') {
    return 'The refresh limit for this hour is used up. Try again in ' + wait + '.';
  }
  return 'The refresh limit for today is used up. Try again in ' + wait + ', or ask Ryan.';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_LIMITS: DEFAULT_LIMITS,
    checkRefresh: checkRefresh,
    keysMatch: keysMatch,
    refusalMessage: refusalMessage,
  };
}
