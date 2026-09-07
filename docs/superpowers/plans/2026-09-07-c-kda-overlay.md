# C-KDA Player Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate C-KDA workspace with read-only player markers, cloaked filtering, EMP/ISH cooldowns, packaged GIF, and a reversible client-local Premium test override without weakening the existing NPC-only bot.

**Architecture:** A dedicated `sa-ckda-v1` channel separates player observations and C-KDA commands from `sa-bot-v1`. MAIN-world code reads version-validated live roots, projects eligible player entities, installs narrow reversible effect/Premium hooks, and publishes sanitized records; isolated-world code validates them, renders a pointer-transparent canvas, and owns UI/storage.

**Tech Stack:** Chrome Manifest V3 content scripts, browser JavaScript, Canvas 2D, `window.postMessage`, `chrome.storage.local`, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-07-c-kda-overlay-design.md`

## Global Constraints

- Host boundary: `https://steam.space-aces.com/gameNew*` only.
- Supported client boundary: exact validated adapter markers for client `1.9.0.051`.
- BOT target/action pipeline accepts NPCs only; C-KDA is observation/rendering only.
- Premium override is client-local, defaults off, and restores exact original state.
- Never replace global `JSON.parse`, `Response.prototype.json`, `Object.defineProperty`, `Reflect.defineProperty`, or `Function`.
- Unknown client versions fail closed.
- C-KDA failure never stops the NPC bot.
- Use tests before implementation code and preserve all existing tests.

## File Structure

- Create `src/ckda-schema.js`: shared channel constants and strict C-KDA envelope/snapshot validation.
- Create `src/ckda-settings.js`: defaults and validation for isolated-world C-KDA preferences.
- Create `src/ckda-core.js`: pure player classification, projection, filtering, and cooldown registry logic.
- Create `src/ckda-main.js`: MAIN-world publisher, effect hook installer, Premium override controller, and lifecycle cleanup.
- Create `src/ckda-bridge.js`: isolated-world validated message subscription and command dispatch.
- Create `src/ckda-canvas.js`: high-DPI marker canvas and five shape renderers.
- Modify `src/overlay.js`: three-tab KDA UI and C-KDA controls/status.
- Modify `src/content.js`: C-KDA storage, orchestration, lifecycle, and BOT-independent error handling.
- Modify `manifest.json`: deterministic script ordering and packaged GIF exposure.
- Create `assets/c-kda.gif`: local copy of the supplied 220122-byte GIF.
- Modify `scripts/check-extension.js`: include all new maintained assets/scripts and forbidden-hook scan.
- Modify `README.md`: document C-KDA operation, safety boundary, defaults, and known limitation.
- Create tests matching each new source file; extend existing manifest/overlay/page-adapter regressions.

---

### Task 1: C-KDA Settings and Message Contract

**Files:**
- Create: `src/ckda-settings.js`
- Create: `src/ckda-schema.js`
- Create: `tests/ckda-settings.test.js`
- Create: `tests/ckda-schema.test.js`

**Interfaces:**
- Produces: `CKDA_DEFAULT_SETTINGS`, `normalizeCkdaSettings(input)`.
- Produces: `CKDA_CHANNEL`, `validateCkdaEnvelope(value, expectedDirection)`, `validateCkdaSnapshot(value)`.
- Snapshot shape: `{timestamp, clientVersion, connectionState, mapId, premiumState, players}`.
- Player shape: `{id, screenX, screenY, relation, cloaked, observedAt, empEndsAt, ishEndsAt}`.

- [ ] **Step 1: Write failing settings tests**

```js
const { CKDA_DEFAULT_SETTINGS, normalizeCkdaSettings } = require("../src/ckda-settings.js");

test("C-KDA defaults keep Premium off", () => {
  assert.deepEqual(CKDA_DEFAULT_SETTINGS, {
    overlayEnabled: true,
    displayMode: "masked-only",
    shape: "circle",
    allyColor: "#45d483",
    enemyColor: "#ff394f",
    sizePx: 8,
    opacity: 0.9,
    showEmpCooldown: true,
    showIshCooldown: true,
    empCooldownMs: 28000,
    ishCooldownMs: 28000,
    premiumOverride: false
  });
});

test("invalid C-KDA values fall back field by field", () => {
  const result = normalizeCkdaSettings({ shape: "hex", sizePx: 500, premiumOverride: "yes" });
  assert.equal(result.value.shape, "circle");
  assert.equal(result.value.sizePx, 8);
  assert.equal(result.value.premiumOverride, false);
  assert.equal(result.ok, false);
});
```

