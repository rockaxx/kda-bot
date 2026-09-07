const test = require("node:test");
const assert = require("node:assert/strict");
const { drawMarker, createCkdaCanvas } = require("../src/ckda-canvas.js");

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
    clientVersion: "1.9.0.051",
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
    getContext() { return context; },
    remove() { this.removed = true; }
  };
  const listeners = new Map();
  const rafs = new Map();
  let nextRaf = 1;
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
      body: { append(canvas) { this.child = canvas; } },
      createElement(tag) { assert.equal(tag, "canvas"); return canvas; }
    },
    windowRef,
    context,
    canvas
  };
}

test("canvas uses viewport DPI, ignores input, filters masked/stale data, and labels cooldown", () => {
  const dom = createDom();
  const canvas = createCkdaCanvas(dom);
  canvas.render(validSnapshot(), validSettings());
  dom.windowRef.runFrame(1000);

  assert.equal(dom.canvas.id, "sa-ckda-marker-layer");
  assert.equal(dom.canvas.style.pointerEvents, "none");
  assert.equal(dom.canvas.style.zIndex, "2147483646");
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
