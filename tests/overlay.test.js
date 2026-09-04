const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canStartBot,
  createSettingsFormState,
  createExportFile,
  formatMapStatus,
  isSupportedDiagnostic,
  keepHostMounted,
  createPanelState,
  shouldToggleOverlay,
  whenDocumentReady
} = require("../src/overlay.js");

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
  const state = createPanelState(["dashboard", "settings"]);
  assert.deepEqual(state.read(), { visible: true, activeTab: "dashboard" });
  state.toggle();
  assert.deepEqual(state.read(), { visible: false, activeTab: "dashboard" });
  assert.equal(state.selectTab("settings"), true);
  assert.deepEqual(state.read(), { visible: false, activeTab: "settings" });
  assert.equal(state.selectTab("unknown"), false);
  assert.deepEqual(state.read(), { visible: false, activeTab: "settings" });
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

test("only the current patched client enables the adapter gate", () => {
  assert.equal(
    isSupportedDiagnostic({ patchStatus: "patched", clientVersion: "1.9.0.051" }),
    true
  );
  assert.equal(
    isSupportedDiagnostic({ patchStatus: "patched", clientVersion: "1.9.0.049" }),
    false
  );
  assert.equal(
    isSupportedDiagnostic({ patchStatus: "unsupported", clientVersion: "1.9.0.051" }),
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
