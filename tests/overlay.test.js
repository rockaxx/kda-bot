const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canStartDryRun,
  isSupportedDiagnostic,
  keepHostMounted,
  whenDocumentReady
} = require("../src/overlay.js");

test("structurally patched runtime diagnostic enables the adapter gate", () => {
  assert.equal(
    isSupportedDiagnostic({ patchStatus: "patched", clientVersion: "1.8.9.099" }),
    true
  );
  assert.equal(
    isSupportedDiagnostic({ patchStatus: "unsupported", clientVersion: "1.8.9.099" }),
    false
  );
});

test("Dry Run starts only with valid settings, supported adapter, and snapshot", () => {
  assert.equal(canStartDryRun({ settingsValid: true, adapterSupported: true, hasSnapshot: true }), true);
  assert.equal(canStartDryRun({ settingsValid: false, adapterSupported: true, hasSnapshot: true }), false);
  assert.equal(canStartDryRun({ settingsValid: true, adapterSupported: false, hasSnapshot: true }), false);
  assert.equal(canStartDryRun({ settingsValid: true, adapterSupported: true, hasSnapshot: false }), false);
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
