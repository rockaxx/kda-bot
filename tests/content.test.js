const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { formatCkdaStatus, isSupportedDiagnostic } = require("../src/overlay.js");

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, event = {}) { for (const fn of [...(listeners.get(type) || [])]) fn(event); },
    count(type) { return listeners.get(type)?.size || 0; }
  };
}

function setup(stored = {}, deferred = false, failBridge = false, storageSet = () => Promise.resolve()) {
  const window = eventTarget();
  const document = { ...eventTarget(), visibilityState: "visible" };
  const calls = { commands: [], saves: [], canvas: [], botSnapshots: [], destroyed: [], starts: 0, stops: 0 };
  let options;
  let botBridge;
  let ckdaBridge;
  let storageCallback;
  let model;
  let canvasThrows = false;
  const runtime = {
    getState: () => ({ state: "idle" }), isActive: () => false,
    start() { calls.starts++; }, stop() { calls.stops++; },
    receiveSnapshot(value) { calls.botSnapshots.push(value); },
    receiveActionResult() {}, destroy() { calls.destroyed.push("runtime"); }
  };
  window.__SA_BOT_ISOLATED_V1__ = {
    ...require("../src/settings.js"), ...require("../src/ckda-settings.js"),
    ...require("../src/ckda-schema.js"),
    whenDocumentReady(_document, callback) { callback(); },
    createController: () => ({ getState: runtime.getState }),
    createLogger: () => ({ add() {}, list: () => [] }),
    isSupportedDiagnostic,
    canStartBot: () => true,
    createRuntime: () => runtime,
    createBridge(value) {
      botBridge = value;
      return { start() {}, stop() { calls.destroyed.push("bridge"); } };
    },
    createCkdaBridge(value) {
      if (failBridge) throw new Error("C-KDA bridge failed");
      ckdaBridge = value;
      return {
        sendCommand(type, payload) { calls.commands.push({ type, payload }); },
        destroy() { calls.destroyed.push("ckda-bridge"); }
      };
    },
    createCkdaCanvas() {
      return {
        render(snapshot, settings) {
          if (canvasThrows) throw new Error("canvas failed");
          calls.canvas.push({ snapshot, settings });
        },
        clear() { calls.canvas.push({ clear: true }); },
        destroy() { calls.destroyed.push("canvas"); }
      };
    },
    createOverlay(value) {
      options = value;
      return {
        render(value) { model = value; calls.statusText = formatCkdaStatus(value.ckdaStatus, value.ckdaSnapshot); },
        destroy() { calls.destroyed.push("overlay"); }
      };
    },
    installEmergencyStop: () => () => calls.destroyed.push("shortcut")
  };
  const chrome = { storage: { local: {
    get(keys, callback) { calls.keys = keys; storageCallback = callback; if (!deferred) callback(stored); },
    set(value) { calls.saves.push(value); return storageSet(value); }
  } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/content.js"), "utf8"), {
    window, document, chrome, TextEncoder
  });
  return {
    window, document, calls, options: () => options, model: () => model,
    snapshot(value) { ckdaBridge?.onSnapshot(value); },
    result(value) { ckdaBridge?.onResult(value); },
    botSnapshot(value) { botBridge.onSnapshot(value); },
    diagnostic(value) { botBridge.onDiagnostic(value); },
    load() { storageCallback(stored); },
    throwCanvas() { canvasThrows = true; }
  };
}

function snapshot() {
  return { timestamp: 1000, clientVersion: "1.9.0.051", connectionState: "connected",
    mapId: 17, premiumState: "inactive", players: [] };
}

test("content loads independent C-KDA defaults and initializes MAIN settings", () => {
  const app = setup();
  assert.deepEqual(Array.from(app.calls.keys), ["settings", "ckdaSettings"]);
  assert.equal(app.model().ckdaSettings.empCooldownMs, 28000);
  assert.equal(app.model().ckdaSettings.premiumOverride, false);
  assert.deepEqual(app.calls.commands.map(value => value.type), ["configure-effects", "set-premium", "refresh"]);
});

test("C-KDA saves normalized settings and updates canvas and Premium independently", async () => {
  const app = setup({ ckdaSettings: { shape: "star" } });
  app.snapshot(snapshot());
  assert.equal(app.model().ckdaSettings.shape, "star");
  assert.equal(await app.options().onSaveCkda({ sizePx: 11, premiumOverride: true, extra: "discard" }), true);
  assert.equal(app.calls.saves.length, 1);
  assert.equal(app.calls.saves[0].ckdaSettings.sizePx, 11);
  assert.equal(app.calls.saves[0].ckdaSettings.extra, undefined);
  assert.equal(app.calls.canvas.at(-1).settings.sizePx, 11);
  assert.equal(app.calls.commands.filter(value => value.type === "set-premium").at(-1).payload.enabled, true);
  assert.equal(await app.options().onSaveCkda({ sizePx: -1 }), false);
  assert.equal(app.calls.saves.length, 1);
  assert.equal(app.model().ckdaSettings.sizePx, 11);
  assert.equal(app.calls.destroyed.length, 0);
  assert.equal(app.calls.stops, 0);
});

