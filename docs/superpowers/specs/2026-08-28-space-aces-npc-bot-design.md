# Space Aces NPC Farming Bot Design

Date: 2026-08-28

## Authorization and scope

Alex supplied written authorization from Space Aces CEO Michal Zborny, dated
2026-08-27, permitting development, testing, integration, and operation of a
bot within the agreed Space Aces account, server, API, and system scope.

This project is limited to autonomous NPC combat on the authorized account.
It must not attack players, interact with other accounts, access unrelated
infrastructure or data, extract credentials, bypass authentication, or craft
an independent server protocol client. The extension must not read or store
passwords, cookies, session tokens, chat content, or unrelated page data.

## Goal

Build a local Chrome Manifest V3 extension that injects an in-game overlay and
automates NPC-only combat on a user-selected map. The player manually travels
to that map. The bot waits while the current map differs from the configured
map, attacks safe edge NPCs, kites them at a configured distance, ignores loot,
retreats at a configured HP threshold, waits for passive repair, and resumes
only after the configured recovery threshold is reached.

## Non-goals

- Travelling through gates or changing maps.
- Attacking, targeting, following, or retaliating against players.
- Collecting loot or cargo boxes.
- Directly constructing or sending Space Aces protocol packets.
- Reading credentials or persisting authenticated browser state.
- Learning individual NPC ranges in the first version.
- Continuing through unknown entity types, stale state, disconnects, or an
  unsupported client version.

## Technical context

The inspected client is a browser application rendered with PIXI. The current
decrypted local reference is approximately 2.2 MB, reports client version
`1.9.0.045`, and is strongly obfuscated. The live game includes map, ship,
target, QuickFire, input, and entity systems inside a JavaScript module closure.
The loader fetches and decrypts the game bundle in the browser before importing
it from a Blob URL. A normal isolated content script therefore cannot rely on
direct access to module-local variables.

The extension will use an early MAIN-world adapter to observe only the minimum
client state needed for the bot. It will use ordinary client mouse and keyboard
input paths for actions. It will not replace the game transport or synthesize
server messages.

## Architecture

### Manifest and bootstrap

`manifest.json` grants access only to
`https://steam.space-aces.com/gameNew*`. The adapter loads at
`document_start` in the page's MAIN world so required client hooks exist before
the encrypted module initializes. The overlay/controller runs as an isolated
content script and communicates with the adapter through a narrow validated
message bridge.

### Page adapter

`src/page-adapter.js` owns client-specific integration. It emits immutable,
sanitized snapshots containing only:

```text
timestamp
clientVersion
connectionState
mapId
player: id, x, y, hpPercent, alive, moving, inCombat
target: id, type, alive
entities[]: id, type, x, y, hpPercent, alive
```

It also accepts a small action vocabulary:

```text
selectNpc(entityId)
moveTo(worldX, worldY)
pressAmmoKey(key)
cancelMovement()
clearTarget()
```

Every action validates current state immediately before using the game's normal
input path. `selectNpc` rejects anything not positively classified as an NPC.
No raw transport send function is exposed.

### Controller

`src/controller.js` owns the deterministic finite-state machine. It consumes
snapshots and emits high-level actions. It does not know obfuscated client
symbols or directly touch the page.

States:

```text
STOPPED
WAITING_FOR_MAP
SEARCHING
SELECTING_TARGET
ATTACKING
KITING
DISENGAGING
FLEEING
REPAIR_WAIT
FAULT
```

The default transition flow is:

```text
WAITING_FOR_MAP -> SEARCHING -> SELECTING_TARGET -> ATTACKING -> KITING
KITING -> SEARCHING when the target dies or disappears
any active state -> DISENGAGING when HP reaches the flee threshold
DISENGAGING -> FLEEING -> REPAIR_WAIT -> SEARCHING
```

Wrong map always transitions to `WAITING_FOR_MAP`. Death, disconnect, stale
snapshots, adapter failure, unsupported client version, or ambiguous entity
classification transitions to `FAULT` or `STOPPED` and produces no further
input.

### Safety planner

`src/planner.js` receives player position, NPC positions, map bounds when
available, and settings. It must account for every nearby NPC, not only the
selected target.

Target selection scores NPCs by:

- positive confirmation that the entity is an NPC;
- low local NPC density;
- proximity to the outside edge of a cluster;
- a safe route from the player;
- availability of at least one safe kite point;
- temporary penalties for recent target or movement failures.

