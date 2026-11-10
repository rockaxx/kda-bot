const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canStartBot,
  createCkdaFormState,
  createDesignFormState,
  createOverlay,
  createSettingsFormState,
  createExportFile,
  formatCkdaStatus,
  formatMapStatus,
  isSupportedDiagnostic,
  keepHostMounted,
  createPanelState,
  shouldToggleOverlay,
  whenDocumentReady
} = require("../src/overlay.js");

function createOverlayDocument() {
  const elements = [];
  function createElement(tagName) {
    const classes = new Set();
    const element = {
      children: [],
      classList: {
        add(name) { classes.add(name); },
        toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }
      },
      dataset: {},
      isConnected: false,
      listeners: {},
      style: {},
      tagName: tagName.toUpperCase(),
      addEventListener(name, handler) { this.listeners[name] = handler; },
      append(...values) { values.forEach((value) => this.appendChild(value)); },
      prepend(...values) {
        values.reverse().forEach((value) => {
          if (value && typeof value === "object") value.parentNode = this;
          this.children.unshift(value);
        });
      },
      appendChild(value) {
        if (value && typeof value === "object") value.parentNode = this;
        this.children.push(value);
        return value;
      },
      attachShadow() {
        return { append(...values) { this.children = values; } };
      },
      remove() { this.removed = true; }
    };
    elements.push(element);
    return element;
  }

  return {
    elements,
    documentRef: {
      body: {
        appendChild(element) {
          element.isConnected = true;
          this.child = element;
        }
      },
      createElement,
      documentElement: {},
      addEventListener() {},
      removeEventListener() {}
    }
  };
}

test("plain N toggles panel but typing and modified shortcuts do not", () => {
  assert.equal(shouldToggleOverlay({ code: "KeyN", repeat: false, target: { tagName: "DIV" } }), true);
  assert.equal(shouldToggleOverlay({ code: "KeyN", repeat: true, target: { tagName: "DIV" } }), false);
  assert.equal(shouldToggleOverlay({ code: "KeyN", ctrlKey: true, target: { tagName: "DIV" } }), false);
  assert.equal(shouldToggleOverlay({ code: "KeyN", target: { tagName: "INPUT" } }), false);
  assert.equal(shouldToggleOverlay({ code: "KeyN", target: { tagName: "TEXTAREA" } }), false);
  assert.equal(shouldToggleOverlay({ code: "KeyN", target: { isContentEditable: true, tagName: "DIV" } }), false);
  assert.equal(shouldToggleOverlay({
    code: "KeyN",
    target: { tagName: "SA-BOT-ROOT" },
    composedPath: () => [{ tagName: "INPUT" }, { tagName: "SA-BOT-ROOT" }]
  }), false);
  assert.equal(shouldToggleOverlay({ code: "KeyM", target: { tagName: "DIV" } }), false);
});

test("panel state toggles visibility and selects only known tabs", () => {
  const state = createPanelState(["bot", "ckda", "settings"]);
  assert.deepEqual(state.read(), { visible: true, activeTab: "bot" });
  state.toggle();
  assert.deepEqual(state.read(), { visible: false, activeTab: "bot" });
  assert.equal(state.selectTab("ckda"), true);
  assert.deepEqual(state.read(), { visible: false, activeTab: "ckda" });
  assert.equal(state.selectTab("settings"), true);
  assert.deepEqual(state.read(), { visible: false, activeTab: "settings" });
  assert.equal(state.selectTab("unknown"), false);
  assert.deepEqual(state.read(), { visible: false, activeTab: "settings" });
});

test("Design Mode rank selector reads numeric rank IDs", () => {
  const listeners = {};
  const input = {
    value: "",
    addEventListener(name, handler) { listeners[name] = handler; }
  };
  const shipInput = { value: "", addEventListener() {} };
  const form = createDesignFormState({ rankId: input, shipDesign: shipInput });
  form.sync({ rankId: 0, shipDesign: "bastion" });
  assert.equal(input.value, "0");
  input.value = "20";
  listeners.change();
  let submitted;
  form.submit((value) => { submitted = value; return true; });
  assert.deepEqual(submitted, { rankId: 20, shipDesign: "bastion" });
});

