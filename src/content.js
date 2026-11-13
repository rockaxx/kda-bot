(function start(root) {
  "use strict";
  if (!root || !root.__SA_BOT_ISOLATED_V1__ || typeof chrome !== "object" || !chrome.storage) return;

  const api = root.__SA_BOT_ISOLATED_V1__;
  const requiredApi = [
    "createCkdaBridge", "createCkdaCanvas", "createMonotonicEpochClock",
    "normalizeCkdaSettings", "normalizeDesignSettings", "normalizeLoadingImage", "createShipCatalog",
    "readLoadingImageFile", "validateCkdaSnapshot"
  ];
  // An unpacked extension can briefly run new files with its previously
  // registered manifest. Exit cleanly until Chrome reloads the full script set.
  const missingApi = requiredApi.filter(name => typeof api[name] !== "function");
  if (missingApi.length) {
    const status = typeof document === "object" &&
      typeof document.getElementById === "function"
      ? document.getElementById("sa-bot-bootstrap-status")
      : null;
    if (status) status.textContent = `KDA blocked — missing: ${missingApi.join(", ")}`;
    return;
  }
  const CKDA_LEASE_RENEW_MS = 15000;
  const CKDA_UI_STALE_MS = 2000;
  const ckdaNow = api.createMonotonicEpochClock(root.performance);
  let leaseTimer = null;
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
    if (leaseTimer !== null) root.clearInterval(leaseTimer);
    leaseTimer = null;
    try { ckdaBridge.sendCommand("teardown"); } catch (_) { /* MAIN lease also expires without renewal. */ }
    cleanup();
    root.removeEventListener("pagehide", unload);
    root.removeEventListener("beforeunload", unload);
  }
  root.addEventListener("beforeunload", unload);
  root.addEventListener("pagehide", unload);
  function renewLease() {
    if (unloaded) return;
    let contextValid = false;
    try { contextValid = Boolean(chrome.runtime?.id); } catch (_) { /* Invalid extension context. */ }
    if (!contextValid) { unload(); return; }
    try {
      ckdaBridge.sendCommand("renew-lease");
    } catch (_) {
      // A C-KDA transport fault must not end the independent BOT runtime.
      if (leaseTimer !== null) root.clearInterval(leaseTimer);
      leaseTimer = null;
      ckdaStartupFailed = true;
      receiveCkdaResult({ state: "error" });
    }
  }
  leaseTimer = root.setInterval(renewLease, CKDA_LEASE_RENEW_MS);
  renewLease();
  if (unloaded) return;

  function initialize(shipCatalog) {
    if (unloaded) return;
    chrome.storage.local.get(["settings", "ckdaSettings", "designSettings", "loadingScreenImage"], (stored = {}) => {
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
    let designSettings = api.normalizeDesignSettings(stored.designSettings || {}, shipCatalog).value;
    let loadingScreenImage = api.normalizeLoadingImage(stored.loadingScreenImage).value;
    let ckdaSaving = false;
    // An unavailable adapter stays closed until discovery explicitly reports ready.
    let ckdaSourceUnsupported = false;
    let ckdaSnapshot = null;
    let lastCkdaSnapshotAt = null;
    let ckdaStatus = { state: ckdaStartupFailed ? "error" : "waiting-for-game" };
    let ckdaCanvas = null;
    try {
      ckdaCanvas = api.createCkdaCanvas({ documentRef: document, windowRef: root, now: ckdaNow });
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
        designSettings,
        loadingImageName: loadingScreenImage?.name || "Besto GIF (default)",
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

    function configureDesign() {
      const { rankId, ringLevel, shipDesign, titleText, titleColor } = designSettings;
      ckdaBridge.sendCommand("set-design-rank", { rankId });
      ckdaBridge.sendCommand("set-design-rings", { ringLevel });
      ckdaBridge.sendCommand("set-design-ship", { shipDesign });
      ckdaBridge.sendCommand("set-design-title", { titleText, titleColor });
    }

    function configureCkda() {
      ckdaBridge.sendCommand("configure-effects", {
        empCooldownMs: ckdaSettings.empCooldownMs,
        ishCooldownMs: ckdaSettings.ishCooldownMs
      });
      ckdaBridge.sendCommand("configure-refresh", { fps: ckdaSettings.refreshFps });
      ckdaBridge.sendCommand("set-premium", { enabled: ckdaSettings.premiumOverride });
      configureDesign();
      ckdaBridge.sendCommand("refresh");
    }

    function clearCkda() {
      ckdaSnapshot = null;
      lastCkdaSnapshotAt = null;
      ckdaCanvas?.clear();
      if (!["error", "save-failed", "unsupported-client"].includes(ckdaStatus.state)) {
        ckdaStatus = { state: "waiting-for-game" };
      }
    }

    function markCkdaUnsupported() {
      ckdaSourceUnsupported = true;
      clearCkda();
      ckdaStatus = { state: "unsupported-client" };
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
        if (!candidate.ok) {
          ckdaAction(() => { ckdaStatus = { state: "save-failed" }; });
          return false;
        }
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
      onPreviewCkda(rawSettings) {
        const candidate = api.normalizeCkdaSettings(rawSettings);
        if (!candidate.ok) return false;
        const refreshChanged = candidate.value.refreshFps !== ckdaSettings.refreshFps;
        ckdaSettings = candidate.value;
        if (refreshChanged) {
          try { ckdaBridge.sendCommand("configure-refresh", { fps: ckdaSettings.refreshFps }); }
          catch (_) { ckdaStatus = { state: "error" }; return false; }
        }
        ckdaCanvas?.render(ckdaSnapshot, ckdaSettings);
        return true;
      },
      shipCatalog,
      async onSaveDesign(rawSettings) {
        if (unloaded) return false;
        const candidate = api.normalizeDesignSettings(rawSettings, shipCatalog);
        if (!candidate.ok) return false;
        try {
          await chrome.storage.local.set({ designSettings: { ...candidate.value } });
          if (unloaded) return false;
          designSettings = candidate.value;
          return ckdaAction(configureDesign);
        } catch (_) {
          return false;
        }
      },
      async onSaveLoadingImage(file) {
        if (unloaded) return false;
        try {
          const value = await api.readLoadingImageFile(file, root.FileReader);
          await chrome.storage.local.set({ loadingScreenImage: { ...value } });
          if (unloaded) return false;
          loadingScreenImage = value;
          render();
          return true;
        } catch (_) {
          return false;
        }
      },
      async onResetLoadingImage() {
        if (unloaded) return false;
        try {
          await chrome.storage.local.remove("loadingScreenImage");
          if (unloaded) return false;
          loadingScreenImage = null;
          render();
          return true;
        } catch (_) {
          return false;
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
    if (typeof document.getElementById === "function") {
      document.getElementById("sa-bot-bootstrap-status")?.remove();
    }
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
        ckdaAction(markCkdaUnsupported);
      } else if (value.patchStatus === "patched" && value.reason === "capabilities-ready") {
        ckdaSourceUnsupported = false;
        if (ckdaStatus.state === "unsupported-client") ckdaStatus = {state: "waiting-for-game"};
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
      if (ckdaSourceUnsupported) return;
      const checked = api.validateCkdaSnapshot(value);
      if (!checked.ok) return;
      const timestamp = ckdaNow();
      if (!Number.isFinite(timestamp) || checked.value.timestamp > timestamp ||
          timestamp - checked.value.timestamp >= CKDA_UI_STALE_MS) return;
      if (checked.value.connectionState !== "connected") {
        clearCkda();
        return;
      }
      ckdaSnapshot = checked.value;
      lastCkdaSnapshotAt = timestamp;
      if (!["error", "save-failed", "unsupported-client"].includes(ckdaStatus.state)) {
        ckdaStatus = { state: ckdaSnapshot.players.length ? "ready" : "no-player-data" };
      }
      ckdaCanvas?.render(ckdaSnapshot, ckdaSettings);
    });
    receiveCkdaResult = (value) => ckdaAction(() => {
      if (value.type === "ready") configureCkda();
      else if (value.state === "unsupported-client") markCkdaUnsupported();
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
    const watchdogTimer = root.setInterval(() => {
      if (unloaded || lastCkdaSnapshotAt === null) return;
      if (ckdaNow() - lastCkdaSnapshotAt >= CKDA_UI_STALE_MS) ckdaAction(clearCkda);
    }, 250);
    cleanup = () => {
      root.clearInterval(watchdogTimer);
      document.removeEventListener("visibilitychange", visibilityChanged);
      for (const release of [
        () => runtime.destroy(), removeEmergencyStop, () => bridge.stop(),
        () => ckdaBridge.destroy(), () => ckdaCanvas?.destroy(), () => overlay.destroy()
      ]) {
        try { release(); } catch (_) { /* Continue releasing independent resources. */ }
      }
    };
    });
  }
  api.whenDocumentReady(document, () => {
    if (api.designCatalogReady) api.designCatalogReady.then(models => initialize(api.createShipCatalog(models)));
    else initialize(api.createShipCatalog(null));
  });
})(typeof window === "object" ? window : null);
