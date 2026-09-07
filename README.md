# KDA

Chrome extension for the authorized Space Aces NPC-only bot. The current build
is **Phase 3 / ACTIVE**: it recognizes client `1.9.0.052`, detects the current
map automatically, selects verified NPCs, presses the configured ammo bind, and
kites through the game's normal movement path.

It also includes a separate C-KDA observation workspace for the same supported
client. C-KDA displays only sanitized player-marker observations; it never
feeds players into BOT targeting or actions.

## Current safety boundary

- Both content scripts run only on `https://steam.space-aces.com/gameNew*`.
  The bundled GIF uses Chrome's required origin-scoped web-resource match
  `https://steam.space-aces.com/*`.
- Chrome permissions: only `storage`; no cookie, request, tab, or broad host
  access.
- Unknown or structurally changed client builds remain unmodified and cannot
  start.
- Players, allies, pets, and drones are invalid targets in the planner and
  controller.
- Every target and ammo action re-checks the live entity and requires
  `isNpc === true`; players are rejected.
- Every movement route is checked against the client's live map barriers.
  Routes toward radiation are shortened to keep a 300-unit safety margin.
- Dense NPC surrounds trigger `ESCAPING_CLUSTER`: the bot repeatedly moves
  through the widest available gap instead of cancelling movement and standing.
- The MAIN-world action adapter starts disarmed. Background timer/snapshot
  delays temporarily suspend it; the next fresh snapshot automatically resumes
  the requested run. STOP, critical faults, and page unload end the run.
- First use must be supervised before any unattended session.

## C-KDA controls and limits

The panel has three tabs: **BOT**, **C-KDA**, and **Settings**. `N` hides or
shows the complete panel, except while focus is in a text, number, select, or
editable field.

The C-KDA tab controls marker visibility, masked-only/all-player display,
shape, ally/enemy colours, size, opacity, EMP/ISH labels and durations, and a
client-local Premium test override. `CLEAR MARKERS` discards the current local
observations. EMP/ISH labels are countdowns from the observed end time, rounded
up to whole seconds; they are not server actions or ability activation.

Player batches rotate within the 4096-byte message limit. The canvas merges
observations by player ID and removes each after 750 ms without an update.
World/map replacement, disconnect, unsupported data, and clear reset that
retained state. A reset uses an empty disconnected C-KDA snapshot before the
next connected batch, including when a new world retains the same map ID.
After 2000 ms without a valid snapshot, the UI clears its old player count and
shows `Waiting for game`; fresh data restores the normal status. Existing
source-unsupported and visible error states retain priority.

Observations, cooldowns, and stale timers share a monotonic epoch clock based
on `performance.timeOrigin + performance.now()`. System clock changes do not
change those countdowns. Premium support does not control player visibility.

Premium override is a reversible local presentation test only. On disable,
page hide, navigation, or extension cleanup, C-KDA restores the original
`isPremium` property descriptor/value and calls the original update path with
the prior boolean value when available. A failed enable also rolls back the
presentation update and restores the exact descriptor again after the callback.
Failed restoration remains `unsupported` and is retained for a later disable
or refresh retry. It does not change server entitlement.

The isolated extension context renews a MAIN-world lease every 15 seconds and
sends an explicit teardown during cleanup. MAIN checks the 120-second lease
every 5 seconds; expiration restores Premium, removes effect hooks and
listeners, stops timers, and releases the installation guard. Browser freezing
can delay execution of cleanup until the tab runs again. Reload the game tab
after extension reload/disable or lease expiry before starting another session.

BOT remains NPC-only: C-KDA player observations cannot become planner targets,
movement targets, or actions. In `Masked only` mode, markers depend on the
server/client data exposing a masked state. If that state is unavailable or the
client changes its structure, C-KDA hides those observations rather than
guessing.

## Verify locally

Open PowerShell in `C:\Users\Alex\Desktop\SA BOT` and run:

```powershell
npm test
npm run check
```

Expected: all tests pass and `extension check passed`.

## Install in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select `C:\Users\Alex\Desktop\SA BOT`.
5. If an older copy is already loaded, click its **Reload** button.
6. Open or fully reload
   `https://steam.space-aces.com/gameNew?factionId=1&lang=en`.

The **KDA** panel should appear in the top-right. Press `N` to hide or show it.
The adapter row should become `Ready` for client `1.9.0.052`. Map, HP, and
NPC count should populate. **START BOT** then becomes enabled.

If C-KDA shows **Unsupported client**, confirm the page is fully reloaded after
extension reload and that the live client is exactly `1.9.0.052`. Use **Export
data** to capture the sanitized diagnostic, then review the adapter fingerprint
before changing any support marker. Do not enable C-KDA/Premium workarounds for
another client version; BOT remains fail-closed on unknown builds.

## Configure and run

1. Travel to the wanted map manually. No map ID is configured; the bot uses
   the currently detected map.
2. Set kite distance, all-NPC danger radius, flee/resume HP percentages, ammo
   key, intervals, and blacklist duration.
3. Click **Save settings**. Invalid values appear under the buttons.
4. For the first supervised check, stand near one isolated NPC and click
   **START BOT**. Confirm target selection, ammo activation, and movement.
5. Click **STOP** during movement. Confirm target clears and the ship stops.
6. Only after this passes, test several NPCs and low-HP retreat/repair.

Emergency stop shortcut: **Shift+Escape**.

The export button remains available for client update diagnostics. If live
obfuscation changes, it exports `space-aces-client-current.js`. Do not commit or
publicly share exports; sanitized runtime structures may still contain
account-specific IDs.

The export contains only bounded, sanitized summaries of six client roots:
`input`, `ui`, `user`, `camera`, `world`, and `renderer`. Keys resembling auth,
tokens, cookies, sessions, chat, messages, payloads, sockets, email, passwords,
or credentials are removed.

The client-source fallback is used only after an obfuscation change prevents
those six roots from being identified. It captures the already decrypted
JavaScript Blob locally, keeps at most 5 MB in extension memory, and downloads
it only after the user clicks Export. It is never uploaded by the extension and
is ignored by Git.

## Rollback

For immediate rollback, open `chrome://extensions` and disable or remove
**KDA**, then reload the game tab. No game files are modified on
disk. Saved extension settings can be removed with Chrome's extension data.

## Known live gate

Automated/static tests verify the action contract, NPC-only checks, controller,
STOP cleanup, watchdog suspension, and automatic resume. Real browser/game behavior still requires the
supervised steps above after every client update. Do not assume a new client
version is compatible until its structural fingerprint is reviewed.