test("Design Mode exposes active-ship default and Goliath design list", () => {
  const originalObserver = global.MutationObserver;
  global.MutationObserver = class { observe() {} disconnect() {} };
  try {
    const { documentRef, elements } = createOverlayDocument();
    const overlay = createOverlay({ documentRef });
    const select = elements.find(element => element.dataset.designSetting === "shipDesign");
    const options = select.children.map(option => [option.value, option.textContent]);
    assert.deepEqual(options.slice(0, 3), [
      ["default", "Current ship design"], ["enforcer", "Goliath Enforcer"], ["bastion", "Goliath Bastion"]
    ]);
    assert.ok(options.some(([value]) => value === "surgeon"));
    assert.ok(options.some(([value]) => value === "regalia"));
    assert.ok(options.length >= 20);
    overlay.destroy();
  } finally {
    global.MutationObserver = originalObserver;
  }
});

test("Design Mode exposes GIF PNG JPEG loading upload and default reset", async () => {
  const originalObserver = global.MutationObserver;
  global.MutationObserver = class { observe() {} disconnect() {} };
  const calls = [];
  try {
    const { documentRef, elements } = createOverlayDocument();
    const overlay = createOverlay({
      documentRef,
      onSaveLoadingImage(file) { calls.push(["upload", file]); return true; },
      onResetLoadingImage() { calls.push(["reset"]); return true; }
    });
    const input = elements.find(element => element.dataset.designSetting === "loadingImage");
    assert.equal(input.type, "file");
    assert.equal(input.accept, ".gif,.png,.jpg,.jpeg,image/gif,image/png,image/jpeg");
    const file = { name: "custom.gif", type: "image/gif" };
    input.files = [file];
    elements.find(element => element.textContent === "UPLOAD LOADING").listeners.click();
    elements.find(element => element.textContent === "DEFAULT BESTO").listeners.click();
    assert.deepEqual(calls, [["upload", file], ["reset"]]);
    overlay.destroy();
  } finally {
    global.MutationObserver = originalObserver;
  }
});

test("visible menu contains only C-KDA and Design tabs", () => {
  const originalObserver = global.MutationObserver;
  global.MutationObserver = class { observe() {} disconnect() {} };
  try {
    const { documentRef, elements } = createOverlayDocument();
    const overlay = createOverlay({ documentRef });
    const tabs = elements.find(element => element.tagName === "NAV");
    assert.deepEqual(tabs.children.map(button => [button.dataset.tab, button.textContent]), [
      ["ckda", "C-KDA"], ["design", "Design"]
    ]);
    const design = elements.find(element => element.dataset.view === "design");
    assert.ok(design);
    assert.equal(elements.find(element => element.dataset.view === "bot")?.parentNode, undefined);
    assert.equal(elements.find(element => element.dataset.view === "settings")?.parentNode, undefined);
    overlay.destroy();
  } finally {
    global.MutationObserver = originalObserver;
  }
});

test("C-KDA drafts survive telemetry renders until successful save", () => {
  const listeners = {};
  const inputs = {};
  for (const [key, type] of [
    ["overlayEnabled", "checkbox"], ["displayMode", "select"], ["shape", "select"],
    ["allyColor", "color"], ["enemyColor", "color"], ["sizePx", "number"],
    ["refreshFps", "select"],
    ["opacity", "number"], ["showEmpCooldown", "checkbox"],
    ["showIshCooldown", "checkbox"], ["empCooldownMs", "number"],
    ["ishCooldownMs", "number"], ["premiumOverride", "checkbox"]
  ]) {
    inputs[key] = {
      checked: false,
      type,
      value: "",
      addEventListener(name, handler) { listeners[`${key}:${name}`] = handler; }
    };
  }
  const form = createCkdaFormState(inputs);
  const persisted = {
    overlayEnabled: true,
    displayMode: "masked-only",
    shape: "circle",
    allyColor: "#45d483",
    enemyColor: "#ff394f",
    sizePx: 8,
    refreshFps: 60,
    opacity: 0.9,
    showEmpCooldown: true,
    showIshCooldown: true,
    empCooldownMs: 28000,
    ishCooldownMs: 28000,
    premiumOverride: false
  };

  form.sync(persisted);
  inputs.allyColor.value = "#abcdef";
  inputs.sizePx.value = "14";
  inputs.shape.value = "star";
  listeners["allyColor:input"]();
  listeners["sizePx:input"]();
  listeners["shape:change"]();

  form.sync({ ...persisted, allyColor: "#ffffff", sizePx: 9, shape: "square" });
  assert.equal(inputs.allyColor.value, "#abcdef");
  assert.equal(inputs.sizePx.value, "14");
  assert.equal(inputs.shape.value, "star");

  let submitted;
  form.submit((value) => {
    submitted = value;
    return true;
  });
  assert.deepEqual(
    { allyColor: submitted.allyColor, sizePx: submitted.sizePx, shape: submitted.shape },
    { allyColor: "#abcdef", sizePx: 14, shape: "star" }
  );
  form.sync({ ...persisted, allyColor: "#aabbcc", sizePx: 15, shape: "plus" });
  assert.equal(inputs.allyColor.value, "#aabbcc");
  assert.equal(inputs.sizePx.value, "15");
  assert.equal(inputs.shape.value, "plus");
});

