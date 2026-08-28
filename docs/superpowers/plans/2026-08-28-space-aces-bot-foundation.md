# Space Aces Bot Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a loadable Chrome extension that provides the complete tested NPC planner, combat/recovery state machine, validated settings, in-game Dry Run overlay, and a sanitized diagnostic adapter for Space Aces client `1.9.0.045`.

**Architecture:** Vanilla JavaScript modules use a small universal wrapper so the same files run as ordered Chrome content scripts and as CommonJS modules under Node's built-in test runner. A MAIN-world script patches only the recognized decrypted client source to expose version-locked read-only root getters; an isolated-world controller receives sanitized snapshots through validated `window.postMessage` envelopes. Active game input remains disabled in this plan; the diagnostic artifact produced here is required to write the separate live-adapter plan without guessing obfuscated fields.

**Tech Stack:** Chrome Manifest V3 (Chrome 111+), vanilla JavaScript, Node.js 23.11.0, `node:test`, no runtime or npm dependencies.

**Spec:** `docs/superpowers/specs/2026-08-28-space-aces-npc-bot-design.md`

## Global Constraints

- Run only on `https://steam.space-aces.com/gameNew*`.
- Never read or store passwords, cookies, session tokens, chat, or unrelated page data.
- Never construct or send Space Aces protocol packets.
- Never emit movement, selection, or attack inputs in this foundation plan.
- Unknown client versions and failed fingerprints remain Dry Run and fail closed.
- Only positively classified NPCs may become targets; player, ally, pet, drone, object, and unknown types are excluded.
- Wrong map, death, disconnect, stale state, adapter error, or unsupported version stops active decisions.
- `game.js` remains ignored reference material and must not enter Git or the extension manifest.
- Use Node's built-in test runner; add no package dependencies.

---

## File Structure

```text
package.json                         Node scripts, no dependencies
manifest.json                        Narrow MV3 permissions and ordered scripts
README.md                            Local install and gated validation guide
scripts/check-extension.js           Manifest/file/permission/static safety checks
src/namespace.js                     Browser namespace initializer
src/schemas.js                       Snapshot and bridge-envelope validators
src/settings.js                      Defaults, ranges, normalization
src/geometry.js                      Pure vector and path geometry
src/planner.js                       Edge target selection and multi-NPC kite planner
src/controller.js                    Deterministic combat/recovery FSM
src/logger.js                        Bounded sanitized operational log
src/source-patch.js                  Exact-version decrypted-source patcher
src/page-adapter.js                  MAIN-world Blob hook and diagnostic snapshots
src/bridge.js                        Isolated-world message validation
src/overlay.js                       Shadow-DOM Dry Run panel
src/content.js                       Lifecycle and module composition
tests/manifest.test.js               Host/permission/packaging safety
tests/schemas.test.js                Snapshot and envelope validation
tests/settings.test.js               Range/default validation
tests/geometry.test.js               Geometry primitives
tests/planner.test.js                Edge targeting and safe kite behavior
tests/controller.test.js             FSM transitions and fail-closed behavior
tests/logger.test.js                 Sanitization and bounded storage
tests/source-patch.test.js           Version/fingerprint source patch safety
tests/bridge.test.js                 Message origin/channel/schema rejection
```

Each `src/*.js` file uses this wrapper pattern:

```js
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.SABot, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";
  return { exportedFunction };
});
```

`src/namespace.js` runs first in each Chrome world and creates `window.SABot`
with a non-enumerable, non-writable property. Node tests require focused modules
directly and do not load `namespace.js`.

---

### Task 1: Safe Extension Shell

**Files:**
- Create: `package.json`
- Create: `manifest.json`
- Create: `src/namespace.js`
- Create: `scripts/check-extension.js`
- Create: `tests/manifest.test.js`

**Interfaces:**
- Consumes: none.
- Produces: `npm test`, `npm run check`, and ordered MV3 script declarations used by all later tasks.

- [ ] **Step 1: Write the failing manifest safety test**

```js
// tests/manifest.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("manifest is scoped to the game and has no sensitive permissions", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions || [], []);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.content_scripts.every(entry =>
    JSON.stringify(entry.matches) === JSON.stringify(["https://steam.space-aces.com/gameNew*"])
  ), true);
  assert.equal(JSON.stringify(manifest).includes("game.js"), false);
  assert.equal(JSON.stringify(manifest).includes("cookies"), false);
  assert.equal(JSON.stringify(manifest).includes("webRequest"), false);
});

test("every declared script exists", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  for (const entry of manifest.content_scripts) {
    for (const script of entry.js) {
      assert.equal(fs.existsSync(path.join(root, script)), true, script);
    }
  }
});
```

