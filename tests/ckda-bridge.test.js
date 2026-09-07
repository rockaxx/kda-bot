const test = require("node:test");
const assert = require("node:assert/strict");
const { createCkdaBridge } = require("../src/ckda-bridge.js");

const validSnapshot = {
  timestamp: 1000,
  clientVersion: "1.9.0.051",
  connectionState: "connected",
  mapId: 17,
  premiumState: "inactive",
  players: [{
    id: 42,
    screenX: 100,
    screenY: 200,
    relation: "enemy",
    cloaked: true,
    observedAt: 1000,
    empEndsAt: null,
    ishEndsAt: null
  }]
};

function createWindow() {
  const listeners = new Map();
  const sent = [];
  return {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { listeners.delete(type, listener); },
    postMessage(message, target) { sent.push({ message, target }); },
    emit(event) { listeners.get("message")?.(event); },
    listenerCount() { return listeners.size; },
    sent
  };
}

test("delivers only same-window valid C-KDA snapshots and results", () => {
  const windowRef = createWindow();
  const snapshots = [];
  const results = [];
  const bridge = createCkdaBridge({
    windowRef,
    onSnapshot(value) { snapshots.push(value); },
    onResult(value) { results.push(value); }
  });

  windowRef.emit({ source: windowRef, data: {
    channel: "sa-ckda-v1", direction: "snapshot", payload: validSnapshot
  } });
  windowRef.emit({ source: windowRef, data: {
    channel: "sa-ckda-v1", direction: "result", payload: { requestId: 1, ok: true }
  } });
  windowRef.emit({ source: {}, data: {
    channel: "sa-ckda-v1", direction: "snapshot", payload: validSnapshot
  } });
  windowRef.emit({ source: windowRef, data: {
    channel: "wrong", direction: "snapshot", payload: validSnapshot
  } });
  windowRef.emit({ source: windowRef, data: {
    channel: "sa-ckda-v1", direction: "snapshot", payload: { players: [] }
  } });
  windowRef.emit({ source: windowRef, data: {
    channel: "sa-ckda-v1", direction: "result", payload: { blob: "x".repeat(4097) }
  } });

  assert.deepEqual(snapshots, [validSnapshot]);
  assert.deepEqual(results, [{ requestId: 1, ok: true }]);
  bridge.destroy();
});

test("sends only numbered C-KDA configuration commands and destroys listener", () => {
  const windowRef = createWindow();
  const bridge = createCkdaBridge({ windowRef, onSnapshot() {}, onResult() {} });

  assert.equal(bridge.sendCommand("set-premium", { enabled: true }), 1);
  assert.equal(bridge.sendCommand("configure-effects", { empCooldownMs: 28000 }), 2);
  assert.deepEqual(windowRef.sent, [
    {
      message: {
        channel: "sa-ckda-v1",
        direction: "command",
        payload: { requestId: 1, type: "set-premium", enabled: true }
      },
      target: "*"
    },
    {
      message: {
        channel: "sa-ckda-v1",
        direction: "command",
        payload: { requestId: 2, type: "configure-effects", empCooldownMs: 28000 }
      },
      target: "*"
    }
  ]);
  assert.throws(() => bridge.sendCommand("moveTo", { x: 1 }), TypeError);
  assert.throws(() => bridge.sendCommand("clearTarget", {}), TypeError);
  assert.throws(() => bridge.sendCommand("clear", { blob: "x".repeat(4097) }), RangeError);

  bridge.destroy();
  assert.equal(windowRef.listenerCount(), 0);
});