This causes clusters to be dismantled from the outside inward. A target is
locked until death, invalidation, an unsafe state, or a recovery transition;
the controller must not continuously switch between valid targets.

For each planning tick, the planner samples candidate points around the target
at `kiteDistance`. Each candidate is rejected when its route or destination
intersects another NPC's configured danger radius, exits known map bounds, or
requires an unsafe direction change. Remaining candidates are scored by the
minimum distance to all non-target NPCs, path safety, direction continuity, and
distance from map boundaries. If no safe candidate exists, combat is aborted
and the bot disengages or temporarily skips that cluster.

Movement commands are rate-limited and sent only when the chosen point changes
materially. This avoids click spam and unstable oscillation.

### Combat and recovery

After selecting a positively identified NPC, the controller verifies the
target snapshot and presses the configured ammo key, initially `1`. It
continues movement planning while the client reports the target alive. If the
attack stops unexpectedly, the key may be retried only after a rate limit and
a fresh target/type check.

Loot is ignored. When the target dies or disappears, the bot clears combat
state and searches again.

When `hpPercent <= fleeHpPercent`, the controller immediately stops acquiring
targets and chooses a flee vector away from the nearby NPC distribution. The
game repairs HP passively outside combat. The bot waits without targeting or
attacking until `hpPercent >= resumeHpPercent`, then performs a new search. It
does not blindly return to the previous target.

Player attacks receive no special retaliation logic. The bot never attacks a
player; ordinary HP recovery logic still causes retreat when necessary.

### Overlay and settings

`src/overlay.js` inserts a docked in-game panel using a shadow root to isolate
styles. It shows:

- Start, Stop, and Dry Run controls;
- current FSM state and reason;
- current and required map;
- HP and recovery thresholds;
- current target and nearby NPC count;
- safe/unsafe planning status;
- a bounded recent-event log.

Settings persist in `chrome.storage.local`:

```text
requiredMap
kiteDistance
dangerRadius
fleeHpPercent
resumeHpPercent
ammoKey
planningIntervalMs
movementIntervalMs
targetBlacklistMs
```

Inputs have documented safe ranges and are validated both when saved and when
read. Invalid settings prevent Start. No sensitive authentication data is
stored.

### Logging and watchdog

`src/logger.js` stores only bounded operational events such as transitions,
target selection, planner rejection reasons, version mismatch, and adapter
faults. It must not log transport payloads, credentials, tokens, chat, or
personal data.

The watchdog checks snapshot age and scheduling delay. A stale snapshot,
disconnect, extension/adaptor exception, player death, or excessive background
tab throttling stops all automation. The Stop control and emergency keyboard
shortcut cancel timers, movement, target state, and attack retries immediately.

## Client update policy

The adapter identifies the expected Space Aces client version or a narrowly
defined structural fingerprint. An unknown version cannot start active mode.
It may run in Dry Run for inspection, but event emission remains disabled until
the adapter contract is reviewed and the fingerprint is updated.

Client-specific selectors, hooks, and symbol mappings stay isolated in the
adapter so planner, controller, settings, and tests remain independent of game
obfuscation changes.

## Testing strategy

Pure unit tests use synthetic snapshots and no live game connection. They cover:

- wrong-map waiting;
- strict NPC classification and player exclusion;
- isolated and edge-NPC selection;
- cluster-center rejection;
- safe kite candidate selection around multiple NPCs;
- no-safe-path disengagement;
- target locking and temporary blacklisting;
- low-HP retreat and full-repair resume;
- stale snapshot, disconnect, death, and unsupported-version stops;
- action rate limits and emergency stop cleanup.

Live validation proceeds in gates:

1. Load extension and verify overlay only.
2. Verify adapter snapshots in Dry Run with zero emitted inputs.
3. Verify required-map waiting.
4. Test one isolated NPC under direct supervision.
5. Test several NPCs and outside-in target selection.
6. Test low-HP disengagement and passive repair.
7. Test disconnect, stale state, hidden-tab throttling, and death stops.
8. Run a longer supervised session before any unattended overnight session.

Each gate must pass before the next. Live tests use the authorized account and
server scope only.

## Planned source layout

```text
manifest.json
src/page-adapter.js
src/bridge.js
src/controller.js
src/planner.js
src/settings.js
src/overlay.js
src/logger.js
src/content.js
tests/controller.test.js
tests/planner.test.js
tests/settings.test.js
docs/superpowers/specs/2026-08-28-space-aces-npc-bot-design.md
```

The locally supplied `game.js` remains ignored reference material and is never
packaged into or committed with the extension.