- [ ] **Step 2: Run the test and verify the missing manifest failure**

Run: `node --test tests/manifest.test.js`

Expected: FAIL with `ENOENT` for `manifest.json`.

- [ ] **Step 3: Create the package and narrow manifest**

```json
// package.json
{
  "name": "space-aces-npc-bot",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "node --test tests/*.test.js",
    "check": "node scripts/check-extension.js"
  }
}
```

```json
// manifest.json
{
  "manifest_version": 3,
  "name": "Space Aces NPC Bot",
  "version": "0.1.0",
  "minimum_chrome_version": "111",
  "permissions": ["storage"],
  "content_scripts": [
    {
      "matches": ["https://steam.space-aces.com/gameNew*"],
      "js": ["src/namespace.js", "src/source-patch.js", "src/page-adapter.js"],
      "run_at": "document_start",
      "world": "MAIN"
    },
    {
      "matches": ["https://steam.space-aces.com/gameNew*"],
      "js": [
        "src/namespace.js",
        "src/schemas.js",
        "src/settings.js",
        "src/geometry.js",
        "src/planner.js",
        "src/controller.js",
        "src/logger.js",
        "src/bridge.js",
        "src/overlay.js",
        "src/content.js"
      ],
      "run_at": "document_idle",
      "world": "ISOLATED"
    }
  ]
}
```

```js
// src/namespace.js
"use strict";
if (!Object.prototype.hasOwnProperty.call(window, "SABot")) {
  Object.defineProperty(window, "SABot", {
    value: Object.create(null),
    configurable: false,
    enumerable: false,
    writable: false
  });
}
```

- [ ] **Step 4: Add the static extension checker**

`scripts/check-extension.js` must parse `manifest.json`, verify every declared
script exists, reject permissions other than `storage`, reject host patterns
other than the exact game URL, and reject declared paths containing `game.js`,
`game-dist`, `.env`, `logs`, or `node_modules`. It exits nonzero with one line
per violation and prints `extension check passed` on success.

```js
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const errors = [];
const allowedPermissions = new Set(["storage"]);
for (const permission of manifest.permissions || []) {
  if (!allowedPermissions.has(permission)) errors.push(`forbidden permission: ${permission}`);
}
if ((manifest.host_permissions || []).length !== 0) {
  errors.push("host_permissions must be empty");
}
for (const entry of manifest.content_scripts || []) {
  if (JSON.stringify(entry.matches) !== JSON.stringify(["https://steam.space-aces.com/gameNew*"])) {
    errors.push("unexpected content script match");
  }
  for (const file of entry.js || []) {
    if (/game(?:-dist)?\.js|\.env|logs|node_modules/i.test(file)) errors.push(`forbidden path: ${file}`);
    if (!fs.existsSync(path.join(root, file))) errors.push(`missing script: ${file}`);
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("extension check passed");
```

- [ ] **Step 5: Create empty declared module shells and run checks**

Create each declared-but-not-yet-implemented `src/*.js` as a strict-mode file
containing only its universal wrapper and `return {};`. These shells are
replaced task-by-task.

Run: `node --test tests/manifest.test.js && npm run check`

Expected: 2 tests PASS and `extension check passed`.

- [ ] **Step 6: Commit**

```powershell
git add package.json manifest.json scripts/check-extension.js src tests/manifest.test.js
git commit -m "chore: add safe extension shell"
```

---

### Task 2: Snapshot Schemas and Validated Settings

**Files:**
- Modify: `src/schemas.js`
- Modify: `src/settings.js`
- Create: `tests/schemas.test.js`
- Create: `tests/settings.test.js`

**Interfaces:**
- Consumes: `window.SABot` namespace from Task 1.
- Produces: `validateSnapshot(value) -> { ok, value?, errors }`, `validateEnvelope(value, expectedDirection) -> { ok, value?, errors }`, `normalizeSettings(value) -> { ok, value, errors }`, and `DEFAULT_SETTINGS`.

- [ ] **Step 1: Write failing schema tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSnapshot, validateEnvelope } = require("../src/schemas.js");

const validSnapshot = {
  timestamp: 1000,
  clientVersion: "1.9.0.045",
  connectionState: "connected",
  mapId: 7,
  player: { id: "hero", x: 10, y: 20, hpPercent: 88, alive: true, moving: false, inCombat: false },
  target: null,
  entities: []
};

