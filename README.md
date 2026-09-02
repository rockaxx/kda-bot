# Space Aces NPC Bot

Chrome extension foundation for the authorized Space Aces NPC-only bot. The
current build is **Phase 2 / DRY RUN**: it recognizes client `1.9.0.049`, shows
an in-game panel, validates settings, reads normalized live map/player/NPC
snapshots, and logs controller decisions. It does not click, move, select NPCs,
or press ammunition keys.

## Current safety boundary

- Scope is only `https://steam.space-aces.com/gameNew*`.
- Chrome permissions: only `storage`; no cookie, request, tab, or broad host
  access.
- Unknown or structurally changed client builds remain unmodified and cannot
  start.
- Players, allies, pets, and drones are invalid targets in the planner and
  controller.
- Controller output is logged only as `would-*`; it is never sent to the game.
- Do not leave this DRY RUN build unattended. Active farming is not enabled.

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

The **Space Aces NPC Bot — DRY RUN** panel should appear in the top-right.
The adapter row should become `supported` for client `1.9.0.049`. Map, HP, and
NPC count should populate. **Start Dry Run** then becomes enabled and records
only `would-*` decisions without sending input to the game.

## Configure and export the checkpoint

1. Enter the map ID where the bot will eventually operate. You still travel to
   that map manually.
2. Set kite distance, all-NPC danger radius, flee/resume HP percentages, ammo
   key, intervals, and blacklist duration.
3. Click **Save settings**. Invalid values appear under the buttons.
4. If the client fingerprint is recognized, click **Export diagnostic** after
   the adapter row reports `supported`.
5. If live obfuscation changed, the button becomes **Export client source**.
   Click it and keep the downloaded file as `space-aces-client-current.js`.
6. Create `C:\Users\Alex\Desktop\SA BOT\local-diagnostics` and move the
   downloaded JSON or JS file there.
7. Send that local file for Phase 2 mapping. Do not commit or publicly share it;
   sanitized runtime structures may still contain account-specific IDs.

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

## Next phase

Live selection, movement, and ammo input will be added only behind version
lock, NPC-only validation, wrong-map wait, multi-NPC safety, HP recovery,
emergency stop, rate limits, and supervised test gates. Unattended operation
stays prohibited until those gates pass.
