<!--
The Fly Trap website — PR checklist.
Full rules: AGENTS.md. Sync procedure: .claude/skills/design-sync/SKILL.md.
The `guardrails` workflow runs these checks mechanically; this checklist is the
human pass for things CI can't see (visuals, intent).
-->

## What changed

<!-- One or two lines. What and why. -->

## Type

- [ ] Design sync (Claude Design → repo) — branch is `design-sync-v<N>`
- [ ] Content update (menu, specials, copy)
- [ ] Fix / chore
- [ ] Other:

## Verification gate (required)

Ran the site locally and checked at **375 / 768 / 1280**:

- [ ] Console: zero errors (Babel-in-browser warning is expected)
- [ ] No horizontal overflow at 375 (`scrollWidth === clientWidth`)
- [ ] Changed section renders + matches intent (screenshots below)
- [ ] If it touches the nav or mobile menu: also checked a landscape phone size (e.g. 844×390), menu open and closed
- [ ] If I couldn't verify something, I said so explicitly below

<!-- Drop screenshots here. -->

## Stack invariants (no-build static site)

- [ ] No `package.json` / bundler / Tailwind / TypeScript / `import`·`export`
- [ ] New `.jsx` (if any) added to `index.html` in correct load order
- [ ] Assets referenced as `assets/...` / `fonts/...` (relative, repo root)

## Local patches preserved (only if this touches synced files)

- [ ] `grep -rn "PATCH (flytrap-website)"` — all markers still present
- [ ] image-slot.js editor-gated `touch-action` intact (mobile scroll)
- [ ] Hero "Order Takeout" mobile CTA intact in `App.jsx`
- [ ] Canonical Toast URL unchanged in `Nav.jsx` and `App.jsx`

## Specials (only if this touches the specials section)

- [ ] `SPECIALS` / `EXTRAS` blocks in `data.js` still reflect Toast (not hand-edited)
- [ ] No SAVORY/SWEET badge or `eyebrow` field
- [ ] Every `photo:` path in `data.js` is committed

## Notes

<!-- Anything reviewers should know. Open questions. Couldn't-verify items. -->