test("accepts the minimal normalized snapshot", () => {
  assert.equal(validateSnapshot(validSnapshot).ok, true);
});

test("rejects unknown entity types", () => {
  const snapshot = { ...validSnapshot, entities: [{ id: "x", type: "mystery", x: 1, y: 2, hpPercent: 100, alive: true }] };
  assert.equal(validateSnapshot(snapshot).ok, false);
});

test("rejects envelopes with the wrong channel or direction", () => {
  assert.equal(validateEnvelope({ channel: "other", direction: "snapshot", payload: validSnapshot }, "snapshot").ok, false);
});
```

- [ ] **Step 2: Write failing settings tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_SETTINGS, normalizeSettings } = require("../src/settings.js");

test("provides conservative defaults", () => {
  assert.deepEqual(DEFAULT_SETTINGS, {
    requiredMap: null,
    kiteDistance: 700,
    dangerRadius: 550,
    fleeHpPercent: 35,
    resumeHpPercent: 100,
    ammoKey: "1",
    planningIntervalMs: 100,
    movementIntervalMs: 250,
    targetBlacklistMs: 5000
  });
});

test("rejects resume threshold below flee threshold", () => {
  const result = normalizeSettings({ fleeHpPercent: 60, resumeHpPercent: 50 });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /resumeHpPercent/);
});

test("rejects non-numeric map and unsupported ammo bind", () => {
  const result = normalizeSettings({ requiredMap: "sector", ammoKey: "F12" });
  assert.equal(result.ok, false);
});
```

- [ ] **Step 3: Run both test files and verify missing exports**

Run: `node --test tests/schemas.test.js tests/settings.test.js`

Expected: FAIL because the shell modules do not export the required functions.

- [ ] **Step 4: Implement exact schema validation**

Allow entity types only from:

```js
const ENTITY_TYPES = Object.freeze(["npc", "player", "ally", "pet", "drone", "object"]);
```

Require all coordinates and percentages to be finite numbers; percentages must
be `0..100`; IDs must be non-empty strings or finite integers. Target may be
`null` or `{ id, type, alive }`. The bridge envelope is exactly:

```js
{
  channel: "sa-bot-v1",
  direction: "snapshot" | "diagnostic" | "action",
  payload: object
}
```

Reject inherited properties by copying accepted fields into a new plain object.

- [ ] **Step 5: Implement settings normalization**

Use these inclusive ranges:

```text
requiredMap: null or integer 1..10000
kiteDistance: 100..5000
dangerRadius: 100..5000
fleeHpPercent: 1..99
resumeHpPercent: fleeHpPercent..100
ammoKey: one character in 0..9
planningIntervalMs: 50..1000
movementIntervalMs: 100..2000
targetBlacklistMs: 1000..60000
```

Merge only known own properties over `DEFAULT_SETTINGS`. Return a frozen value
when valid and retain defaults for missing fields.

- [ ] **Step 6: Run focused and full tests**

Run: `node --test tests/schemas.test.js tests/settings.test.js && npm test`

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/schemas.js src/settings.js tests/schemas.test.js tests/settings.test.js
git commit -m "feat: validate bot state and settings"
```

---

### Task 3: Geometry and Edge-NPC Target Selection

**Files:**
- Modify: `src/geometry.js`
- Modify: `src/planner.js`
- Create: `tests/geometry.test.js`
- Create: `tests/planner.test.js`

**Interfaces:**
- Consumes: normalized entity objects and settings from Task 2.
- Produces: `distance(a, b)`, `pointOnCircle(center, radius, angle)`, `segmentDistance(point, start, end)`, `isPathClear(start, end, hazards, radius)`, and `selectEdgeNpc(player, entities, settings, blacklist, now)`.

- [ ] **Step 1: Write failing geometry tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { distance, segmentDistance, isPathClear } = require("../src/geometry.js");

test("calculates Euclidean distance", () => {
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test("detects a hazard intersecting a route", () => {
  const hazards = [{ id: "n2", x: 5, y: 1 }];
  assert.equal(isPathClear({ x: 0, y: 0 }, { x: 10, y: 0 }, hazards, 2), false);
  assert.equal(segmentDistance(hazards[0], { x: 0, y: 0 }, { x: 10, y: 0 }), 1);
});
```

- [ ] **Step 2: Write failing edge-selection tests**

