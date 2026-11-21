# Staff refresh link

A link staff can open on a phone after changing a special in Toast. It shows one
button, **Refresh specials now**, which starts the Toast sync immediately instead of
waiting for GitHub's scheduler (which in practice fires every 1 to 4 hours, see
[ARCHITECTURE.md](ARCHITECTURE.md#the-schedule-is-not-15-minutes)). The new specials
are live about 2 minutes after the press.

Code: `apps-script/staff-refresh/`. Backstop: `.github/scripts/dispatch-guard.mjs`.

## How it works

```
staff phone ──press──▶ Google Apps Script web app ──GitHub API──▶ Toast sync workflow ──▶ Pages deploy
                       (checks key + limits,                       (checks its own limit,
                        holds the token)                            then the normal sync)
```

The site is on GitHub Pages, which serves files and runs no code, and starting a
workflow needs a GitHub token that must never be in the browser or the repo. So the
button lives in a small Google Apps Script web app that holds the token in its Script
Properties. Apps Script is free and runs on Google's servers, so there is no new
vendor or bill. A Cloudflare Worker would also work but needs a new account.

Opening the link only shows the page. Nothing runs until someone presses the button,
because chat apps open every link they are sent to build a preview.

## Limits

Two independent layers, so a bug or leak in one is still capped by the other.

**In the web app** (`limits.js`, refused presses are never counted, so mashing the
button does not extend the wait):

| Limit | Value | What staff see |
|---|---|---|
| Cooldown | 5 minutes between refreshes | "refreshed a moment ago, try again in N minutes" |
| Hourly | 4 per rolling hour | "limit for this hour is used up" |
| Daily | 12 per rolling 24 hours | "limit for today is used up, or ask Ryan" |

A script lock makes two simultaneous presses take turns, so both cannot slip under
the limit. Apps Script cannot see the caller's IP address, so there is no per-person
limit; the limits are global, and the key in the link is what keeps outsiders out.

**In GitHub** (`dispatch-guard.mjs`, runs as the first job of every manual Toast
sync): if another manual run started less than 2 minutes ago, or 30 manual runs
already started in the last 24 hours, the sync job is skipped (shows grey, not red).
This counts manual runs from anyone, including **Run workflow** on GitHub. It holds
even if the token leaks and someone calls the GitHub API directly, because the token
cannot edit this file. If the check itself errors it lets the run through.
Scheduled runs are never limited.

Also unchanged: the workflow's `concurrency` group means runs never overlap, and the
sync commits nothing when Toast has not changed.

**Worst case if the link leaks:** someone can start up to 12 no-op syncs a day until
the key is changed. They cannot change the menu, the code or any setting.
**If the token leaks:** up to 30 manual syncs a day, and they could crowd out real
manual runs for that day (scheduled runs still happen). Revoke the token.

## Setup after merge (not done yet)

Nothing below has been created. Each step needs an owner of the repo's GitHub
organization and a Google account.

1. **GitHub token.** github.com > Settings > Developer settings > Fine-grained
   tokens > Generate new token.
   - Resource owner: `the-Fly-Trap-a-finer-diner`.
   - Repository access: only `flytrap-website`.
   - Permissions: **Actions: Read and write**. Nothing else (Metadata: read is
     added automatically).
   - Expiration: 1 year, with a calendar reminder to replace it.
   - If the organization has not allowed fine-grained tokens yet: org Settings >
     Personal access tokens > allow them (and approve this one if approval is on).
2. **Apps Script project.** script.google.com > New project, named
   "Fly Trap staff refresh", owned by the account that should own it long term.
   - Replace `Code.gs` with `apps-script/staff-refresh/Code.gs`.
   - Add a script file `limits` and paste `apps-script/staff-refresh/limits.js`.
   - Add an HTML file `Page` and paste `apps-script/staff-refresh/Page.html`.
   - Project Settings > tick "Show appsscript.json", then replace it with
     `apps-script/staff-refresh/appsscript.json`.
3. **Script Properties** (Project Settings > Script properties):
   - `GITHUB_TOKEN`: the token from step 1.
   - `GITHUB_REPO`: `the-Fly-Trap-a-finer-diner/flytrap-website`
   - `REFRESH_KEY`: a random string of at least 24 characters, for example from
     `openssl rand -base64 30 | tr -d '/+='`. Shorter keys are rejected.
4. **Deploy.** Deploy > New deployment > Web app. Execute as: **Me**. Who has access:
   **Anyone**. Approve the permission prompt (it asks to connect to an external
   service, which is the GitHub call).
5. **Test.** Open `<web app URL>?k=<REFRESH_KEY>`, press the button, and check
   GitHub > Actions for a run named **Toast sync (staff refresh)**. Press again
   right away and you should get the cooldown message.
6. **Share** the full link with staff (a pinned message in the staff chat, or a
   home-screen bookmark). Treat it like a door code.

## Changing or turning it off

- **New link** (someone left, link was posted somewhere public): change
  `REFRESH_KEY` in Script Properties. Old links stop working immediately; no
  redeploy needed.
- **Turn it off:** Deploy > Manage deployments > Archive. Or revoke the token on
  GitHub, which also stops it.
- **Change the limits:** edit `limits.js` here, then paste it into the Apps Script
  `limits` file and Deploy > Manage deployments > edit > New version.
- **Logs:** Apps Script > Executions shows each press and any GitHub error.