test("C-KDA snapshots stay separate and malformed snapshots leave last state intact", () => {
  const app = setup();
  const bot = { bot: true };
  app.botSnapshot(bot);
  app.snapshot(snapshot());
  const previous = app.model().ckdaSnapshot;
  app.snapshot({ ...snapshot(), mapId: -1 });
  assert.equal(app.model().snapshot, bot);
  assert.equal(app.model().ckdaSnapshot, previous);
  assert.deepEqual(app.calls.botSnapshots, [bot]);
  assert.equal(app.calls.canvas.at(-1).snapshot.mapId, 17);
});

test("C-KDA listener errors report C-KDA status without disturbing BOT", () => {
  const app = setup();
  app.throwCanvas();
  assert.doesNotThrow(() => app.snapshot(snapshot()));
  assert.equal(app.model().ckdaStatus.state, "error");
  assert.equal(app.calls.stops, 0);
  assert.equal(app.calls.botSnapshots.length, 0);
});

test("visibility recovery hides old markers and only requests fresh C-KDA data", () => {
  const app = setup();
  app.snapshot(snapshot());
  app.document.visibilityState = "hidden";
  const count = app.calls.commands.length;
  app.document.emit("visibilitychange");
  assert.equal(app.calls.commands.length, count);
  app.document.visibilityState = "visible";
  app.document.emit("visibilitychange");
  assert.equal(app.calls.commands.at(-1).type, "refresh");
  assert.deepEqual(app.calls.canvas.at(-1), { clear: true });
  assert.equal(app.model().ckdaSnapshot, null);
  assert.equal(app.calls.starts + app.calls.stops, 0);
  app.snapshot(snapshot());
  assert.equal(app.calls.canvas.at(-1).snapshot.mapId, 17);
});

test("clear erases local markers and forwards the clear command", () => {
  const app = setup();
  app.snapshot(snapshot());
  app.options().onCkdaCommand("clear");
  assert.equal(app.calls.commands.at(-1).type, "clear");
  assert.deepEqual(app.calls.canvas.at(-1), { clear: true });
});

test("pagehide cleanup is idempotent and detaches visibility recovery", () => {
  const app = setup();
  app.window.emit("pagehide");
  app.window.emit("beforeunload");
  app.window.emit("pagehide");
  assert.deepEqual(app.calls.destroyed.sort(), ["bridge", "canvas", "ckda-bridge", "overlay", "runtime", "shortcut"]);
  assert.equal(app.document.count("visibilitychange"), 0);
});

test("pagehide before storage returns prevents late UI and runtime creation", () => {
  const app = setup({}, true);
  app.window.emit("pagehide");
  app.load();
  assert.equal(app.options(), undefined);
  assert.deepEqual(app.calls.destroyed.sort(), ["bridge", "ckda-bridge"]);
});

test("late MAIN readiness resends persisted C-KDA configuration without BOT lifecycle changes", () => {
  const app = setup({ ckdaSettings: { premiumOverride: true, empCooldownMs: 15000, sizePx: -1 } });
  assert.equal(app.model().ckdaSettings.sizePx, 8);
  app.calls.commands.length = 0;
  app.result({ type: "ready" });
  assert.deepEqual(app.calls.commands.map(value => value.type), ["configure-effects", "set-premium", "refresh"]);
  assert.equal(app.calls.commands[0].payload.empCooldownMs, 15000);
  assert.equal(app.calls.commands[1].payload.enabled, true);
  assert.equal(app.calls.starts + app.calls.stops, 0);
});

test("snapshot received during storage load reaches only C-KDA after initialization", () => {
  const app = setup({}, true);
  app.snapshot(snapshot());
  app.load();
  assert.equal(app.model().ckdaSnapshot.mapId, 17);
  assert.equal(app.calls.botSnapshots.length, 0);
  assert.equal(app.calls.canvas.at(-1).snapshot.mapId, 17);
});

test("C-KDA bridge startup failure still initializes BOT and reports C-KDA error", () => {
  let app;
  assert.doesNotThrow(() => { app = setup({}, false, true); });
  app.botSnapshot({ bot: true });
  assert.equal(app.calls.botSnapshots.length, 1);
  assert.equal(app.model().ckdaStatus.state, "error");
  app.window.emit("pagehide");
  assert.equal(app.calls.destroyed.includes("runtime"), true);
});

test("MAIN error results and local listener errors render visible C-KDA errors", () => {
  const app = setup();
  app.snapshot({ ...snapshot(), premiumState: "active" });
  app.result({ type: "set-premium", requestId: 1, state: "error" });
  assert.equal(app.calls.statusText, "C-KDA error");
  assert.equal(app.model().ckdaStatus.state, "error");
  app.snapshot(snapshot());
  assert.equal(app.calls.statusText, "C-KDA error");
  app.throwCanvas();
  app.snapshot(snapshot());
  assert.equal(app.calls.statusText, "C-KDA error");
  assert.equal(app.calls.starts + app.calls.stops, 0);
});