test("C-KDA async save preserves rejected and newer drafts and clears only confirmed drafts", async () => {
  const defaults = require("../src/ckda-settings.js").CKDA_DEFAULT_SETTINGS;
  const listeners = {};
  const inputs = Object.fromEntries(Object.keys(defaults).map(key => [key, {
    checked: false, value: "",
    addEventListener(name, fn) { listeners[`${key}:${name}`] = fn; }
  }]));
  const form = createCkdaFormState(inputs);
  form.sync(defaults);
  inputs.sizePx.value = "11";
  listeners["sizePx:input"]();
  await form.submit(() => Promise.resolve(false));
  form.sync(defaults);
  assert.equal(inputs.sizePx.value, "11");
  await form.submit(() => Promise.resolve(true));
  form.sync(defaults);
  assert.equal(inputs.sizePx.value, "8");
  inputs.sizePx.value = "12";
  listeners["sizePx:input"]();
  let complete;
  const pending = form.submit(() => new Promise(resolve => { complete = resolve; }));
  inputs.sizePx.value = "13";
  listeners["sizePx:input"]();
  complete(true);
  await pending;
  form.sync(defaults);
  assert.equal(inputs.sizePx.value, "13");
});

test("C-KDA status uses compact human-readable labels", () => {
  assert.equal(formatCkdaStatus("ready"), "Ready");
  assert.equal(formatCkdaStatus("waiting-for-game"), "Waiting for game");
  assert.equal(formatCkdaStatus("unsupported-client"), "Unsupported client");
  assert.equal(formatCkdaStatus("no-player-data"), "No player data");
  assert.equal(formatCkdaStatus("premium-active"), "Premium override active");
  assert.equal(formatCkdaStatus("premium-unsupported"), "Premium override unsupported");
});

test("C-KDA Premium snapshot state outranks ready and no-player-data status", () => {
  const activeSnapshot = { connectionState: "connected", premiumState: "active", players: [] };
  const unsupportedSnapshot = { connectionState: "connected", premiumState: "unsupported", players: [] };
  assert.equal(formatCkdaStatus("ready", activeSnapshot), "Premium override active");
  assert.equal(formatCkdaStatus("no-player-data", activeSnapshot), "Premium override active");
  assert.equal(formatCkdaStatus("ready", unsupportedSnapshot), "Premium override unsupported");
  assert.equal(formatCkdaStatus("no-player-data", unsupportedSnapshot), "Premium override unsupported");
});

test("C-KDA failure labels stay visible above stale Premium snapshot state", () => {
  const activeSnapshot = { connectionState: "connected", premiumState: "active", players: [] };
  assert.equal(formatCkdaStatus({ state: "error" }, activeSnapshot), "C-KDA error");
  assert.equal(formatCkdaStatus({ state: "save-failed" }, activeSnapshot), "C-KDA save failed");
  assert.equal(formatCkdaStatus({ state: "unsupported-client" }, activeSnapshot), "Unsupported client");
});

test("overlay renders C-KDA failures in the visible status metric", () => {
  const originalObserver = global.MutationObserver;
  global.MutationObserver = class { observe() {} disconnect() {} };
  try {
    const { documentRef, elements } = createOverlayDocument();
    const overlay = createOverlay({ documentRef });
    const statusLabel = elements.find(element => element.textContent === "Status");
    const statusValue = statusLabel.parentNode.children[1];
    for (const [state, label] of [["error", "C-KDA error"], ["save-failed", "C-KDA save failed"], ["unsupported-client", "Unsupported client"]]) {
      overlay.render({ ckdaStatus: { state }, ckdaSnapshot: { premiumState: "active", players: [] } });
      assert.equal(statusValue.textContent, label);
    }
    overlay.destroy();
  } finally {
    global.MutationObserver = originalObserver;
  }
});