```js
const { selectEdgeNpc } = require("../src/planner.js");
const settings = { kiteDistance: 700, dangerRadius: 550 };
const player = { x: 0, y: 0 };

test("excludes players and unknown combat objects", () => {
  const entities = [
    { id: "p", type: "player", x: 100, y: 0, alive: true, hpPercent: 100 },
    { id: "n", type: "npc", x: 900, y: 0, alive: true, hpPercent: 100 }
  ];
  assert.equal(selectEdgeNpc(player, entities, settings, new Map(), 1000).id, "n");
});

test("selects the outside NPC instead of the cluster center", () => {
  const entities = [
    { id: "left", type: "npc", x: 1000, y: 0, alive: true, hpPercent: 100 },
    { id: "center", type: "npc", x: 1500, y: 0, alive: true, hpPercent: 100 },
    { id: "right", type: "npc", x: 2000, y: 0, alive: true, hpPercent: 100 },
    { id: "upper", type: "npc", x: 1500, y: 300, alive: true, hpPercent: 100 }
  ];
  assert.equal(selectEdgeNpc(player, entities, settings, new Map(), 1000).id, "left");
});

test("ignores temporarily blacklisted NPCs", () => {
  const entities = [
    { id: "a", type: "npc", x: 500, y: 0, alive: true, hpPercent: 100 },
    { id: "b", type: "npc", x: 800, y: 0, alive: true, hpPercent: 100 }
  ];
  assert.equal(selectEdgeNpc(player, entities, settings, new Map([["a", 2000]]), 1000).id, "b");
});
```

- [ ] **Step 3: Run tests and verify missing behavior**

Run: `node --test tests/geometry.test.js tests/planner.test.js`

Expected: FAIL because geometry and planner functions are absent.

- [ ] **Step 4: Implement geometry and deterministic scoring**

`selectEdgeNpc` filters to alive `type === "npc"`, removes active blacklist
entries, and calculates for each candidate:

```text
localDensity = count(other NPC distance <= 2 * dangerRadius)
nearestNeighbor = minimum distance to another NPC, or Infinity
travelDistance = distance(player, candidate)
score = localDensity * 1_000_000 + travelDistance - min(nearestNeighbor, 100000)
```

Lowest score wins; ties use lexicographic `String(id)` ordering. Before scoring,
reject candidates whose direct player-to-target route crosses another NPC's
danger radius.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test tests/geometry.test.js tests/planner.test.js && npm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/geometry.js src/planner.js tests/geometry.test.js tests/planner.test.js
git commit -m "feat: select safe edge NPC targets"
```

---

### Task 4: Multi-NPC Kite and Flee Planning

**Files:**
- Modify: `src/planner.js`
- Modify: `tests/planner.test.js`

**Interfaces:**
- Consumes: geometry functions and `selectEdgeNpc` from Task 3.
- Produces: `planKitePoint(player, target, entities, settings, previousPoint, bounds) -> { status, point?, reason, score? }` and `planFleePoint(player, entities, settings, bounds) -> { status, point?, reason }`.

- [ ] **Step 1: Add failing kite tests**

```js
const { planKitePoint, planFleePoint } = require("../src/planner.js");

test("rejects a kite point endangered by a second NPC", () => {
  const target = { id: "target", type: "npc", x: 1000, y: 0, alive: true, hpPercent: 100 };
  const blocker = { id: "blocker", type: "npc", x: 1000, y: 700, alive: true, hpPercent: 100 };
  const result = planKitePoint(
    { x: 0, y: 0 }, target, [target, blocker],
    { kiteDistance: 700, dangerRadius: 550 }, null,
    { minX: -5000, maxX: 5000, minY: -5000, maxY: 5000 }
  );
  assert.equal(result.status, "safe");
  assert.ok(Math.hypot(result.point.x - blocker.x, result.point.y - blocker.y) > 550);
});

test("returns unsafe when every sampled point is blocked", () => {
  const target = { id: "t", type: "npc", x: 0, y: 0, alive: true, hpPercent: 100 };
  const blockers = Array.from({ length: 16 }, (_, index) => ({
    id: `b${index}`, type: "npc",
    x: 700 * Math.cos(index * Math.PI / 8),
    y: 700 * Math.sin(index * Math.PI / 8),
    alive: true, hpPercent: 100
  }));
  assert.equal(planKitePoint({ x: -1400, y: 0 }, target, [target, ...blockers], { kiteDistance: 700, dangerRadius: 550 }, null, null).status, "unsafe");
});

