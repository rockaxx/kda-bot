(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_ISOLATED_V1__, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  const FIELD_DEFINITIONS = Object.freeze([
    ["requiredMap", "Map ID", "number"],
    ["kiteDistance", "Kite distance", "number"],
    ["dangerRadius", "Danger radius", "number"],
    ["fleeHpPercent", "Flee HP %", "number"],
    ["resumeHpPercent", "Resume HP %", "number"],
    ["ammoKey", "Ammo key", "text"],
    ["planningIntervalMs", "Plan interval ms", "number"],
    ["movementIntervalMs", "Move interval ms", "number"],
    ["targetBlacklistMs", "Blacklist ms", "number"]
  ]);

  function canStartDryRun({ settingsValid, adapterSupported, hasSnapshot }) {
    return Boolean(settingsValid && adapterSupported && hasSnapshot);
  }

  function isSupportedDiagnostic(diagnostic) {
    return Boolean(diagnostic && diagnostic.patchStatus === "patched");
  }

  function createExportFile({ clientSource, diagnostic }) {
    if (typeof clientSource === "string" && clientSource.length > 0) {
      return {
        content: clientSource,
        filename: "space-aces-client-current.js",
        type: "application/javascript"
      };
    }
    if (!diagnostic) return null;
    return {
      content: JSON.stringify(diagnostic, null, 2),
      filename: `sa-bot-diagnostic-${diagnostic.clientVersion || "unknown"}.json`,
      type: "application/json"
    };
  }

  function whenDocumentReady(documentRef, callback) {
    if (documentRef.readyState === "loading") {
      documentRef.addEventListener("DOMContentLoaded", callback, { once: true });
      return;
    }
    callback();
  }

  function keepHostMounted(documentRef, host, Observer = MutationObserver) {
    function mount() {
      const parent = documentRef.body || documentRef.documentElement;
      if (parent && !host.isConnected) parent.appendChild(host);
    }
    const observer = new Observer(mount);
    mount();
    observer.observe(documentRef.documentElement, {
      childList: true,
      subtree: true
    });
    return () => observer.disconnect();
  }

  function createOverlay({ documentRef, onStart, onStop, onSave, onExport }) {
    const host = documentRef.createElement("div");
    host.id = "sa-bot-root";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = documentRef.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .panel { position: fixed; z-index: 2147483647; top: 12px; right: 12px;
        width: 310px; max-height: calc(100vh - 24px); overflow: auto;
        box-sizing: border-box; padding: 12px; border: 1px solid #38bdf8;
        border-radius: 10px; background: rgba(8,15,28,.96); color: #e5eefc;
        font: 12px/1.35 Arial,sans-serif; box-shadow: 0 8px 30px #000a; }
      h2 { margin: 0 0 8px; font-size: 15px; color: #7dd3fc; }
      .badge { color: #fbbf24; font-weight: 700; }
      .grid { display: grid; grid-template-columns: 1fr 100px; gap: 5px 8px; }
      label, .key { color: #a9bdd8; align-self: center; }
      input { width: 100%; box-sizing: border-box; border: 1px solid #334155;
        border-radius: 4px; background: #111c2e; color: #fff; padding: 4px; }
      .buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 9px 0; }
      button { border: 0; border-radius: 5px; padding: 6px; cursor: pointer;
        background: #0369a1; color: white; font-weight: 700; }
      button.stop { background: #b91c1c; } button:disabled { opacity: .4; cursor: not-allowed; }
      .status { border-top: 1px solid #334155; padding-top: 8px; }
      .value { text-align: right; overflow-wrap: anywhere; }
      .errors { color: #fca5a5; margin: 6px 0; white-space: pre-wrap; }
      pre { margin: 7px 0 0; padding: 6px; max-height: 110px; overflow: auto;
        background: #020617; color: #94a3b8; white-space: pre-wrap; font: 10px/1.3 monospace; }
    `;
    const panel = documentRef.createElement("section");
    panel.className = "panel";
    const title = documentRef.createElement("h2");
    title.textContent = "Space Aces NPC Bot — DRY RUN";
    panel.appendChild(title);

    const fields = documentRef.createElement("div");
    fields.className = "grid";
    const inputs = {};
    for (const [key, labelText, type] of FIELD_DEFINITIONS) {
      const label = documentRef.createElement("label");
      label.textContent = labelText;
      const input = documentRef.createElement("input");
      input.type = type;
      input.dataset.setting = key;
      inputs[key] = input;
      fields.append(label, input);
    }
    panel.appendChild(fields);

    const buttons = documentRef.createElement("div");
    buttons.className = "buttons";
    const makeButton = (text, className) => {
      const button = documentRef.createElement("button");
      button.textContent = text;
      if (className) button.className = className;
      buttons.appendChild(button);
      return button;
    };
    const startButton = makeButton("Start Dry Run");
    const stopButton = makeButton("STOP", "stop");
    const saveButton = makeButton("Save settings");
    const exportButton = makeButton("Export diagnostic");
    panel.appendChild(buttons);

    const errors = documentRef.createElement("div");
    errors.className = "errors";
    panel.appendChild(errors);
    const status = documentRef.createElement("div");
    status.className = "grid status";
    const statusValues = {};
    for (const [key, label] of [
      ["fsm", "FSM"], ["adapter", "Adapter"], ["map", "Map"],
      ["hp", "HP"], ["target", "Target"], ["nearby", "NPCs"],
      ["safety", "Safety"]
    ]) {
      const name = documentRef.createElement("span");
      name.className = "key";
      name.textContent = label;
      const value = documentRef.createElement("span");
      value.className = "value";
      value.textContent = "—";
      statusValues[key] = value;
      status.append(name, value);
    }
    panel.appendChild(status);
    const logView = documentRef.createElement("pre");
    logView.textContent = "No events";
    panel.appendChild(logView);
    shadow.append(style, panel);
    const stopMountGuard = keepHostMounted(documentRef, host);

    let lastModel = {};
    function readSettings() {
      const result = {};
      for (const [key, , type] of FIELD_DEFINITIONS) {
        const raw = inputs[key].value.trim();
        result[key] = key === "requiredMap" && raw === ""
          ? null
          : type === "number" ? Number(raw) : raw;
      }
      return result;
    }

    startButton.addEventListener("click", () => {
      if (canStartDryRun(lastModel)) onStart();
    });
    stopButton.addEventListener("click", () => onStop());
    saveButton.addEventListener("click", () => onSave(readSettings()));
    exportButton.addEventListener("click", () => onExport());

    function render(model) {
      lastModel = { ...model };
      if (model.settings) {
        for (const [key] of FIELD_DEFINITIONS) {
          inputs[key].value = model.settings[key] === null ? "" : String(model.settings[key]);
        }
      }
      startButton.disabled = !canStartDryRun(model) || Boolean(model.active);
      stopButton.disabled = !model.active;
      exportButton.disabled = !model.diagnostic && !model.clientSource;
      exportButton.textContent = model.clientSource
        ? "Export client source"
        : "Export diagnostic";
      errors.textContent = (model.settingsErrors || []).join("\n");
      const snapshot = model.snapshot;
      statusValues.fsm.textContent = `${model.state?.name || "STOPPED"} (${model.state?.reason || "—"})`;
      statusValues.adapter.textContent = model.adapterSupported ? "supported" : "waiting/unsupported";
      statusValues.map.textContent = snapshot ? `${snapshot.mapId} / ${model.settings?.requiredMap ?? "unset"}` : "—";
      statusValues.hp.textContent = snapshot ? `${snapshot.player.hpPercent}%` : "—";
      statusValues.target.textContent = snapshot?.target ? `${snapshot.target.type}:${snapshot.target.id}` : "none";
      statusValues.nearby.textContent = snapshot ? String(snapshot.entities.filter((e) => e.type === "npc" && e.alive).length) : "—";
      statusValues.safety.textContent = model.active ? "DRY RUN — no actions sent" : "stopped";
      const entries = model.entries || [];
      logView.textContent = entries.length
        ? entries.slice(-12).map((entry) => `${entry.at} ${entry.type} ${JSON.stringify(entry.data)}`).join("\n")
        : "No events";
    }

    function destroy() {
      stopMountGuard();
      host.remove();
    }

    return { destroy, readSettings, render };
  }

  return {
    canStartDryRun,
    createExportFile,
    createOverlay,
    isSupportedDiagnostic,
    keepHostMounted,
    whenDocumentReady
  };
});
