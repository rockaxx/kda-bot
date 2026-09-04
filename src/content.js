(function start(root) {
  "use strict";
  if (!root || !root.__SA_BOT_ISOLATED_V1__ || typeof chrome !== "object" || !chrome.storage) return;

  const api = root.__SA_BOT_ISOLATED_V1__;
  let pendingSnapshot = null;
  let pendingDiagnostic = null;
  let pendingSource = null;
  const pendingActionResults = [];
  let receiveSnapshot = (value) => { pendingSnapshot = value; };
  let receiveDiagnostic = (value) => { pendingDiagnostic = value; };
  let receiveSource = (value) => { pendingSource = value; };
  let receiveActionResult = (value) => { pendingActionResults.push(value); };
  let cleanup = () => bridge.stop();
  let removeEmergencyStop = () => {};
  let unloaded = false;
  const bridge = api.createBridge({
    windowRef: root,
    onSnapshot(value) { receiveSnapshot(value); },
    onDiagnostic(value) { receiveDiagnostic(value); },
    onSource(value) { receiveSource(value); },
    onActionResult(value) { receiveActionResult(value); }
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
    let clientSource = null;
    let snapshot = null;
    let runtime = null;

    function model() {
      return {
        settings,
        settingsValid: normalized.ok,
        settingsErrors: normalized.errors,
        adapterSupported: api.isSupportedDiagnostic(diagnostic),
        hasSnapshot: Boolean(snapshot),
        diagnostic,
        clientSource,
        snapshot,
        state: controller.getState(),
        entries: logger.list(),
        active: runtime ? runtime.isActive() : false
      };
    }

    function render() {
      overlay.render(model());
    }

    function buildRuntime(nextController) {
      return api.createRuntime({
        controller: nextController,
        bridge,
        logger,
        staleAfterMs: Math.max(2000, 5 * settings.planningIntervalMs),
        onChange: render
      });
    }

    const overlay = api.createOverlay({
      documentRef: document,
      onStart() {
        if (!api.canStartBot(model())) return;
        runtime.start(snapshot);
        render();
      },
      onStop() {
        runtime.stop("user-stop");
        render();
      },
      onSave(rawSettings) {
        const candidate = api.normalizeSettings(rawSettings);
        normalized = candidate;
        if (candidate.ok) {
          settings = candidate.value;
          if (runtime.isActive()) runtime.stop("settings-changed");
          runtime.destroy();
          controller = api.createController({ settings });
          runtime = buildRuntime(controller);
          chrome.storage.local.set({ settings: { ...settings } });
          logger.add("settings", { state: "saved" });
        } else {
          logger.add("settings", { state: "rejected", errors: candidate.errors });
        }
        render();
        return candidate.ok;
      },
      onExport() {
        const file = api.createExportFile({ clientSource, diagnostic });
        if (!file) return;
        const blob = new Blob([file.content], { type: file.type });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.filename;
        anchor.click();
        URL.revokeObjectURL(url);
      }
    });
    runtime = buildRuntime(controller);
    removeEmergencyStop = api.installEmergencyStop(root, () => {
      if (runtime && runtime.isActive()) runtime.stop("emergency-shortcut");
    });

    receiveSnapshot = (value) => {
      snapshot = value;
      runtime.receiveSnapshot(value);
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
    receiveActionResult = (value) => {
      runtime.receiveActionResult(value);
      render();
    };
    receiveSource = (value) => {
      clientSource = value.source;
      logger.add("source", {
        state: "captured",
        bytes: new TextEncoder().encode(clientSource).byteLength,
        reason: value.reason
      });
      render();
    };
    if (pendingDiagnostic) receiveDiagnostic(pendingDiagnostic);
    if (pendingSource) receiveSource(pendingSource);
    if (pendingSnapshot) receiveSnapshot(pendingSnapshot);
    for (const result of pendingActionResults) receiveActionResult(result);
    pendingDiagnostic = null;
    pendingSource = null;
    pendingSnapshot = null;
    pendingActionResults.length = 0;
    render();
    cleanup = () => {
      runtime.destroy();
      removeEmergencyStop();
      bridge.stop();
      overlay.destroy();
    };
    });
  });
})(typeof window === "object" ? window : null);
