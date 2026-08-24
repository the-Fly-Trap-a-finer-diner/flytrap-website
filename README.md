# The Fly Trap — website

Marketing site for **The Fly Trap: a finer diner**, 22950 Woodward Ave, Ferndale, MI.

A **no-build static site**: HTML + plain CSS + React loaded from a CDN and JSX
transpiled in the browser. There is no `package.json`, no bundler, no server.
Menu and specials content is pulled from **Toast** by a scheduled GitHub Action.

| | |
|---|---|
| **Repo** | `the-Fly-Trap-a-finer-diner/flytrap-website` |
| **Deployed** | GitHub Pages from `main` → **https://theflytrapferndale.com** |
| **Production domain** | Live. `www.`, `theflytrapferndale.net` and the `github.io` host all 301 to the apex. |
| **Content source** | Toast POS (menu, weekly specials, soup, muffin) + hand-edited files for everything else |
| **CI** | `guardrails` + `tests` on every PR, `toast-sync` every 15 min, `pages` on every push to `main` |
| **Monitoring** | Every deploy is verified in a real browser, and the live site is checked every 15 min. A failure opens a `site-down` issue and assigns it. |

## Run it locally

Any static file server works. From the repo root:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. There is nothing to install and nothing to build —
what you serve is what deploys.

Run the unit tests (Node 20+, no dependencies):

```bash
node --test test/*.mjs
```

## Documentation

Read these in order:

1. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — file-by-file map, how the page
   is assembled, where data comes from, and every automated job.
2. **[docs/DEVELOPING.md](docs/DEVELOPING.md)** — how to make a change: workflow,
   verification gate, the gotchas that will bite you, and a section written for AI
   coding agents.
3. **[docs/CONTENT.md](docs/CONTENT.md)** — the things that change often (photos,
   specials, menu, press, hours, copy): where each one lives and how to update it.
4. **[docs/SEO.md](docs/SEO.md)** — what SEO exists today, what is still open, and
   the domain-cutover checklist.
5. **[ROADMAP.md](ROADMAP.md)** — what shipped, what's in flight, what's blocked.
6. **[AGENTS.md](AGENTS.md)** — the hard stack constraints. These are enforced by CI.

Deep dives on the two sync scripts:
[docs/TOAST_MENU_SYNC.md](docs/TOAST_MENU_SYNC.md) ·
[docs/SPECIALS_SYNC.md](docs/SPECIALS_SYNC.md)

## If the site goes down

You will get a GitHub issue labelled `site-down`, assigned to you, with a table
naming the failing layer and a short runbook. Most of the time nothing is needed:
a bad automated menu update rolls itself back and pauses the sync.

When that happens the repo will contain **`.github/SYNC_PAUSED`**, and the Toast
sync skips every run until it is deleted. Fix the cause first — usually the Toast
item — then delete the file and re-run the sync with `force=true`.

Full runbook, including how to roll back by hand:
[docs/SPECIALS_SYNC.md](docs/SPECIALS_SYNC.md#when-a-sync-breaks-the-site)

## What you need access to

- **GitHub** — repo admin (Actions secrets, Pages settings, branch protection).
- **Toast** — Standard API Access credential with the `menus:read` scope. Stored as
  the repo secrets `TOAST_CLIENT_ID`, `TOAST_CLIENT_SECRET`, `TOAST_RESTAURANT_GUID`.
  Kara manages the actual menu content inside Toast.
- **Domain registrar** for `theflytrapferndale.com` / `.net` — needed for the
  production cutover only.
