const test = require("node:test");
const assert = require("node:assert/strict");

const { installModelInterceptor } = require("../src/design-model-main.js");

function harness(payload) {
  const listeners = new Map();
  const response = new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json", "x-model": "original" }
  });
  const calls = [];
  const nativeFetch = async (...args) => { calls.push(args); return response; };
  const windowRef = {
    fetch: nativeFetch,
    Response,
    location: { href: "https://steam.space-aces.com/gameNew" },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, event) { for (const fn of [...(listeners.get(type) || [])]) fn(event); }
  };
  return { calls, nativeFetch, response, windowRef };
}

function models() {
  return { ships: {
    2: { path: "ships/ship_goliath-bastion", end: 63 },
    31: { path: "ships/goliath-surgeon", end: 63 }
  }, ranks: {} };
}

test("exact Models.steam.json request maps Surgeon 31 path to Bastion 2 path", async () => {
  const value = harness(models());
  installModelInterceptor(value.windowRef, { configWaitMs: 0 });
  value.windowRef.emit("message", { source: value.windowRef, data: {
    channel: "sa-design-bootstrap-v1", shipDesign: "bastion"
  } });
  const response = await value.windowRef.fetch("https://unsmod.eu/spacemap/data/Models.steam.json");
  const data = await response.json();
  assert.equal(data.ships[31].path, "ships/ship_goliath-bastion");
  assert.equal(data.ships[2].path, "ships/ship_goliath-bastion");
  assert.equal(response.headers.get("x-model"), "original");
  assert.equal(value.windowRef.fetch, value.nativeFetch);
});

test("default design returns original model response and non-model requests stay native", async () => {
  const value = harness(models());
  const controller = installModelInterceptor(value.windowRef, { configWaitMs: 0 });
  assert.equal(await value.windowRef.fetch("https://unsmod.eu/spacemap/data/Other.json"), value.response);
  assert.notEqual(value.windowRef.fetch, value.nativeFetch);
  value.windowRef.emit("message", { source: value.windowRef, data: {
    channel: "sa-design-bootstrap-v1", shipDesign: "default"
  } });
  const response = await value.windowRef.fetch("https://unsmod.eu/spacemap/data/Models.steam.json");
  assert.equal(response, value.response);
  assert.equal((await response.json()).ships[31].path, "ships/goliath-surgeon");
  assert.equal(value.windowRef.fetch, value.nativeFetch);
  assert.equal(controller.cleanup(), false);
});

test("malformed model data fails open with original response", async () => {
  const value = harness({ ships: { 31: { path: "ships/goliath-surgeon" } } });
  installModelInterceptor(value.windowRef, { configWaitMs: 0 });
  value.windowRef.emit("message", { source: value.windowRef, data: {
    channel: "sa-design-bootstrap-v1", shipDesign: "bastion"
  } });
  const response = await value.windowRef.fetch("https://unsmod.eu/spacemap/data/Models.steam.json");
  assert.equal(response, value.response);
  assert.equal((await response.json()).ships[31].path, "ships/goliath-surgeon");
});
