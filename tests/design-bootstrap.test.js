const test = require("node:test");
const assert = require("node:assert/strict");

const { publishDesignBootstrap } = require("../src/design-bootstrap.js");

function models() {
  return { ships: { 2: { path: "ships/ship_goliath-bastion" }, 31: { path: "ships/goliath-surgeon" } }, ranks: {} };
}

test("bootstrap loads packaged Models JSON in isolated world and publishes data", async () => {
  const messages = [];
  const windowRef = { postMessage(message) { messages.push(message); } };
  const storageArea = { get(keys, callback) {
    assert.deepEqual(keys, ["designSettings"]);
    callback({ designSettings: { shipDesign: "bastion" } });
  } };
  const fetchCalls = [];
  const result = await publishDesignBootstrap({
    windowRef, storageArea,
    runtimeGetUrl: (path) => `chrome-extension://kda/${path}`,
    fetchFn: async (url) => { fetchCalls.push(url); return { ok: true, json: async () => models() }; }
  });
  assert.equal(result, true);
  assert.deepEqual(fetchCalls, ["chrome-extension://kda/assets/Models.steam.json"]);
  assert.deepEqual(messages, [{ channel: "sa-design-bootstrap-v1", shipDesign: "bastion", models: models() }]);
});

test("bootstrap normalizes design and fails closed when packaged data cannot load", async () => {
  const messages = [];
  const args = {
    windowRef: { postMessage(message) { messages.push(message); } },
    storageArea: { get(_keys, callback) { callback({ designSettings: { shipDesign: "unknown" } }); } },
    runtimeGetUrl: (path) => `chrome-extension://kda/${path}`,
    fetchFn: async () => ({ ok: true, json: async () => models() })
  };
  await publishDesignBootstrap(args);
  assert.equal(messages[0].shipDesign, "default");
  messages.length = 0;
  assert.equal(await publishDesignBootstrap({ ...args, fetchFn: async () => ({ ok: false }) }), false);
  assert.deepEqual(messages, []);
});
