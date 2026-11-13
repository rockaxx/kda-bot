const test = require("node:test");
const assert = require("node:assert/strict");

const { publishDesignBootstrap } = require("../src/design-bootstrap.js");

function models() {
  return { ships: { 2: { path: "ships/ship_goliath-bastion" }, 31: { path: "ships/goliath-surgeon" } }, ranks: {} };
}

test("bootstrap loads packaged Models JSON in isolated world and publishes data", async () => {
  const messages = [];
  const windowRef = { postMessage(message) { messages.push(message); } };
  const fetchCalls = [];
  const result = await publishDesignBootstrap({
    windowRef,
    runtimeGetUrl: (path) => `chrome-extension://kda/${path}`,
    fetchFn: async (url) => { fetchCalls.push(url); return { ok: true, json: async () => models() }; }
  });
  assert.deepEqual(result, models().ships);
  assert.deepEqual(fetchCalls, ["chrome-extension://kda/assets/Models.steam.json"]);
  assert.deepEqual(messages, [{ channel: "sa-design-bootstrap-v1", models: models() }]);
});

test("bootstrap fails closed when packaged data cannot load", async () => {
  const messages = [];
  const args = {
    windowRef: { postMessage(message) { messages.push(message); } },
    runtimeGetUrl: (path) => `chrome-extension://kda/${path}`,
    fetchFn: async () => ({ ok: true, json: async () => models() })
  };
  assert.equal(await publishDesignBootstrap({ ...args, fetchFn: async () => ({ ok: false }) }), null);
  assert.deepEqual(messages, []);
});
