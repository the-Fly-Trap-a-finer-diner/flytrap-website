---
name: design-sync
description: Pull updates from the Claude Design project "The Fly Trap - A Finer Diner" into the flytrap-website repo. Use when the user says "sync design", "pull design updates", "design-sync", "check for design updates", or whenever the user mentions changes they made in Claude Design. Handles fetch → diff → apply to a versioned branch → verify locally → regression checks → open PR. Versions are tracked in `.claude/design-sync/state.json`.
---

# design-sync — Claude Design → flytrap-website sync workflow

## Project links

- **Repo:** https://github.com/the-Fly-Trap-a-finer-diner/flytrap-website
- **Claude Design project:** https://claude.ai/design/p/019de9e7-4c3e-72d2-ab13-812e9dc9223d
- **Project ID:** `019de9e7-4c3e-72d2-ab13-812e9dc9223d`
- **Live site:** GitHub Pages from `main` (`.github/workflows/pages.yml`)

Claude Design has no GitHub push API. Sync is a download-via-browser flow.

## Stack constraints (read AGENTS.md first)

The repo is a NO-BUILD static site: HTML + React UMD + Babel-in-browser + plain CSS. All files live at the repo root. See `AGENTS.md` at the repo root for the hard list. If a sync would violate those constraints, STOP and ask the user before applying.

## State file: `.claude/design-sync/state.json`

Tracked in git. Schema:

```json
{
  "version": 3,
  "lastSyncedAt": "2026-06-06T17:32:00-04:00",
  "claudeDesignProjectId": "019de9e7-4c3e-72d2-ab13-812e9dc9223d",
  "lastArchive": {
    "filename": "The Fly Trap - A Finer Diner (1).zip",
    "sizeBytes": 115284699,
    "sha256": "..."
  },
  "syncedFiles": {
    "App.jsx": "sha256",
    "Menu.jsx": "sha256",
    "Nav.jsx": "sha256",
    "Sections.jsx": "sha256",
    "data.js": "sha256",
    "site.css": "sha256",
    "colors_and_type.css": "sha256",
    "image-slot.js": "sha256",
    "tweaks-panel.jsx": "sha256"
  },
  "history": [
    { "version": 1, "ts": "...", "branch": "design-sync-v1", "pr": "...", "notes": "..." }
  ]
}
```

Version increments by 1 every successful sync. New version = new branch `design-sync-v<N>`.

## Files to sync FROM the archive

**Sync (overwrite repo copy):**
- `App.jsx`, `Menu.jsx`, `Nav.jsx`, `Sections.jsx`
- `data.js`
- `site.css`, `colors_and_type.css`
- `image-slot.js` (referenced by HTML)
- `tweaks-panel.jsx` (provides `window.useTweaks` consumed by `App.jsx`)
- `assets/**` (merge — additive; never delete repo assets without explicit user confirmation)
- `fonts/**` (merge — additive)

**Do NOT sync:**
- `The Fly Trap.html` — repo uses `index.html` instead. Diff the two; port any NEW `<script>`/`<link>`/`<meta>` tags into `index.html` manually. Never rename `index.html`.
- `dist/` — Claude Design build artifact. Excluded.
- `screenshots/` — Claude Design canvas screenshots. Excluded.
- `uploads/` — Claude Design upload staging. Excluded.
- `.thumbnail` — Claude Design preview thumbnail. Excluded.

**Decisions that need user input every sync:**
1. Has `tweaks-panel.jsx` UI been hidden in production? Check `tweaks-panel.jsx` for a feature flag or visibility check. If the panel renders an editor in prod, ask user whether to gate it (e.g. `?tweaks=1` URL flag) before merging.
2. Any new `<script>` tags in `The Fly Trap.html` that index.html lacks?
3. Asset deletions: if a file in `assets/` no longer exists in the archive but exists in repo, surface and ask.

## Workflow

### Stage 0 — Preflight

```bash
cd ~/flytrap-website
git fetch origin
git status --short          # must be clean
git checkout main && git pull
```

If working tree dirty: STOP. Ask user to stash/commit first.

Read current state:
```bash
cat .claude/design-sync/state.json
```

### Stage 1 — Fetch latest archive from Claude Design

Use claude-in-chrome MCP. Pre-check Downloads for stale archives so we can identify the new one.