test("flee point moves away from NPC centroid", () => {
  const result = planFleePoint({ x: 0, y: 0 }, [
    { id: "a", type: "npc", x: 100, y: 0, alive: true, hpPercent: 100 },
    { id: "b", type: "npc", x: 200, y: 0, alive: true, hpPercent: 100 }
  ], { kiteDistance: 700, dangerRadius: 550 }, null);
  assert.equal(result.status, "safe");
  assert.ok(result.point.x < 0);
});
```

- [ ] **Step 2: Run tests and verify new exports fail**

Run: `node --test tests/planner.test.js`

Expected: FAIL because `planKitePoint` and `planFleePoint` are absent.

- [ ] **Step 3: Implement 32-angle candidate sampling**

Sample 32 equally spaced points around the target at `kiteDistance`. Reject a
candidate when it is outside supplied bounds, its player-to-candidate segment
crosses any non-target NPC's danger circle, or its endpoint lies within
`dangerRadius` of any non-target NPC. Score survivors as:

```text
score = minimumDistanceToNonTargetNpc
      - 0.25 * distance(player, candidate)
      - 0.10 * distance(previousPoint, candidate) when previousPoint exists
```

Highest score wins; ties use the lower angle index. `planFleePoint` calculates
the centroid of alive NPCs within `3 * dangerRadius`, moves `2 * kiteDistance`
in the normalized opposite direction, clamps to bounds, and returns `unsafe`
when the resulting point remains inside any danger circle.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/planner.test.js && npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/planner.js tests/planner.test.js
git commit -m "feat: plan multi-NPC kite movement"
```

---

### Task 5: Combat and Recovery State Machine

**Files:**
- Modify: `src/controller.js`
- Create: `tests/controller.test.js`

**Interfaces:**
- Consumes: `selectEdgeNpc`, `planKitePoint`, `planFleePoint`, normalized settings, and validated snapshots.
- Produces: `createController({ settings, now })` with methods `start()`, `stop(reason)`, `update(snapshot)`, `getState()`, and `drainActions()`.

- [ ] **Step 1: Write failing FSM tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { createController } = require("../src/controller.js");

function snapshot(overrides = {}) {
  return {
    timestamp: 1000,
    clientVersion: "1.9.0.045",
    connectionState: "connected",
    mapId: 7,
    player: { id: "hero", x: 0, y: 0, hpPercent: 100, alive: true, moving: false, inCombat: false },
    target: null,
    entities: [],
    ...overrides
  };
}

const settings = {
  requiredMap: 7, kiteDistance: 700, dangerRadius: 550,
  fleeHpPercent: 35, resumeHpPercent: 100, ammoKey: "1",
  planningIntervalMs: 100, movementIntervalMs: 250, targetBlacklistMs: 5000
};

test("waits without actions on the wrong map", () => {
  const controller = createController({ settings, now: () => 1000 });
  controller.start();
  controller.update(snapshot({ mapId: 8 }));
  assert.equal(controller.getState().name, "WAITING_FOR_MAP");
  assert.deepEqual(controller.drainActions(), []);
});

test("selects only an NPC and requests ammo after target confirmation", () => {
  const controller = createController({ settings, now: () => 1000 });
  controller.start();
  controller.update(snapshot({ entities: [{ id: "n1", type: "npc", x: 900, y: 0, hpPercent: 100, alive: true }] }));
  assert.deepEqual(controller.drainActions(), [{ type: "selectNpc", entityId: "n1" }]);
  controller.update(snapshot({ target: { id: "n1", type: "npc", alive: true }, entities: [{ id: "n1", type: "npc", x: 900, y: 0, hpPercent: 100, alive: true }] }));
  assert.deepEqual(controller.drainActions()[0], { type: "pressAmmoKey", key: "1" });
});

test("low HP disengages and waits for full repair", () => {
  const controller = createController({ settings, now: () => 1000 });
  controller.start();
  controller.update(snapshot({
    player: { id: "hero", x: 0, y: 0, hpPercent: 35, alive: true, moving: false, inCombat: true },
    target: { id: "n1", type: "npc", alive: true },
    entities: [{ id: "n1", type: "npc", x: 500, y: 0, hpPercent: 100, alive: true }]
  }));
  assert.equal(controller.getState().name, "FLEEING");
  assert.equal(controller.drainActions().some(action => action.type === "clearTarget"), true);
  controller.update(snapshot({ player: { id: "hero", x: -1000, y: 0, hpPercent: 99, alive: true, moving: false, inCombat: false } }));
  assert.equal(controller.getState().name, "REPAIR_WAIT");
  controller.update(snapshot());
  assert.equal(controller.getState().name, "SEARCHING");
});

