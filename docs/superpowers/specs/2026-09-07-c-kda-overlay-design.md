# C-KDA Player Overlay and Premium Test Design

Date: 2026-09-07

Status: Approved by user on 2026-09-07

## Objective

Extend the existing KDA Chrome extension with a separate C-KDA player-observation workspace while preserving the existing NPC-only bot. The feature applies only to `https://steam.space-aces.com/*` and the currently supported Space Aces client fingerprint.

The result provides configurable player markers, cloaked-player filtering, EMP/ISH cooldown presentation, a locally bundled decorative GIF, and a reversible client-side Premium test override. It must not select, attack, move toward, or otherwise automate actions against players.

## Product layout

The current dashboard navigation becomes three tabs:

1. `BOT` — existing NPC automation controls and telemetry.
2. `C-KDA` — player marker, cooldown, visual, and Premium test controls.
3. `Settings` — existing bot settings.

The existing dark bloody-red theme remains. The supplied GIF is copied into the extension and displayed from a packaged asset so the UI does not depend on Postimg at runtime.

The `N` key continues to show or hide the complete KDA panel. Form controls must retain focus normally; pressing `N` while typing in an input, textarea, or editable element must not unexpectedly toggle the panel.

## C-KDA controls

The C-KDA tab contains:

- master marker overlay toggle;
- display mode: `Masked only` or `All players`;
- marker shape: circle, square, triangle, plus, or star;
- independent ally and enemy colours;
- marker size and opacity;
- EMP cooldown indicator toggle;
- ISH cooldown indicator toggle;
- Premium test override toggle;
- clear-marker action;
- compact status showing adapter support, tracked player count, and Premium override state.

Settings persist in extension-owned storage. Invalid persisted values are replaced by documented defaults. UI edits update local state without being overwritten by telemetry renders.

## Architecture

### Isolation from the NPC bot

C-KDA uses a separate message direction and schema from the bot snapshot/action protocol. Player observations never enter the NPC entity list used by the bot controller or planner.

The existing rule remains invariant:

```text
BOT target/action pipeline accepts NPCs only.
C-KDA player pipeline is observation/rendering only.
```

No C-KDA message exposes a player-targeting or player-action command.

### Page-world adapter

The MAIN-world adapter reads only the already exposed, version-validated live roots. It inspects the current `world.MAP_SHIPS` collection and excludes:

- the local hero ship;
- every entity explicitly marked as an NPC;
- malformed or stale entities;
- entities whose screen projection cannot be calculated safely.

For every accepted player, the adapter publishes a bounded projection record containing only data required for display:

- stable runtime identifier;
- finite screen X/Y coordinates;
- ally/enemy relation;
- cloaked state;
- optional EMP/ISH cooldown state;
- observation timestamp.

World coordinates, raw player objects, methods, account data, inventory, and network payloads are not passed into the isolated extension context.

Screen coordinates are obtained through the renderer wrapper's supported projection path, expected to be equivalent to `renderer.wrapper.toGlobal({x: 0, y: 0})`. A missing wrapper or non-finite result fails closed and hides that marker. This avoids the old version-fragile injection into an obfuscated `changePos` method.

### Marker renderer

The isolated overlay owns one `pointer-events: none` canvas positioned above the game canvas and below the KDA menu. It resizes using the current viewport and device-pixel ratio.

Each animation frame:

1. clear the marker canvas;
2. discard observations older than the stale timeout;
3. apply `Masked only` or `All players` filtering;
4. reject coordinates outside a small viewport margin;
5. draw the configured ally/enemy marker;
6. draw enabled cooldown labels only when their state is valid.

The renderer uses `requestAnimationFrame` only for drawing. Snapshot collection is rate-limited separately so it does not enumerate the game world at display refresh frequency.

### Cloaked-player limitation

The overlay can reveal a cloaked player only when the Space Aces client still contains that player's live entity and renderer position. If the server withholds the entity or position entirely, the extension cannot manufacture reliable location data and must not guess.

### EMP and ISH cooldown tracking

Cooldowns use semantic events or state changes from the current supported client, not obsolete method names copied from the old script. The implementation must first identify current EMP and ISH activation points in client version `1.9.0.051`.

Tracking rules:

- use a monotonic clock for countdown calculations;
- deduplicate repeated render/effect events for the same activation;
- associate the event only with a validated player identifier;
- remove timers on expiry, map replacement, disconnect, adapter reset, or manual clear;
- do not invent a cooldown when the current client exposes no trustworthy activation evidence;
- keep cooldown durations in validated C-KDA settings if they are not available from authoritative live state.

