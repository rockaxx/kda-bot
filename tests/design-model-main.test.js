const test = require("node:test");
const assert = require("node:assert/strict");

const { installModelInterceptor } = require("../src/design-model-main.js");
const EXTERNAL_URL = "https://unsmod.eu/spacemap/data/Models.steam.json?v=52";
const BASE_URL = "https://steam.space-aces.com/client/data/Models.steam.json?v=52";

function models() {
  return { ships: {
    2: { path: "ships/ship_goliath-bastion", start: 0, end: 63, scale: 1.2 },
    31: { path: "ships/goliath-surgeon", start: 0, end: 63, scale: 0.9 }
  }, ranks: {} };
}

function harness() {
  const listeners = new Map();
  const calls = [];
  const originalResponse = new Response(JSON.stringify({ native: true }), { status: 200 });
  const nativeFetch = async (input) => { calls.push(input); return originalResponse; };
  const windowRef = {
    fetch: nativeFetch, Response, Headers,
    location: { href: "https://steam.space-aces.com/gameNew" },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, event) { for (const fn of [...(listeners.get(type) || [])]) fn(event); }
  };
  return { calls, nativeFetch, originalResponse, windowRef };
}

function configure(value, shipDesign = "bastion", payload = models()) {
  value.windowRef.emit("message", { source: value.windowRef, data: {
    channel: "sa-design-bootstrap-v1", shipDesign, models: payload
  } });
}

test("both external and base Models requests use packaged substituted data", async () => {
  const value = harness();
  installModelInterceptor(value.windowRef, { configWaitMs: 0 });
  configure(value);
  for (const url of [EXTERNAL_URL, BASE_URL]) {
    const data = await (await value.windowRef.fetch(url)).json();
    assert.deepEqual(data.ships[31], data.ships[2]);
  }
  assert.deepEqual(value.calls, [], "native model URLs must not be loaded");
  assert.notEqual(value.windowRef.fetch, value.nativeFetch, "narrow hook stays for second model request");
});

test("default design returns unchanged packaged data for both model requests", async () => {
  const value = harness();
  installModelInterceptor(value.windowRef, { configWaitMs: 0 });
  configure(value, "default");
  for (const url of [EXTERNAL_URL, BASE_URL]) {
    const data = await (await value.windowRef.fetch(url)).json();
    assert.equal(data.ships[31].path, "ships/goliath-surgeon");
  }
  assert.deepEqual(value.calls, []);
});

test("non-model and invalid bootstrap data fail open to native fetch", async () => {
  const value = harness();
  installModelInterceptor(value.windowRef, { configWaitMs: 0 });
  assert.equal(await value.windowRef.fetch("https://unsmod.eu/spacemap/data/Other.json"), value.originalResponse);
  configure(value, "bastion", { ships: {} });
  assert.equal(await value.windowRef.fetch(EXTERNAL_URL), value.originalResponse);
  assert.deepEqual(value.calls, ["https://unsmod.eu/spacemap/data/Other.json", EXTERNAL_URL]);
});