- [ ] **Step 2: Run settings tests and verify missing-module failure**

Run: `node --test tests/ckda-settings.test.js`

Expected: FAIL with `Cannot find module '../src/ckda-settings.js'`.

- [ ] **Step 3: Implement settings normalization**

Implement exact accepted values:

```js
const DISPLAY_MODES = new Set(["masked-only", "all"]);
const SHAPES = new Set(["circle", "square", "triangle", "plus", "star"]);
const COLOR = /^#[0-9a-f]{6}$/i;
// sizePx 3..30, opacity 0.1..1, cooldowns 1000..120000 ms.
// Booleans must be actual booleans; no truthy coercion.
```

Return `{ok, value: Object.freeze(normalized), errors}`. Invalid supplied fields use their default and append one stable error string.

- [ ] **Step 4: Write failing schema tests**

```js
const valid = {
  channel: "sa-ckda-v1",
  direction: "snapshot",
  payload: {
    timestamp: 1000,
    clientVersion: "1.9.0.051",
    connectionState: "connected",
    mapId: 17,
    premiumState: "inactive",
    players: [{
      id: 42, screenX: 100, screenY: 200, relation: "enemy",
      cloaked: true, observedAt: 1000, empEndsAt: null, ishEndsAt: 29000
    }]
  }
};
assert.equal(validateCkdaEnvelope(valid, "snapshot").ok, true);
assert.equal(validateCkdaEnvelope({ ...valid, channel: "sa-bot-v1" }).ok, false);
assert.equal(validateCkdaEnvelope({
  ...valid,
  payload: { ...valid.payload, players: [{ ...valid.payload.players[0], screenX: Infinity }] }
}).ok, false);
```

- [ ] **Step 5: Run schema tests and verify missing-module failure**

Run: `node --test tests/ckda-schema.test.js`

Expected: FAIL with `Cannot find module '../src/ckda-schema.js'`.

- [ ] **Step 6: Implement strict schema validation**

Directions are exactly `snapshot`, `command`, `result`, and `lifecycle`. Relations are exactly `ally` or `enemy`; Premium states are `inactive`, `active`, or `unsupported`; cooldown endpoints are `null` or finite non-negative numbers. Copy only declared keys into the validated value.

- [ ] **Step 7: Run focused tests**

Run: `node --test tests/ckda-settings.test.js tests/ckda-schema.test.js`

Expected: all PASS.

- [ ] **Step 8: Commit contract layer**

```powershell
git add src/ckda-settings.js src/ckda-schema.js tests/ckda-settings.test.js tests/ckda-schema.test.js
git commit -m "feat: add C-KDA contracts"
```

### Task 2: Player Classification, Projection, and Cooldown Registry

**Files:**
- Create: `src/ckda-core.js`
- Create: `tests/ckda-core.test.js`
- Modify: `tests/page-adapter.test.js`

**Interfaces:**
- Produces: `classifyPlayer(entity, roots): "ally" | "enemy" | null`.
- Produces: `projectPlayer(entity): {screenX, screenY} | null`.
- Produces: `filterVisiblePlayers(players, settings, now, viewport, staleAfterMs = 750)`.
- Produces: `createCooldownRegistry(now): {activate, read, clear, clearAll}`.

- [ ] **Step 1: Write failing classification and BOT-isolation tests**

```js
assert.equal(classifyPlayer({ ID: 7, isNpc: true }, roots), null);
assert.equal(classifyPlayer(roots.user.ship, roots), null);
assert.equal(classifyPlayer({ ID: roots.user.userID, isNpc: false }, roots), null);
assert.equal(classifyPlayer({ ID: 8, isNpc: false, clanId: 99 }, roots), "ally");
assert.equal(classifyPlayer({ ID: 9, isNpc: false, clanId: 15 }, roots), "enemy");
```

