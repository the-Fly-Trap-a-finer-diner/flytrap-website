# Architecture — how the site is laid out and wired

Everything below describes `main` as of 2026-08-24.

---

## 1. The 30-second version

```
Toast POS ──[GitHub Action, every 15 min]──▶ assets/menu.json  +  data.js (SPECIALS/EXTRAS blocks)
                                                     │  (committed to main)
                                                     ▼
                                        [GitHub Action] Pages deploy
                                                     ▼
              index.html ──▶ React UMD + Babel (CDN) ──▶ .jsx files transpiled in the browser
                                                     ▼
                                     one HTML page, five sections + one hash route
```

Every deploy is then verified, and the live site is checked every 15 minutes:

```
        Pages deploy ──▶ [post-deploy-verify] ──┬── pass ──▶ record last-known-good
                                                └── fail ──▶ roll back + pause the sync
                                                              + open an incident issue

  cron, every 15 min ──▶ [site-health] ─────────┬── pass ──▶ close any open incident
                                                └── fail ──▶ open/update the incident
```

No build step exists anywhere. The files in the repo root **are** the deployed
site; the Pages workflow copies them into `_site` and uploads that.

---

## 2. File map

Every source file lives at the repo root. Subfolders are for assets and tooling only.
This flat layout is deliberate and enforced — see [AGENTS.md](../AGENTS.md).

### Runtime (these ship to the browser)

| File | What it is |
|---|---|
| `index.html` | The only HTML page. Head tags, CDN `<script>` tags, and the ordered list of local scripts. |
| `data.js` | All hand-authored content data on `window.FT_DATA`, plus the open/closed time helpers. Contains two **machine-written blocks** — see §4. |
| `tweaks-panel.jsx` | Claude Design's edit-mode panel. **Also declares the shared `const { useState, useEffect, useRef, useMemo, useCallback } = React;` that every later component relies on.** Renders nothing in production. |
| `Nav.jsx` | Sticky top nav + mobile drawer. `window.Nav`. |
| `Menu.jsx` | The menu section: specials tab, soup/muffin cards, all menu categories, sticky jump-nav with scrollspy. `window.Menu`. |
| `Sections.jsx` | `About`, `DishScroll`, `Retail` (+ `RetailCarousel`), `PressQuote`, `Press`, `Visit`, `Footer`. |
| `App.jsx` | Root component + router + scroll effects, the `BackFly` animation, and the hero (`window.Hero = HeroWrap`). Mounts to `#root`. |
| `image-slot.js` | `<image-slot>` web component from the Claude Design starter. Not used by any current section; kept because a guardrail asserts its local patch. |
| `colors_and_type.css` | Design tokens: `@font-face` declarations, colors, type scale, spacing, radii, shadows, easing. |
| `site.css` | All layout and component styling, ~1,900 lines, organised top-to-bottom by section with `/* ==== */` banners. |
| `assets/` | Images and `menu.json`. |
| `fonts/` | Self-hosted Fraunces + Inter woff2. |
| `favicon.png`, `favicon-32.png` | Icons. |

### Tooling (excluded from the deploy)

