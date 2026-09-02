# Live Snapshot Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the existing DRY RUN controller on Space Aces client `1.9.0.049` by publishing validated live snapshots without sending game inputs.

**Architecture:** Extend the source fingerprint table with the exact six roots from client `1.9.0.049`. Keep client-specific reads in the MAIN-world page adapter, normalize only map/player/target/NPC fields, and post bounded snapshots through the existing validated bridge. Keep all action output as `would-*` logs.

**Tech Stack:** Chrome Manifest V3, browser JavaScript, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-28-space-aces-npc-bot-design.md`

## Global Constraints

- NPC-only classification requires `entity.isNpc === true`; unknown entities are omitted.
- No mouse, keyboard, WebSocket, or raw protocol action is emitted in this phase.
- Unknown client fingerprints fail closed.
- Snapshot contains only the fields listed by the approved spec.
- The supplied decrypted client remains outside Git.

---

### Task 1: Current client fingerprint

**Files:**
- Modify: `src/source-patch.js`
- Test: `tests/source-patch.test.js`

**Interfaces:**
- Consumes: decrypted client source string.
- Produces: `patchGameSource(source)` exposing six version-specific roots through `window.__SA_BOT_ROOTS__`.

- [x] **Step 1: Write failing test** for current root markers and exact exposed symbols.
- [x] **Step 2: Run** `node --test tests/source-patch.test.js`; expect current-client case to fail with `unsupported`.
- [x] **Step 3: Add minimal version-specific fingerprint table** for `1.9.0.045` and `1.9.0.049`.
- [x] **Step 4: Run test**; expect all source-patch tests PASS.
- [x] **Step 5: Commit** fingerprint change.

### Task 2: Snapshot normalization and publication

**Files:**
- Modify: `src/page-adapter.js`
- Test: `tests/page-adapter.test.js`

**Interfaces:**
- Consumes: roots `{ version, user, world }`; `world.MAP_SHIPS` is a `Map`; ship fields `x`, `y`, `HP`, `maxHp[config]`, `targetID`, `destroyed`, `isAttacking`; entity fields `isNpc`, `x`, `y`, `HP`, `maxHp[config]`, `destroyed`.
- Produces: `createSnapshot(roots, timestamp)` and `publishSnapshot(windowRef, snapshot)`.

- [x] **Step 1: Write failing tests** for a valid snapshot, strict NPC-only filtering, HP clamping, current NPC target, and missing-root rejection.
- [x] **Step 2: Run** `node --test tests/page-adapter.test.js`; expect missing API failures.
- [x] **Step 3: Implement pure normalizer** using only known data fields; return `null` unless map/player core state is valid.
- [x] **Step 4: Add 100 ms publisher loop** after roots become available; diagnostic still publishes once.
- [x] **Step 5: Run page-adapter tests**; expect PASS.
- [x] **Step 6: Commit** snapshot adapter change.

### Task 3: Current-version controller gate and full verification

**Files:**
- Modify: `src/controller.js`
- Modify: `tests/controller.test.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: snapshots whose `clientVersion` is `1.9.0.049`.
- Produces: normal DRY RUN FSM decisions and `would-*` entries.

- [x] **Step 1: Write failing controller test** proving current client version does not fault.
- [x] **Step 2: Run** `node --test tests/controller.test.js`; expect `unsupported-client-version` failure.
- [x] **Step 3: Change expected client version** to `1.9.0.049` and document current DRY RUN behavior.
- [x] **Step 4: Run** `npm test` and `npm run check`; expect zero failures/errors.
- [x] **Step 5: Review diff** for source bundle, secrets, active actions, or unrelated files.
- [x] **Step 6: Commit** current-version gate and docs.
