const test = require("node:test");
const assert = require("node:assert/strict");
const { drawMarker, createCkdaCanvas } = require("../src/ckda-canvas.js");
const { startCkdaPublisher } = require("../src/ckda-main.js");
const { createCkdaBridge } = require("../src/ckda-bridge.js");

function recordingContext() {
  const calls = [];
  return {
    calls,
    save() { calls.push(["save"]); },
    restore() { calls.push(["restore"]); },
    beginPath() { calls.push(["beginPath"]); },
    closePath() { calls.push(["closePath"]); },
    arc(...args) { calls.push(["arc", ...args]); },
    rect(...args) { calls.push(["rect", ...args]); },
    moveTo(...args) { calls.push(["moveTo", ...args]); },
    lineTo(...args) { calls.push(["lineTo", ...args]); },
    fill() { calls.push(["fill"]); },
    stroke() { calls.push(["stroke"]); },
    clearRect(...args) { calls.push(["clearRect", ...args]); },
    setTransform(...args) { calls.push(["setTransform", ...args]); },
    fillText(...args) { calls.push(["fillText", ...args]); }
  };
}

for (const [shape, primitive, count] of [
  ["circle", "arc", 1],
  ["square", "rect", 1],
  ["triangle", "moveTo", 1],
  ["plus", "moveTo", 2],
  ["star", "lineTo", 9]
]) {
  test(`drawMarker renders ${shape} geometry`, () => {
    const context = recordingContext();
    drawMarker(context, shape, 20, 30, 10, "#ff394f", 0.5);

    assert.equal(context.calls.filter(([name]) => name === primitive).length, count);
    assert.deepEqual(context.calls[0], ["save"]);
    assert.deepEqual(context.calls.at(-1), ["restore"]);
    assert.equal(context.calls.some(([name]) => name === "fill"), true);
    assert.equal(context.globalAlpha, 0.5);
    assert.equal(context.strokeStyle, "#ff394f");
    assert.equal(context.lineWidth, 2.5);
    if (shape === "triangle") {
      assert.equal(
        context.calls.filter(([name]) => name === "moveTo" || name === "lineTo").length,
        3,
        "triangle must define three vertices"
      );
    }
    if (shape === "plus") {
      assert.equal(context.calls.filter(([name]) => name === "lineTo").length, 2);
    }
    if (shape === "star") {
      const vertices = context.calls
        .filter(([name]) => name === "moveTo" || name === "lineTo")
        .map(([, x, y]) => Math.hypot(x - 20, y - 30));
      assert.equal(vertices.length, 10);
      assert.deepEqual(vertices.map((value) => Math.round(value)), [10, 5, 10, 5, 10, 5, 10, 5, 10, 5]);
    }
  });
}

function validSnapshot(now = 1000) {
  return {
    timestamp: now,
    clientVersion: "1.9.0.052",
    connectionState: "connected",
    mapId: 17,
    premiumState: "inactive",
    players: [{
      id: 7,
      screenX: 100,
      screenY: 200,
      relation: "enemy",
      cloaked: true,
      observedAt: now,
      empEndsAt: now + 2100,
      ishEndsAt: null
    }]
  };
}

function validSettings(overrides = {}) {
  return {
    overlayEnabled: true,
    displayMode: "masked-only",
    shape: "circle",
    allyColor: "#45d483",
    enemyColor: "#ff394f",
    sizePx: 8,
    opacity: 0.9,
    showEmpCooldown: true,
    showIshCooldown: true,
    empCooldownMs: 28000,
    ishCooldownMs: 28000,
    premiumOverride: false,
    ...overrides
  };
}

function createDom() {
  const context = recordingContext();
  const canvas = {
    id: "",
    style: {},
    width: 0,
    height: 0,
    isConnected: false,
    getContext() { return context; },
    remove() { this.removed = true; this.isConnected = false; }
  };
  const listeners = new Map();
  const rafs = new Map();
  let nextRaf = 1;
  let epochNow = 1000;
  const windowRef = {
    innerWidth: 640,
    innerHeight: 480,
    devicePixelRatio: 2,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    requestAnimationFrame(callback) { const id = nextRaf++; rafs.set(id, callback); return id; },
    cancelAnimationFrame(id) { rafs.delete(id); },
    runFrame(now) { const [id, callback] = rafs.entries().next().value || []; if (id) { rafs.delete(id); callback(now); } },
    rafCount() { return rafs.size; },
    listenerCount() { return listeners.size; }
  };
  return {
    documentRef: {
      body: { append(canvas) { this.child = canvas; canvas.isConnected = true; } },
      createElement(tag) { assert.equal(tag, "canvas"); return canvas; }
    },
    windowRef,
    now: () => epochNow,
    setNow(value) { epochNow = value; },
    context,
    canvas,
    detachCanvas() { canvas.isConnected = false; }
  };
}

