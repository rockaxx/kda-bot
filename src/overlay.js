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
  const CKDA_FIELD_DEFINITIONS = Object.freeze([
    ["overlayEnabled", "Marker overlay", "checkbox"],
    ["displayMode", "Display mode", "select"],
    ["shape", "Marker shape", "select"],
    ["allyColor", "Ally colour", "color"],
    ["enemyColor", "Enemy colour", "color"],
    ["sizePx", "Marker size", "number"],
    ["refreshFps", "Marker refresh", "select"],
    ["opacity", "Opacity", "number"],
    ["showEmpCooldown", "Show EMP", "checkbox"],
    ["empCooldownMs", "EMP duration ms", "number"],
    ["showIshCooldown", "Show ISH", "checkbox"],
    ["ishCooldownMs", "ISH duration ms", "number"],
    ["premiumOverride", "Premium override", "checkbox"]
  ]);
  const CKDA_NUMBER_ATTRIBUTES = Object.freeze({
    sizePx: { min: "3", max: "200", step: "1" },
    opacity: { min: "0.1", max: "1", step: "0.1" },
    empCooldownMs: { min: "1000", max: "120000", step: "1000" },
    ishCooldownMs: { min: "1000", max: "120000", step: "1000" }
  });
  const DESIGN_FIELD_DEFINITIONS = Object.freeze([
    ["rankId", "Rank design", "number"],
    ["ringLevel", "Gate rings", "number"],
    ["shipDesign", "Ship design", "select"],
    ["titleText", "Custom title", "text"],
    ["titleColor", "Title colour", "color"]
  ]);
  function canStartBot({ settingsValid, adapterSupported, hasSnapshot }) {
    return Boolean(settingsValid && adapterSupported && hasSnapshot);
  }

  function formatMapStatus(snapshot) {
    return snapshot ? String(snapshot.mapId) : "—";
  }

  function createFormState(inputs, definitions) {
    const dirtyFields = new Set();
    let editRevision = 0;
    for (const [key] of definitions) {
      const markDirty = () => { dirtyFields.add(key); editRevision += 1; };
      inputs[key].addEventListener("input", markDirty);
      inputs[key].addEventListener("change", markDirty);
    }

    function read() {
      const result = {};
      for (const [key, , type] of definitions) {
        if (type === "checkbox") {
          result[key] = Boolean(inputs[key].checked);
          continue;
        }
        const raw = inputs[key].value.trim();
        result[key] = type === "number" || key === "refreshFps" ? Number(raw) : raw;
      }
      return result;
    }

    function sync(settings) {
      if (!settings) return;
      for (const [key, , type] of definitions) {
        if (dirtyFields.has(key)) continue;
        if (type === "checkbox") {
          inputs[key].checked = Boolean(settings[key]);
        } else {
          inputs[key].value = settings[key] === null ? "" : String(settings[key]);
        }
      }
    }

    function submit(onSave) {
      const submittedRevision = editRevision;
      const result = onSave(read());
      function finish(accepted) {
        if (accepted === true && editRevision === submittedRevision) dirtyFields.clear();
        return accepted === true;
      }
      if (result && typeof result.then === "function") return Promise.resolve(result).then(finish, () => false);
      return finish(result);
    }

    return { read, submit, sync };
  }

  function createSettingsFormState(inputs) {
    const form = createFormState(inputs, FIELD_DEFINITIONS);
    return { ...form, readSettings: form.read };
  }

  function createCkdaFormState(inputs) {
    const form = createFormState(inputs, CKDA_FIELD_DEFINITIONS);
    return { ...form, readSettings: form.read };
  }

  function createDesignFormState(inputs) {
    const form = createFormState(inputs, DESIGN_FIELD_DEFINITIONS);
    return { ...form, readSettings: form.read };
  }

  function formatCkdaStatus(status, snapshot) {
    const state = typeof status === "string" ? status : status && status.state;
    if (state === "error") return "C-KDA error";
    if (state === "save-failed") return "C-KDA save failed";
    if (state === "unsupported-client") return "Unsupported client";
    if (snapshot?.premiumState === "active") return "Premium override active";
    if (snapshot?.premiumState === "unsupported") return "Premium override unsupported";
    const labels = {
      ready: "Ready",
      waiting: "Waiting for game",
      "waiting-for-game": "Waiting for game",
      "unsupported-client": "Unsupported client",
      "no-player-data": "No player data",
      "premium-active": "Premium override active",
      "premium-unsupported": "Premium override unsupported"
    };
    if (labels[state]) return labels[state];
    if (!snapshot || snapshot.connectionState !== "connected") return "Waiting for game";
    if (!Array.isArray(snapshot.players) || snapshot.players.length === 0) {
      return "No player data";
    }
    return "Ready";
  }

  function isSupportedDiagnostic(diagnostic) {
    return Boolean(
      diagnostic &&
      diagnostic.patchStatus === "patched"
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

  function createOverlay({
    documentRef,
    onStart,
    onStop,
    onSave,
    onSaveCkda = () => false,
    onPreviewCkda = () => {},
    shipCatalog = [],
    onSaveDesign = () => false,
    onSaveLoadingImage = () => false,
    onResetLoadingImage = () => false,
    onCkdaCommand = () => {},
    onExport
  }) {
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
        border: 1px solid rgba(244,63,94,.38); border-radius: 18px;
        background: linear-gradient(145deg,rgba(24,5,11,.98),rgba(6,2,5,.99));
        color: #fff1f2; font: 12px/1.4 Inter,Segoe UI,Arial,sans-serif;
        box-shadow: 0 24px 70px rgba(0,0,0,.68), 0 0 28px rgba(127,29,29,.18), inset 0 1px rgba(255,255,255,.04);
        backdrop-filter: blur(18px); }
      .header { display: flex; align-items: center; gap: 11px; padding: 16px 16px 13px;
        background: radial-gradient(circle at 18% 0%,rgba(225,29,72,.23),transparent 58%); }
      .logo { width: 39px; height: 39px; display: grid; place-items: center; flex: none;
        border: 1px solid rgba(251,113,133,.58); border-radius: 12px;
        background: linear-gradient(145deg,#dc2626,#450a0a); color: white;
        font-size: 18px; font-weight: 900; box-shadow: 0 0 25px rgba(225,29,72,.33); }
      .heading { min-width: 0; flex: 1; }
      h2 { margin: 0; color: #fff1f2; font-size: 18px; line-height: 1.05;
        letter-spacing: .16em; font-weight: 850; }
      .subtitle { margin-top: 4px; color: #a9777f; font-size: 10px; letter-spacing: .08em;
        text-transform: uppercase; }
      .live-pill { display: flex; align-items: center; gap: 6px; padding: 5px 8px;
        border: 1px solid rgba(148,163,184,.18); border-radius: 999px;
        color: #a78b91; background: rgba(28,7,12,.78); font-size: 9px; font-weight: 800; }
      .live-pill::before { content: ''; width: 7px; height: 7px; border-radius: 50%;
        background: #7f6066; box-shadow: 0 0 0 3px rgba(127,96,102,.12); }
      .live-pill.on { color: #fda4af; border-color: rgba(244,63,94,.32); }
      .live-pill.on::before { background: #f43f5e; box-shadow: 0 0 10px #e11d48; }
      .tabs { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 5px; margin: 0 14px;
        padding: 4px; border: 1px solid rgba(148,163,184,.1); border-radius: 11px;
        background: rgba(12,3,7,.68); }
      .tab { padding: 8px; border: 0; border-radius: 8px; color: #9b7279;
        background: transparent; font: inherit; font-weight: 750; cursor: pointer; }
      .tab.active { color: #fff1f2; background: linear-gradient(135deg,rgba(190,18,60,.45),rgba(69,10,10,.55));
        box-shadow: inset 0 0 0 1px rgba(251,113,133,.16), 0 5px 16px rgba(127,29,29,.18); }
      .view { padding: 14px; }
      .mode-card { display: flex; align-items: center; gap: 12px; padding: 13px;
        border: 1px solid rgba(244,63,94,.2); border-radius: 13px;
        background: linear-gradient(135deg,rgba(136,19,55,.2),rgba(23,4,9,.5)); }
      .mode-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px;
        color: #fb7185; background: rgba(225,29,72,.13); font-size: 16px; }
      .mode-name { font-size: 13px; font-weight: 800; color: #fff1f2; overflow-wrap: anywhere; }
      .mode-reason { color: #a4777f; font-size: 10px; overflow-wrap: anywhere; }
      .ckda-mascot { position: fixed; z-index: 2147483647; top: -6px; right: 340px;
        width: 64px; height: 44px; object-fit: contain; pointer-events: none;
        filter: drop-shadow(0 4px 7px rgba(0,0,0,.7)) drop-shadow(0 0 7px rgba(225,29,72,.45)); }
      .ckda-visual { display: flex; align-items: center; gap: 10px; margin-bottom: 11px;
        padding: 9px 10px; border: 1px solid rgba(244,63,94,.16); border-radius: 11px;
        background: rgba(29,7,13,.54); color: #a4777f; font-size: 10px; }
      .controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 11px 0; }
      button.action { min-height: 39px; border: 0; border-radius: 10px; cursor: pointer;
        color: white; font: inherit; font-weight: 850; letter-spacing: .03em;
        background: linear-gradient(135deg,#e11d48,#991b1b); box-shadow: 0 8px 20px rgba(190,18,60,.26); }
      button.action.stop { background: linear-gradient(135deg,#7f1d1d,#3f0808);
        box-shadow: 0 8px 18px rgba(69,10,10,.34); }
      button:disabled { opacity: .34; cursor: not-allowed; filter: saturate(.35); box-shadow: none; }
      .section-title { margin: 13px 2px 8px; color: #96636d; font-size: 9px;
        font-weight: 850; letter-spacing: .16em; text-transform: uppercase; }
      .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
      .metric { min-height: 57px; padding: 9px 10px; border: 1px solid rgba(148,163,184,.1);
        border-radius: 11px; background: rgba(29,7,13,.54); }
      .key { display: block; color: #875e66; font-size: 9px; font-weight: 750;
        letter-spacing: .08em; text-transform: uppercase; }
      .value { display: block; margin-top: 4px; color: #ffe4e6; font-size: 12px;
        font-weight: 700; overflow-wrap: anywhere; }
      .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
      .field { display: flex; flex-direction: column; gap: 5px; }
      label { color: #a77b83; font-size: 10px; font-weight: 700; }
      input, select { width: 100%; border: 1px solid rgba(159,73,88,.32); border-radius: 9px;
        outline: none; background: rgba(15,3,7,.82); color: #fff1f2; padding: 8px 9px;
        font: 700 12px/1.2 Inter,Segoe UI,Arial,sans-serif; transition: border-color .15s,box-shadow .15s; }
      input:focus, select:focus { border-color: #f43f5e; box-shadow: 0 0 0 3px rgba(244,63,94,.12); }
      input[type="checkbox"] { width: auto; min-width: 18px; min-height: 18px; accent-color: #e11d48; }
      input[type="color"] { min-height: 35px; padding: 3px; cursor: pointer; }
      .toggle-field { flex-direction: row; align-items: center; justify-content: space-between;
        padding: 8px 9px; border: 1px solid rgba(159,73,88,.2); border-radius: 9px;
        background: rgba(15,3,7,.44); }
      .wide { grid-column: 1/-1; }
      .secondary { width: 100%; min-height: 36px; border: 1px solid rgba(244,63,94,.22);
        border-radius: 10px; color: #fda4af; background: rgba(76,5,25,.34);
        font: inherit; font-weight: 750; cursor: pointer; }
      .errors { color: #fda4af; margin: 8px 2px 0; white-space: pre-wrap; font-size: 10px; }
      .footer { display: flex; align-items: center; justify-content: space-between; gap: 8px;
        padding: 10px 14px 12px; border-top: 1px solid rgba(244,63,94,.1); color: #79545b; }
      kbd { padding: 2px 6px; border: 1px solid rgba(148,163,184,.25); border-radius: 5px;
        color: #fda4af; background: rgba(48,7,17,.78);
        font: 800 10px/1.4 Inter,Segoe UI,Arial,sans-serif; }
      .export { border: 0; padding: 5px 7px; color: #a36d77; background: transparent;
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
    subtitle.textContent = "Visual Customization Console";
    heading.append(title, subtitle);
    const livePill = documentRef.createElement("div");
    livePill.className = "live-pill";
    livePill.textContent = "VISUAL";
    header.append(logo, heading, livePill);
    panel.appendChild(header);

    const tabState = createPanelState(["ckda", "design"]);
    const tabs = documentRef.createElement("nav");
    tabs.className = "tabs";
    const tabButtons = {};
    for (const [name, text] of [["ckda", "C-KDA"], ["design", "Design"]]) {
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

    const ckdaFields = documentRef.createElement("div");
    ckdaFields.className = "settings-grid";
    const ckdaInputs = {};
    for (const [key, labelText, type] of CKDA_FIELD_DEFINITIONS) {
      const field = documentRef.createElement("div");
      field.className = type === "checkbox" ? "field toggle-field" : "field";
      const label = documentRef.createElement("label");
      label.textContent = labelText;
      const input = type === "select"
        ? documentRef.createElement("select")
        : documentRef.createElement("input");
      if (type === "select") {
        const options = key === "displayMode"
          ? [["masked-only", "Masked only"], ["all", "All players"]]
          : key === "refreshFps"
            ? [["30", "30 FPS"], ["60", "60 FPS"], ["120", "120 FPS"],
              ["240", "240 FPS"], ["360", "360 FPS"]]
            : [["circle", "Circle"], ["square", "Square"], ["triangle", "Triangle"], ["plus", "Plus"], ["star", "Star"]];
        for (const [value, text] of options) {
          const option = documentRef.createElement("option");
          option.value = value;
          option.textContent = text;
          input.appendChild(option);
        }
      } else {
        input.type = type;
        if (type === "number") Object.assign(input, CKDA_NUMBER_ATTRIBUTES[key]);
      }
      input.id = `sa-ckda-${key}`;
      label.htmlFor = input.id;
      input.dataset.ckdaSetting = key;
      ckdaInputs[key] = input;
      field.append(label, input);
      ckdaFields.appendChild(field);
    }
    const ckdaForm = createCkdaFormState(ckdaInputs);
    const previewCkda = () => onPreviewCkda(ckdaForm.readSettings());
    for (const input of Object.values(ckdaInputs)) {
      input.addEventListener("input", previewCkda);
      input.addEventListener("change", previewCkda);
    }

    const designInputs = {};
    const rankSelect = documentRef.createElement("select");
    rankSelect.id = "sa-design-rankId";
    rankSelect.dataset.designSetting = "rankId";
    for (let rankId = 0; rankId <= 20; rankId += 1) {
      const option = documentRef.createElement("option");
      option.value = String(rankId);
      option.textContent = rankId === 0 ? "Default game rank" : `Rank ${rankId}`;
      rankSelect.appendChild(option);
    }
    designInputs.rankId = rankSelect;
    const ringSelect = documentRef.createElement("select");
    ringSelect.id = "sa-design-ringLevel";
    ringSelect.dataset.designSetting = "ringLevel";
    designInputs.ringLevel = ringSelect;
    const shipDesignSelect = documentRef.createElement("select");
    shipDesignSelect.id = "sa-design-shipDesign";
    shipDesignSelect.dataset.designSetting = "shipDesign";
    const shipCategorySelect = documentRef.createElement("select");
    shipCategorySelect.id = "sa-design-shipCategory";
    shipCategorySelect.dataset.designSetting = "shipCategory";
    function addOption(select, value, label) {
      const option = documentRef.createElement("option");
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
      return option;
    }
    addOption(ringSelect, "0", "Current game rings");
    for (let level = 1; level <= 6; level += 1) {
      addOption(ringSelect, String(level), "Ring " + level);
    }
    addOption(ringSelect, "7", "Crown");
    addOption(shipDesignSelect, "default", "Current ship design");
    addOption(shipCategorySelect, "", "All designs");
    const categories = [...new Set(shipCatalog.map(entry => entry.category))].sort();
    for (const category of categories.filter(value => value !== "Other")) {
      addOption(shipCategorySelect, category, category + " designs");
    }
    if (categories.includes("Other")) addOption(shipCategorySelect, "Other", "Other");
    shipCategorySelect.value = "";
    const shipOptions = shipCatalog.map(entry => ({
      ...entry, option: addOption(shipDesignSelect, entry.value, entry.label)
    }));
    designInputs.shipDesign = shipDesignSelect;
    const titleTextInput = documentRef.createElement("input");
    titleTextInput.type = "text";
    titleTextInput.maxLength = 40;
    titleTextInput.placeholder = "Blank uses game title";
    const titleColorInput = documentRef.createElement("input");
    titleColorInput.type = "color";
    designInputs.titleText = titleTextInput;
    designInputs.titleColor = titleColorInput;
    const designForm = createDesignFormState(designInputs);
    function filterShipOptions() {
      const category = shipCategorySelect.value;
      for (const entry of shipOptions) {
        const hidden = Boolean(category && entry.category !== category && entry.value !== shipDesignSelect.value);
        if (entry.option.hidden !== hidden) entry.option.hidden = entry.option.disabled = hidden;
      }
    }
    shipCategorySelect.addEventListener("change", filterShipOptions);
    shipDesignSelect.addEventListener("change", filterShipOptions);

    const makeButton = (text, className, parent) => {
      const button = documentRef.createElement("button");
      button.textContent = text;
      if (className) button.className = className;
      parent.appendChild(button);
      return button;
    };

    const dashboard = documentRef.createElement("div");
    dashboard.className = "view";
    dashboard.dataset.view = "bot";
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

    const ckdaView = documentRef.createElement("div");
    ckdaView.className = "view";
    ckdaView.dataset.view = "ckda";
    const ckdaImage = documentRef.createElement("img");
    ckdaImage.className = "ckda-mascot";
    ckdaImage.alt = "C-KDA";
    let ckdaImageFailed = false;
    const ckdaAssetUrl = typeof chrome !== "undefined" && chrome.runtime &&
      typeof chrome.runtime.getURL === "function"
      ? chrome.runtime.getURL("assets/c-kda.gif")
      : "";
    if (ckdaAssetUrl) {
      ckdaImage.src = ckdaAssetUrl;
    } else {
      ckdaImage.hidden = true;
    }
    ckdaImage.addEventListener("error", () => {
      ckdaImageFailed = true;
      ckdaImage.hidden = true;
    });
    const ckdaTitle = documentRef.createElement("div");
    ckdaTitle.className = "section-title";
    ckdaTitle.textContent = "Player marker controls";
    ckdaView.append(ckdaTitle, ckdaFields);
    const ckdaControls = documentRef.createElement("div");
    ckdaControls.className = "controls";
    const saveCkdaButton = makeButton("SAVE C-KDA", "action", ckdaControls);
    const clearCkdaButton = makeButton("CLEAR MARKERS", "secondary", ckdaControls);
    ckdaView.appendChild(ckdaControls);
    const ckdaStatusTitle = documentRef.createElement("div");
    ckdaStatusTitle.className = "section-title";
    ckdaStatusTitle.textContent = "C-KDA status";
    ckdaView.appendChild(ckdaStatusTitle);
    const ckdaStatusGrid = documentRef.createElement("div");
    ckdaStatusGrid.className = "status-grid";
    const ckdaStatusValues = {};
    for (const [key, label] of [
      ["support", "Adapter"], ["tracked", "Tracked"], ["state", "Status"]
    ]) {
      const metric = documentRef.createElement("div");
      metric.className = "metric";
      if (key === "state") metric.classList.add("wide");
      const name = documentRef.createElement("span");
      name.className = "key";
      name.textContent = label;
      const value = documentRef.createElement("span");
      value.className = "value";
      value.textContent = "—";
      ckdaStatusValues[key] = value;
      metric.append(name, value);
      ckdaStatusGrid.appendChild(metric);
    }
    ckdaView.appendChild(ckdaStatusGrid);

    const designView = documentRef.createElement("div");
    designView.className = "view";
    designView.dataset.view = "design";
    const designTitle = documentRef.createElement("div");
    designTitle.className = "section-title";
    designTitle.textContent = "Ship appearance";
    const designFields = documentRef.createElement("div");
    designFields.className = "settings-grid";
    const rankField = documentRef.createElement("div");
    rankField.className = "field";
    const rankLabel = documentRef.createElement("label");
    rankLabel.textContent = "Hero rank";
    rankLabel.htmlFor = rankSelect.id;
    rankField.append(rankLabel, rankSelect);
    designFields.appendChild(rankField);
    const ringField = documentRef.createElement("div");
    ringField.className = "field";
    const ringLabel = documentRef.createElement("label");
    ringLabel.htmlFor = ringSelect.id;
    ringLabel.textContent = "Gate rings";
    ringField.append(ringLabel, ringSelect);
    designFields.appendChild(ringField);
    const categoryField = documentRef.createElement("div");
    categoryField.className = "field wide";
    const categoryLabel = documentRef.createElement("label");
    categoryLabel.htmlFor = shipCategorySelect.id;
    categoryLabel.textContent = "Ship category";
    categoryField.append(categoryLabel, shipCategorySelect);
    designFields.appendChild(categoryField);
    const shipField = documentRef.createElement("div");
    shipField.className = "field wide";
    const shipLabel = documentRef.createElement("label");
    shipLabel.textContent = "Active ship appearance";
    shipLabel.htmlFor = shipDesignSelect.id;
    shipField.append(shipLabel, shipDesignSelect);
    designFields.appendChild(shipField);
    for (const [key, labelText] of DESIGN_FIELD_DEFINITIONS.slice(3)) {
      const input = designInputs[key];
      input.id = "sa-design-" + key;
      input.dataset.designSetting = key;
      const field = documentRef.createElement("div");
      field.className = "field";
      const label = documentRef.createElement("label");
      label.htmlFor = input.id;
      label.textContent = labelText;
      field.append(label, input);
      designFields.appendChild(field);
    }
    const loadingField = documentRef.createElement("div");
    loadingField.className = "field wide";
    const loadingLabel = documentRef.createElement("label");
    loadingLabel.textContent = "Loading image (GIF, PNG, JPEG)";
    const loadingImageInput = documentRef.createElement("input");
    loadingImageInput.id = "sa-design-loadingImage";
    loadingImageInput.type = "file";
    loadingImageInput.accept = ".gif,.png,.jpg,.jpeg,image/gif,image/png,image/jpeg";
    loadingImageInput.dataset.designSetting = "loadingImage";
    loadingLabel.htmlFor = loadingImageInput.id;
    loadingField.append(loadingLabel, loadingImageInput);
    designFields.appendChild(loadingField);
    const designNote = documentRef.createElement("div");
    designNote.className = "ckda-visual";
    designNote.textContent = "Appearance changes apply locally on save. Loading image applies after reload.";
    const loadingImageStatus = documentRef.createElement("div");
    loadingImageStatus.className = "mode-reason";
    loadingImageStatus.textContent = "Besto GIF (default)";
    const loadingControls = documentRef.createElement("div");
    loadingControls.className = "controls";
    const uploadLoadingButton = makeButton("UPLOAD LOADING", "action", loadingControls);
    const resetLoadingButton = makeButton("DEFAULT BESTO", "secondary", loadingControls);
    const saveDesignButton = makeButton("SAVE DESIGN", "action wide", designView);
    designView.prepend(designTitle, designFields, designNote, loadingImageStatus, loadingControls);
    panel.append(ckdaView, designView);

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
    shadow.append(style, panel, ckdaImage);
    const stopMountGuard = keepHostMounted(documentRef, host);

    let lastModel = {};

    function syncPanelState() {
      const current = tabState.read();
      panel.hidden = !current.visible;
      ckdaImage.hidden = !current.visible || !ckdaAssetUrl || ckdaImageFailed;
      for (const name of Object.keys(tabButtons)) {
        tabButtons[name].classList.toggle("active", current.activeTab === name);
      }
      ckdaView.hidden = current.activeTab !== "ckda";
      designView.hidden = current.activeTab !== "design";
    }

    for (const [name, button] of Object.entries(tabButtons)) {
      button.addEventListener("click", () => {
        tabState.selectTab(name);
        syncPanelState();
      });
    }

    function handleToggle(event) {
      if (shadow.activeElement === titleTextInput) return;
      if (!shouldToggleOverlay(event)) return;
      event.preventDefault();
      event.stopPropagation();
      tabState.toggle();
      syncPanelState();
    }
    documentRef.addEventListener("keydown", handleToggle, true);
    for (const type of ["keydown", "keyup", "keypress"]) {
      titleTextInput.addEventListener(type, event => event.stopPropagation());
    }
    syncPanelState();

    startButton.addEventListener("click", () => {
      if (canStartBot(lastModel)) onStart();
    });
    stopButton.addEventListener("click", () => onStop());
    saveButton.addEventListener("click", () => settingsForm.submit(onSave));
    saveCkdaButton.addEventListener("click", () => ckdaForm.submit(onSaveCkda));
    saveDesignButton.addEventListener("click", () => designForm.submit(onSaveDesign));
    uploadLoadingButton.addEventListener("click", () => {
      const file = loadingImageInput.files?.[0];
      if (file) onSaveLoadingImage(file);
    });
    resetLoadingButton.addEventListener("click", () => onResetLoadingImage());
    clearCkdaButton.addEventListener("click", () => onCkdaCommand("clear"));
    exportButton.addEventListener("click", () => onExport());

    function render(model) {
      lastModel = { ...model };
      settingsForm.sync(model.settings);
      ckdaForm.sync(model.ckdaSettings);
      const previousShip = shipDesignSelect.value;
      designForm.sync(model.designSettings);
      if (shipDesignSelect.value !== previousShip) filterShipOptions();
      loadingImageStatus.textContent = model.loadingImageName || "Besto GIF (default)";
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
      const ckdaSnapshot = model.ckdaSnapshot;
      ckdaStatusValues.support.textContent = ckdaSnapshot ? "Ready" : "Waiting";
      ckdaStatusValues.tracked.textContent = Array.isArray(ckdaSnapshot?.players)
        ? String(ckdaSnapshot.players.length)
        : "—";
      ckdaStatusValues.state.textContent = formatCkdaStatus(model.ckdaStatus, ckdaSnapshot);
    }

    function destroy() {
      stopMountGuard();
      documentRef.removeEventListener("keydown", handleToggle, true);
      host.remove();
    }

    return {
      destroy,
      readCkdaSettings: ckdaForm.readSettings,
      readDesignSettings: designForm.readSettings,
      readSettings: settingsForm.readSettings,
      render
    };
  }

  return {
    canStartBot,
    createExportFile,
    createOverlay,
    createCkdaFormState,
    createDesignFormState,
    createPanelState,
    createSettingsFormState,
    formatCkdaStatus,
    formatMapStatus,
    isSupportedDiagnostic,
    keepHostMounted,
    shouldToggleOverlay,
    whenDocumentReady
  };
});