The obsolete `setEmpSprite` hook is not assumed to exist. If no stable current activation point can be proven, that individual indicator remains unsupported rather than patching an unrelated function.

### Premium test override

Premium testing is client-local and no API request is sent by the extension.

The override targets only the version-validated live user root. On enable it:

1. records the original own-property descriptor or original absence of the Premium property;
2. installs a configurable override that reports the Premium state as enabled;
3. optionally invokes or observes the current client `updatePremium` path only when its signature is positively identified;
4. updates C-KDA status with the effective result.

On disable, page hide, navigation, extension invalidation, or unload, it restores the exact original descriptor/value or removes the temporary property if it did not originally exist.

The implementation must not globally replace `JSON.parse`, `Response.prototype.json`, `Object.defineProperty`, `Reflect.defineProperty`, or unrelated prototypes. Those old-script hooks affect every subsystem and can corrupt game state. If the scoped user-root override is insufficient, the feature reports `unsupported` and captures diagnostics; broad interception is outside this implementation.

Premium override changes only client presentation/branching that trusts the local property. Server-authoritative entitlement remains unchanged.

## Version and security boundary

- Host boundary: `steam.space-aces.com` only.
- Supported client boundary: exact validated adapter markers for client `1.9.0.051`.
- Unknown or mismatched client: disable C-KDA data collection and Premium override, show `Unsupported client`, preserve BOT's existing fail-closed behavior.
- No network credential capture, request replay, server mutation, account modification, inventory modification, or player automation is introduced.

## Lifecycle and recovery

C-KDA clears all transient observations and cooldowns on:

- map/world root replacement;
- adapter disconnect or timeout;
- page navigation or unload;
- extension context invalidation;
- manual clear.

Tab background throttling may delay visual refresh, but returning to the tab requests a fresh snapshot and discards stale observations. It must not require stopping and restarting the NPC bot.

A C-KDA failure must not stop the NPC bot. A BOT failure must not leave Premium override restoration handlers unregistered.

## Error presentation

The UI uses short human-readable states instead of raw JSON:

- `Ready`
- `Waiting for game`
- `Unsupported client`
- `No player data`
- `Premium override active`
- `Premium override unsupported`

Detailed diagnostics remain available through the existing export mechanism and console-safe structured logs, but are not rendered as an unformatted JSON block.

## Persisted defaults

Suggested defaults:

```text
overlayEnabled: true
displayMode: masked-only
shape: circle
allyColor: #45d483
enemyColor: #ff394f
sizePx: 8
opacity: 0.90
showEmpCooldown: true
showIshCooldown: true
premiumOverride: false
```

Premium override defaults to off and must not silently enable itself after a fresh installation. If persistence is retained across reloads, restoration and reapplication must still be deterministic and visible in status.

## Test strategy

Implementation follows focused tests before production code.

Required automated coverage:

- C-KDA settings defaults, validation, persistence, and editable-field stability;
- message schema acceptance and rejection;
- self/NPC/player classification;
- player records never entering BOT snapshots or actions;
- cloaked-only and all-player filters;
- finite projection, viewport clipping, and stale-record removal;
- all five marker shape paths;
- ally/enemy styling, size, opacity, and high-DPI canvas sizing;
- EMP/ISH activation deduplication, countdown, expiry, and cleanup;
- Premium descriptor capture, effective override, exact restoration, originally-absent property, and failure rollback;
- no global JSON/Response/Object/Reflect monkeypatches;
- pagehide/navigation cleanup;
- `N` toggle behavior and editable-control exemption;
- unsupported-client fail-closed behavior;
- existing BOT/NPC/controller/planner regression suite;
- extension manifest/static validation.

## Acceptance criteria

The feature is accepted when:

1. `BOT`, `C-KDA`, and `Settings` tabs work without losing edited values.
2. C-KDA markers track eligible live players and never NPCs or the local ship.
3. `Masked only` and `All players` behave as labeled.
4. All configured marker visuals render without intercepting game input.
5. Supported EMP/ISH events show accurate, deduplicated countdowns and cleanly expire.
6. Premium override visibly enables the scoped client Premium state and restores the original state exactly when disabled or unloaded.
7. Unknown client versions fail closed.
8. C-KDA errors do not stop the NPC bot.
9. The supplied GIF loads from the packaged extension asset.
10. All automated tests and the extension checker pass, followed by manual validation in Chrome on Space Aces client `1.9.0.051`.

## Explicit non-goals

- attacking, selecting, following, or targeting players;
- server-side Premium assignment or entitlement mutation;
- movement speed modification or teleportation;
- inventory, skin, mask, or loadout mutation;
- global response/JSON interception;
- support for unvalidated client versions.