```javascript
// 1. list_connected_browsers, select_browser, tabs_create_mcp
// 2. navigate to https://claude.ai/design/p/019de9e7-4c3e-72d2-ab13-812e9dc9223d
// 3. wait for "The Fly Trap - A Finer Diner" title
// 4. Click Share → Export → "Project archive .zip" → "Download"
//    Click sequence (async, with 500-1500ms gaps to let the UI settle):
//      Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Share').click()
//      Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Export').click()
//      Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Project archive')).click()
//      Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Download').click()
```

Wait for download in `~/Downloads/The Fly Trap - A Finer Diner*.zip`. File can be 100MB+; poll filesystem until size stabilizes for 5 sec.

```bash
ARCHIVE=$(ls -t "$HOME/Downloads/The Fly Trap - A Finer Diner"*.zip | head -1)
```

### Stage 2 — Extract + integrity check

```bash
WORK=$HOME/.claude/tmp/flytrap-sync/$(date +%Y%m%d-%H%M%S)
mkdir -p "$WORK/current"
unzip -q "$ARCHIVE" -d "$WORK/current"
sha256sum "$ARCHIVE" > "$WORK/archive.sha256"
```

Verify expected files present:
```bash
for f in App.jsx Menu.jsx Nav.jsx Sections.jsx data.js site.css colors_and_type.css; do
  [ -f "$WORK/current/$f" ] || { echo "MISSING: $f"; exit 1; }
done
```

If a critical file is missing: STOP. Ask user — archive may be partial.

### Stage 3 — Compute next version + branch

```bash
NEXT=$(jq '.version + 1' .claude/design-sync/state.json)
BRANCH="design-sync-v${NEXT}"
git checkout -b "$BRANCH" main
```

### Stage 4 — Diff + classify changes

For each file in the sync list:

```bash
for f in App.jsx Menu.jsx Nav.jsx Sections.jsx data.js site.css colors_and_type.css image-slot.js tweaks-panel.jsx; do
  if [ -f "$f" ]; then
    diff -u "$f" "$WORK/current/$f" > "$WORK/diff-$f.patch" || true
    echo "$f: $(wc -l < "$WORK/diff-$f.patch") diff lines"
  else
    echo "$f: NEW"
  fi
done
```

Compare HTML files manually:
```bash
diff -u index.html "$WORK/current/The Fly Trap.html"
```

Report a summary table to the user:
| File | Status | Lines changed | Notes |
|------|--------|---------------|-------|

If ANY change touches:
- `index.html` `<script>` ordering — call it out (load order matters)
- A new global on `window.*` — call it out
- A renamed component — call it out
- A removed file — STOP and ask

### Stage 5 — Apply

```bash
# overwrite each file from the archive
for f in App.jsx Menu.jsx Nav.jsx Sections.jsx data.js site.css colors_and_type.css image-slot.js tweaks-panel.jsx; do
  cp "$WORK/current/$f" "$f"
done

# merge assets additively
rsync -av --ignore-existing "$WORK/current/assets/" assets/
rsync -av --ignore-existing "$WORK/current/fonts/" fonts/
```

For `index.html`: do NOT cp. Diff the two HTML files. Port new `<script>` / `<link>` / `<meta>` tags into `index.html` manually. Preserve `index.html` as the entrypoint.

### Stage 5b — Re-apply local-only patches (REQUIRED after every sync)

The archive overwrites repo files including site-only patches. Re-apply this list after every `cp`:

#### Patch P1: image-slot.js mobile scroll fix

Claude Design ships `image-slot.js` with `touch-action:none` on `.frame img` and `.spill` inside the shadow stylesheet. That blocks vertical page scroll on mobile when the touch starts on a special's photo. We override only outside editor mode (`:host([data-editable])`).

```bash
python3 - <<'PY'
import re, pathlib
p = pathlib.Path('image-slot.js')
src = p.read_text()
patched = src.replace(
    "'.frame img{position:absolute;max-width:none;transform:translate(-50%,-50%);' +\n"
    "    '  -webkit-user-drag:none;user-select:none;touch-action:none}' +",
    "// PATCH (flytrap-website): scope touch-action:none to editor mode only so\n"
    "    // mobile page scroll passes through the photo on the deployed site.\n"
    "    // image-slot sets [data-editable] only when window.omelette is present.\n"
    "    // This change will be clobbered by the next design-sync; the design-sync\n"
    "    // skill documents the re-patch step. Original lines kept commented above.\n"
    "    '.frame img{position:absolute;max-width:none;transform:translate(-50%,-50%);' +\n"
    "    '  -webkit-user-drag:none;user-select:none;touch-action:auto}' +\n"
    "    ':host([data-editable]) .frame img{touch-action:none}' +"
).replace(
    "'.spill{position:absolute;transform:translate(-50%,-50%);display:none;z-index:1;' +\n"
    "    '  cursor:grab;touch-action:none}' +",
    "'.spill{position:absolute;transform:translate(-50%,-50%);display:none;z-index:1;' +\n"
    "    '  cursor:grab;touch-action:auto}' +\n"
    "    ':host([data-editable]) .spill{touch-action:none}' +"
)
if patched == src:
    print('P1: no change — already patched or pattern moved (inspect manually)')
else:
    p.write_text(patched)
    print('P1: applied')
PY
```