Extend `tests/page-adapter.test.js` with a player and assert `createSnapshot(...).entities` still contains only `{type: "npc"}` records.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/ckda-core.test.js tests/page-adapter.test.js`

Expected: C-KDA import FAIL; existing BOT assertions remain PASS.

- [ ] **Step 3: Implement player classification**

Eligibility requires a canonical `ID`, `isNpc !== true`, `isHero !== true`, not object-identical to `roots.user.ship`, and ID different from `roots.user.userID`. Ally is true for equal non-null clan IDs or normalized `clanRelation` containing `ally`, `friend`, or `own`; all other eligible players are enemy.

- [ ] **Step 4: Write failing projection/filter tests**

```js
const entity = { renderer: { wrapper: { toGlobal: () => ({ x: 12.5, y: 44 }) } } };
assert.deepEqual(projectPlayer(entity), { screenX: 12.5, screenY: 44 });
assert.equal(projectPlayer({ renderer: { wrapper: { toGlobal: () => ({ x: NaN, y: 1 }) } } }), null);

const filtered = filterVisiblePlayers([
  { id: 1, screenX: 20, screenY: 20, cloaked: true, observedAt: 900 },
  { id: 2, screenX: 30, screenY: 30, cloaked: false, observedAt: 900 },
  { id: 3, screenX: 40, screenY: 40, cloaked: true, observedAt: 1 }
], { overlayEnabled: true, displayMode: "masked-only" }, 1000, { width: 100, height: 100 });
assert.deepEqual(filtered.map((item) => item.id), [1]);
```

- [ ] **Step 5: Implement fail-closed projection/filtering**

Use `renderer.wrapper.toGlobal({x: 0, y: 0})` in `try/catch`. Accept a 32 px viewport margin, reject stale records, and return a new array without mutating the snapshot.

- [ ] **Step 6: Write failing cooldown registry tests**

```js
let current = 1000;
const registry = createCooldownRegistry(() => current);
registry.activate("emp", 7, 28000);
registry.activate("emp", 7, 28000);
assert.equal(registry.read(7).empEndsAt, 29000);
current = 29001;
assert.equal(registry.read(7).empEndsAt, null);
registry.activate("ish", 7, 28000);
registry.clearAll();
assert.deepEqual(registry.read(7), { empEndsAt: null, ishEndsAt: null });
```

- [ ] **Step 7: Implement monotonic cooldown registry**

Store one end timestamp per `kind:id`. Duplicate activation within 250 ms retains the original end time; a later activation replaces it. `read` lazily removes expired entries.

- [ ] **Step 8: Run focused tests**

Run: `node --test tests/ckda-core.test.js tests/page-adapter.test.js`

Expected: all PASS.

- [ ] **Step 9: Commit pure C-KDA core**

```powershell
git add src/ckda-core.js tests/ckda-core.test.js tests/page-adapter.test.js
git commit -m "feat: add C-KDA player model"
```

### Task 3: MAIN-World Player Snapshot Publisher

**Files:**
- Create: `src/ckda-main.js`
- Create: `tests/ckda-main.test.js`
- Modify: `manifest.json`
- Modify: `tests/manifest.test.js`

**Interfaces:**
- Consumes: `classifyPlayer`, `projectPlayer`, `createCooldownRegistry`, `CKDA_CHANNEL`.
- Produces: `createCkdaSnapshot(roots, cooldowns, premiumState, timestamp)`.
- Produces: `startCkdaPublisher(windowRef, roots, options): {stop, refresh}`.

- [ ] **Step 1: Write failing snapshot tests**

Build a `MAP_SHIPS` fixture containing local ship, NPC, valid cloaked enemy, valid ally, and malformed player. Assert output includes exactly the two valid remote players, finite projected coordinates, `Boolean(entity.isCloaked)`, relation, cooldown endpoints, current map ID, and normalized version `1.9.0.051`.

- [ ] **Step 2: Run test and verify missing-module failure**

Run: `node --test tests/ckda-main.test.js`

Expected: FAIL with `Cannot find module '../src/ckda-main.js'`.

- [ ] **Step 3: Implement sanitized snapshot construction**

Use `roots.world.MAP_SHIPS.forEach`. Return `null` unless version is exactly `1.9.0.051`, network is connected, map ID is a positive integer, and required roots exist. Never include raw entities, names, inventory, account fields, or functions.

- [ ] **Step 4: Write failing publisher lifecycle tests**

Assert publisher sends immediately, then at 100 ms; `refresh()` sends once; world/map identity change clears cooldowns before publication; `stop()` clears the interval and prevents further messages.

- [ ] **Step 5: Implement publisher lifecycle**

Publisher messages are `{channel: "sa-ckda-v1", direction: "snapshot", payload}`. Track the last `world` identity and `mapId`. On change call `cooldowns.clearAll()`.

- [ ] **Step 6: Add deterministic manifest order test**

MAIN order must be:

```json
["src/namespace-main.js", "src/source-patch.js", "src/page-adapter.js",
 "src/ckda-schema.js", "src/ckda-core.js", "src/ckda-main.js"]