test("canvas reconnects after the game replaces its loading DOM", () => {
  const dom = createDom();
  const canvas = createCkdaCanvas(dom);
  canvas.render(validSnapshot(), validSettings({ displayMode: "all" }));
  dom.detachCanvas();

  dom.windowRef.runFrame(1000);

  assert.equal(dom.canvas.isConnected, true);
  assert.equal(dom.context.calls.some(([name]) => name === "arc"), true);
  canvas.destroy();
});

test("canvas merges rotating player observations by ID and expires each independently", () => {
  const dom = createDom();
  const canvas = createCkdaCanvas(dom);
  canvas.render(validSnapshot(), validSettings());
  dom.setNow(1100);
  const next = validSnapshot(1100);
  next.players[0].id = 8;
  next.players[0].screenX = 200;
  canvas.render(next, validSettings());
  dom.windowRef.runFrame(100);
  assert.deepEqual(dom.context.calls.filter(([name]) => name === "arc").map(call => call[1]), [100, 200]);
  dom.context.calls.length = 0;
  dom.setNow(1751);
  dom.windowRef.runFrame(751);
  assert.deepEqual(dom.context.calls.filter(([name]) => name === "arc").map(call => call[1]), [200]);
  dom.context.calls.length = 0;
  dom.setNow(1851);
  dom.windowRef.runFrame(851);
  assert.equal(dom.context.calls.some(([name]) => name === "arc"), false);
  canvas.destroy();
});

test("canvas merge updates one ID without duplication and does not replace a newer observation with an older one", () => {
  const dom = createDom();
  const canvas = createCkdaCanvas(dom);
  canvas.render(validSnapshot(), validSettings());
  dom.setNow(1100);
  const next = validSnapshot(1100);
  next.players[0].screenX = 200;
  canvas.render(next, validSettings());
  canvas.render(validSnapshot(), validSettings());
  dom.windowRef.runFrame(100);
  assert.deepEqual(dom.context.calls.filter(([name]) => name === "arc").map(call => call[1]), [200]);
  canvas.destroy();
});

for (const reason of ["map", "disconnect", "unsupported", "clear", "destroy"]) {
  test(`canvas forgets retained observations on ${reason}`, () => {
    const dom = createDom();
    const canvas = createCkdaCanvas(dom);
    canvas.render(validSnapshot(), validSettings());
    const empty = { ...validSnapshot(), players: [] };
    if (reason === "map") empty.mapId = 18;
    else if (reason === "disconnect") empty.connectionState = "disconnected";
    else if (reason === "unsupported") empty.clientVersion = "1.9.0.053";
    else canvas[reason]();
    canvas.render(empty, validSettings());
    canvas.render({ ...empty, clientVersion: "1.9.0.052", connectionState: "connected" }, validSettings());
    dom.windowRef.runFrame(0);
    assert.equal(dom.context.calls.some(([name]) => name === "arc"), false);
    canvas.destroy();
  });
}

test("32-player rotation delivers and renders the final cloaked player within two bounded publications", () => {
  const dom = createDom();
  const canvas = createCkdaCanvas(dom);
  const messages = [];
  const messageListeners = new Set();
  const windowRef = {
    addEventListener(_type, listener) { messageListeners.add(listener); },
    removeEventListener(_type, listener) { messageListeners.delete(listener); },
    postMessage(message) {
      messages.push(message);
      for (const listener of messageListeners) listener({ source: windowRef, data: structuredClone(message) });
    }
  };
  const roots = { version: "1.9.0.052", network: { connected: true },
    user: { userID: 99, ship: { ID: 99 } },
    world: { mapId: 17, MAP_SHIPS: new Map(Array.from({ length: 32 }, (_, id) => [id, {
      ID: `player-${id}-é`, isNpc: false, isCloaked: id === 31,
      renderer: { wrapper: { toGlobal: () => ({ x: 100 + id, y: 200 }) } }
    }])) } };
  const bridge = createCkdaBridge({ windowRef, onSnapshot(value) { canvas.render(value, validSettings()); } });
  const publisher = startCkdaPublisher(windowRef, roots, { now: dom.now });
  publisher.refresh();
  dom.windowRef.runFrame(0);
  assert.deepEqual(dom.context.calls.filter(([name]) => name === "arc").map(call => call[1]), [131]);
  for (const message of messages) assert.ok(new TextEncoder().encode(JSON.stringify(message)).byteLength <= 4096);
  dom.context.calls.length = 0;
  roots.world = { mapId: 17, MAP_SHIPS: new Map() };
  publisher.refresh();
  dom.windowRef.runFrame(1);
  assert.equal(dom.context.calls.some(([name]) => name === "arc"), false, "same-map world replacement must clear retained observations");
  publisher.stop();
  bridge.destroy();
  canvas.destroy();
});