test("unsupported source fingerprint diagnostics mark C-KDA unsupported even when no roots arrive", () => {
  const app = setup({}, true);
  app.diagnostic({ patchStatus: "unsupported", clientVersion: null, reason: "root-fingerprint-mismatch" });
  app.load();
  assert.equal(app.calls.statusText, "Unsupported client");
  app.document.emit("visibilitychange");
  assert.equal(app.calls.statusText, "Unsupported client");
  assert.equal(app.model().ckdaSnapshot, null);
  app.snapshot(snapshot());
  assert.equal(app.model().ckdaSnapshot, null);
  assert.equal(app.calls.statusText, "Unsupported client");
  assert.equal(app.calls.starts + app.calls.stops, 0);
});

test("mismatched adapter version clears C-KDA markers without touching BOT runtime", () => {
  const app = setup();
  app.snapshot(snapshot());
  app.diagnostic({ patchStatus: "patched", clientVersion: "1.9.0.052" });
  assert.equal(app.calls.statusText, "Unsupported client");
  assert.equal(app.model().ckdaSnapshot, null);
  assert.deepEqual(app.calls.canvas.at(-1), { clear: true });
  assert.equal(app.calls.starts + app.calls.stops, 0);
});

test("rejected C-KDA storage save returns failure without applying settings or Premium", async () => {
  let rejectSave = true;
  const app = setup({}, false, false, () => rejectSave ? Promise.reject(new Error("storage unavailable")) : Promise.resolve());
  app.snapshot(snapshot());
  const commandCount = app.calls.commands.length;
  assert.equal(await app.options().onSaveCkda({ premiumOverride: true, sizePx: 11 }), false);
  assert.equal(app.model().ckdaSettings.premiumOverride, false);
  assert.equal(app.model().ckdaSettings.sizePx, 8);
  assert.equal(app.calls.commands.length, commandCount);
  assert.equal(app.calls.statusText, "C-KDA save failed");
  app.snapshot(snapshot());
  assert.equal(app.calls.statusText, "C-KDA save failed");
  app.document.emit("visibilitychange");
  assert.equal(app.calls.statusText, "C-KDA save failed");
  rejectSave = false;
  assert.equal(await app.options().onSaveCkda({ sizePx: 11 }), true);
  assert.notEqual(app.calls.statusText, "C-KDA save failed");
  assert.equal(app.calls.starts + app.calls.stops, 0);
});

test("C-KDA save waits for storage completion and ignores completion after pagehide", async () => {
  let completeSave;
  const app = setup({}, false, false, () => new Promise(resolve => { completeSave = resolve; }));
  const commandCount = app.calls.commands.length;
  const saved = app.options().onSaveCkda({ premiumOverride: true });
  assert.equal(app.calls.commands.length, commandCount);
  assert.equal(await app.options().onSaveCkda({ sizePx: 12 }), false);
  assert.equal(app.calls.saves.length, 1);
  assert.equal(app.model().ckdaSettings.premiumOverride, false);
  app.window.emit("pagehide");
  completeSave();
  assert.equal(await saved, false);
  assert.equal(app.calls.commands.length, commandCount);
});

for (const failure of ["save-failed", "error"]) {
  test(`unsupported source gate survives ${failure} before a queued valid player snapshot`, async () => {
    const app = setup({}, false, false, () => Promise.reject(new Error("storage unavailable")));
    const playerSnapshot = { ...snapshot(), players: [{
      id: 8, screenX: 100, screenY: 100, relation: "enemy", cloaked: true,
      observedAt: 1000, empEndsAt: null, ishEndsAt: null
    }] };
    app.snapshot(playerSnapshot);
    app.diagnostic({ patchStatus: "unsupported", clientVersion: null, reason: "root-fingerprint-mismatch" });
    assert.equal(app.model().ckdaSnapshot, null);
    assert.deepEqual(app.calls.canvas.at(-1), { clear: true });
    const canvasCallsAfterUnsupported = app.calls.canvas.length;
    if (failure === "save-failed") {
      assert.equal(await app.options().onSaveCkda({ sizePx: 11 }), false);
    } else {
      app.result({ type: "set-premium", requestId: 1, state: "error" });
    }
    assert.equal(app.model().ckdaStatus.state, failure);
    app.snapshot(playerSnapshot);
    assert.equal(app.model().ckdaSnapshot, null);
    assert.equal(app.calls.canvas.length, canvasCallsAfterUnsupported);
    assert.equal(app.calls.starts + app.calls.stops, 0);
  });
}

test("MAIN unsupported result clears observations and remains closed after an error result", () => {
  const app = setup();
  app.snapshot(snapshot());
  app.result({ state: "unsupported-client" });
  assert.equal(app.model().ckdaSnapshot, null);
  assert.deepEqual(app.calls.canvas.at(-1), { clear: true });
  app.result({ state: "error" });
  app.snapshot(snapshot());
  assert.equal(app.model().ckdaSnapshot, null);
});
