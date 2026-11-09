# Live Design Fixes

## Intent

Fix the black loading screen and invisible rank override, then add one proof-of-concept ship design choice: locally render Surgeon model ID `31` with Bastion model ID `2` assets after reload.

## Chosen approach

- Loading: isolated document-start controller applies the absolute `chrome.runtime.getURL("assets/besto.gif")` as inline `background-image: ... !important` and reapplies it when the game replaces the body.
- Rank: use the current client's proven hero `ship.wrapper` as fallback positioning target when no separate `rankLogo` object exists. The fallback never hides the entire ship.
- Ship: install a MAIN-world, exact-URL fetch interceptor for only `Models.steam.json`. When persisted Design Mode is `bastion`, copy the Bastion path from `ships[2]` into Surgeon `ships[31]`, return a replacement `Response`, then restore native fetch. Other requests and malformed responses remain byte/native behavior.

## UI and lifecycle

Design Mode adds `Ship design` with `Default Surgeon` and `Bastion`. Saving persists the setting. Ship changes take effect on game reload because model configuration is consumed during preload. Default returns untouched server/model data on the next reload.

## Constraints

- Visual/local client behavior only; no server/account mutation.
- Rank `Default` and cleanup restore native presentation.
- Loading failure must keep black fallback and expose no local filesystem path.
- Interceptor touches only the exact models resource and fails open.
- BOT remains absent from visible menu.