test("C-KDA controls bind every label and expose schema-aligned numeric bounds", () => {
  const originalObserver = global.MutationObserver;
  global.MutationObserver = class { observe() {} disconnect() {} };
  try {
    const { documentRef, elements } = createOverlayDocument();
    const overlay = createOverlay({
      documentRef,
      onStart() {},
      onStop() {},
      onSave() { return true; },
      onExport() {}
    });
    const controls = elements.filter((element) => element.dataset.ckdaSetting);
    assert.equal(controls.length, 13);
    for (const control of controls) {
      assert.ok(control.id, `${control.dataset.ckdaSetting} needs an id`);
      assert.ok(
        elements.some((element) => element.tagName === "LABEL" && element.htmlFor === control.id),
        `${control.dataset.ckdaSetting} needs an associated label`
      );
    }
    assert.deepEqual(
      Object.fromEntries(
        controls.filter((control) => control.type === "number").map((control) => [
          control.dataset.ckdaSetting,
          { min: control.min, max: control.max, step: control.step }
        ])
      ),
      {
        sizePx: { min: "3", max: "200", step: "1" },
        opacity: { min: "0.1", max: "1", step: "0.1" },
        empCooldownMs: { min: "1000", max: "120000", step: "1000" },
        ishCooldownMs: { min: "1000", max: "120000", step: "1000" }
      }
    );
    const refreshFps = controls.find(control => control.dataset.ckdaSetting === "refreshFps");
    assert.deepEqual(refreshFps.children.map(option => [option.value, option.textContent]), [
      ["30", "30 FPS"],
      ["60", "60 FPS"],
      ["120", "120 FPS"],
      ["240", "240 FPS"],
      ["360", "360 FPS"]
    ]);
    overlay.destroy();
  } finally {
    global.MutationObserver = originalObserver;
  }
});

test("C-KDA marker controls preview immediately without requiring save", () => {
  const originalObserver = global.MutationObserver;
  global.MutationObserver = class { observe() {} disconnect() {} };
  const previews = [];
  try {
    const { documentRef, elements } = createOverlayDocument();
    const overlay = createOverlay({
      documentRef,
      onPreviewCkda(value) { previews.push(value); }
    });
    const defaults = require("../src/ckda-settings.js").CKDA_DEFAULT_SETTINGS;
    for (const input of elements.filter(element => element.dataset.ckdaSetting)) {
      const value = defaults[input.dataset.ckdaSetting];
      if (input.type === "checkbox") input.checked = value;
      else input.value = String(value);
    }
    const displayMode = elements.find(element => element.dataset.ckdaSetting === "displayMode");
    const overlayEnabled = elements.find(element => element.dataset.ckdaSetting === "overlayEnabled");
    displayMode.value = "all";
    overlayEnabled.checked = true;
    displayMode.listeners.change();

    assert.equal(previews.at(-1).displayMode, "all");
    assert.equal(previews.at(-1).overlayEnabled, true);
    overlay.destroy();
  } finally {
    global.MutationObserver = originalObserver;
  }
});

test("C-KDA mascot uses packaged runtime URL, sits outside content flow, and hides on failure", () => {
  const originalChrome = global.chrome;
  const urls = [];
  const originalObserver = global.MutationObserver;
  global.chrome = { runtime: { getURL(path) { urls.push(path); return `chrome-extension://test/${path}`; } } };
  global.MutationObserver = class { observe() {} disconnect() {} };
  try {
    const { documentRef, elements } = createOverlayDocument();
    const overlay = createOverlay({ documentRef });
    const image = elements.find((element) => element.tagName === "IMG");

    assert.deepEqual(urls, ["assets/c-kda.gif"]);
    assert.equal(image.src, "chrome-extension://test/assets/c-kda.gif");
    assert.equal(image.className, "ckda-mascot");
    assert.equal(image.hidden, false);
    image.listeners.error();
    assert.equal(image.hidden, true);
    overlay.destroy();
  } finally {
    if (originalChrome === undefined) delete global.chrome;
    else global.chrome = originalChrome;
    global.MutationObserver = originalObserver;
  }
});

