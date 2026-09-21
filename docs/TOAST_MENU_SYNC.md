# Full menu sync (Toast → site)

The **standing menu** is pulled from Toast automatically, the same way the weekly
specials are. Toast is the source of truth; nobody hand-edits the menu each time
it changes.

> Curation is intentionally **deferred**. Right now we pull *everything* Toast
> returns (minus the retail + specials groups, which are shown elsewhere) — no
> filtering of `$0` add-ons, modifiers, or the kid's menu. Once Kara & Sean see
> the full pull on the site they'll decide how they want it curated (a dedicated
> "Website Menu" group in Toast, or code-side filters). See "Curation, TBD" below.

## How it works

```
Toast  ────[GitHub Action, on a cron]────▶  assets/menu.json (committed)
                                              │
                                   page load: fetch(assets/menu.json)
                                              │  success → live menu
                                              └─ fail  → FT_DATA.menuItems (saved backup in data.js)
```

- **`.github/scripts/toast-sync.mjs`** (zero deps, Node 20+ `fetch`):
  1. Auth → `GET /menus/v2/metadata` (for `lastUpdated`) + `GET /menus/v2/menus`.
  2. Walk every menu group (except the excluded ones) into `{ categories, items }`
     and write **`assets/menu.json`** — only when the content actually changed, so
     most runs commit nothing.
- **`.github/workflows/toast-sync.yml`** runs this **and** the specials / soup /
  muffin pull on the same schedule (+ manual dispatch) in one job. It makes a single
  commit of `assets/menu.json` (plus `data.js` + specials images) when anything
  changed, rebases onto `main` before pushing, and triggers the Pages deploy.
- **The site** (`Menu.jsx` → `useLiveMenu`) fetches `assets/menu.json` at page
  load and renders it. The browser never talks to Toast directly.

The site shows exactly what is on the current Toast menu. **Stock/86 status is not
reflected** — out-of-stock items are neither hidden nor greyed. Only the published
menu structure matters; an item removed from the Toast menu stops appearing on the
next sync.

## The backup (menu is never blank)

Two independent layers:

1. **Sync fails** (auth/API/network error, or Toast returns an empty menu): the
   script throws **before writing**, so the last-good `assets/menu.json` already
   committed stays live. `buildBase` refuses to emit an empty menu.
2. **Page-load fetch of `assets/menu.json` fails** (missing file, bad deploy,
   offline): `useLiveMenu` falls back to the hand-curated menu inlined in
   `data.js` (`FT_DATA.menuCategories` / `FT_DATA.menuItems`) and shows a small
   "Showing our saved menu" note. This inlined copy is the durable saved version —
   it is never touched by the sync, so it can't be corrupted by a bad pull.

Keep `FT_DATA.menuItems` in `data.js` reasonably current (refresh it from a good
`assets/menu.json` now and then) so the emergency fallback isn't stale.

## What Toast needs

- A **Standard API Access** credential with the **`menus:read`** scope.
- Repo secrets (Settings → Secrets and variables → Actions):
  `TOAST_CLIENT_ID`, `TOAST_CLIENT_SECRET`, `TOAST_RESTAURANT_GUID`.
- Optional overrides: `TOAST_HOSTNAME` (default `https://ws-api.toasttab.com`),
  `TOAST_VEG_MARKER` (default `(v)`), `TOAST_EXCLUDE_GROUPS`.

Until the secrets are set the workflow is a **no-op** — safe to merge first.

## Conventions Kara controls in Toast

- **Vegetarian:** append the veg marker (default `(v)`) to the item's Toast
  description. It's stripped from the shown text and turns on the green leaf.
- **Excluded groups:** `TOAST_EXCLUDE_GROUPS` (default
  `Weekly Specials,SWAT! Sauce,WHAM! Jam,Fly Trap Swag`) — the specials + retail
  groups, shown in their own sections.

## Curation, TBD (for Kara & Sean)

The raw Toast menu is large and includes POS-only entries (`$0` add-ons,
modifiers, kid's menu, protein-variant duplicates). We ship the full pull as-is
for now. Options to clean it up, once they decide:

- **In Toast (recommended):** maintain a dedicated "Website Menu" group and set
  `TOAST_EXCLUDE_GROUPS` to everything else — what Kara puts there is what shows.
- **In code:** add filters to `toast-sync.mjs` (drop `price == 0`, drop
  modifier/add-on groups, dedupe variants).

## Change detection is on content, never on Toast's timestamp

Every run pulls the full `/menus` payload and compares it to what is committed.
`assets/menu.json` is rewritten only on a byte difference, and the specials step
returns early when the spliced `data.js` is identical - so an unchanged menu
still commits nothing, and there is nothing to force.

It used to work the other way: the menu step skipped the `/menus` pull whenever
`/menus/v2/metadata`'s `lastUpdated` matched the timestamp in the committed
`assets/menu.json`, and the specials step, which reuses that payload, then had
nothing to work from.

**That gate was wrong.** `lastUpdated` tracks menu *publishes*, not edits, and
Toast does not republish for everything a manager changes in Toast Web. On
2026-09-18 Kara pulled a special from Weekly Specials and changed the Soup O' The
Day; `/menus` served the new content immediately while `lastUpdated` sat at
`2026-09-18T21:12:48Z` for three days. The site kept showing the pulled special
and the old soup message, and every run went green having done nothing.
(The gate had one escape hatch - keep pulling while a special sits at
`photo: ""`, because attaching a photo does not move the timestamp either - which
is why the failure only surfaced on a week where every special had its photo.)

The cost of pulling every time is one `/menus` call per run: 96 a day against
Toast's cap of **1 request/sec per location**. The 429s that originally motivated
the gate came from calling `/menus` *twice in one run* (menu step + specials
step); that is fixed separately by sharing the payload between the two steps.

`lastUpdated` is still read and still written into `menu.json` - it is useful in a
log or a diff - it just no longer decides whether the sync pulls.

## Test / verify

Offline (no network), against the sample fixtures:

```bash
TOAST_MENUS_FIXTURE=.github/scripts/fixtures/menus.sample.json \
node .github/scripts/toast-sync.mjs
# rewrites assets/menu.json from the sample payload; `git checkout assets/menu.json` to revert
```

Against live Toast without writing (needs the secrets exported locally):

```bash
TOAST_DRY_RUN=1 node .github/scripts/toast-sync.mjs   # logs category/item/oos counts, writes nothing
TOAST_DUMP=/tmp/menu-dump.md node .github/scripts/toast-sync.mjs   # full listing incl. excluded groups, for review
```
