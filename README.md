# KDA

Chrome extension for the authorized Space Aces visual customization workspace.
The visible panel contains **C-KDA** player markers and **Design** controls. The
legacy NPC bot implementation remains disabled and is not exposed in the UI.

## Features

- C-KDA player markers with all-player or masked-only mode, five marker shapes,
  ally/enemy colours, size, opacity, selectable 30/60 FPS position refresh, and
  EMP/ISH countdown labels.
- Client-local Premium presentation override. It does not grant or change any
  server entitlement and is restored on disable, navigation, or cleanup.
- Visual rank selection from default through rank 20.
- Live appearance override for the active ship using the bundled Goliath design
  list; selecting the default restores the current game design.
- Custom loading image from a local **GIF, PNG, JPG, or JPEG** file. Other file
  types are rejected. With no custom image, bundled `besto.gif` is the default.
- `N` hides or shows the complete KDA panel.

The extension runs only on `https://steam.space-aces.com/gameNew*`. It requests
only Chrome `storage` and `unlimitedStorage`; the latter stores a selected local
loading image. Images remain in the extension's local Chrome storage.

## Install a GitHub release

1. Download `KDA-v0.4.0.zip` from the latest GitHub release.
2. Extract the ZIP. Do not select the ZIP itself in Chrome.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted `KDA-v0.3.0` folder containing `manifest.json`.
7. Open or fully reload
   `https://steam.space-aces.com/gameNew?factionId=1&lang=en`.

When updating, remove the old unpacked copy or load the newly extracted folder,
then fully reload the game tab. Because this is an unpacked extension, Chrome
does not auto-update it from GitHub.

## Use

- **C-KDA:** configure markers, then click **SAVE C-KDA**.
- **Design:** choose rank and active ship appearance, then click **SAVE DESIGN**.
  Ship and rank changes apply live when the game objects are ready.
- **Loading image:** choose a supported file and click **UPLOAD LOADING**, then
  reload the game. Click **DEFAULT BESTO** and reload to restore the bundled GIF.
- Press `N` to hide or show the panel.

Visual overrides are local to the browser. A game client update can change its
runtime structure; if KDA reports an unsupported client, disable the extension
and wait for a reviewed compatibility update.

## Verify and package from source

Requirements: Node.js and Windows PowerShell.

```powershell
npm test
npm run check
npm run release:pack
```

The packaging command creates `dist/KDA-v<version>.zip`. The release archive
contains only the runtime extension files and this README.

## Rollback

Disable or remove **KDA** in `chrome://extensions`, then reload the game tab.
No game files are modified on disk. Chrome may retain extension settings until
the unpacked extension data is removed.

## Verification boundary

Automated tests and static checks cover extension structure, settings,
validation, marker/design logic, and release assets. A supervised browser/game
check is still required after each game-client update.