| Path | What it is |
|---|---|
| `.github/scripts/toast-sync.mjs` | Pulls the standing menu from Toast → `assets/menu.json`. |
| `.github/scripts/specials-sync.mjs` | Pulls weekly specials + soup + muffin → the marked blocks in `data.js`, downloads special photos, and appends to `docs/specials-history.json`. |
| `.github/scripts/fixtures/*.json` | Sample Toast payloads for offline testing. |
| `.github/scripts/precompile-jsx.mjs` | Transpiles the `.jsx` files into the deploy artifact so the browser never loads Babel. Deploy-only; the repo keeps its `.jsx`. |
| `.github/scripts/site-health.mjs` | Probes the live site — fetches it, parses the live `data.js`, and loads the page in headless Chrome to confirm React mounts. Used by two workflows. |
| `.github/scripts/lib/headless.mjs` | Minimal Chrome DevTools Protocol client over Node's built-in `WebSocket`. No Playwright, no `package.json`. |
| `.github/scripts/rollback.mjs` | Restores the synced files from the last verified-good commit when a deploy fails verification. |
| `.github/actions/incident/` | Composite action that opens, updates and closes the incident issue. |
| `.github/workflows/toast-sync.yml` | The scheduled sync job. |
| `.github/workflows/pages.yml` | Deploy to GitHub Pages. |
| `.github/workflows/guardrails.yml` | Mechanical enforcement of the stack rules, plus the test suite. |
| `.github/workflows/post-deploy-verify.yml` | Proves the site works after every deploy; rolls back if it does not. |
| `.github/workflows/site-health.yml` | Scheduled uptime monitoring with alerting. |
| `.github/SYNC_PAUSED` | Only present after an automatic rollback. While it exists the Toast sync skips every run. |
| `apps-script/lib/` | Shared block-building helpers. `specials.js` is imported by `.github/scripts/specials-sync.mjs` and the tests; `github.js` by `test/github.test.mjs`. The Apps Script web app that gave the directory its name is gone — only the library remains. |
| `test/*.mjs` | `node:test` unit tests for the specials/soup block builders. |
| `.claude/` | Agent tooling: the design-sync skill and its state, launch config, archived plans/reports. |

---

## 3. How the page is assembled

`index.html` loads, in this exact order (the order is asserted by CI):

```
React UMD → ReactDOM UMD → @babel/standalone      (unpkg, with SRI hashes)
data.js → image-slot.js → tweaks-panel.jsx → Nav.jsx → Menu.jsx → Sections.jsx → App.jsx
```

Because there are no modules, **load order is the dependency graph**:

- `data.js` must be first — it defines `window.FT_DATA` and `window.ftOpenNow` /
  `window.ftTodayIdx` / `window.useOpenNow`.
- `tweaks-panel.jsx` must come before any component file — it declares the bare
  `useState` / `useEffect` / `useRef` aliases those files use unqualified.
- `App.jsx` must be last — it calls `ReactDOM.createRoot(...).render(<App />)` and
  defines `window.Hero`.

Components are plain function declarations assigned to `window.*` at the bottom of
their file. There are no `import` / `export` statements anywhere; CI fails the build
if one appears.

### Routing

There is one page and one pseudo-route:

- **`/`** → `App` renders `Hero, Menu, About, DishScroll, Retail, Press, Visit, Footer, BackFly`.
  Nav links are in-page smooth scrolls to `#menu`, `#about`, `#retail`, `#press`, `#visit`.
There is no second page and no client-side router. The `#daily-buzz` sub-page and its
`BuzzBand` teaser were removed once it became clear nothing linked to them and nobody
maintained the copy.

### Notable behaviours

| Behaviour | Where |
|---|---|
| Open/Closed badge, "today" row in the hours table | `data.js` → `ftOpenNow` / `ftTodayIdx` / `useOpenNow`. Hours are hard-coded Mon–Sun 8a–3p, `America/Detroit`. Fails to "Closed" if `Intl` is unavailable. |
| Hero logo shrinks and hands off to the small nav lockup on scroll | `App.jsx` scroll handler + `.hero-wordmark` / `.lockup.show` in `site.css`. |
| The red fly that follows section headers, with its dashed trail | `BackFly` in `App.jsx`. Skipped entirely under `prefers-reduced-motion`. |
| Fade-up on scroll | `.reveal` class + the `IntersectionObserver` in `App.jsx`. |
| Menu jump-nav follows the section under it | `Menu.jsx` scrollspy `IntersectionObserver` + the strip auto-scroll effect. |
| Rotating press pull-quote | `PressQuote` in `Sections.jsx`; pauses on hover/focus, no auto-advance under reduced motion. |

---

## 4. Where the content comes from

This is the single most important thing to understand before editing anything.