test("disconnect, stale snapshot, death, and unknown version fail closed", () => {
  for (const bad of [
    snapshot({ connectionState: "disconnected" }),
    snapshot({ timestamp: 1 }),
    snapshot({ player: { id: "hero", x: 0, y: 0, hpPercent: 0, alive: false, moving: false, inCombat: false } }),
    snapshot({ clientVersion: "other" })
  ]) {
    const controller = createController({ settings, now: () => 10000 });
    controller.start();
    controller.update(bad);
    assert.equal(controller.getState().name, "FAULT");
    assert.deepEqual(controller.drainActions(), []);
  }
});
```

- [ ] **Step 2: Run tests and verify the missing controller failure**

Run: `node --test tests/controller.test.js`

Expected: FAIL because `createController` is absent.

- [ ] **Step 3: Implement deterministic transitions and action queue**

Use exact action objects:

```text
{ type: "selectNpc", entityId }
{ type: "pressAmmoKey", key }
{ type: "moveTo", x, y }
{ type: "cancelMovement" }
{ type: "clearTarget" }
```

`stop()` clears timers, locked target, previous kite point, blacklist, and the
action queue. `update()` first performs fail-closed checks, then wrong-map and
HP checks, then state-specific logic. A snapshot is stale when
`now() - snapshot.timestamp > max(2000, 5 * planningIntervalMs)`. This plan's
content lifecycle never sends drained actions to the page; it displays them as
Dry Run decisions only.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/controller.test.js && npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/controller.js tests/controller.test.js
git commit -m "feat: add fail-closed combat FSM"
```

---

### Task 6: Version-Locked Source Patch and Sanitized Diagnostics

**Files:**
- Modify: `src/source-patch.js`
- Modify: `src/page-adapter.js`
- Create: `tests/source-patch.test.js`

**Interfaces:**
- Consumes: decrypted JavaScript Blob created by the Space Aces preloader.
- Produces: `patchGameSource(source) -> { status, source, version, reason }`, `summarizeRoot(value, options) -> plain JSON`, and MAIN-world `sa-bot-v1` diagnostic messages. It emits no action listener in this plan.

- [ ] **Step 1: Write failing exact-version patch tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { patchGameSource, summarizeRoot } = require("../src/source-patch.js");

const marker = "const _0x416562='1.9.0.045';";
const roots = "let _0x229c50,_0x594165,_0x22a0bf,_0x1ceb4c,_0x429744,_0x607b9;" +
  "_0x429744['mapId'];_0x22a0bf['ship'];" +
  "_0x607b9['gamepadTargeter'];_0x229c50['initListeners'];";

test("patches only the recognized client fingerprint", () => {
  const result = patchGameSource(`${marker}${roots}`);
  assert.equal(result.status, "patched");
  assert.match(result.source, /__SA_BOT_ROOTS__/);
  assert.match(result.source, /get world\(\).*_0x429744/s);
});

test("leaves unknown versions byte-identical", () => {
  const source = "const version='2.0.0';";
  const result = patchGameSource(source);
  assert.equal(result.status, "unsupported");
  assert.equal(result.source, source);
});