```

Isolated order begins with `namespace.js`, then `ckda-schema.js`, `ckda-settings.js`, `ckda-core.js` before consumers.

- [ ] **Step 7: Update manifest and run focused tests**

Run: `node --test tests/ckda-main.test.js tests/manifest.test.js`

Expected: all PASS.

- [ ] **Step 8: Commit publisher**

```powershell
git add src/ckda-main.js tests/ckda-main.test.js manifest.json tests/manifest.test.js
git commit -m "feat: publish C-KDA player snapshots"
```

### Task 4: Reversible EMP and ISH Event Hooks

**Files:**
- Modify: `src/ckda-main.js`
- Modify: `tests/ckda-main.test.js`
- Modify: `src/source-patch.js`
- Modify: `tests/source-patch.test.js`

**Interfaces:**
- Produces: `findUniquePrototypeMethod(target, markers): string | null`.
- Produces: `installEffectHooks(world, cooldowns, durations): {supported, cleanup}`.
- Current semantic points: named `world.addEmpNew(target)` and one prototype method whose function source contains both `instaShield` and `tshield`.

- [ ] **Step 1: Write failing unique-method tests**

```js
const proto = {
  hiddenIsh(target) { return "instaShield tshield" + target.ID; },
  unrelated() { return "instaShield"; }
};
assert.equal(findUniquePrototypeMethod(Object.create(proto), ["instaShield", "tshield"]), "hiddenIsh");
proto.second = function () { return "instaShield tshield"; };
assert.equal(findUniquePrototypeMethod(Object.create(proto), ["instaShield", "tshield"]), null);
```

- [ ] **Step 2: Implement unique descriptor discovery**

Walk the prototype chain up to but excluding `Object.prototype`. Inspect only own data descriptors whose value is a function via `Function.prototype.toString.call`. Require exactly one match; never invoke candidate methods during discovery.

- [ ] **Step 3: Write failing hook/cleanup tests**

Assert EMP and ISH wrappers call originals with unchanged `this`, arguments, and return value; activate cooldown only for a target with valid `ID`; duplicate installation is rejected; cleanup restores exact original function descriptors; cleanup is idempotent.

- [ ] **Step 4: Implement reversible wrappers**

Use `Object.getOwnPropertyDescriptor` and `Object.defineProperty` only on the owning world prototype. Mark wrapper functions with a private `Symbol`. EMP duration comes from `settings.empCooldownMs`; ISH from `settings.ishCooldownMs`.

- [ ] **Step 5: Strengthen current source fingerprint**

Require the current-client profile to contain all existing seven root markers plus literal semantic markers `['addEmpNew']`, `'instaShield'`, `'tshield'`, and `['updatePremium']`. Missing or ambiguous roots still return `unsupported` byte-identically.

- [ ] **Step 6: Run focused tests**

Run: `node --test tests/ckda-main.test.js tests/source-patch.test.js`

Expected: all PASS.

- [ ] **Step 7: Commit semantic hooks**

```powershell
git add src/ckda-main.js tests/ckda-main.test.js src/source-patch.js tests/source-patch.test.js
git commit -m "feat: track current EMP and ISH effects"
```

### Task 5: Scoped Premium Test Override

**Files:**
- Modify: `src/ckda-main.js`
- Modify: `tests/ckda-main.test.js`

**Interfaces:**
- Produces: `createPremiumOverride(roots, documentRef): {enable, disable, refresh, state}`.
- `state()` returns `inactive`, `active`, or `unsupported`.

- [ ] **Step 1: Write failing descriptor preservation tests**

Cover a writable data property, accessor property, absent property, non-configurable property, throwing `updatePremium`, user-root replacement, and repeated enable/disable.

Core assertions:

```js
const original = Object.getOwnPropertyDescriptor(user, "isPremium");
assert.equal(controller.enable(), true);
assert.equal(user.isPremium, true);
controller.disable();
assert.deepEqual(Object.getOwnPropertyDescriptor(user, "isPremium"), original);
assert.equal(JSON.parse, nativeJsonParse);
assert.equal(Response.prototype.json, nativeResponseJson);
```

- [ ] **Step 2: Run test and verify failure**

Run: `node --test tests/ckda-main.test.js --test-name-pattern="Premium"`

Expected: FAIL because controller export does not exist.

- [ ] **Step 3: Implement transactional enable**

Require version `1.9.0.051`, a live user object, function `user.updatePremium`, and a configurable or absent own `isPremium` property. Capture the exact descriptor. Install configurable getter returning `true` and setter that records but does not expose server writes while active. Call `user.updatePremium(true)` inside `try/catch`. If any step fails, restore immediately and return `false`.

- [ ] **Step 4: Implement exact disable/refresh**

Disable restores the captured descriptor, or deletes the temporary property when originally absent, then invokes `updatePremium(originalBoolean)` only when the original effective value was boolean. `refresh()` detects changed `roots.user`, restores the old root, and transactionally applies to the new root only when the override remains requested.

- [ ] **Step 5: Add forbidden-global regression**

Read `src/*.js` and assert no assignment or `defineProperty` target modifies `JSON.parse`, `Response.prototype.json`, `Object.defineProperty`, `Reflect.defineProperty`, or `window.Function`.

- [ ] **Step 6: Run focused tests**

Run: `node --test tests/ckda-main.test.js`

Expected: all PASS.

- [ ] **Step 7: Commit Premium override**

```powershell
git add src/ckda-main.js tests/ckda-main.test.js
git commit -m "feat: add reversible Premium test override"
```

### Task 6: Isolated Bridge and Marker Canvas

**Files:**
- Create: `src/ckda-bridge.js`
- Create: `src/ckda-canvas.js`
- Create: `tests/ckda-bridge.test.js`
- Create: `tests/ckda-canvas.test.js`
- Modify: `manifest.json`

**Interfaces:**
- Produces: `createCkdaBridge({windowRef, onSnapshot, onResult})` with `sendCommand(type, payload)` and `destroy()`.
- Produces: `drawMarker(context, shape, x, y, size, color, opacity)`.
- Produces: `createCkdaCanvas({documentRef, windowRef}): {render, clear, destroy}`.

- [ ] **Step 1: Write failing bridge tests**

Assert only same-window, valid `sa-ckda-v1` snapshots/results are delivered; malformed, wrong-channel, oversized, and wrong-source messages are rejected. Command IDs increment and commands contain no player-action types.

- [ ] **Step 2: Implement bridge**

Allow command types exactly `set-premium`, `configure-effects`, `clear`, and `refresh`. Reject payloads whose serialized size exceeds 4096 bytes. `destroy()` removes the listener.

- [ ] **Step 3: Write failing canvas geometry tests**

Use a recording context and assert each shape issues its expected primitives: circle=`arc`, square=`rect`, triangle=three vertices, plus=two crossing strokes, star=ten alternating vertices. Assert `save/restore` bracket opacity/style changes.

- [ ] **Step 4: Implement shape renderer**

Keep line width proportional to marker size and clamp drawing inputs using already normalized settings. No text or player name is drawn.

- [ ] **Step 5: Write failing high-DPI/lifecycle tests**

Assert CSS size follows viewport, backing width/height multiply by `devicePixelRatio`, canvas has `pointer-events:none`, stale/masked filtering is applied, cooldown labels show `ceil((endsAt-now)/1000)`, and `destroy()` cancels animation frame/listeners and removes canvas.

- [ ] **Step 6: Implement canvas lifecycle**

Use one RAF loop, retain only the latest validated snapshot/settings, and clear when disabled, disconnected, unsupported, or stale. Give canvas fixed ID `sa-ckda-marker-layer` and z-index below the KDA menu host.

- [ ] **Step 7: Update isolated manifest order and run tests**

Load `ckda-bridge.js` and `ckda-canvas.js` before `overlay.js` and `content.js`.

Run: `node --test tests/ckda-bridge.test.js tests/ckda-canvas.test.js tests/manifest.test.js`

Expected: all PASS.

- [ ] **Step 8: Commit bridge and renderer**

```powershell
git add src/ckda-bridge.js src/ckda-canvas.js tests/ckda-bridge.test.js tests/ckda-canvas.test.js manifest.json tests/manifest.test.js
git commit -m "feat: render C-KDA player markers"
```

### Task 7: Three-Tab Bloody C-KDA UI

**Files:**
- Modify: `src/overlay.js`
- Modify: `tests/overlay.test.js`

**Interfaces:**
- Extends `createOverlay` callbacks with `onSaveCkda`, `onCkdaCommand`.
- Extends `render(model)` with `ckdaSettings`, `ckdaSnapshot`, `ckdaStatus`.
- Produces `createCkdaFormState(inputs)` using the same draft-preservation contract as bot settings.

- [ ] **Step 1: Write failing tab and form-state tests**

Change expected tabs to `createPanelState(["bot", "ckda", "settings"])`, default `bot`. Assert unknown selection remains rejected. Add C-KDA draft test proving telemetry renders do not overwrite focused colour/number/select edits before save.

- [ ] **Step 2: Run overlay tests and verify failure**

Run: `node --test tests/overlay.test.js`

Expected: FAIL because current tabs are `dashboard/settings` and no C-KDA form exists.

- [ ] **Step 3: Rename Dashboard to BOT and build C-KDA view**

Use three equal navigation buttons. Build labeled controls for overlay, mode, shape, ally/enemy colour, size, opacity, EMP/ISH toggles and durations, Premium override, save, clear, status, and tracked count. Keep raw JSON absent.

- [ ] **Step 4: Add state/status rendering**

Map states to exact labels: `Ready`, `Waiting for game`, `Unsupported client`, `No player data`, `Premium override active`, `Premium override unsupported`. Never disable BOT Start due solely to C-KDA state.

- [ ] **Step 5: Preserve keyboard behavior**

Keep existing composed-path editable detection. `N` toggles the complete menu; normal form keystrokes do not.

- [ ] **Step 6: Run overlay tests**

Run: `node --test tests/overlay.test.js`

Expected: all PASS.

- [ ] **Step 7: Commit UI**

```powershell
git add src/overlay.js tests/overlay.test.js
git commit -m "feat: add C-KDA control tab"
```

### Task 8: C-KDA Orchestration, Persistence, and Cleanup

**Files:**
- Modify: `src/content.js`
- Create: `tests/content.test.js`
- Modify: `src/ckda-main.js`
- Modify: `tests/ckda-main.test.js`

**Interfaces:**
- Storage key: `ckdaSettings`.
- MAIN command handler consumes validated `set-premium`, `configure-effects`, `clear`, `refresh` commands.
- Isolated model tracks latest snapshot independently from runtime BOT snapshot.

- [ ] **Step 1: Write failing isolated orchestration tests**

Mock `chrome.storage.local`, bridge, canvas, and overlay. Assert defaults load, save persists normalized values, canvas receives new settings/snapshots, Premium command mirrors the toggle, malformed snapshots do not change state, and bridge/canvas cleanup occurs on page hide.

- [ ] **Step 2: Implement independent C-KDA model**

Do not place C-KDA snapshots in `runtime.onSnapshot`. Overlay `render` receives BOT and C-KDA fields separately. C-KDA listener exceptions are caught and converted to C-KDA status only.

- [ ] **Step 3: Write failing MAIN command/lifecycle tests**

Assert commands require same-window source and exact channel/schema; `set-premium` invokes controller; `configure-effects` validates durations; `clear` clears timers; `refresh` publishes immediately. `pagehide` stops publisher, cleans hooks, disables Premium, and removes command listener.

- [ ] **Step 4: Implement MAIN installer**

`installCkda(windowRef)` polls for `__SA_BOT_ROOTS__`, requires supported version, then creates one cooldown registry, effect hooks, Premium controller, command handler, and publisher. Use a single installation guard and an idempotent cleanup closure.

- [ ] **Step 5: Handle background-tab recovery**

On isolated `visibilitychange` to visible, send `refresh`. Stale canvas data stays hidden until a fresh snapshot arrives. Never stop/restart the BOT runtime for this recovery.

- [ ] **Step 6: Run focused tests**

Run: `node --test tests/content.test.js tests/ckda-main.test.js tests/runtime.test.js tests/controller.test.js`

Expected: all PASS.

- [ ] **Step 7: Commit orchestration**

```powershell
git add src/content.js tests/content.test.js src/ckda-main.js tests/ckda-main.test.js
git commit -m "feat: integrate C-KDA lifecycle"
```

### Task 9: Packaged GIF, Static Checks, and Documentation

**Files:**
- Create: `assets/c-kda.gif`
- Modify: `manifest.json`
- Modify: `scripts/check-extension.js`
- Modify: `README.md`
- Modify: `tests/manifest.test.js`

**Interfaces:**
- Supplied source URL: `https://i.postimg.cc/XYb12P2F/5d27099922e5fa89a861563885703ace.gif`.
- Runtime URL: `chrome.runtime.getURL("assets/c-kda.gif")`.

- [ ] **Step 1: Add failing asset/static tests**

Assert manifest declares `assets/c-kda.gif` under `web_accessible_resources`, every listed script exists, GIF begins with `GIF87a` or `GIF89a`, expected downloaded length is 220122 bytes, and maintained source contains none of the forbidden global hook assignments.

- [ ] **Step 2: Run static tests and verify missing-asset failure**

Run: `node --test tests/manifest.test.js`

Expected: FAIL because `assets/c-kda.gif` is absent.

- [ ] **Step 3: Acquire and validate the binary asset**

Create `assets/`, download the exact supplied HTTPS resource to `assets/c-kda.gif`, verify HTTP success, GIF signature, and 220122-byte length before keeping it. Do not add a remote runtime dependency.

- [ ] **Step 4: Wire local GIF into UI and manifest**

Set the C-KDA image source through `chrome.runtime.getURL("assets/c-kda.gif")`; include a non-disruptive textual fallback if image loading fails.

- [ ] **Step 5: Extend extension checker**

Check new script ordering, asset existence/signature/size, supported version marker, channel separation, and forbidden-global-hook absence.

- [ ] **Step 6: Update README**

Document installation/reload, three tabs, `N`, marker controls, cooldown semantics, Premium override restoration, NPC-only BOT invariant, masked-player server-data limitation, supported client `1.9.0.051`, and diagnostic steps for `Unsupported client`.

- [ ] **Step 7: Run focused static verification**

Run: `node --test tests/manifest.test.js && node scripts/check-extension.js`

Expected: tests PASS and checker prints its normal success summary with no missing files or forbidden hooks.

- [ ] **Step 8: Commit asset/docs/checker**

```powershell
git add assets/c-kda.gif manifest.json scripts/check-extension.js README.md tests/manifest.test.js
git commit -m "docs: package and document C-KDA"
```

### Task 10: Full Regression and Chrome Acceptance

**Files:**
- Review only: all changed files

**Interfaces:**
- Consumes the complete plan deliverable.
- Produces verification evidence; no new behavior.

- [ ] **Step 1: Run whitespace and forbidden-marker checks**

Run: `git diff --check` and `rg -n "JSON\.parse\s*=|Response\.prototype\.json\s*=|window\.Function\s*=" src tests manifest.json README.md`.

Expected: `git diff --check` silent; no placeholders or forbidden assignments.

- [ ] **Step 2: Run complete automated suite**

Run: `npm test`

Expected: all tests PASS, including original NPC BOT suite.

- [ ] **Step 3: Run maintained extension checker**

Run: `npm run check`

Expected: success exit code and all static checks PASS.

- [ ] **Step 4: Review final diff and Git scope**

Run: `git status --short --branch` and `git diff --stat origin/main...HEAD`.

Confirm only planned source, tests, docs, manifest, and GIF are present; no downloaded client source, credentials, diagnostics, or user data enter Git.

- [ ] **Step 5: Manual Chrome acceptance checklist**

Reload unpacked extension from `C:\Users\Alex\Desktop\SA BOT`; open `https://steam.space-aces.com/gameNew`; verify:

1. tabs read `BOT`, `C-KDA`, `Settings`;
2. `N` hides/shows KDA and does not interrupt form typing;
3. BOT starts, moves, fights NPCs, and never targets players;
4. C-KDA `All players` shows eligible players and no NPC/local marker;
5. `Masked only` hides unmasked players;
6. five shapes, colours, size, and opacity update and persist after reload;
7. marker layer never blocks game clicks;
8. EMP/ISH activations create one accurate countdown each and expire;
9. Premium ON reports active and client Premium presentation updates; OFF restores prior state;
10. reload/navigation restores Premium and clears markers/timers;
11. alt-tab and return refreshes C-KDA without restarting BOT;
12. supplied GIF renders locally with network disabled after initial game load.

- [ ] **Step 6: Record manual limitations honestly**

If a cloaked entity is absent from `MAP_SHIPS`, record it as server-withheld and do not add coordinate guessing. If an exact current EMP/ISH hook is unsupported, retain fail-closed status and diagnostic evidence rather than attaching a broad hook.
