# Developing — how to make a change

Read [ARCHITECTURE.md](ARCHITECTURE.md) first. This document is the working
procedure and the list of things that will bite you.

---

## The loop

```bash
git checkout main && git pull
git checkout -b fix/thing-you-are-fixing

# edit files at the repo root — no install, no build

python3 -m http.server 8000     # verify at localhost:8000
node --test test/*.mjs          # only if you touched apps-script/lib or .github/scripts

git commit -am "fix(menu): thing you are fixing"
gh pr create                    # guardrails runs here
# merge → main → auto-deploys to Pages within a minute or two
```

### Rules that are not negotiable

- **Never push site changes straight to `main`.** `main` auto-deploys. One logical
  change per branch → PR → merge.
- **Conventional commits**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `style:`,
  `test:` — imperative, lowercase, no trailing period.
- **Keep PRs single-purpose.** Don't fold an unrelated fix into another change.
- Everything in [AGENTS.md](../AGENTS.md) is enforced by CI. Read it once; it is short.

---

## The verification gate

Before opening a PR, serve the site and confirm at **375 / 768 / 1280** widths:

- Console has **zero errors**. (One warning is expected and fine: Babel's
  "You are using the in-browser Babel transformer" notice.)
- No horizontal overflow at 375 —
  `document.documentElement.scrollWidth === document.documentElement.clientWidth`
  must be `true`.
- The section you changed renders as intended. Screenshot it.
- If you touched the menu: reload with the network throttled or with
  `assets/menu.json` renamed, and confirm the backup menu + "Showing our saved menu"
  notice appear.

"I couldn't verify X because Y" is an acceptable PR note. Silently shipping an
unverified change is not.

---

## Gotchas

These are the things that are surprising about this codebase.

**1. Script load order is the dependency graph.**
There are no imports. A component can only use something declared in a file that
`index.html` loads *earlier*. `tweaks-panel.jsx` declares the bare
`useState/useEffect/useRef/useMemo/useCallback` aliases; `data.js` declares
`FT_DATA` and the time helpers. If you add a file, add its `<script type="text/babel">`
tag in the right position — CI checks the order of the existing seven.

**2. `data.js` is partly machine-written.**
The regions between `/* SPECIALS:START */…/* SPECIALS:END */` and
`/* EXTRAS:START */…/* EXTRAS:END */` are rewritten by the Toast sync. Anything
you type there is gone by the next run. Never delete the marker
comments — `spliceSpecials()` throws if they're missing, which breaks the sync.

**3. `assets/menu.json` is machine-written too.** Same deal. To change what the menu
says, change it in Toast. To change which *categories* appear, edit
`HIDDEN_CATEGORIES` in `Menu.jsx`.

**4. The Toast bot commits to `main` constantly.**
Long-lived branches will drift and conflict on `data.js` / `assets/menu.json`.
Rebase often, or just keep branches short. If you hit a conflict in one of those two
files, take `main`'s version — it is machine truth — and re-apply only your own
structural edits.

**5. React is loaded in development mode.**
`index.html` pulls `react.development.js` / `react-dom.development.js` from unpkg.
Swapping to `.production.min.js` is a real performance win but requires updating the
SRI `integrity` hashes at the same time. (This swap is included in the open SEO PR —
see [SEO.md](SEO.md).)

**6. The tweaks panel and `image-slot.js` are Claude Design scaffolding.**
`TweaksPanel` returns `null` unless a host activates edit mode, so it is invisible in
production — but `tweaks-panel.jsx` also declares the shared hook aliases, so it
cannot simply be deleted. Two guardrail checks protect `image-slot.js`'s local patch.

**7. Retail content is not in `data.js`.**
The retail cards, copy, prices and photo paths are a hard-coded array inside
`Retail()` in `Sections.jsx`. Same for the About copy, which is inline JSX.

