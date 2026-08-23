# Automated specials sync (Toast → site)

The **weekly specials** plus the **soup of the day** and the **mini-muffin** —
the parts that turn over — are pulled from Toast automatically, so nobody
hand-edits the codebase. Toast is the source of truth. (The full standing menu
is pulled by a sibling script into `assets/menu.json`; see
[TOAST_MENU_SYNC.md](TOAST_MENU_SYNC.md). Both run in one workflow.)

## How it works

`.github/scripts/specials-sync.mjs` (zero deps, Node 20+ `fetch`; reuses the
tested `apps-script/lib/specials.js` block builder):

1. Auth → `GET /menus/v2/menus`.
2. Find the **"Weekly Specials"** Toast group and keep every item in it —
   **a photo is not required**. Three things are excluded: the **soup** and the
   **muffin** (matched by name; they publish as extras cards instead, and would
   otherwise appear twice) and anything with **no price or a $0 price** (Toast's
   menu carries POS artifacts like `***ADD ON***` that must never surface as a
   special). A dry run prints every skipped item with its reason.
3. Download the photo of each special **that has one** into
   `assets/specials/toast-<slug>.jpg` (self-hosted —
   `.special-photo` is `aspect-ratio: 1/1; object-fit: cover`, so any aspect
   crops cleanly). Once every download has succeeded, delete any `toast-*.jpg`
   the new block no longer references, so the directory doesn't grow forever.
   Only the script's own `toast-` naming is ever pruned — hand-added files and the
   retired form publisher's `week-*.jpg` are left alone.
4. Read the **soup** (the **"Soup O' The Day"** item — flavor from its
   description, **Cup = the item's base price**, **Bowl = base + the "Bowl" size
   upcharge**, plus an **out-of-stock** flag). Toast delivers the "Soup Sizes"
   modifier group by *reference* (`item.modifierGroupReferences` → the payload's
   top-level `modifierGroupReferences` / `modifierOptionReferences` tables), where
   each size option's price is an upcharge on the base (Cup +$0, Bowl +$1 → Bowl
   $6 on a $5 base); inline modifier objects and legacy "Cup of Soup" / "Bowl of
   Soup" items are still handled as fallbacks. The **mini-muffin** (price +
   description as the flavor) is read from anywhere in the menu.
5. Rewrite the `/* SPECIALS:START … END */` block **and** the
   `/* EXTRAS:START … END */` block (soup + muffin) of `data.js`.

On an **out-of-stock soup day** — the Toast item flagged out of stock, with its
description set to a message like "No soup on the weekend!" — the sync writes
`available:false` and **clears the prices**, so the site passes that description
through on its own with no price hanging off it. In stock, it shows the flavor +
Cup/Bowl.

`.github/workflows/toast-sync.yml` runs this **and** the menu pull every 15
minutes (+ manual dispatch) in a single job: it makes one commit of `data.js` +
`assets/menu.json` + the images when anything changed (skips otherwise), rebases
onto `main` before pushing, and triggers the Pages deploy.

## Fallback (no blank specials, ever)

Any auth / API / image-download error throws **before** anything is written, so
the last-good specials committed in `data.js` stay live. An empty Weekly
Specials group is also a no-op, as is a missing soup or muffin item (that card is
left exactly as it was). A Toast outage can't blank the site — every
block keeps its own last-good committed state as the fallback.

## What Toast needs (already satisfied)

- A **Standard API Access** credential with the **`menus:read`** scope. (The
  credential issued for this project already has it — verified against live
  Toast.) `stock:read` is not needed for specials.
- Secrets in the repo (Settings → Secrets and variables → Actions):
  `TOAST_CLIENT_ID`, `TOAST_CLIENT_SECRET`, `TOAST_RESTAURANT_GUID`.
- Optional overrides: `TOAST_HOSTNAME` (default `https://ws-api.toasttab.com`),
  `TOAST_VEG_MARKER` (default `(v)`), `TOAST_SPECIALS_GROUP` (default
  `Weekly Specials`).

## Conventions Kara controls in Toast

- **Which specials show:** everything in the "Weekly Specials" group that has a
  price, except the soup and the muffin. **A photo is optional** — a special
  without one publishes with `photo: ""` and the site shows a brand placeholder
  tile (black field, red bloom, cut-out fly) in the same 1:1 box a photo would
  occupy, so the card keeps its shape in the grid. To pull a special, move it out
  of the group. Removing only its photo no longer removes the special.
- **Adding the photo later just works.** While any special is published without
  one, the sync pulls `/menus` on every run instead of trusting the `lastUpdated`
  timestamp — attaching an image in Toast doesn't reliably move that timestamp, so
  the gate would otherwise never notice. Add the photo in Toast and the next run
  (≤15 min) downloads it and swaps out the placeholder. No dispatch needed.
- **Seeing what was skipped:** run the workflow with **dry_run = true**
  (Actions → Toast sync → Run workflow). It lists what would publish, flags the
  ones with no photo, and lists every skipped item with the reason.
