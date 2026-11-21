// Staff refresh link for theflytrapferndale.com.
//
// One button that asks GitHub to run the Toast sync now, so a special changed
// in Toast reaches the website in a couple of minutes instead of whenever
// GitHub's scheduler next fires (often 1 to 4 hours).
//
// Why Apps Script: the site is on GitHub Pages, which serves files and runs no
// code, and starting a workflow needs a GitHub token that must never reach a
// browser. A Google Apps Script web app is free, keeps the token server-side in
// Script Properties, and needs no new vendor. See docs/STAFF_REFRESH.md for
// setup, the limits, and how to turn it off.
//
// What this can do, even in the wrong hands: start the "Toast sync" workflow on
// main, at most as often as limits.gs allows. The sync only ever re-reads Toast,
// so the worst case is a few no-op runs. It cannot change content, code or
// settings: the token is limited to Actions on this one repository.
//
// Script Properties (Project Settings > Script properties), all required:
//   GITHUB_TOKEN  fine-grained token: this repo only, Actions read and write
//   GITHUB_REPO   owner/name, e.g. the-Fly-Trap-a-finer-diner/flytrap-website
//   REFRESH_KEY   long random string; the staff link is <web app URL>?k=<key>
//
// Files in this Apps Script project: Code.gs (this), limits.gs (a copy of
// limits.js from the repo) and Page.html.

var WORKFLOW_FILE = 'toast-sync.yml';
var HISTORY_PROP = 'REFRESH_HISTORY';

// Opening the link only shows the page. The refresh runs when someone presses
// the button: chat apps fetch every link they are sent to build a preview, and
// a GET that triggered a sync would fire one each time the link is shared.
function doGet(e) {
  var key = (e && e.parameter && e.parameter.k) || '';
  if (!keysMatch(key, prop_('REFRESH_KEY'))) {
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">This link is not valid. Ask Ryan for the current one.</p>')
      .setTitle('Fly Trap refresh');
  }
  var page = HtmlService.createTemplateFromFile('Page');
  page.key = key;
  return page.evaluate()
    .setTitle('Refresh the Fly Trap website')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Called from the page's button. Returns { ok, message } for the page to show.
function requestRefresh(key) {
  if (!keysMatch(String(key || ''), prop_('REFRESH_KEY'))) {
    return { ok: false, message: 'This link is not valid. Ask Ryan for the current one.' };
  }

  // One request at a time, so two people pressing together cannot both slip
  // under the limit.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { ok: false, message: 'Someone else is refreshing right now. Try again in a minute.' };
  }
  try {
    var props = PropertiesService.getScriptProperties();
    var history = [];
    try { history = JSON.parse(props.getProperty(HISTORY_PROP) || '[]'); } catch (err) { history = []; }

    var result = checkRefresh(history, Date.now());
    if (!result.allowed) {
      return { ok: false, message: refusalMessage(result) };
    }

    // Count the attempt before calling GitHub. If the call times out after
    // GitHub already accepted it, it still counts against the limit.
    props.setProperty(HISTORY_PROP, JSON.stringify(result.history));

    var res = UrlFetchApp.fetch(
      'https://api.github.com/repos/' + prop_('GITHUB_REPO') + '/actions/workflows/' + WORKFLOW_FILE + '/dispatches',
      {
        method: 'post',
        contentType: 'application/json',
        headers: {
          Authorization: 'Bearer ' + prop_('GITHUB_TOKEN'),
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        payload: JSON.stringify({ ref: 'main', inputs: { source: 'staff-refresh' } }),
        muteHttpExceptions: true,
      }
    );
    var code = res.getResponseCode();
    if (code === 204) {
      return { ok: true, message: 'Refresh started. New specials should be on the website in about 2 minutes.' };
    }
    console.error('GitHub dispatch failed: HTTP ' + code + ' ' + res.getContentText().slice(0, 300));
    return { ok: false, message: 'The refresh could not start (GitHub said ' + code + '). Tell Ryan.' };
  } finally {
    lock.releaseLock();
  }
}

function prop_(name) {
  return PropertiesService.getScriptProperties().getProperty(name) || '';
}
