# Instant refresh: Toast webhook and staff link

New specials normally reach the site whenever GitHub's scheduler next runs the Toast
sync, which in practice is every 1 to 4 hours (see
[ARCHITECTURE.md](ARCHITECTURE.md#the-schedule-is-not-15-minutes)). A small
Cloudflare Worker cuts that to about 2 minutes:

- **Toast webhook (automatic).** When the restaurant publishes a menu change in Toast,
  Toast calls the Worker, and the Worker starts the Toast sync. Nobody presses
  anything.
- **Staff link (backup).** A link with one button, **Refresh specials now**, for a
  change that did not come with a publish. Rate limited.

The 3-hourly scheduled sync stays on as the last backstop.

Code: `workers/toast-refresh/`. GitHub-side cap: `.github/scripts/dispatch-guard.mjs`.

## How it works

```
Toast publish ──signed POST──▶ /toast-webhook ┐
                                              ├─▶ Worker ──GitHub API──▶ Toast sync ──▶ Pages deploy
staff phone ──press──▶ /?k=<key> → /refresh ──┘   (limits,      (dispatch)   (daily cap,
                                                    holds token)               concurrency)
```

The site is on GitHub Pages, which runs no code, and starting a workflow needs a
GitHub token that must never be in a browser or the repo. The Worker holds it as an
encrypted Cloudflare secret. Google Apps Script was tried first but cannot receive
Toast's webhook: it answers a POST with a redirect, which Toast counts as a failure,
and it cannot read the signature header.

Cost: the free Workers plan. A busy day is a few dozen requests and KV writes, far
inside the free allowance.

## Security and limits

**Toast webhook** (`src/toast-webhook.mjs`):
- Every message must carry a valid `Toast-Signature`: base64 HMAC-SHA256 of the
  body plus its timestamp, keyed with the subscription's secret. Unsigned or wrongly
  signed messages get 401 and start nothing. Toast's docs do not say exactly which
  timestamp is appended, so the body's own `timestamp` field and the bare body are
  both accepted; both still need the secret.
- Only `menus_updated` for our restaurant GUID, sent in the last 30 minutes, is acted
  on. Anything else gets a 200 and is ignored.
- Each Toast event id is acted on once, so Toast's retries do not start extra runs.
- No cooldown, because every publish should go live. Caps: 20 per hour, 40 per day.
- The Worker answers within milliseconds and calls GitHub afterwards, because Toast
  gives up on endpoints that take over 2 seconds.

**Staff link** (`src/limits.mjs`):

| Limit | Value | What staff see |
|---|---|---|
| Key | 24+ random characters in the link | "This link is not valid" |
| Cooldown | 5 minutes between refreshes | "refreshed a moment ago, try again in N minutes" |
| Hourly | 4 per rolling hour | "limit for this hour is used up" |
| Daily | 12 per rolling 24 hours | "limit for today is used up, or ask Ryan" |

Refused presses are not counted, so mashing the button does not extend the wait.
Opening the link only shows the page; the run starts on the button, because chat
apps open links to build previews.

**In GitHub** (`dispatch-guard.mjs`, first job of every manual Toast sync): more
than 48 manual runs in 24 hours, counting everyone and not counting runs GitHub
cancelled, and the sync is skipped (grey, not red). It holds even if the token leaks,
because the token cannot edit that file. If the check itself errors it lets the run
through. Scheduled runs are never limited.

**Bursts** (several publishes a minute apart) are fine: the workflow's concurrency
group keeps one sync running and one queued, GitHub cancels older queued runs, and the
queued run reads the newest menu.

The Worker's state is in Cloudflare KV, which is not transactional, so two requests in
the same instant can both pass a limit. That costs one extra queued run at most.

**Worst cases.** A leaked staff link: up to 12 no-op syncs a day until the key is
changed. A leaked Toast secret or GitHub token: up to 48 manual syncs a day, which
could crowd out real manual runs that day (scheduled runs still happen); rotate it.
None of them can change the menu, the code or any setting.

## Setup after merge (none of this is done)

Each step creates an account, a secret or a live service, so each waits for Ryan's
yes. Steps 2 to 7 run from `workers/toast-refresh/`.

1. **Cloudflare account** (free) at dash.cloudflare.com, owned by whoever should own
   it long term. Pick a workers.dev subdomain when asked.
2. **Sign wrangler in:** `npx wrangler login`.
3. **State store:** `npx wrangler kv namespace create REFRESH_STATE`, then put the id
   it prints into `wrangler.toml` in place of `REPLACE_WITH_KV_NAMESPACE_ID` and commit
   that one line. The id is not a secret.
4. **GitHub token.** github.com > Settings > Developer settings > Fine-grained tokens:
   resource owner `the-Fly-Trap-a-finer-diner`, only `flytrap-website`, permission
   **Actions: Read and write** and nothing else, 1 year expiry with a calendar
   reminder. The org may need to allow fine-grained tokens first (org Settings >
   Personal access tokens). Then `npx wrangler secret put GITHUB_TOKEN`.
5. **Other secrets:**
   - `npx wrangler secret put REFRESH_KEY`, a random 24+ character string, for
     example from `openssl rand -base64 30 | tr -d '/+='`.
   - `npx wrangler secret put TOAST_RESTAURANT_GUID`, the same value as the repo's
     `TOAST_RESTAURANT_GUID` secret.
6. **Deploy:** `npx wrangler deploy`. Note the URL it prints,
   `https://flytrap-toast-refresh.<subdomain>.workers.dev`.
7. **Toast webhook.** In Toast Web: Integrations > Toast API access > Manage
   credentials > Manage webhooks > **+ Add webhook**. Credentials: the ones the Toast
   sync already uses. Category: **Menus**. URL: `<worker URL>/toast-webhook`. A
   notification email for delivery problems. Copy the secret key the subscription
   shows, then `npx wrangler secret put TOAST_WEBHOOK_SECRET`. Toast requires the
   "Manage Integrations" permission and Restaurant Management Suite Essentials or
   higher, so this may need Kara's login.
8. **Test.** Publish any small menu change in Toast, then check GitHub > Actions for
   **Toast sync (Toast publish)** within a minute. Open `<worker URL>/?k=<REFRESH_KEY>`,
   press the button and look for **Toast sync (staff refresh)**; press again and you
   should get the cooldown message. Worker logs: Cloudflare dashboard > Workers >
   flytrap-toast-refresh > Logs.
9. **Share** the staff link with staff (pinned in the staff chat or a home-screen
   bookmark). Treat it like a door code.

## Changing or turning it off

- **New staff link:** `npx wrangler secret put REFRESH_KEY` with a new value. Old links
  stop working at once.
- **Stop the webhook:** delete the subscription in Toast Web, or delete the Worker.
- **Turn everything off:** revoke the GitHub token. The scheduled sync keeps running.
- **Change the limits:** edit `src/limits.mjs`, run the tests, `npx wrangler deploy`.
