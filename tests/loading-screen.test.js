const test = require("node:test");
const assert = require("node:assert/strict");

const { installLoadingScreen } = require("../src/loading-screen.js");

function body() {
  const values = new Map();
  return { style: {
    setProperty(name, value, priority) { values.set(name, { value, priority }); },
    removeProperty(name) { values.delete(name); },
    getPropertyValue(name) { return values.get(name)?.value || ""; },
    getPropertyPriority(name) { return values.get(name)?.priority || ""; },
    get(name) { return values.get(name); }
  } };
}

function harness() {
  const callbacks = [];
  const observers = [];
  const documentListeners = {};
  const windowListeners = {};
  let canvas = null;
  const windowRef = {
    addEventListener(name, handler) { windowListeners[name] = handler; },
    removeEventListener(name, handler) {
      if (windowListeners[name] === handler) delete windowListeners[name];
    },
    emitResultReady(overrides = {}) {
      windowListeners.message?.({
        source: this,
        data: { channel: "sa-ckda-v1", direction: "result", payload: { type: "ready" } },
        ...overrides
      });
    },
    emitGameSnapshot(overrides = {}) {
      windowListeners.message?.({
        source: this,
        data: {
          channel: "sa-ckda-v1", direction: "snapshot",
          payload: { timestamp: 1, clientVersion: "1.9.0.0996", connectionState: "connected", mapId: 17, players: [] }
        },
        ...overrides
      });
    }
  };
  const documentRef = {
    body: body(), documentElement: {}, readyState: "loading",
    addEventListener(name, handler) { documentListeners[name] = handler; },
    removeEventListener(name, handler) {
      if (documentListeners[name] === handler) delete documentListeners[name];
    },
    querySelector(selector) { assert.equal(selector, "canvas"); return canvas; }
  };
  class Observer {
    constructor(callback) { callbacks.push(callback); observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  return {
    callbacks, documentRef, documentListeners, windowListeners, windowRef, observers, Observer,
    setCanvas(value) { canvas = value; }
  };
}

test("loading controller applies packaged GIF only before game canvas exists", () => {
  const value = harness();
  const controller = installLoadingScreen({ documentRef: value.documentRef, windowRef: value.windowRef,
    assetUrl: "chrome-extension://kda/assets/besto.gif", Observer: value.Observer });
  assert.deepEqual(value.documentRef.body.style.get("background-image"), {
    value: 'url("chrome-extension://kda/assets/besto.gif")', priority: "important"
  });
  assert.equal(controller.destroy(), true);
});

test("loading controller reapplies before load, then removes GIF and disconnects", () => {
  const value = harness();
  installLoadingScreen({ documentRef: value.documentRef, windowRef: value.windowRef,
    assetUrl: "chrome-extension://kda/assets/besto.gif", Observer: value.Observer });
  const secondBody = body();
  value.documentRef.body = secondBody;
  value.callbacks[0]();
  assert.equal(secondBody.style.get("background-image").priority, "important");
  value.setCanvas({ isConnected: true });
  value.documentRef.readyState = "complete";
  value.windowRef.emitResultReady();
  assert.equal(secondBody.style.get("background-image").value,
    'url("chrome-extension://kda/assets/besto.gif")');
  value.windowRef.emitGameSnapshot();
  assert.deepEqual(secondBody.style.get("background-image"), {
    value: "none", priority: "important"
  });
  assert.equal(secondBody.style.get("background-size"), undefined);
  assert.equal(value.observers[0].disconnected, true);
});

test("loading controller keeps GIF until first connected game snapshot", () => {
  const value = harness();
  value.setCanvas({ isConnected: true });
  installLoadingScreen({ documentRef: value.documentRef, windowRef: value.windowRef,
    assetUrl: "chrome-extension://kda/assets/besto.gif", Observer: value.Observer });
  assert.equal(value.documentRef.body.style.get("background-image").value,
    'url("chrome-extension://kda/assets/besto.gif")');
  assert.equal(value.observers[0].disconnected, undefined);
  value.documentRef.readyState = "complete";
  value.callbacks[0]();
  assert.equal(value.documentRef.body.style.get("background-image").value,
    'url("chrome-extension://kda/assets/besto.gif")');
  value.windowRef.emitResultReady();
  assert.equal(value.documentRef.body.style.get("background-image").value,
    'url("chrome-extension://kda/assets/besto.gif")');
  value.windowRef.emitGameSnapshot();
  assert.equal(value.documentRef.body.style.get("background-image").value, "none");
  assert.equal(value.observers[0].disconnected, true);
});

test("loading controller ignores forged and malformed readiness messages", () => {
  const value = harness();
  installLoadingScreen({ documentRef: value.documentRef, windowRef: value.windowRef,
    assetUrl: "chrome-extension://kda/assets/besto.gif", Observer: value.Observer });
  value.windowRef.emitGameSnapshot({ source: {} });
  value.windowListeners.message({ source: value.windowRef, data: {
    channel: "wrong", direction: "result", payload: { type: "ready" }
  } });
  assert.equal(value.documentRef.body.style.get("background-image").value,
    'url("chrome-extension://kda/assets/besto.gif")');
});

test("loading controller replaces Besto with a persisted custom image", () => {
  const value = harness();
  const storage = { get(_keys, callback) { callback({ loadingScreenImage: {
    name: "custom.png", mimeType: "image/png",
    dataUrl: "data:image/png;base64,iVBORw0KGgo="
  } }); } };
  installLoadingScreen({ documentRef: value.documentRef, windowRef: value.windowRef,
    storage, assetUrl: "chrome-extension://kda/assets/besto.gif", Observer: value.Observer });
  assert.equal(value.documentRef.body.style.get("background-image").value,
    'url("data:image/png;base64,iVBORw0KGgo=")');
});