Verify: at 375x812 in preview, dragging vertically while finger starts on a `.special-photo` must scroll the page (not freeze).

#### Patch P2: mobile-only Order Takeout hero CTA

**The hero is `window.Hero = HeroWrap` defined inside `App.jsx`** (search for "Solid-color hero" comment, ~line 199) — the single source for the hero markup.

Secondary CTA block in `App.jsx` HeroWrap has TWO anchors:
- `.btn-ghost.hero-cta-desktop` → `#visit`, label `Visit Us →` (existing CTA)
- `.btn-ghost.hero-cta-mobile`  → `https://order.toasttab.com/online/the-fly-trap-ferndale-22950-woodward-avenue`, `target=_blank rel=noopener`, label `Order Takeout →`

`site.css` rules:
```css
.hero-cta-desktop { display: none; }
.hero-cta-mobile { display: inline-flex; }
@media (min-width: 768px) {
  .hero-cta-desktop { display: inline-flex; }
  .hero-cta-mobile { display: none; }
}
```

Toast URL canonical: `https://order.toasttab.com/online/the-fly-trap-ferndale-22950-woodward-avenue` (matches `Nav.jsx` "Order Now" CTA). If Toast URL changes, update Nav.jsx + both hero blocks together.

If a sync removes either anchor or the CSS rules, re-add.

#### Patch P3: mobile drawer contained on short (landscape) viewports

Added in PR #155. Three `site.css` blocks, each marked `PATCH (flytrap-website)`:

- `.drawer` has `overflow-y: auto; overscroll-behavior: contain; visibility: hidden;`
  and `transition: transform 320ms var(--ease-out), visibility 0s linear 320ms;`.
  `.drawer.open` sets `visibility: visible` with `transition: transform 320ms var(--ease-out), visibility 0s;`.
  Without this, on a landscape phone the drawer's content is taller than the
  drawer, and the overflow (Visit link, Order Now button, address) hangs below the
  closed, translated-away drawer over the page.
- `@media (max-height: 500px)` block after the base drawer rules (after
  `@keyframes pulse`) tightening drawer padding, link size and spacing.
- `.drawer .drawer-meta .open-pill` is `display: flex` (not `inline-flex`) so the
  address starts on its own line instead of running into "Open now · 8a — 3p".

If a sync drops any of these, restore them from PR #155 (`git show 7949b95 -- site.css`).
Verify: at 844×390 the closed menu shows nothing over the page, and the open menu
scrolls to the address.

#### General rule

Treat anything outside the archive's file list — or with a `PATCH (flytrap-website)` marker comment — as a local patch that survives every sync. Grep before committing:

```bash
grep -rn "PATCH (flytrap-website)" --include="*.js" --include="*.jsx" --include="*.css"
```

Each result must still be present after applying a sync. If gone, restore from prior commit or this skill.

Update state file:
```bash
jq --arg ver "$NEXT" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg sha "$(sha256sum "$ARCHIVE" | awk '{print $1}')" \
   '.version = ($ver|tonumber) | .lastSyncedAt = $ts | .lastArchive.sha256 = $sha' \
   .claude/design-sync/state.json > .claude/design-sync/state.json.tmp
mv .claude/design-sync/state.json.tmp .claude/design-sync/state.json
```

Update each file hash in `syncedFiles`.

### Stage 6 — Local verification (REQUIRED before PR)

Per `~/.claude/CLAUDE.md` verification rules.

```bash
# kill any prior server
lsof -t -iTCP:8000 -sTCP:LISTEN | xargs -r kill 2>/dev/null
cd ~/flytrap-website && python3 -m http.server 8000 &
SERVER_PID=$!
sleep 2
```

