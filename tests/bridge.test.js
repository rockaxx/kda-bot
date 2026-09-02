const test = require("node:test");
const assert = require("node:assert/strict");
const { createBridge } = require("../src/bridge.js");

function validSnapshot() {
  return {
    timestamp: 1000,
    clientVersion: "1.9.0.045",
    connectionState: "connected",
    mapId: 7,
    player: {
      id: "hero",
      x: 0,
      y: 0,
      hpPercent: 100,
      alive: true,
      moving: false,
      inCombat: false
    },
    target: null,
    entities: []
  };
}

function fakeWindow() {
  const listeners = {};
  return {
    listeners,
    addEventListener(name, fn) {
      listeners[name] = fn;
    },
    removeEventListener(name, fn) {
      if (listeners[name] === fn) delete listeners[name];
    }
  };
}

test("bridge rejects foreign source and invalid channel", () => {
  const windowRef = fakeWindow();
  let received = 0;
  const bridge = createBridge({
    windowRef,
    onSnapshot: () => { received += 1; },
    onDiagnostic: () => { received += 1; }
  });
  bridge.start();
  windowRef.listeners.message({
    source: {},
    data: { channel: "sa-bot-v1", direction: "snapshot", payload: validSnapshot() }
  });
  windowRef.listeners.message({
    source: windowRef,
    data: { channel: "wrong", direction: "snapshot", payload: validSnapshot() }
  });
  assert.equal(received, 0);
});

test("bridge validates snapshots and detaches on stop", () => {
  const windowRef = fakeWindow();
  const snapshots = [];
  const bridge = createBridge({
    windowRef,
    onSnapshot: (value) => snapshots.push(value),
    onDiagnostic: () => {}
  });
  bridge.start();
  windowRef.listeners.message({
    source: windowRef,
    data: { channel: "sa-bot-v1", direction: "snapshot", payload: validSnapshot() }
  });
  assert.equal(snapshots.length, 1);
  assert.notEqual(snapshots[0], validSnapshot());
  bridge.stop();
  assert.equal(windowRef.listeners.message, undefined);
});

test("bridge accepts only bounded plain-JSON diagnostics", () => {
  const windowRef = fakeWindow();
  const diagnostics = [];
  const bridge = createBridge({
    windowRef,
    onSnapshot: () => {},
    onDiagnostic: (value) => diagnostics.push(value)
  });
  bridge.start();
  const send = (payload) => windowRef.listeners.message({
    source: windowRef,
    data: { channel: "sa-bot-v1", direction: "diagnostic", payload }
  });
  send({ patchStatus: "patched" });
  send({ oversized: "x".repeat(200 * 1024) });
  send({ invalid: undefined });
  assert.deepEqual(diagnostics, [{ patchStatus: "patched" }]);
});

test("bridge accepts bounded client source and rejects oversized source", () => {
  const windowRef = fakeWindow();
  const sources = [];
  const bridge = createBridge({
    windowRef,
    onSnapshot: () => {},
    onDiagnostic: () => {},
    onSource: (value) => sources.push(value)
  });
  bridge.start();
  const send = (source) => windowRef.listeners.message({
    source: windowRef,
    data: {
      channel: "sa-bot-v1",
      direction: "source",
      payload: { reason: "root-fingerprint-mismatch", source }
    }
  });

  send("const currentClient = true;");
  send("x".repeat(5 * 1024 * 1024 + 1));

  assert.deepEqual(sources, [{
    reason: "root-fingerprint-mismatch",
    source: "const currentClient = true;"
  }]);
});
