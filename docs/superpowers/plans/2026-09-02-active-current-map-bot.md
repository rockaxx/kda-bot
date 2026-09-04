# Active Current-Map NPC Bot Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Chrome extension actively target and kite verified NPCs on whichever map is currently loaded, with no Map ID setting and immediate fail-closed cleanup.

**Architecture:** The isolated controller continues producing a small high-level action vocabulary. The isolated bridge sends validated requests to an initially disarmed MAIN-world executor; that executor re-reads current game roots before every action and calls only existing client target, movement, and key-bind functions. Action results return to the isolated logger. No WebSocket or protocol packet construction is added.

**Tech Stack:** Chrome Manifest V3 content scripts, browser JavaScript, Node.js built-in test runner.

---

### Task 1: Resolve the current structural client version

**Files:**
- Modify: `tests/source-patch.test.js`
- Modify: `src/source-patch.js`

1. Change the no-literal current-fingerprint test to require version `1.9.0.049` embedded in the patched source.
2. Run `node --test tests/source-patch.test.js`; confirm failure because version is `null`/runtime-derived.
3. Add the known version to each exact structural fingerprint and use it when no literal build marker exists.
4. Re-run the focused test; require all tests green.

### Task 2: Remove map configuration and operate on the live map

**Files:**
- Modify: `tests/settings.test.js`
- Modify: `tests/controller.test.js`
- Modify: `tests/overlay.test.js`
- Modify: `src/settings.js`
- Modify: `src/controller.js`
- Modify: `src/overlay.js`

1. Add/change tests proving legacy `requiredMap` is discarded, map mismatch never blocks NPC selection, and active UI exposes no map-setting field while displaying the current map.
2. Run the three focused test files; confirm failures for the obsolete setting/wait behavior/UI.
3. Remove `requiredMap` validation/default/input and the controller's wrong-map branch. Rename the start gate/button from Dry Run to Bot and show current map only.
4. Re-run focused tests; require all green.

### Task 3: Add a fail-closed MAIN-world action executor

**Files:**
- Modify: `tests/page-adapter.test.js`
- Modify: `src/page-adapter.js`

1. Add tests for disarmed rejection, arming, verified NPC selection, player rejection, NPC-only ammo dispatch, finite movement, and disarm cleanup.
2. Run `node --test tests/page-adapter.test.js`; confirm missing-executor failure.
3. Implement an action executor that validates envelopes and live roots, invokes only `requestTarget`, `forceMovement`, and `keyLookupObj[DigitN]`, and emits bounded action results.
4. Install the executor alongside snapshot publication and re-run focused tests green.

### Task 4: Wire active execution, results, Stop, and watchdog

**Files:**
- Modify: `tests/bridge.test.js`
- Add: `tests/runtime.test.js`
- Modify: `src/bridge.js`
- Add: `src/runtime.js`
- Modify: `src/content.js`
- Modify: `manifest.json`

1. Add tests proving outgoing actions use the narrow envelope, incoming action results are validated, Start arms before queued actions, Stop disarms immediately, faults disarm, and stale snapshots trigger cleanup.
2. Run focused tests; confirm failures because action transport/runtime do not exist.
3. Add bridge `sendAction`, validated action-result handling, and a testable runtime coordinator. Keep DOM/bootstrap wiring in `content.js` thin.
4. Add `runtime.js` before `content.js` in the isolated script list. Re-run focused tests green.

### Task 5: Verify extension and document live gate

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-28-space-aces-npc-bot-design.md` only if implementation details differ from the approved contract.

1. Update usage: reload unpacked extension, hard-refresh game, confirm adapter/version/current map, supervise first isolated NPC, verify Stop cleanup.
2. Run `npm test` and `npm run check`.
3. Review `git diff --check`, `git status --short`, and the final diff for unrelated or sensitive files.
4. Report static evidence and the exact supervised browser checks still required; do not claim live behavior before user verification.
