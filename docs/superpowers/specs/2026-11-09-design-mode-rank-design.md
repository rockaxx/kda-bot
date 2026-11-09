# Design Mode Rank Override

## Intent

Keep existing BOT implementation in source but remove/disable its UI entry. The visible KDA panel becomes a visual-tool console containing C-KDA and Design Mode. Design Mode initially changes only the local player's displayed rank icon.

## Scope

- BOT tab, combat settings tab, start/stop controls, and NPC telemetry are not rendered or reachable.
- Existing BOT modules remain packaged and unchanged unless required to keep startup safe.
- C-KDA behavior remains available.
- Design Mode provides `Default` plus rank IDs `1..20`.
- A selected rank uses `https://unsmod.eu/spacemap/ui/rank/<id>/0.png`.
- The override follows the local player's existing rank-logo display object, hides the original icon while active, and restores it on Default, teardown, page unload, root replacement, or unsupported state.
- Rank selection persists in `chrome.storage.local` and is reapplied after reload.
- Ship/model replacement is explicitly deferred to a later phase.

## Approach

Chosen: a narrow MAIN-world rank overlay controlled through the existing validated C-KDA command bridge. This avoids rewriting `Models.steam.json`, broad `fetch`/`JSON.parse` hooks, and server-visible state. Alternatives rejected for phase 1: replacing all rank entries in the remote model JSON (global and reload-sensitive), or modifying the game's rank/model objects directly (fragile across client builds).

## Constraints

- Visual-only and local-only.
- No new broad global hooks.
- Command schema strictly validates rank `0..20`.
- Existing C-KDA transport size and same-window checks remain.
- Remote image failure must leave the original game rank visible.

## Loading screen addendum

The extension packages the user-provided `besto.gif` and injects an isolated content stylesheet at `document_start`. The stylesheet replaces the mod body background image with the packaged GIF using an `!important` background-image declaration while retaining cover, center, no-repeat, and black fallback behavior. No local `file://` path is exposed to the page.