test("settings draft survives live renders until successful save", () => {
  const listeners = {};
  const inputs = {};
  for (const key of [
    "kiteDistance", "dangerRadius", "fleeHpPercent", "resumeHpPercent",
    "ammoKey", "planningIntervalMs", "movementIntervalMs", "targetBlacklistMs"
  ]) {
    inputs[key] = {
      value: "",
      addEventListener(name, handler) { listeners[`${key}:${name}`] = handler; }
    };
  }
  const form = createSettingsFormState(inputs);
  const persisted = {
    kiteDistance: 700,
    dangerRadius: 550,
    fleeHpPercent: 35,
    resumeHpPercent: 100,
    ammoKey: "1",
    planningIntervalMs: 100,
    movementIntervalMs: 250,
    targetBlacklistMs: 5000
  };

  form.sync(persisted);
  inputs.kiteDistance.value = "850";
  listeners["kiteDistance:input"]();
  form.sync(persisted);
  assert.equal(inputs.kiteDistance.value, "850");

  let submitted;
  form.submit((value) => {
    submitted = value;
    return true;
  });
  assert.equal(submitted.kiteDistance, 850);
  form.sync({ ...persisted, kiteDistance: 900 });
  assert.equal(inputs.kiteDistance.value, "900");
});

test("client source export takes priority over fallback diagnostic JSON", () => {
  assert.deepEqual(
    createExportFile({
      clientSource: "const live = true;",
      diagnostic: { clientVersion: null }
    }),
    {
      content: "const live = true;",
      filename: "space-aces-client-current.js",
      type: "application/javascript"
    }
  );
});

test("any structurally patched four-part client version enables the adapter gate", () => {
  assert.equal(
    isSupportedDiagnostic({ patchStatus: "patched", clientVersion: "1.9.0.052" }),
    true
  );
  assert.equal(
    isSupportedDiagnostic({ patchStatus: "patched", clientVersion: "1.9.0.049" }),
    true
  );
  assert.equal(
    isSupportedDiagnostic({ patchStatus: "patched", clientVersion: "future" }),
    false
  );
  assert.equal(
    isSupportedDiagnostic({ patchStatus: "unsupported", clientVersion: "1.9.0.052" }),
    false
  );
});

test("Bot starts only with valid settings, supported adapter, and snapshot", () => {
  assert.equal(canStartBot({ settingsValid: true, adapterSupported: true, hasSnapshot: true }), true);
  assert.equal(canStartBot({ settingsValid: false, adapterSupported: true, hasSnapshot: true }), false);
  assert.equal(canStartBot({ settingsValid: true, adapterSupported: false, hasSnapshot: true }), false);
  assert.equal(canStartBot({ settingsValid: true, adapterSupported: true, hasSnapshot: false }), false);
});

test("map status shows only the currently detected map", () => {
  assert.equal(formatMapStatus({ mapId: 17 }), "17");
  assert.equal(formatMapStatus(null), "—");
});

test("overlay initialization waits for the stable document body", () => {
  let readyHandler;
  let calls = 0;
  const documentRef = {
    readyState: "loading",
    addEventListener(name, handler, options) {
      assert.equal(name, "DOMContentLoaded");
      assert.deepEqual(options, { once: true });
      readyHandler = handler;
    }
  };

  whenDocumentReady(documentRef, () => { calls += 1; });
  assert.equal(calls, 0);
  readyHandler();
  assert.equal(calls, 1);
});

test("overlay host is restored when the game replaces its DOM", () => {
  let observerCallback;
  let disconnected = false;
  let appends = 0;
  class FakeObserver {
    constructor(callback) { observerCallback = callback; }
    observe() {}
    disconnect() { disconnected = true; }
  }
  const host = { isConnected: false };
  const documentRef = {
    body: {
      appendChild(value) {
        assert.equal(value, host);
        host.isConnected = true;
        appends += 1;
      }
    },
    documentElement: {}
  };

  const stop = keepHostMounted(documentRef, host, FakeObserver);
  assert.equal(appends, 1);
  host.isConnected = false;
  observerCallback();
  assert.equal(appends, 2);
  stop();
  assert.equal(disconnected, true);
});