**8. Contact details are duplicated.** Address, phone, hours and the Toast ordering
URL appear in several files. See [CONTENT.md](CONTENT.md#contact-details-are-duplicated)
for the complete list before you change one.

**9. `node --test test/` does not work** on current Node — pass the glob:
`node --test test/*.mjs`.

---

## Testing the sync scripts without touching Toast

Offline, against committed fixtures:

```bash
TOAST_MENUS_FIXTURE=.github/scripts/fixtures/specials.sample.json \
  node .github/scripts/specials-sync.mjs      # rewrites data.js from the sample

TOAST_MENUS_FIXTURE=.github/scripts/fixtures/menus.sample.json \
  node .github/scripts/toast-sync.mjs         # rewrites assets/menu.json from the sample

git checkout data.js assets/menu.json         # revert
```

Against live Toast, writing nothing (needs the credentials exported locally):

```bash
TOAST_DRY_RUN=1 TOAST_CLIENT_ID=… TOAST_CLIENT_SECRET=… TOAST_RESTAURANT_GUID=… \
  node .github/scripts/specials-sync.mjs

TOAST_DUMP=/tmp/menu-dump.md node .github/scripts/toast-sync.mjs   # full listing for review
```

You can also run the workflow from the Actions tab with **dry_run = true** — that
pulls from live Toast using the repo secrets and logs what it *would* publish without
committing. This is the easiest way to inspect live Toast data if you don't have the
credentials locally.

---

## Working with an AI agent on this repo

The repo is agent-friendly by design: small, flat, no build, and the invariants are
machine-checked. Point the agent at [AGENTS.md](../AGENTS.md) — that file exists
specifically to constrain code generation, and `guardrails.yml` is its enforcement.

### Give the agent this context

> This is a no-build static site. No `package.json`, no bundler, no npm packages, no
> TypeScript, no `import`/`export`. React 18.3.1 comes from a UMD `<script>` tag and
> JSX is transpiled in the browser by Babel standalone. Components are function
> declarations assigned to `window.*`; cross-file dependencies resolve through the
> script order in `index.html`. Styling is plain CSS in `colors_and_type.css`
> (tokens) and `site.css` (everything else) — use the CSS custom properties, don't
> hard-code hex. All source files live at the repo root; don't create component
> subfolders. Read `AGENTS.md` and `docs/ARCHITECTURE.md` before editing.

### Rules for agents

1. **Never edit inside the `SPECIALS:` / `EXTRAS:` marker blocks in `data.js`, and
   never edit `assets/menu.json`.** Both are machine-generated. Change Toast, or
   change the presentation code.
2. **Never add a dependency**, a config file, or a build step to "fix" something. If
   the answer seems to require npm, the answer is wrong for this repo.
3. **Never reformat a whole file.** Diffs should be minimal and reviewable; the
   design-sync tooling diffs these files by hash.
4. **Preserve the `PATCH (flytrap-website)` markers.** They mark local fixes that a
   design sync would otherwise clobber, and CI asserts they exist.
5. **One change per branch and PR.** Don't opportunistically clean up nearby code —
   note it in [ROADMAP.md](../ROADMAP.md) instead.
6. **Verify before claiming done.** Serve the site, check the console, check 375px
   for horizontal overflow, screenshot the changed section. Say so plainly if you
   couldn't.
7. **Assume `main` moved.** The Toast bot pushes several times a day; rebase before
   pushing.

### Good first tasks to hand an agent

Styling tweaks in `site.css`, copy edits in `Sections.jsx`, adding a press item to
`FT_DATA.press`, adding a dish photo to `FT_DATA.dishes`, adjusting
`HIDDEN_CATEGORIES`. All are single-file, visually verifiable, and cannot break the
sync.

### Tasks to keep away from an agent without close review

Anything touching `.github/scripts/*.mjs` (they run unattended against a live POS
API and a bad write commits straight to `main`), the `BackFly` animation in `App.jsx`
(650 lines of hand-tuned rAF math), and the script tags in `index.html`.
