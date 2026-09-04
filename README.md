# Space Aces NPC Bot

Chrome extension for the authorized Space Aces NPC-only bot. The current build
is **Phase 3 / ACTIVE**: it recognizes client `1.9.0.049`, detects the current
map automatically, selects verified NPCs, presses the configured ammo bind, and
kites through the game's normal movement path.

## Current safety boundary

- Scope is only `https://steam.space-aces.com/gameNew*`.
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
- The MAIN-world action adapter starts disarmed. STOP, faults, stale snapshots,
  and page unload disarm it and cancel current target/movement.
- First use must be supervised before any unattended session.

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

The **Space Aces NPC Bot — ACTIVE** panel should appear in the top-right.
The adapter row should become `supported` for client `1.9.0.049`. Map, HP, and
NPC count should populate. **START BOT** then becomes enabled.

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
**Space Aces NPC Bot**, then reload the game tab. No game files are modified on
disk. Saved extension settings can be removed with Chrome's extension data.

## Known live gate

Automated/static tests verify the action contract, NPC-only checks, controller,
STOP cleanup, and watchdog. Real browser/game behavior still requires the
supervised steps above after every client update. Do not assume a new client
version is compatible until its structural fingerprint is reviewed.