test("sanitizes sensitive keys and limits depth", () => {
  const summary = summarizeRoot({ mapId: 7, token: "secret", child: { hp: 50, deep: { x: 1 } } }, { maxDepth: 1, maxKeys: 20 });
  assert.equal(summary.mapId, 7);
  assert.equal(Object.hasOwn(summary, "token"), false);
  assert.deepEqual(summary.child, { hp: 50, deep: "[depth-limit]" });
});
```

- [ ] **Step 2: Run tests and verify missing behavior**

Run: `node --test tests/source-patch.test.js`

Expected: FAIL because the shell exports no patcher.

- [ ] **Step 3: Implement exact source fingerprint and injected getters**

Require all of these literals before patching:

```js
const CLIENT_VERSION_MARKER = "const _0x416562='1.9.0.045';";
const REQUIRED_ROOT_MARKERS = [
  "_0x429744['mapId']",
  "_0x22a0bf['ship']",
  "_0x607b9['gamepadTargeter']",
  "_0x229c50['initListeners']"
];
```

Insert exactly once after `CLIENT_VERSION_MARKER`:

```js
Object.defineProperty(window,"__SA_BOT_ROOTS__",{configurable:true,value:Object.freeze({
  version:"1.9.0.045",
  get input(){return _0x229c50;},
  get ui(){return _0x594165;},
  get user(){return _0x22a0bf;},
  get camera(){return _0x1ceb4c;},
  get world(){return _0x429744;},
  get renderer(){return _0x607b9;}
})});
```

If the property already exists, the injected expression must not overwrite it.
Reject multiple version-marker occurrences.

`summarizeRoot` includes primitives, own enumerable key names, array lengths,
constructor names, and bounded nested summaries. It excludes keys matching:

```text
token|cookie|session|auth|password|email|chat|message|payload|socket|credential
```

It catches getters that throw and records `[unavailable]`; it never calls
functions.

- [ ] **Step 4: Implement the MAIN-world Blob observer**

`src/page-adapter.js` stores the native `Blob`, installs a constructor proxy at
`document_start`, and only examines Blob parts when `options.type` equals
`application/javascript` and the single part is a string. It calls
`patchGameSource`, forwards unchanged source on unsupported/error, and restores
normal Blob construction semantics with `Reflect.construct`.

After `DOMContentLoaded`, poll for `window.__SA_BOT_ROOTS__` for at most 30
seconds. When available, post one diagnostic envelope containing client
version, patch status, current URL pathname, and sanitized summaries of the six
roots. When unavailable or unsupported, post a diagnostic envelope with the
reason. Never include raw source or transport data.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test tests/source-patch.test.js && npm test && npm run check`

Expected: all tests PASS and `extension check passed`.

- [ ] **Step 6: Commit**

```powershell
git add src/source-patch.js src/page-adapter.js tests/source-patch.test.js
git commit -m "feat: add version-locked diagnostics"
```

---

### Task 7: Validated Bridge, Bounded Logger, and Dry Run Overlay

**Files:**
- Modify: `src/bridge.js`
- Modify: `src/logger.js`
- Modify: `src/overlay.js`
- Modify: `src/content.js`
- Create: `tests/bridge.test.js`
- Create: `tests/logger.test.js`

**Interfaces:**
- Consumes: diagnostic/snapshot envelopes, settings, and controller from prior tasks.
- Produces: `createBridge({ windowRef, onSnapshot, onDiagnostic })`, `createLogger(limit)`, `createOverlay({ documentRef, onStart, onStop, onSave })`, and the composed content lifecycle. No action envelope is posted in this plan.

- [ ] **Step 1: Write failing bridge and logger tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { createBridge } = require("../src/bridge.js");
const { createLogger } = require("../src/logger.js");

test("bridge rejects foreign source and invalid channel", () => {
  const listeners = {};
  const windowRef = { addEventListener: (name, fn) => { listeners[name] = fn; } };
  let received = 0;
  const bridge = createBridge({ windowRef, onSnapshot: () => { received += 1; }, onDiagnostic: () => {} });
  bridge.start();
  listeners.message({ source: {}, data: { channel: "sa-bot-v1", direction: "snapshot", payload: {} } });
  listeners.message({ source: windowRef, data: { channel: "wrong", direction: "snapshot", payload: {} } });
  assert.equal(received, 0);
});

test("logger bounds entries and removes sensitive fields", () => {
  const logger = createLogger(2);
  logger.add("state", { token: "secret", state: "SEARCHING" });
  logger.add("state", { state: "KITING" });
  logger.add("state", { state: "REPAIR_WAIT" });
  const entries = logger.list();
  assert.equal(entries.length, 2);
  assert.equal(JSON.stringify(entries).includes("secret"), false);
});
```

- [ ] **Step 2: Run tests and verify missing exports**

Run: `node --test tests/bridge.test.js tests/logger.test.js`

Expected: FAIL because the shell modules export no factories.

- [ ] **Step 3: Implement bridge and logger**

The bridge accepts only `event.source === windowRef`, channel `sa-bot-v1`, and
directions `snapshot` or `diagnostic`. Snapshot payloads pass
`validateSnapshot`; diagnostics must be plain JSON with serialized size at most
200 KB. `stop()` removes the listener.

The logger deep-copies data, removes the same sensitive key patterns as Task 6,
adds an ISO timestamp, and stores only the newest `limit` entries.

- [ ] **Step 4: Implement the shadow-root overlay**

Create fixed host `#sa-bot-root` in the top-right corner with a closed shadow
root. Include Start, Stop, Save, and Export Diagnostic buttons; fields for every
setting; status rows for FSM, adapter, current/required map, HP, target, nearby
NPC count, and safety; plus a bounded log view.

