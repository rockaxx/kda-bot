# Design Mode Rank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disable the BOT UI and add a persistent Design Mode rank selector that visually replaces the local player's rank icon.

**Architecture:** The isolated UI stores a rank ID and sends it through the existing strict C-KDA bridge. MAIN world owns a small rank overlay bound to the live hero rank-logo display object and restores the original icon on every exit path.

**Tech Stack:** Chrome MV3 content scripts, plain JavaScript, PIXI display-object projection, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-09-design-mode-rank-design.md`

## Global Constraints

- Rank IDs are integer `0..20`; `0` means Default.
- Asset URL is exactly `https://unsmod.eu/spacemap/ui/rank/<id>/0.png`.
- No broad `fetch`, `JSON.parse`, or platform-global hook.
- BOT source remains present but no BOT UI/control is reachable.
- Original rank visibility is restored on failure and cleanup.

## Review Focus

- Missing/destroyed `rankLogo` → no exception; original stays visible.
- Remote image error → override hides itself and restores original.
- Live user/root replacement → old original restored; new rank target followed.
- Invalid command fields/rank → schema rejects command.
- Teardown/pagehide → image removed, RAF cancelled, original restored.

---

### Task 1: Rank settings and command contract

**Files:**
- Create: `src/design-settings.js`
- Modify: `src/ckda-schema.js`
- Modify: `src/ckda-schema-main.js`
- Modify: `manifest.json`
- Test: `tests/design-settings.test.js`
- Test: `tests/ckda-schema.test.js`
- Test: `tests/manifest.test.js`

**Interfaces:**
- Produces: `DESIGN_DEFAULT_SETTINGS`, `normalizeDesignSettings(value)` and command `set-design-rank { rankId }`.

- [ ] Write failing tests for Default/`1..20`, invalid ranks, strict command fields, and manifest load order.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement settings and schema in both worlds; register isolated script.
- [ ] Run focused tests and confirm pass.

### Task 2: MAIN-world hero rank overlay

**Files:**
- Create: `src/design-main.js`
- Modify: `src/ckda-main.js`
- Modify: `manifest.json`
- Test: `tests/design-main.test.js`
- Test: `tests/ckda-main.test.js`

**Interfaces:**
- Consumes: `createRankOverride({ windowRef, documentRef, getRoots })` and `setRank(rankId)`.
- Produces: cleanup-safe visual overlay controlled by `set-design-rank`.

- [ ] Write failing tests for exact URL, live positioning, original visibility, load error, root replacement, and cleanup.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement minimal overlay and integrate validated command handling/cleanup.
- [ ] Run focused tests and confirm pass.

### Task 3: C-KDA + Design Mode-only UI

**Files:**
- Modify: `src/overlay.js`
- Modify: `src/content.js`
- Test: `tests/overlay.test.js`
- Test: `tests/content.test.js`

**Interfaces:**
- Consumes: persisted `designSettings.rankId` and `onSaveDesign(raw)`.
- Produces: only `C-KDA` and `Design Mode` tabs; rank selector with Default and `1..20`.

- [ ] Write failing tests proving BOT/Settings tabs and controls are absent, C-KDA is default, rank save persists and sends command.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement UI and content persistence/command wiring.
- [ ] Run focused tests and confirm pass.

### Task 4: Verification and commit

**Files:**
- Review all changed files.

- [ ] Run `npm test` and require all tests pass.
- [ ] Run `npm run check` and require extension check pass.
- [ ] Run `git diff --check` and inspect diff for unrelated/generated/sensitive files.
- [ ] Commit exact task files with a Conventional Commit message.

### Added scope: packaged loading screen

- Copy the user-provided `besto.gif` into maintained extension assets.
- Inject `src/loading-screen.css` at `document_start` and override only the body loading background.
- Test manifest resource scope, binary presence, and CSS reference.