Run preview checks via `preview_*` tools (set `cwd` = repo, URL = http://localhost:8000):

1. `preview_start` (or skip if static server is up)
2. `preview_resize` to 375, 768, 1280 — screenshot each
3. At 375: assert `document.documentElement.scrollWidth === clientWidth` (no horizontal overflow)
4. `preview_console_logs` at level `error` — must be EMPTY
5. `preview_logs` at level `error` — must be EMPTY
6. `preview_network` — no 4xx/5xx for same-origin requests
7. Landscape phone (844×390): mobile menu closed → nothing from it shows over the page; open → scrolls to Order Now + address

Stop the server when done:
```bash
kill $SERVER_PID 2>/dev/null
```

If ANY check fails: do not proceed. Either fix the issue (likely a missing port from `The Fly Trap.html` to `index.html`) or roll back the file with `git checkout -- <file>`.

### Stage 7 — Regression checks

Spot-check sections that didn't change in the archive — they must still render. Sections to manually verify in the browser:

- Hero (solid-color `window.Hero = HeroWrap` in `App.jsx`, open/closed badge based on America/Detroit 8a–3p)
- Nav (sticky behavior past hero)
- Menu tabs + vegetarian filter
- Specials (NEW — verify both cards render with images)
- About, Retail, Press, Visit
- Footer
- Mobile menu (drawer) at 844×390 landscape, open and closed

Capture screenshots at 375 / 768 / 1280 for each major section. Attach to PR.

### Stage 8 — Commit + push + PR

```bash
git add -A
git commit -m "feat(design): sync v${NEXT} from Claude Design

- Source: claude.ai/design/p/019de9e7-4c3e-72d2-ab13-812e9dc9223d
- Archive sha256: $(jq -r .lastArchive.sha256 .claude/design-sync/state.json)
- Files synced: <list>
- Verified: 375/768/1280 breakpoints, console clean
"
git push -u origin "$BRANCH"

gh pr create --base main --head "$BRANCH" \
  --title "Design sync v${NEXT}: <one-line summary>" \
  --body "$(cat <<EOF
## Source
Claude Design project: \`The Fly Trap - A Finer Diner\` (\`019de9e7-4c3e-72d2-ab13-812e9dc9223d\`)
Archive: \`$(basename "$ARCHIVE")\`
sha256: $(jq -r .lastArchive.sha256 .claude/design-sync/state.json)

## Changes
<files + line counts table>

## Verification
- [x] python http.server runs clean
- [x] No console errors at 375 / 768 / 1280
- [x] No horizontal overflow at 375
- [x] Open/closed badge ticks
- [x] Menu tabs + veg filter work
- [x] Hash routes work

## Open questions
<anything that needs user decision before merge>
EOF
)"
```

After merge, `main` auto-deploys via the existing Pages workflow.

Append to `.claude/design-sync/state.json` history:
```json
{ "version": <N>, "ts": "...", "branch": "design-sync-v<N>", "pr": "<URL>", "notes": "..." }
```

Commit the state update as a fix-up to the same PR (or a follow-up commit if the PR is already merged).

### Stage 9 — Follow-up issues

For each finding that didn't block the PR but should be tracked:

```bash
gh issue create --title "[design-sync v${NEXT}] <issue>" --body "<details>" --label "design-sync"
```

Common follow-ups:
- Tweaks panel visible in prod — needs gating
- Asset bloat — uploads/ growing
- New external script needs SRI hash

## Failure recovery

- **Download blocked:** user prompt in Chrome blocked the download → re-trigger with focused tab, then retry.
- **Archive truncated:** unzip errors → re-download, compare sha256.
- **Sync produced a broken site:** `git reset --hard main; git branch -D design-sync-v<N>` — versioned branches are disposable until merged.
- **Merge conflict on `main`:** rebase the sync branch on `main`, re-run Stage 6 + 7 before merging.

## Update cadence

Run when the user says they made changes in Claude Design. There is no push notification from Claude Design today, so this skill is pull-only. To check passively: archive sha256 differs from last → there are updates.

A cheaper poll: compare the project's preview iframe URL `src` (`https://<projectId>.claudeusercontent.com/_bootstrap`) — Claude Design changes the bootstrap URL when content changes. Worth testing as a lightweight check before pulling the full archive.

---

## Sub-workflow: Weekly specials sync

**Automated from Toast.** The weekly specials — plus the soup + mini-muffin and
the full standing menu — are pulled from Toast by the Toast sync workflow every
15 minutes; there is no manual weekly pull to run. See `docs/SPECIALS_SYNC.md`
and `docs/TOAST_MENU_SYNC.md`. The tweaks-panel form is the manual override /
emergency path. (This replaced the old Instagram-based specials skill.)