Start remains disabled until settings validate, a supported diagnostic exists,
and a normalized snapshot exists. In this plan, Start sets UI mode to
`DRY_RUN` and calls `controller.start()`. Controller actions are logged as
`would-select`, `would-move`, `would-press-key`, or `would-clear-target`; they
are never posted to MAIN world.

Export Diagnostic creates a local JSON Blob containing only the already
sanitized diagnostic and triggers download as
`sa-bot-diagnostic-1.9.0.045.json` from an explicit user click.

- [ ] **Step 5: Compose content lifecycle**

`src/content.js` loads settings from `chrome.storage.local`, normalizes them,
constructs logger/controller/bridge/overlay, and updates the overlay on each
snapshot. Stop calls controller stop, bridge stop only on unload, and clears
pending render timers. `beforeunload` always performs cleanup. No interval runs
faster than `planningIntervalMs`.

- [ ] **Step 6: Run focused and full tests**

Run: `node --test tests/bridge.test.js tests/logger.test.js && npm test && npm run check`

Expected: all tests PASS and `extension check passed`.

- [ ] **Step 7: Commit**

```powershell
git add src/bridge.js src/logger.js src/overlay.js src/content.js tests/bridge.test.js tests/logger.test.js
git commit -m "feat: add in-game dry run overlay"
```

---

### Task 8: Installation Guide and Diagnostic Checkpoint

**Files:**
- Create: `README.md`
- Modify: `docs/superpowers/specs/2026-08-28-space-aces-npc-bot-design.md`

**Interfaces:**
- Consumes: loadable extension and passing checks from Tasks 1-7.
- Produces: exact local install, Dry Run, diagnostic export, and rollback instructions plus the evidence needed for the separate live-adapter plan.

- [ ] **Step 1: Write the README with exact Chrome steps**

Document:

1. Run `npm test` and `npm run check` from `C:\Users\Alex\Desktop\SA BOT`.
2. Open `chrome://extensions`, enable Developer mode, choose Load unpacked, and
   select `C:\Users\Alex\Desktop\SA BOT`.
3. Open Space Aces, travel manually to the configured map, and confirm overlay
   status `SUPPORTED / DRY_RUN`.
4. Save settings and inspect `would-*` events without real inputs.
5. Click Export Diagnostic and save the JSON in the project directory as
   `local-diagnostics/sa-bot-diagnostic-1.9.0.045.json`.
6. Keep `local-diagnostics/` ignored because runtime structures may contain
   account-specific identifiers even after sanitization.
7. Disable or remove the unpacked extension for immediate rollback.

State clearly that active NPC selection, movement, and ammo input are not yet
enabled and that unattended operation is prohibited until the live-adapter plan
is implemented and supervised gates pass.

- [ ] **Step 2: Ignore local diagnostic exports**

Add to `.gitignore`:

```text
local-diagnostics/
sa-bot-diagnostic-*.json
```

- [ ] **Step 3: Update the design document with the implementation checkpoint**

Append a section named `Implementation checkpoints` stating that Phase 1 ends
with a Dry Run diagnostic extension and Phase 2 maps the six exposed roots to
the normalized snapshot/action adapter using the exported diagnostic. Preserve
all original full-system requirements.

- [ ] **Step 4: Run final non-live verification**

Run: `npm test`

Expected: all tests PASS.

Run: `npm run check`

Expected: `extension check passed`.

Run: `git diff --check`

Expected: no output.

Run: `git status --short`

Expected: only intended README, `.gitignore`, source, test, manifest, package,
script, spec, and plan changes before commit; `game.js` and local diagnostics
must not appear.

- [ ] **Step 5: Commit**

```powershell
git add .gitignore README.md docs package.json manifest.json scripts src tests
git commit -m "docs: add dry run validation guide"
```

---

## Phase 1 Completion Gate

Phase 1 is complete only when automated tests and extension checks pass, the
unpacked extension loads without manifest errors, the overlay reports
`SUPPORTED / DRY_RUN`, no mouse or keyboard event is emitted, and the user
exports a sanitized diagnostic file for client `1.9.0.045`.

That diagnostic is then inspected locally and used to write a second plan with
exact client field mappings and supervised live-action gates. Phase 2 must keep
the same strict NPC classification, wrong-map wait, multi-NPC safety planner,
HP recovery, version lock, and fail-closed rules.