test("canvas uses viewport DPI, ignores input, filters masked/stale data, and labels cooldown", () => {
  const dom = createDom();
  const canvas = createCkdaCanvas(dom);
  canvas.render(validSnapshot(), validSettings());
  dom.windowRef.runFrame(1000);

  assert.equal(dom.canvas.id, "sa-ckda-marker-layer");
  assert.equal(dom.canvas.style.pointerEvents, "none");
  assert.equal(dom.canvas.style.zIndex, "2147483647");
  assert.equal(dom.canvas.style.width, "640px");
  assert.equal(dom.canvas.style.height, "480px");
  assert.equal(dom.canvas.width, 1280);
  assert.equal(dom.canvas.height, 960);
  assert.deepEqual(dom.context.calls.find(([name]) => name === "setTransform"), ["setTransform", 2, 0, 0, 2, 0, 0]);
  assert.deepEqual(dom.context.calls.find(([name]) => name === "fillText"), ["fillText", "EMP 3", 110, 194]);

  dom.context.calls.length = 0;
  const unmasked = validSnapshot(1000);
  unmasked.players[0].cloaked = false;
  canvas.render(unmasked, validSettings({ displayMode: "masked-only" }));
  dom.windowRef.runFrame(1000);
  assert.equal(dom.context.calls.some(([name]) => name === "arc"), false, "masked-only must hide unmasked players");

  dom.context.calls.length = 0;
  canvas.render(validSnapshot(1000), validSettings({ displayMode: "masked-only" }));
  dom.setNow(2000);
  dom.windowRef.runFrame(2000);
  assert.equal(dom.context.calls.some(([name]) => name === "arc"), false, "stale data must fail closed");

  canvas.destroy();
});

test("canvas clear and destroy cancel lifecycle resources and remove layer", () => {
  const dom = createDom();
  const canvas = createCkdaCanvas(dom);
  canvas.render(validSnapshot(), validSettings({ overlayEnabled: false }));
  dom.windowRef.runFrame(1000);
  assert.equal(dom.context.calls.some(([name]) => name === "arc"), false);

  canvas.clear();
  canvas.destroy();
  assert.equal(dom.windowRef.rafCount(), 0);
  assert.equal(dom.windowRef.listenerCount(), 0);
  assert.equal(dom.canvas.removed, true);
});

test("canvas uses its epoch clock when RAF timestamp has a different origin", () => {
  const dom = createDom();
  const epochNow = 1_700_000_000_000;
  const canvas = createCkdaCanvas({ ...dom, now: () => epochNow });

  canvas.render(validSnapshot(epochNow), validSettings());
  dom.windowRef.runFrame(42);

  assert.equal(dom.context.calls.some(([name]) => name === "arc"), true);
  assert.deepEqual(
    dom.context.calls.find(([name]) => name === "fillText"),
    ["fillText", "EMP 3", 110, 194]
  );
  canvas.destroy();
});

test("canvas staleness and countdown use performance delta despite wall-clock jumps", (t) => {
  const dom = createDom();
  let elapsed = 0;
  let wall = 1_700_000_000_000;
  t.mock.method(Date, "now", () => wall);
  dom.windowRef.performance = { timeOrigin: 1_700_000_000_000, now: () => elapsed };
  const canvas = createCkdaCanvas({ documentRef: dom.documentRef, windowRef: dom.windowRef });
  canvas.render(validSnapshot(1_700_000_000_000), validSettings());
  wall -= 60_000;
  elapsed = 250;
  dom.windowRef.runFrame(9999);
  assert.deepEqual(dom.context.calls.find(([name]) => name === "fillText"), ["fillText", "EMP 2", 110, 194]);
  dom.context.calls.length = 0;
  wall += 120_000;
  elapsed = 750;
  dom.windowRef.runFrame(12345);
  assert.equal(dom.context.calls.some(([name]) => name === "arc"), true);
  dom.context.calls.length = 0;
  elapsed = 751;
  dom.windowRef.runFrame(12346);
  assert.equal(dom.context.calls.some(([name]) => name === "arc"), false);
  canvas.destroy();
});

for (const premiumState of ["inactive", "active", "unsupported"]) {
  test(`supported connected player markers render when Premium is ${premiumState}`, () => {
    const dom = createDom();
    const canvas = createCkdaCanvas(dom);
    canvas.render({ ...validSnapshot(), premiumState }, validSettings());
    dom.windowRef.runFrame(0);
    assert.deepEqual(dom.context.calls.filter(([name]) => name === "arc").map(call => call[1]), [100]);
    canvas.destroy();
  });
}
