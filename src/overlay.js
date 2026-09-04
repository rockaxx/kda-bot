(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_ISOLATED_V1__, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  const FIELD_DEFINITIONS = Object.freeze([
    ["kiteDistance", "Kite distance", "number"],
    ["dangerRadius", "Danger radius", "number"],
    ["fleeHpPercent", "Flee HP %", "number"],
    ["resumeHpPercent", "Resume HP %", "number"],
    ["ammoKey", "Ammo key", "text"],
    ["planningIntervalMs", "Plan interval ms", "number"],
    ["movementIntervalMs", "Move interval ms", "number"],
    ["targetBlacklistMs", "Blacklist ms", "number"]
  ]);
  const EXPECTED_CLIENT_VERSION = "1.9.0.049";

  function canStartBot({ settingsValid, adapterSupported, hasSnapshot }) {
    return Boolean(settingsValid && adapterSupported && hasSnapshot);
  }

  function formatMapStatus(snapshot) {
    return snapshot ? String(snapshot.mapId) : "—";
  }

  function createSettingsFormState(inputs) {
    const dirtyFields = new Set();
    for (const [key] of FIELD_DEFINITIONS) {
      inputs[key].addEventListener("input", () => dirtyFields.add(key));
    }

    function readSettings() {
      const result = {};
      for (const [key, , type] of FIELD_DEFINITIONS) {
        const raw = inputs[key].value.trim();
        result[key] = type === "number" ? Number(raw) : raw;
      }
      return result;
    }

    function sync(settings) {
      if (!settings) return;
      for (const [key] of FIELD_DEFINITIONS) {
        if (dirtyFields.has(key)) continue;
        inputs[key].value = settings[key] === null ? "" : String(settings[key]);
      }
    }

    function submit(onSave) {
      const result = onSave(readSettings());
      if (result === true) dirtyFields.clear();
    }

    return { readSettings, submit, sync };
  }

  function isSupportedDiagnostic(diagnostic) {
    return Boolean(
      diagnostic &&
      diagnostic.patchStatus === "patched" &&
      String(diagnostic.clientVersion || "").replace(/^n/, "") ===
        EXPECTED_CLIENT_VERSION
    );
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

  function shouldToggleOverlay(event) {
    if (
      !event ||
      event.code !== "KeyN" ||
      event.repeat ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.shiftKey
    ) return false;
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const target = path[0] || event.target || {};
    const tagName = String(target.tagName || "").toUpperCase();
    return !target.isContentEditable && !["INPUT", "TEXTAREA", "SELECT"].includes(tagName);
  }

  function createPanelState(tabNames) {
    const knownTabs = new Set(tabNames);
    let visible = true;
    let activeTab = tabNames[0];
    return {
      read: () => ({ visible, activeTab }),
      toggle() { visible = !visible; },
      selectTab(name) {
        if (!knownTabs.has(name)) return false;
        activeTab = name;
        return true;
      }
    };
  }

  function createOverlay({ documentRef, onStart, onStop, onSave, onExport }) {
    const host = documentRef.createElement("div");
    host.id = "sa-bot-root";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = documentRef.createElement("style");
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; }
      [hidden] { display: none !important; }
      .panel { position: fixed; z-index: 2147483647; top: 16px; right: 16px;
        width: 356px; max-height: calc(100vh - 32px); overflow: auto;
        border: 1px solid rgba(103,232,249,.32); border-radius: 18px;
        background: linear-gradient(145deg,rgba(8,18,34,.97),rgba(5,10,23,.98));
        color: #eaf7ff; font: 12px/1.4 Inter,Segoe UI,Arial,sans-serif;
        box-shadow: 0 24px 70px rgba(0,0,0,.55), inset 0 1px rgba(255,255,255,.05);
        backdrop-filter: blur(18px); }
      .header { display: flex; align-items: center; gap: 11px; padding: 16px 16px 13px;
        background: radial-gradient(circle at 20% 0%,rgba(14,165,233,.17),transparent 55%); }
      .logo { width: 39px; height: 39px; display: grid; place-items: center; flex: none;
        border: 1px solid rgba(103,232,249,.55); border-radius: 12px;
        background: linear-gradient(145deg,#0891b2,#2563eb); color: white;
        font-size: 18px; font-weight: 900; box-shadow: 0 0 24px rgba(6,182,212,.25); }
      .heading { min-width: 0; flex: 1; }
      h2 { margin: 0; color: #f8fdff; font-size: 18px; line-height: 1.05;
        letter-spacing: .16em; font-weight: 850; }
      .subtitle { margin-top: 4px; color: #7192aa; font-size: 10px; letter-spacing: .08em;
        text-transform: uppercase; }
      .live-pill { display: flex; align-items: center; gap: 6px; padding: 5px 8px;
        border: 1px solid rgba(148,163,184,.18); border-radius: 999px;
        color: #94a3b8; background: rgba(15,23,42,.72); font-size: 9px; font-weight: 800; }
      .live-pill::before { content: ''; width: 7px; height: 7px; border-radius: 50%;
        background: #64748b; box-shadow: 0 0 0 3px rgba(100,116,139,.12); }
      .live-pill.on { color: #67e8f9; border-color: rgba(34,211,238,.25); }
      .live-pill.on::before { background: #22d3ee; box-shadow: 0 0 9px #22d3ee; }
      .tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin: 0 14px;
        padding: 4px; border: 1px solid rgba(148,163,184,.1); border-radius: 11px;
        background: rgba(2,6,23,.52); }
      .tab { padding: 8px; border: 0; border-radius: 8px; color: #7592aa;
        background: transparent; font: inherit; font-weight: 750; cursor: pointer; }
      .tab.active { color: #eafaff; background: linear-gradient(135deg,rgba(8,145,178,.35),rgba(37,99,235,.28));
        box-shadow: inset 0 0 0 1px rgba(103,232,249,.12); }
      .view { padding: 14px; }
      .mode-card { display: flex; align-items: center; gap: 12px; padding: 13px;
        border: 1px solid rgba(56,189,248,.17); border-radius: 13px;
        background: linear-gradient(135deg,rgba(14,116,144,.15),rgba(15,23,42,.42)); }
      .mode-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px;
        color: #67e8f9; background: rgba(6,182,212,.11); font-size: 16px; }
      .mode-name { font-size: 13px; font-weight: 800; color: #f0fbff; overflow-wrap: anywhere; }
      .mode-reason { color: #7091a8; font-size: 10px; overflow-wrap: anywhere; }
      .controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 11px 0; }
      button.action { min-height: 39px; border: 0; border-radius: 10px; cursor: pointer;
        color: white; font: inherit; font-weight: 850; letter-spacing: .03em;
        background: linear-gradient(135deg,#0891b2,#2563eb); box-shadow: 0 8px 18px rgba(2,132,199,.18); }
      button.action.stop { background: linear-gradient(135deg,#be123c,#991b1b);
        box-shadow: 0 8px 18px rgba(190,18,60,.15); }
      button:disabled { opacity: .34; cursor: not-allowed; filter: saturate(.35); box-shadow: none; }
      .section-title { margin: 13px 2px 8px; color: #66849b; font-size: 9px;
        font-weight: 850; letter-spacing: .16em; text-transform: uppercase; }
      .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
      .metric { min-height: 57px; padding: 9px 10px; border: 1px solid rgba(148,163,184,.1);
        border-radius: 11px; background: rgba(15,23,42,.48); }
      .key { display: block; color: #607d94; font-size: 9px; font-weight: 750;
        letter-spacing: .08em; text-transform: uppercase; }
      .value { display: block; margin-top: 4px; color: #dff6ff; font-size: 12px;
        font-weight: 700; overflow-wrap: anywhere; }
      .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
      .field { display: flex; flex-direction: column; gap: 5px; }
      label { color: #88a3b7; font-size: 10px; font-weight: 700; }
      input { width: 100%; border: 1px solid rgba(100,116,139,.32); border-radius: 9px;
        outline: none; background: rgba(3,9,22,.78); color: #ecfeff; padding: 8px 9px;
        font: 700 12px/1.2 Inter,Segoe UI,Arial,sans-serif; transition: border-color .15s,box-shadow .15s; }
      input:focus { border-color: #22d3ee; box-shadow: 0 0 0 3px rgba(34,211,238,.1); }
      .wide { grid-column: 1/-1; }
      .secondary { width: 100%; min-height: 36px; border: 1px solid rgba(56,189,248,.19);
        border-radius: 10px; color: #9edcf1; background: rgba(8,47,73,.3);
        font: inherit; font-weight: 750; cursor: pointer; }
      .errors { color: #fda4af; margin: 8px 2px 0; white-space: pre-wrap; font-size: 10px; }
      .footer { display: flex; align-items: center; justify-content: space-between; gap: 8px;
        padding: 10px 14px 12px; border-top: 1px solid rgba(148,163,184,.08); color: #526d82; }
      kbd { padding: 2px 6px; border: 1px solid rgba(148,163,184,.25); border-radius: 5px;
        color: #9ac1d4; background: rgba(15,23,42,.75);
        font: 800 10px/1.4 Inter,Segoe UI,Arial,sans-serif; }
      .export { border: 0; padding: 5px 7px; color: #668da4; background: transparent;
        font: inherit; font-size: 10px; cursor: pointer; }
    `;
    const panel = documentRef.createElement("section");
    panel.className = "panel";
    const header = documentRef.createElement("header");
    header.className = "header";
    const logo = documentRef.createElement("div");
    logo.className = "logo";
    logo.textContent = "K";
    const heading = documentRef.createElement("div");
    heading.className = "heading";
    const title = documentRef.createElement("h2");
    title.textContent = "KDA";
    const subtitle = documentRef.createElement("div");
    subtitle.className = "subtitle";
    subtitle.textContent = "NPC Automation Console";
    heading.append(title, subtitle);
    const livePill = documentRef.createElement("div");
    livePill.className = "live-pill";
    livePill.textContent = "IDLE";
    header.append(logo, heading, livePill);
    panel.appendChild(header);

    const tabState = createPanelState(["dashboard", "settings"]);
    const tabs = documentRef.createElement("nav");
    tabs.className = "tabs";
    const tabButtons = {};
    for (const [name, text] of [["dashboard", "Dashboard"], ["settings", "Settings"]]) {
      const button = documentRef.createElement("button");
      button.className = "tab";
      button.textContent = text;
      button.dataset.tab = name;
      tabButtons[name] = button;
      tabs.appendChild(button);
    }
    panel.appendChild(tabs);

    const fields = documentRef.createElement("div");
    fields.className = "settings-grid";
    const inputs = {};
    for (const [key, labelText, type] of FIELD_DEFINITIONS) {
      const field = documentRef.createElement("div");
      field.className = "field";
      const label = documentRef.createElement("label");
      label.textContent = labelText;
      const input = documentRef.createElement("input");
      input.type = type;
      input.dataset.setting = key;
      inputs[key] = input;
      field.append(label, input);
      fields.appendChild(field);
    }
    const settingsForm = createSettingsFormState(inputs);

    const makeButton = (text, className, parent) => {
      const button = documentRef.createElement("button");
      button.textContent = text;
      if (className) button.className = className;
      parent.appendChild(button);
      return button;
    };

    const dashboard = documentRef.createElement("div");
    dashboard.className = "view";
    dashboard.dataset.view = "dashboard";
    const modeCard = documentRef.createElement("div");
    modeCard.className = "mode-card";
    const modeIcon = documentRef.createElement("div");
    modeIcon.className = "mode-icon";
    modeIcon.textContent = "◆";
    const modeCopy = documentRef.createElement("div");
    const modeName = documentRef.createElement("div");
    modeName.className = "mode-name";
    const modeReason = documentRef.createElement("div");
    modeReason.className = "mode-reason";
    modeCopy.append(modeName, modeReason);
    modeCard.append(modeIcon, modeCopy);
    dashboard.appendChild(modeCard);

    const controls = documentRef.createElement("div");
    controls.className = "controls";
    const startButton = makeButton("START BOT", "action", controls);
    const stopButton = makeButton("STOP", "action stop", controls);
    dashboard.appendChild(controls);

    const sectionTitle = documentRef.createElement("div");
    sectionTitle.className = "section-title";
    sectionTitle.textContent = "Live telemetry";
    dashboard.appendChild(sectionTitle);
    const status = documentRef.createElement("div");
    status.className = "status-grid";
    const statusValues = {};
    for (const [key, label] of [
      ["adapter", "Adapter"], ["map", "Map"], ["hp", "Hull"],
      ["target", "Target"], ["nearby", "Nearby NPCs"], ["safety", "Safety"]
    ]) {
      const metric = documentRef.createElement("div");
      metric.className = "metric";
      const name = documentRef.createElement("span");
      name.className = "key";
      name.textContent = label;
      const value = documentRef.createElement("span");
      value.className = "value";
      value.textContent = "—";
      statusValues[key] = value;
      metric.append(name, value);
      status.appendChild(metric);
    }
    dashboard.appendChild(status);

    const settingsView = documentRef.createElement("div");
    settingsView.className = "view";
    settingsView.dataset.view = "settings";
    const settingsTitle = documentRef.createElement("div");
    settingsTitle.className = "section-title";
    settingsTitle.textContent = "Combat behaviour";
    settingsView.append(settingsTitle, fields);
    const saveButton = makeButton("SAVE SETTINGS", "action wide", settingsView);

    const errors = documentRef.createElement("div");
    errors.className = "errors";
    settingsView.appendChild(errors);
    panel.append(dashboard, settingsView);

    const footer = documentRef.createElement("footer");
    footer.className = "footer";
    const hint = documentRef.createElement("span");
    hint.append("Toggle menu ");
    const hotkey = documentRef.createElement("kbd");
    hotkey.textContent = "N";
    hint.appendChild(hotkey);
    const exportButton = makeButton("Export data", "export", footer);
    footer.prepend(hint);
    panel.appendChild(footer);
    shadow.append(style, panel);
    const stopMountGuard = keepHostMounted(documentRef, host);

    let lastModel = {};

    function syncPanelState() {
      const current = tabState.read();
      panel.hidden = !current.visible;
      for (const name of Object.keys(tabButtons)) {
        tabButtons[name].classList.toggle("active", current.activeTab === name);
      }
      dashboard.hidden = current.activeTab !== "dashboard";
      settingsView.hidden = current.activeTab !== "settings";
    }

    for (const [name, button] of Object.entries(tabButtons)) {
      button.addEventListener("click", () => {
        tabState.selectTab(name);
        syncPanelState();
      });
    }

    function handleToggle(event) {
      if (!shouldToggleOverlay(event)) return;
      event.preventDefault();
      event.stopPropagation();
      tabState.toggle();
      syncPanelState();
    }
    documentRef.addEventListener("keydown", handleToggle, true);
    syncPanelState();

    startButton.addEventListener("click", () => {
      if (canStartBot(lastModel)) onStart();
    });
    stopButton.addEventListener("click", () => onStop());
    saveButton.addEventListener("click", () => settingsForm.submit(onSave));
    exportButton.addEventListener("click", () => onExport());

    function render(model) {
      lastModel = { ...model };
      settingsForm.sync(model.settings);
      startButton.disabled = !canStartBot(model) || Boolean(model.active);
      stopButton.disabled = !model.active;
      exportButton.disabled = !model.diagnostic && !model.clientSource;
      exportButton.textContent = model.clientSource
        ? "Export client source"
        : "Export data";
      errors.textContent = (model.settingsErrors || []).join("\n");
      const snapshot = model.snapshot;
      modeName.textContent = model.state?.name || "STOPPED";
      modeReason.textContent = model.state?.reason || "Ready";
      livePill.className = model.active ? "live-pill on" : "live-pill";
      livePill.textContent = model.active ? "LIVE" : "IDLE";
      statusValues.adapter.textContent = model.adapterSupported ? "Ready" : "Waiting";
      statusValues.map.textContent = formatMapStatus(snapshot);
      statusValues.hp.textContent = snapshot ? `${snapshot.player.hpPercent}%` : "—";
      statusValues.target.textContent = snapshot?.target ? `${snapshot.target.type}:${snapshot.target.id}` : "none";
      statusValues.nearby.textContent = snapshot ? String(snapshot.entities.filter((e) => e.type === "npc" && e.alive).length) : "—";
      statusValues.safety.textContent = model.active ? "NPC only" : "Stopped";
    }

    function destroy() {
      stopMountGuard();
      documentRef.removeEventListener("keydown", handleToggle, true);
      host.remove();
    }

    return { destroy, readSettings: settingsForm.readSettings, render };
  }

  return {
    canStartBot,
    createExportFile,
    createOverlay,
    createPanelState,
    createSettingsFormState,
    formatMapStatus,
    isSupportedDiagnostic,
    keepHostMounted,
    shouldToggleOverlay,
    whenDocumentReady
  };
});
