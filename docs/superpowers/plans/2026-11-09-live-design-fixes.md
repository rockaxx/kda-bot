# Live Design Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make loading GIF and rank visible live, and add Surgeon-to-Bastion visual model selection.

**Architecture:** Three narrow controllers: isolated loading background, resilient rank target fallback, exact Models JSON interceptor. Persist Design settings through existing storage/UI bridge.

**Tech Stack:** Chrome MV3, vanilla JavaScript, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-09-live-design-fixes-design.md`

## Global Constraints

- Current supported client stays `1.9.0.052`.
- No server/account writes.
- Ship override intercepts only `Models.steam.json` and fails open.
- TDD red-green per task.

## Review Focus

- Missing/replaced body: loading controller reapplies absolute asset URL.
- Missing rankLogo: hero wrapper fallback draws without hiding ship.
- Non-model fetches: native fetch called unchanged.
- Malformed/failed model response: native response survives.
- Default ship setting: Surgeon path remains original.

---

### Task 1: Loading and rank live fixes

**Files:**
- Create: `src/loading-screen.js`
- Create: `tests/loading-screen.test.js`
- Modify: `manifest.json`, `scripts/check-extension.js`, `src/design-main.js`, `tests/design-main.test.js`, `tests/manifest.test.js`

**Interfaces:**
- Produces: `installLoadingScreen({documentRef, assetUrl, Observer})`; rank fallback on `roots.user.ship.wrapper`.

- [ ] Write failing tests for absolute loading URL/replacement body and hero-wrapper fallback.
- [ ] Run focused tests; confirm expected failures.
- [ ] Implement minimal controllers and manifest order.
- [ ] Run focused tests; confirm pass.
- [ ] Commit.

### Task 2: Surgeon-to-Bastion preload override

**Files:**
- Create: `src/design-model-main.js`
- Create: `tests/design-model-main.test.js`
- Modify: `src/design-settings.js`, `src/content.js`, `src/overlay.js`, `manifest.json`, `scripts/check-extension.js`, related tests.

**Interfaces:**
- Consumes: `designSettings.shipDesign` (`default|bastion`).
- Produces: exact-resource `installModelInterceptor(windowRef, getDesign)` and Design selector.

- [ ] Write failing tests for exact URL, path 31→2, default, failure-open, persistence/UI.
- [ ] Run focused tests; confirm expected failures.
- [ ] Implement minimal interceptor/settings/UI wiring.
- [ ] Run focused tests; confirm pass.
- [ ] Commit.

### Task 3: Final verification

- [ ] Run `npm test`, `npm run check`, `git diff --check`.
- [ ] Review commit range and clean Git state.
