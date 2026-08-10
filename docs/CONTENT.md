# Content — the things that change often

Where each piece of changeable content lives, who owns it, and exactly how to update
it. If you only read one document before taking over day-to-day maintenance, read
this one.

---

## Quick answer table

| I want to change… | Do this |
|---|---|
| This week's specials, or a special's photo | **In Toast.** Nothing to do in the repo. |
| Soup of the day / mini-muffin flavour or price | **In Toast.** |
| A menu item's name, price or description | **In Toast.** |
| Which menu *categories* appear on the site | Edit `HIDDEN_CATEGORIES` in `Menu.jsx` |
| The "A few of our favorites" dish photos | `FT_DATA.dishes` in `data.js` + files in `assets/dishes/` |
| Retail products, copy, prices, photos | The `cards` array inside `Retail()` in `Sections.jsx` + `assets/retail/` |
| Press articles or the rotating pull-quotes | `FT_DATA.press` / `FT_DATA.pressQuotes` in `data.js` |
| The About / origin story copy | `About()` in `Sections.jsx` (inline JSX) |
| Opening hours | Three places — see [Hours](#hours) |
| Address, phone, email, Instagram, order link | Several places — see [Contact details](#contact-details-are-duplicated) |
| The logo or the fly | `assets/brand/` — see [Brand assets](#brand-assets) |
| Colours or type | `colors_and_type.css` tokens |

---

## Toast-owned content (no code change needed)

The weekly specials, the soup, the mini-muffin and the entire standing menu come
from Toast automatically, roughly every 15 minutes. **Kara maintains these in Toast;
nobody edits the repo.** The conventions Toast expects:

| Thing | Convention in Toast |
|---|---|
| **A special appears on the site** | Put the item in the **"Weekly Specials"** group and give it a price. A photo is optional — without one the card shows a brand placeholder tile until you add one, and the sync swaps it in automatically within ~15 min. |
| **Pull a special down** | Move it out of the "Weekly Specials" group. (Removing just the photo no longer pulls it — it publishes without one.) |
| **Soup flavour** | The description of the **"Soup O' The Day"** item. |
| **Soup prices** | Item base price = Cup. The **"Bowl"** option of the **"Soup Sizes"** modifier group adds its upcharge to the base (e.g. $5 base + $1 = $6 Bowl). |
| **Soup unavailable** | Set its description to the message you want shown ("No soup on the weekend!"). Marking the item **out of stock** as well is good practice, but the message alone is enough — the site shows it with no price either way. |
| **Muffin** | The "Muffin" item (matched loosely) — price + description as the flavour. |
| **Vegetarian** | Append the 🥬 glyph to the item's Toast description. On specials, the `(v)` text marker also works and is stripped from the shown text. |

A change in Toast is live on the site within ~15 minutes (GitHub's scheduler is
best-effort; occasionally longer). To force it: **Actions → Toast sync → Run
workflow**. To see what Toast would publish without committing anything, run it with
**dry_run = true**.

Details: [SPECIALS_SYNC.md](SPECIALS_SYNC.md) · [TOAST_MENU_SYNC.md](TOAST_MENU_SYNC.md)

### Two files are machine-owned — never hand-edit

- `assets/menu.json`
- The regions of `data.js` between `/* SPECIALS:START */…/* SPECIALS:END */` and
  `/* EXTRAS:START */…/* EXTRAS:END */`

The next sync overwrites them. Do not remove the marker comments either — the
splice function throws without them, which breaks the sync.

### There is no manual override

Toast is the only way to change a special. A Google Apps Script form used to publish
directly to `main`; it was removed because the next sync overwrote whatever it wrote
within 15 minutes, so it offered false reassurance rather than a real fallback.

If Toast is down, the last good specials stay on the site untouched — that is the
fallback.

---

## Photos

All images live under `assets/`, referenced with **root-relative-free paths** —
`assets/dishes/foo.jpg`, never `/assets/...` or `/public/...`. GitHub Pages serves
the repo root, so a leading slash breaks the path.

### Directory layout

| Directory | Contents | Managed by |
|---|---|---|
| `assets/specials/` | Weekly special photos, `toast-<slug>.jpg` | **Toast sync** — downloaded automatically |
| `assets/dishes/` | 5 "favourites" carousel photos | Human |
| `assets/retail/` | SWAT! sauce + Wham! Jam product shots | Human |
| `assets/brand/` | Logo and fly artwork | Human |
| `assets/details/` | 6 interior/detail photos — **currently unused** | Human |

### Size and shape specs

| Slot | Rendered as | Current files | Target |
|---|---|---|---|
| **Special photo** | `aspect-ratio: 1/1`, `object-fit: cover` — any aspect crops to a square, centred | ~720×1280, ~550 KB | Square-safe subject. Toast handles this; nothing to do. |
| **Dish card** | Fixed height (180px mobile / 240px desktop), **natural width** — never cropped | 600–760 px wide, 44–216 KB | Export ~760 px wide, landscape-ish, JPEG q80, **under 150 KB** |
| **Retail card** | `aspect-ratio: 3/4` portrait, `object-fit: cover`. Renders at 256×341 CSS px on desktop | 700×929, 110–130 KB | 3:4 portrait, **700 px wide, JPEG q80**. Never PNG — see below |
| **Logo / fly** | Inline `<img>`, CSS-sized | 1003×401 and 71×73 PNG | PNG with alpha is correct here |

> **Save retail photos as JPEG, never PNG.** These are photographs; PNG is for
> artwork with flat colour or transparency. The retail set was 6.3 MB as two PNGs
> plus three oversized JPEGs and is now 600 KB at the same on-screen quality. To
> match, `sips -s format jpeg -s formatOptions 80 --resampleWidth 700 in.png --out out.jpg`.

### Adding or swapping a dish photo

1. Drop the file in `assets/dishes/` — lowercase, hyphenated, `.jpg`.
2. Add or edit the entry in `FT_DATA.dishes` in `data.js`:
   ```js
   { src: "assets/dishes/the-burger.jpg", label: "The Burger" },
   ```
   Order in the array is the order in the carousel. `label` is both the caption and
   the `alt` text, so write it as a real description.
3. Serve locally, check the carousel at 375 and 1280, and confirm the card height
   looks right against its neighbours.

### Adding or swapping a retail photo

1. Drop the file in `assets/retail/` (3:4 portrait, JPEG).
2. Edit the `cards` array in `Retail()` in `Sections.jsx`. A simple card uses
   `photo:`; a multi-option card (the sauces) has a `variants` array where each
   variant may carry its own `photo:` and falls back to the card's.
3. A card with no `photo` renders its `label` as script-font text instead — that's
   how Gift Cards and Swag currently display.

### Brand assets

`assets/brand/flytrap-logo-original-red.png` is the live logo — used in the hero,
the nav lockup and the footer. `fly-red.png` is the animated accent fly.

Six other brand files (`flytrap-logo-orange.png`, `flytrap-logo-original.png`,
`flytrap-logo-original-{72,150,300}.webp`, `flytrap-logo-oval-ferndale.png`) are
**not referenced anywhere**. Neither are the six photos in `assets/details/`. They're
kept as source material; delete them if you want a smaller repo.

### Every special is archived

`docs/specials-history.json` records each special that has ever run — dates, name,
description, price, and a handle for recovering its photo even after the file is
pruned. Nothing to maintain; the sync appends to it. See
[SPECIALS_SYNC.md](SPECIALS_SYNC.md#the-archive--every-special-ever-run).

### Specials photos clean themselves up

`assets/specials/` holds only the photos of the specials currently running. After a
successful pull, `specials-sync.mjs` deletes any `toast-*.jpg` the new specials block
no longer references (`orphanedPhotos()`, unit-tested).

The prune is deliberately narrow: it only removes files matching the sync's own
`toast-<slug>.jpg` naming, and only after every download succeeded. Anything you add
by hand, or that the retired Apps Script form published as `week-*.jpg`, is left
alone.

---

## Hours

Hard-coded in **three** places. Change all three together:

1. `data.js` → `ftOpenNow()` — the minute window `480`–`900` (8:00a–3:00p) that drives
   the Open/Closed badge.
2. `App.jsx` → the hero strip text `Mon–Sun · 8a — 3p`, and `Nav.jsx` → the drawer
   pill `· 8a — 3p`.
3. `Sections.jsx` → `Visit()`, the hours table rows (`8:00a — 3:00p`).

The badge and the "today" highlight are anchored to `America/Detroit`, so they read
correctly for out-of-state visitors. If the restaurant ever has different hours on
different days, `ftOpenNow()` needs a per-day table rather than one window.

---

## Contact details are duplicated

Before changing any of these, grep for the old value across the root `.jsx` files.

| Detail | Appears in |
|---|---|
| `22950 Woodward Ave` | `App.jsx` (hero strip), `Nav.jsx` (drawer), `Sections.jsx` (Visit heading, address card, footer) |
| Phone `(248) 399-5150` / `tel:2483995150` | `Nav.jsx`, `Sections.jsx` (Visit, footer) |
| `dine@theflytrapferndale.com` | `Sections.jsx` (Visit) |
| Instagram `@theflytrapferndale` | `Sections.jsx` (Visit, footer) |
| **Toast ordering URL** | `Nav.jsx` (nav CTA + drawer) and `App.jsx` (hero CTA). **CI fails if it is missing from either file** — update both together. |
| Google Maps link | `Sections.jsx` → `Visit()` → `mapsUrl` |

The canonical Toast URL is:
`https://order.toasttab.com/online/the-fly-trap-ferndale-22950-woodward-avenue`

---

## Copy blocks

| Copy | Location |
|---|---|
| About / "Why 'The Fly Trap'?" origin story | `Sections.jsx` → `About()`, inline paragraphs and two `<blockquote className="about-pull">` pull-quotes |
| Menu footer disclaimers + veg legend | `Menu.jsx` → `.menu-foot` |
| "Full Bar — Beer, Wine & Booze" callout | `Menu.jsx` → `.menu-callout` |
| Empty-specials message | `Menu.jsx` — "No specials running this week" |
| Backup-menu notice | `Menu.jsx` — "Showing our saved menu…" |
| Visit lede (parking, walk-in only) | `Sections.jsx` → `Visit()` |
| Footer tagline, copyright line, build credit | `Sections.jsx` → `Footer()` → `.footer-bottom` |
| Page title + meta description | `index.html` |

---

## The menu fallback copy

`FT_DATA.menuCategories` / `FT_DATA.menuItems` in `data.js` is a **hand-curated
snapshot** shown only when `assets/menu.json` fails to load. It is never touched by
the sync, which is what makes it a safe fallback — but it does go stale.

Refresh it a couple of times a year: open a recent `assets/menu.json`, and bring the
prices and items in `data.js` in line with it. Keep the `cat` ids as they are — the
`HIDDEN_CATEGORIES` set in `Menu.jsx` lists both the Toast ids and these legacy ids
so the filter works against either source.
