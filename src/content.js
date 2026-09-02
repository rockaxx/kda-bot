(function start(root) {
  "use strict";
  if (!root || !root.__SA_BOT_ISOLATED_V1__ || typeof chrome !== "object" || !chrome.storage) return;

  const api = root.__SA_BOT_ISOLATED_V1__;
  let pendingSnapshot = null;
  let pendingDiagnostic = null;
  let receiveSnapshot = (value) => { pendingSnapshot = value; };
  let receiveDiagnostic = (value) => { pendingDiagnostic = value; };
  let cleanup = () => bridge.stop();
  let unloaded = false;
  const bridge = api.createBridge({
    windowRef: root,
    onSnapshot(value) { receiveSnapshot(value); },
    onDiagnostic(value) { receiveDiagnostic(value); }
  });
  bridge.start();

  root.addEventListener("beforeunload", () => {
    unloaded = true;
    cleanup();
  }, { once: true });

  api.whenDocumentReady(document, () => {
    chrome.storage.local.get(["settings"], (stored) => {
    if (unloaded) return;
    let normalized = api.normalizeSettings(stored.settings || {});
    let settings = normalized.value;
    let controller = api.createController({ settings });
    const logger = api.createLogger(100);
    let diagnostic = null;
    let snapshot = null;
    let active = false;

    function model() {
      return {
        settings,
        settingsValid: normalized.ok,
        settingsErrors: normalized.errors,
        adapterSupported:
          diagnostic?.patchStatus === "patched" &&
          diagnostic?.clientVersion === api.EXPECTED_CLIENT_VERSION,
        hasSnapshot: Boolean(snapshot),
        diagnostic,
        snapshot,
        state: controller.getState(),
        entries: logger.list(),
        active
      };
    }

    function render() {
      overlay.render(model());
    }

    function logDryRunActions() {
      for (const action of controller.drainActions()) {
        const names = {
          selectNpc: "would-select",
          moveTo: "would-move",
          pressAmmoKey: "would-press-key",
          clearTarget: "would-clear-target",
          cancelMovement: "would-cancel-movement"
        };
        logger.add(names[action.type] || "would-act", action);
      }
    }

    const overlay = api.createOverlay({
      documentRef: document,
      onStart() {
        if (!api.canStartDryRun(model())) return;
        active = true;
        controller.start();
        logger.add("mode", { mode: "DRY_RUN", state: "started" });
        if (snapshot) {
          controller.update(snapshot);
          logDryRunActions();
        }
        render();
      },
      onStop() {
        active = false;
        controller.stop("user-stop");
        logger.add("mode", { mode: "DRY_RUN", state: "stopped" });
        render();
      },
      onSave(rawSettings) {
        const candidate = api.normalizeSettings(rawSettings);
        normalized = candidate;
        if (candidate.ok) {
          settings = candidate.value;
          active = false;
          controller.stop("settings-changed");
          controller = api.createController({ settings });
          chrome.storage.local.set({ settings: { ...settings } });
          logger.add("settings", { state: "saved" });
        } else {
          logger.add("settings", { state: "rejected", errors: candidate.errors });
        }
        render();
      },
      onExport() {
        if (!diagnostic) return;
        const blob = new Blob([JSON.stringify(diagnostic, null, 2)], {
          type: "application/json"
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `sa-bot-diagnostic-${diagnostic.clientVersion || "unknown"}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
      }
    });

    receiveSnapshot = (value) => {
      snapshot = value;
      if (active) {
        controller.update(value);
        logDryRunActions();
      }
      render();
    };
    receiveDiagnostic = (value) => {
      diagnostic = value;
      logger.add("adapter", {
        patchStatus: value.patchStatus,
        clientVersion: value.clientVersion,
        reason: value.reason
      });
      render();
    };
    if (pendingDiagnostic) receiveDiagnostic(pendingDiagnostic);
    if (pendingSnapshot) receiveSnapshot(pendingSnapshot);
    pendingDiagnostic = null;
    pendingSnapshot = null;
    render();
    cleanup = () => {
      active = false;
      controller.stop("unload");
      bridge.stop();
      overlay.destroy();
    };
    });
  });
})(typeof window === "object" ? window : null);