| Content | Lives in | Written by |
|---|---|---|
| **Standing menu** (19 categories, ~210 items) | `assets/menu.json` | **Toast sync — do not hand-edit** |
| **Weekly specials** + photos | `data.js`, between `/* SPECIALS:START */` and `/* SPECIALS:END */` | **Toast sync — do not hand-edit** |
| **Soup of the day + mini muffin** | `data.js`, between `/* EXTRAS:START */` and `/* EXTRAS:END */` | **Toast sync — do not hand-edit** |
| Menu **fallback** copy | `data.js` → `FT_DATA.menuCategories` / `menuItems` | Human. Only shown when `assets/menu.json` fails to load. |
| Which menu categories are **hidden** | `Menu.jsx` → `HIDDEN_CATEGORIES` | Human |
| Dish scroll photos | `data.js` → `FT_DATA.dishes` + `assets/dishes/` | Human |
| Retail cards, copy, prices, photos | **`Sections.jsx` → the `cards` array inside `Retail()`** (hard-coded, not in `data.js`) | Human |
| Press articles + pull-quotes | `data.js` → `FT_DATA.press` / `pressQuotes` | Human |
| About copy | `Sections.jsx` → `About()`, inline JSX | Human |
| Address, phone, email, hours, Toast order URL | Hard-coded in **several** places — see [CONTENT.md](CONTENT.md#contact-details-are-duplicated) | Human |

### Menu load path

```js
// Menu.jsx → useLiveMenu()
fetch("assets/menu.json")           // success → source: "live"
  .catch(() => FT_DATA.menuItems)   // failure → source: "backup", shows a small notice
```

Then `visibleMenu()` drops every category in `HIDDEN_CATEGORIES` (the bar, B-sides,
kid's menu and the whole drink list) from both the live and backup data. Toast
category ids and the legacy `data.js` ids are both listed there, so the filter works
either way.

---

## 5. Automation

### `toast-sync.yml` — content pipeline

Cron `2,17,32,47 * * * *` (≈ every 15 min, deliberately offset off the top of the
hour because GitHub drops congested sub-hourly runs), plus manual dispatch with a
`dry_run` toggle.

Two jobs. `guard` first: if `.github/SYNC_PAUSED` exists the `sync` job is
**skipped** (not failed — a red X four times an hour for the length of a pause
would drown the incident it belongs to). That file is written by an automatic
rollback and removed by a human. See *Rollback* below.

Then `sync`, in order:

1. `toast-sync.mjs` — auth, `GET /menus/v2/metadata` + `/menus/v2/menus`, write
   `assets/menu.json`, and stash the raw payload in a temp file.
2. `specials-sync.mjs` — reuse that payload (Toast rate-limits `/menus` to 1 req/sec,
   so a second call would 429), rewrite the `SPECIALS` and `EXTRAS` blocks of
   `data.js`, download any new special photo into `assets/specials/`.
3. Commit `assets/menu.json data.js assets/specials docs/specials-history.json`
   **only if something changed**, `git pull --rebase` onto `main`, push as
   `flytrap-toast-bot`. This path list is mirrored by `SYNCED_PATHS` in
   `rollback.mjs`, and a test asserts the two never drift — if they did, a
   rollback would restore some of a bad sync and leave the rest.
4. Explicitly dispatch the Pages workflow (a `GITHUB_TOKEN` commit doesn't trigger
   other workflows).

**Failure behaviour:** every script throws *before* writing on any auth/API/download
error, so the last good committed content stays live. A Toast outage cannot blank the
site. Without the `TOAST_*` secrets the whole workflow is a no-op.

`specials-sync.mjs` also **compiles the candidate `data.js` and refuses to write it
if it does not parse.** `data.js` is a plain `<script>`: one stray byte is a
SyntaxError that takes out `window.FT_DATA` and blanks the page. That is exactly
what a bare CR in a Toast description did on 2026-08-21 (25 hours) and again on
2026-08-23 (2 hours). A malformed description now costs a red workflow run instead
of the site.

Secrets: `TOAST_CLIENT_ID`, `TOAST_CLIENT_SECRET`, `TOAST_RESTAURANT_GUID`.
Optional: `TOAST_HOSTNAME`, `TOAST_VEG_MARKER`, `TOAST_SPECIALS_GROUP`,
`TOAST_EXCLUDE_GROUPS`.

Full detail: [TOAST_MENU_SYNC.md](TOAST_MENU_SYNC.md) and [SPECIALS_SYNC.md](SPECIALS_SYNC.md).

### `pages.yml` — deploy

On push to `main` (and manual dispatch). `rsync`s the repo root into `_site`,
excluding `.git`, `.github`, `.claude`, `docs`, `test`, `apps-script`, `AGENTS.md`,
`README.md`, `ROADMAP.md`, `LICENSE`, `.gitignore`, `.image-slots.state.json`, then
uploads and deploys. **Merging to `main` publishes immediately.**

**It also precompiles the JSX.** `.github/scripts/precompile-jsx.mjs` transpiles
the five `.jsx` files into plain `.js` inside `_site` and rewrites `index.html` to
load those instead, dropping the `@babel/standalone` tag. The repo is untouched —
this is not a build step for contributors, and nothing generated is committed.

Why: the site otherwise downloads a 3 MB compiler and runs it over 75 KB of JSX
before anything renders. Measured on a 4x-throttled CPU (Lighthouse's mobile
default), median of 5 runs:

| | in-browser Babel | precompiled |
|---|---|---|
| React mounted, first visit | 1515 ms | **343 ms** |
| React mounted, repeat visit | 1145 ms | **137 ms** |
| main thread blocked | 1210 ms | **217 ms** |

The repeat-visit row is the important one: the HTTP cache removes Babel's
download but not its parse-and-compile, so the cost is paid on every visit
forever. Rendered DOM is byte-identical either way.

**It cannot break the deploy.** The script rewrites `index.html` last, so any
earlier failure leaves `_site` holding exactly what ships today — the step is
`continue-on-error` and the script exits 0 with a warning. Verified by running it
with the CDN unreachable: the artifact kept its `.jsx` files and Babel tag and
still rendered.

The Babel build is pinned by `index.html` itself — CI reuses that URL and
verifies the download against the same SRI hash the browser enforces, so the
transform cannot drift from what production would have done.

A side effect worth knowing: the deployed page no longer loads Babel from unpkg
at all, so an unpkg outage or an SRI mismatch on that file can no longer blank
the site. React and ReactDOM are still loaded from unpkg, so the dependency is
reduced, not removed.

It also stamps `<lastmod>` in the published `sitemap.xml` with the date of the last
commit that actually changed the page — deliberately *not* the deploy date, since a
CI-only or docs-only merge deploys the site without changing it, and a `lastmod`
reading "today" on every deploy is one Google learns to ignore. **This is the only
writer**; the committed `sitemap.xml` holds a placeholder that is never served, and
editing it by hand does nothing.

Checkout uses `fetch-depth: 0` with `filter: blob:none` so the history walk is
available without pulling every blob.

### `guardrails.yml` — CI

Runs on every PR to `main` and every push to `main`. Pure grep/test, no install.
It fails the build on:

1. Any build-tooling file (`package.json`, `tsconfig.json`, `vite.config.*`, …),
   `node_modules/`, root `.ts`/`.tsx`, any `import`/`export` at line start, Tailwind CDN.
2. `index.html` missing a script tag or having them out of order.
3. A missing local patch: the `PATCH (flytrap-website)` marker and `touch-action`
   rules in `image-slot.js`; the `hero-cta-mobile` anchor in `App.jsx` and its
   visibility rule in `site.css`.
4. The canonical Toast ordering URL missing from `Nav.jsx` or `App.jsx`.
5. Re-introduced `special-badge` markup or an `eyebrow:` field in `data.js`.
6. A specials photo referenced in `data.js` but not committed.
7. `data.js` or `image-slot.js` failing `node --check`, or a bare carriage return
   in any tracked text file. Both added after the CR outage: inside a JS string a
   CR is a line terminator, so it breaks the parse.
8. A committed `.env`, or any reference to the legacy Bolt preview domain (the
   check greps the whole repo for the literal hostname, **including markdown** — so
   don't type it in a doc either).

A second job, `tests`, runs `node --test test/*.test.mjs`. The suite existed long
before CI ran it, which is how a serializer bug shipped past a green pipeline.

**Branch protection.** A repository ruleset named "main protection" is active on
`main`: it blocks **deletion** and **force-pushes**. It does *not* require the
`guardrails` check to pass, because that would also block the Toast bot — the bot
pushes straight to `main` with `GITHUB_TOKEN` and its commits carry `[skip ci]`, so
`guardrails` never runs on them.

This repo now lives in the **`the-Fly-Trap-a-finer-diner` organisation**, which
means the GitHub Actions integration *can* be listed as a ruleset bypass actor —
the option an earlier version of this document listed as future work. Requiring the
check is therefore now possible: add Actions as a bypass actor, then add a required
status check for `guardrails`. Not done yet; it is a repo-settings change, not a
code one.

Note that requiring `guardrails` would not have caught either CR outage anyway —
`[skip ci]` keeps CI off the bot's commits entirely. The gates that actually cover
the bot are the pre-write parse check in `specials-sync.mjs` and
`post-deploy-verify.yml` below.

### `post-deploy-verify.yml` — did the deploy actually work

Runs on `workflow_run` after **Deploy to GitHub Pages** completes. Keyed off the
deploy rather than the push, because the sync bot's `[skip ci]` suppresses every
push-triggered workflow — and this way it covers every route to production: the
bot, a merged PR, a manual dispatch.

It runs `site-health.mjs`, which makes six checks and reports all of them even
after one fails:

| Check | What it proves |
|---|---|
| `index` | `/` returns HTML with the `#root` mount point |
| `assets` | every local script, stylesheet, preload and icon returns 200 |
| `data.js` | parses as JavaScript and assigns `window.FT_DATA` |
| `photos` | every `photo:` path in the live `data.js` returns 200 |
| `render` | headless Chrome loads the page and React actually mounts |
| `freshness` | the live `data.js` is the one this deploy pushed |

`render` is the one that matters most. Every other check inspects bytes; this runs
the real page in a real browser — Babel transpiles the JSX, React mounts, `data.js`
executes — and looks at the resulting DOM. A blank site fails it regardless of
cause. **Status codes are not enough:** during both CR outages every file returned
200 while the page rendered blank.

It drives Chrome over the DevTools Protocol using Node's built-in `WebSocket`
(`lib/headless.mjs`). `chrome --dump-dom` was tried first and rejected: it
serializes before in-browser Babel has finished fetching and transforming the
`.jsx` files, so it reports an empty `#root` on a healthy site.

On success it records the commit in `refs/verified/last-known-good` — a custom ref,
so it clutters no clones and triggers no workflows.

### Rollback — `rollback.mjs`

When verification fails on a **bot-authored** deploy, the files the sync owns are
restored from `refs/verified/last-known-good`, committed, pushed, and Pages is
redeployed explicitly (a `GITHUB_TOKEN` push raises no events).

Guards, in precedence order. Each exists to stop it doing something worse than the
outage it is fixing:

| Guard | Why |
|---|---|
| already paused | An earlier rollback is uncleared. Hands off. |
| no last-known-good | Nothing to roll back to. |
| this deploy *is* a rollback | Rolling back further would loop. |
| head == last-known-good | Content did not change — it is Pages, DNS or the cert. |
| **human author** | Never quietly undo someone's merge. |

Two details that are easy to get wrong, and are the way they are on purpose:

- **It restores files, it does not `git revert`.** Every sync rewrites the same line
  of `data.js`, so reverting anything but the tip conflicts.
- **It targets a recorded good commit, not `HEAD~1`.** During the first outage two
  syncs were broken back to back, so a one-step rollback would have landed on
  another blank site.

A rollback writes **`.github/SYNC_PAUSED`**, which stops the Toast sync. Without it
the next run re-pulls the same bad Toast data and the two trade commits every
fifteen minutes. Clearing it is a deliberate human act — see
[SPECIALS_SYNC.md](SPECIALS_SYNC.md#the-sync-is-paused--what-now).

### `site-health.yml` — is the site up right now

Cron `7,22,37,52 * * * *`, offset from the sync's `2,17,32,47` so a check never
lands mid-deploy. Runs the same `site-health.mjs`; a monitor that checks something
different from what the deploy gate checks is one you cannot reason about.

Catches what the deploy gate cannot: an expired cert, a Pages outage, a DNS change,
a CDN serving a stale broken copy — and a site that was fine at deploy time and
broke an hour later.

**Alerting.** On failure `.github/actions/incident` opens one GitHub issue labelled
`site-down` and assigns it, which is what sends the email. Assignees come from the
`INCIDENT_ASSIGNEES` repo variable, defaulting to `ryankolean,smcclanaghan76`.

Chosen over email or a push service because it needs no secrets and leaves an audit
trail. The dedupe is the part that makes it survivable: one issue per outage (found
by a hidden marker in the body, so renaming it does not create a second), body
refreshed every run, **comment at most once an hour**, closed automatically on
recovery with the outage duration. Four runs an hour with no dedupe would be 96
issues a day and everyone would mute the repo.

`post-deploy-verify.yml` uses the same action, so a broken deploy and a broken site
are one thread — and a deploy that fixes an outage closes the issue the monitor
opened.

### `apps-script/lib/` — shared helpers, not an app

The directory is named after a Google Apps Script web app that used to let a
non-developer submit specials through a passcode-protected form, committing straight
to `main` via the GitHub API with a personal access token.

**That app was removed.** Once Toast became the source of truth, the next sync
overwrote anything the form published within 15 minutes, so it was not the fallback
it appeared to be — and it carried a personal token and a hardcoded repo path that
would break on any change of ownership.

What remains is the library it shared with the sync: `lib/specials.js` (builds and
splices the `SPECIALS` / `EXTRAS` blocks — used by `specials-sync.mjs` and the tests)
and `lib/github.js` (used by `test/github.test.mjs`). Renaming the directory would
churn those import paths for no functional gain, so the name stays.

### Claude Design sync (legacy)

The site's visual design originated in a Claude Design project; the sync procedure
lives in `.claude/skills/design-sync/SKILL.md` with state in
`.claude/design-sync/state.json`. Only one sync (v1, 2026-06-06) was ever recorded and
the repo has diverged substantially since. **Treat this as historical.** If you don't
plan to keep using Claude Design, the `image-slot.js` / `tweaks-panel.jsx` scaffolding
and the guardrail checks that protect them can eventually be retired — but
`tweaks-panel.jsx` must not simply be deleted, because it declares the React hook
aliases the components use.

---

## 6. Styling

- `colors_and_type.css` holds the tokens. The brand palette is deliberately narrow:
  electric red `#FD0003` (`--color-flytrap-red-deep` / `-bright`), pure black
  (`--color-checker-black`), white. The terracotta/plum/butter/chartreuse tokens are
  leftovers from an earlier palette, still wired into the (hidden) tweaks panel.
- `site.css` is one long, section-ordered stylesheet. Find your section by its
  `/* ==== NAME ==== */` banner.
- Mobile-first. Breakpoints are plain `@media (min-width: 768px)` / `1024px`; the type
  scale steps down under 768px in `colors_and_type.css`.
- **Use the tokens.** Hard-coded hex in `site.css` is a review comment.
- `Caveat` (the script accent) is still loaded from Google Fonts via `@import` in
  `colors_and_type.css` — the only runtime dependency besides the React/Babel CDN.
  Fraunces and Inter are self-hosted.
