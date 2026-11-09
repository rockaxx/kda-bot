const test = require("node:test");
const assert = require("node:assert/strict");

const { installLoadingScreen } = require("../src/loading-screen.js");

function body() {
  const values = new Map();
  return {
    style: {
      setProperty(name, value, priority) { values.set(name, { value, priority }); },
      get(name) { return values.get(name); }
    }
  };
}

test("loading controller applies absolute packaged GIF with important priority", () => {
  const firstBody = body();
  const documentRef = { body: firstBody, documentElement: {} };
  const controller = installLoadingScreen({
    documentRef,
    assetUrl: "chrome-extension://kda/assets/besto.gif",
    Observer: class { observe() {} disconnect() {} }
  });

  assert.deepEqual(firstBody.style.get("background-image"), {
    value: 'url("chrome-extension://kda/assets/besto.gif")', priority: "important"
  });
  assert.deepEqual(firstBody.style.get("background-size"), { value: "cover", priority: "important" });
  controller.destroy();
});

test("loading controller reapplies background when the game replaces body", () => {
  const callbacks = [];
  const firstBody = body();
  const secondBody = body();
  const documentRef = { body: firstBody, documentElement: {} };
  const controller = installLoadingScreen({
    documentRef,
    assetUrl: "chrome-extension://kda/assets/besto.gif",
    Observer: class {
      constructor(callback) { callbacks.push(callback); }
      observe() {}
      disconnect() { this.disconnected = true; }
    }
  });

  documentRef.body = secondBody;
  callbacks[0]();
  assert.equal(secondBody.style.get("background-image").priority, "important");
  controller.destroy();
});
