(function start(root) {
  "use strict";
  if (!root || !root.__SA_BOT_ISOLATED_V1__ || typeof chrome !== "object" || !chrome.storage) return;

  const api = root.__SA_BOT_ISOLATED_V1__;
  let pendingSnapshot = null;
  let pendingDiagnostic = null;
  let pendingSource = null;
  let pendingCkdaSnapshot = null;
  const pendingActionResults = [];
  let receiveSnapshot = (value) => { pendingSnapshot = value; };
  let receiveDiagnostic = (value) => { pendingDiagnostic = value; };
  let receiveSource = (value) => { pendingSource = value; };
  let receiveActionResult = (value) => { pendingActionResults.push(value); };
  let receiveCkdaSnapshot = (value) => { pendingCkdaSnapshot = value; };
  let receiveCkdaResult = () => {};
  let cleanup = () => { bridge.stop(); ckdaBridge.destroy(); };
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
  let ckdaStartupFailed = false;
  let ckdaBridge = { sendCommand() {}, destroy() {} };
  try {
    ckdaBridge = api.createCkdaBridge({
      windowRef: root,
      onSnapshot(value) { if (!unloaded) receiveCkdaSnapshot(value); },
      onResult(value) { if (!unloaded) receiveCkdaResult(value); }
    });
  } catch (_) {
    ckdaStartupFailed = true;
  }

  function unload() {
    if (unloaded) return;
    unloaded = true;
    cleanup();
    root.removeEventListener("pagehide", unload);
    root.removeEventListener("beforeunload", unload);
  }
  root.addEventListener("beforeunload", unload);
  root.addEventListener("pagehide", unload);

  api.whenDocumentReady(document, () => {
    chrome.storage.local.get(["settings", "ckdaSettings"], (stored = {}) => {
    if (unloaded) return;
    let normalized = api.normalizeSettings(stored.settings || {});
    let settings = normalized.value;
    let controller = api.createController({ settings });
    const logger = api.createLogger(100);
    let diagnostic = null;
    let clientSource = null;
    let snapshot = null;
    let runtime = null;
    let ckdaSettings = api.normalizeCkdaSettings(stored.ckdaSettings || {}).value;
    let ckdaSaving = false;
    let ckdaSnapshot = null;
    let ckdaStatus = { state: ckdaStartupFailed ? "error" : "waiting-for-game" };
    let ckdaCanvas = null;
    try {
      ckdaCanvas = api.createCkdaCanvas({ documentRef: document, windowRef: root });
    } catch (_) {
      ckdaStatus = { state: "error" };
    }

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
        ckdaSettings,
        ckdaSnapshot,
        ckdaStatus,
        state: runtime ? runtime.getState() : controller.getState(),
        entries: logger.list(),
        active: runtime ? runtime.isActive() : false
      };
    }

    function render() {
      overlay.render(model());
    }

    function ckdaAction(action) {
      let ok = true;
      try { action(); } catch (_) { ckdaStatus = { state: "error" }; ok = false; }
      try { render(); } catch (_) { ckdaStatus = { state: "error" }; ok = false; }
      return ok;
    }

    function configureCkda() {
      ckdaBridge.sendCommand("configure-effects", {
        empCooldownMs: ckdaSettings.empCooldownMs,
        ishCooldownMs: ckdaSettings.ishCooldownMs
      });
      ckdaBridge.sendCommand("set-premium", { enabled: ckdaSettings.premiumOverride });
      ckdaBridge.sendCommand("refresh");
    }

    function clearCkda() {
      ckdaSnapshot = null;
      ckdaCanvas?.clear();
      if (!["error", "save-failed", "unsupported-client"].includes(ckdaStatus.state)) {
        ckdaStatus = { state: "waiting-for-game" };
      }
    }

    function visibilityChanged() {
      if (document.visibilityState !== "visible" || unloaded) return;
      ckdaAction(() => {
        clearCkda();
        ckdaBridge.sendCommand("refresh");
      });
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
      async onSaveCkda(rawSettings) {
        if (unloaded || ckdaSaving) return false;
        const candidate = api.normalizeCkdaSettings(rawSettings);
        if (!candidate.ok) return false;
        ckdaSaving = true;
        try {
          await chrome.storage.local.set({ ckdaSettings: { ...candidate.value } });
          if (unloaded) return false;
          ckdaSettings = candidate.value;
          if (ckdaStatus.state !== "unsupported-client") {
            ckdaStatus = { state: ckdaStartupFailed ? "error" : "waiting-for-game" };
          }
          return ckdaAction(() => {
            configureCkda();
            ckdaCanvas?.render(ckdaSnapshot, ckdaSettings);
          });
        } catch (_) {
          if (!unloaded) ckdaAction(() => { ckdaStatus = { state: "save-failed" }; });
          return false;
        } finally {
          ckdaSaving = false;
        }
      },
      onCkdaCommand(type) {
        if (type !== "clear") return;
        ckdaAction(() => {
          clearCkda();
          ckdaBridge.sendCommand("clear");
        });
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
      if (value.patchStatus === "unsupported" ||
          (value.patchStatus === "patched" && !api.isSupportedDiagnostic(value))) {
        ckdaAction(() => {
          clearCkda();
          ckdaStatus = { state: "unsupported-client" };
        });
      }
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
    receiveCkdaSnapshot = (value) => ckdaAction(() => {
      if (ckdaStatus.state === "unsupported-client") return;
      const checked = api.validateCkdaSnapshot(value);
      if (!checked.ok) return;
      ckdaSnapshot = checked.value;
      if (!["error", "save-failed", "unsupported-client"].includes(ckdaStatus.state)) {
        ckdaStatus = { state: ckdaSnapshot.players.length ? "ready" : "no-player-data" };
      }
      ckdaCanvas?.render(ckdaSnapshot, ckdaSettings);
    });
    receiveCkdaResult = (value) => ckdaAction(() => {
      if (value.type === "ready") configureCkda();
      else if (value.state === "unsupported-client") ckdaStatus = { state: value.state };
      else if (value.state === "error") ckdaStatus = { state: "error" };
    });
    if (pendingDiagnostic) receiveDiagnostic(pendingDiagnostic);
    if (pendingSource) receiveSource(pendingSource);
    if (pendingSnapshot) receiveSnapshot(pendingSnapshot);
    if (pendingCkdaSnapshot) receiveCkdaSnapshot(pendingCkdaSnapshot);
    for (const result of pendingActionResults) receiveActionResult(result);
    pendingDiagnostic = null;
    pendingSource = null;
    pendingSnapshot = null;
    pendingCkdaSnapshot = null;
    pendingActionResults.length = 0;
    render();
    document.addEventListener("visibilitychange", visibilityChanged);
    ckdaAction(configureCkda);
    cleanup = () => {
      document.removeEventListener("visibilitychange", visibilityChanged);
      for (const release of [
        () => runtime.destroy(), removeEmergencyStop, () => bridge.stop(),
        () => ckdaBridge.destroy(), () => ckdaCanvas?.destroy(), () => overlay.destroy()
      ]) {
        try { release(); } catch (_) { /* Continue releasing independent resources. */ }
      }
    };
    });
  });
})(typeof window === "object" ? window : null);