- **Soup:** the **"Soup O' The Day"** item — its description is the flavor, its
  base price is the Cup price, and the **"Bowl" option of the "Soup Sizes" modifier
  group** adds its upcharge to the base for the Bowl price (e.g. base $5 + $1 =
  $6). To take the soup down for the day, mark the item **out of stock** in
  Toast and set its description to the message you want shown (e.g. "No soup on the
  weekend!"); the site shows that message with no price. Legacy "Cup of Soup" /
  "Bowl of Soup" items are still read as a fallback. Overridable via
  `TOAST_SOUP_ITEM` (+ `TOAST_SOUP_CUP_ITEM`, `TOAST_SOUP_BOWL_ITEM`).
- **Muffin:** the "Muffin" item (matched loosely) for the muffin price + flavor;
  overridable via `TOAST_MUFFIN_ITEM`.
- **Vegetarian leaf:** append the 🥬 glyph to the item's Toast description (soup,
  specials, and menu items keep it inline, so it renders as the green leaf). The
  `(v)` text marker on specials is also stripped and flags the item vegetarian.

## Forcing a run

The specials step reuses the menu step's payload, and the menu step skips its
pull when Toast reports the menu unchanged — so a change to the sync's own logic
won't reach the site until Toast next republishes. Force one run with
**Actions → Toast sync → Run workflow → force = true**. See
[TOAST_MENU_SYNC.md](TOAST_MENU_SYNC.md#forcing-a-run-after-changing-the-sync-logic).

## Test it offline (no network)

```bash
TOAST_MENUS_FIXTURE=.github/scripts/fixtures/specials.sample.json \
  node .github/scripts/specials-sync.mjs
```
Rewrites the specials block from the sample payload (images skipped). `git
checkout data.js` to revert.

## Verify against live Toast (no write)

```bash
TOAST_DRY_RUN=1 TOAST_CLIENT_ID=… TOAST_CLIENT_SECRET=… TOAST_RESTAURANT_GUID=… \
  node .github/scripts/specials-sync.mjs
```
Prints the specials it would publish; writes nothing, downloads nothing.

## The archive — every special ever run

`docs/specials-history.json` is a running record of every special that has been
published, appended by the sync whenever `data.js` changes. The site never reads
it; it exists so the restaurant can answer "what did we run last spring?" without
a developer.

Each entry carries `firstSeen` / `lastSeen` dates, the name, description, price,
veg flag, the photo path, and `photoBlob` — git's own hash of the image bytes.

A special running for three weeks is **one** entry with a moving `lastSeen`, not
three. Matching is on name plus description, with the 🥬 veg glyph ignored (adding
the marker to an existing special is not a new dish). A genuine wording change
does create a new entry, which is intended — a Chris Benoit made with sourdough is
not the one made with French bread.

### Getting a pruned photo back

The sync deletes a special's photo once it rotates out, but git keeps every blob
that was ever committed. `photoBlob` is the direct handle:

```bash
git cat-file -p 97bb3b84392d... > the-turkish-ish-eggs.jpg
```

No need to hunt for the commit that deleted it.

## There is no manual override

Toast is the only way in. A Google Apps Script form used to publish specials
straight to `main`, and the earlier Instagram-based `flytrap-specials` skill before
that; both are retired. The form was removed because anything it wrote was
overwritten by the next sync within 15 minutes — it read like a safety net but
wasn't one.

If Toast is unreachable, the last good specials stay live (see Fallback above).
To change what's on the site, change it in Toast.

## When a sync breaks the site

Since the two August 2026 outages there are four layers between a bad Toast
description and a blank site. In order:

1. **The sync refuses to write a `data.js` that does not parse** and exits
   non-zero, so the last-good file stays committed and live.
2. **Post-deploy verify** loads the live site in a headless browser after every
   deploy and fails if React does not mount.
3. **Automatic rollback** restores the synced files from the last commit
   confirmed working, pushes, and pauses the sync.
4. **The scheduled monitor** checks every 15 minutes and opens an issue
   assigned to Ryan and Sean.

### The sync is paused — what now

A rollback leaves `.github/SYNC_PAUSED` in the repo. While it exists the Toast
sync skips every run (it shows as *skipped*, not failed) and the site keeps
serving the last verified-good content. Nothing expires; it waits for a person.

To resume:

1. Read the incident issue and the pause file — both say what failed.
2. Fix the cause. Usually the Toast item; occasionally the sync script.
3. Delete `.github/SYNC_PAUSED` and commit.
4. Run **Toast sync** with `force=true` to pull a fresh copy — the normal
   `lastUpdated` gate would otherwise skip until Toast changes again.

### Rolling back by hand

Automatic rollback only touches commits authored by `flytrap-toast-bot`. For
anything else, or if it declined:

```bash
# The last commit confirmed working on the live site
git rev-parse refs/verified/last-known-good

# Restore exactly what the sync owns
git checkout <good-sha> -- data.js assets/menu.json assets/specials docs/specials-history.json
git commit -m "revert(toast): restore the last verified-good site"
git push
```

Use `git checkout <sha> -- <paths>`, **not `git revert`**. Every sync rewrites
the same line of `data.js`, so reverting anything but the tip conflicts.

Do not assume the previous commit is good. During the first outage two syncs
were broken back to back, so stepping back one would have landed on another
blank site. `refs/verified/last-known-good` is the only SHA known to have served
a working page.

To get the site back in seconds without touching `main`, re-run the last good
Pages deploy — it rebuilds from that run's commit:

```bash
gh run list --workflow="Deploy to GitHub Pages" --limit 10 --json databaseId,headSha,conclusion
gh run rerun <id>
```

That is a stop-gap: `main` still holds the bad commit, so the next push
redeploys it.
