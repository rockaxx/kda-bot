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
  const timers = new Map();
  let nextTimer = 0;
  let elapsed = 0;
  window.performance = { timeOrigin: 1000, now: () => elapsed };
  window.setInterval = (callback, delay) => { timers.set(++nextTimer, { callback, delay }); return nextTimer; };
  window.clearInterval = id => timers.delete(id);
  const document = { ...eventTarget(), visibilityState: "visible" };
  const calls = { commands: [], saves: [], canvas: [], botSnapshots: [], destroyed: [], starts: 0, stops: 0 };
  let options;
  let botBridge;
  let ckdaBridge;
  let storageCallback;
  let model;
  let canvasThrows = false;
  let failingCommand = null;
  const runtime = {
    getState: () => ({ state: "idle" }), isActive: () => false,
    start() { calls.starts++; }, stop() { calls.stops++; },
    receiveSnapshot(value) { calls.botSnapshots.push(value); },
    receiveActionResult() {}, destroy() { calls.destroyed.push("runtime"); }
  };
  window.__SA_BOT_ISOLATED_V1__ = {
    ...require("../src/settings.js"), ...require("../src/ckda-settings.js"),
    ...require("../src/design-settings.js"),
    ...require("../src/ckda-schema.js"),
    ...require("../src/ckda-core.js"),
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
        sendCommand(type, payload) {
          if (type === failingCommand) throw new Error("C-KDA send failed");
          calls.commands.push({ type, payload });
        },
        destroy() { calls.destroyed.push("ckda-bridge"); }
      };
    },
    createCkdaCanvas(value) {
      calls.canvasOptions = value;
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
  const chrome = { runtime: { id: "test-extension" }, storage: { local: {
    get(keys, callback) { calls.keys = keys; storageCallback = callback; if (!deferred) callback(stored); },
    set(value) { calls.saves.push(value); return storageSet(value); }
  } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/content.js"), "utf8"), {
    window, document, chrome, TextEncoder, Date
  });
  return {
    window, document, chrome, calls, timers, options: () => options, model: () => model,
    tick(delay) { for (const timer of [...timers.values()]) if (delay === undefined || timer.delay === delay) timer.callback(); },
    setNow(value) { elapsed = value - 1000; },
    failCommand(type) { failingCommand = type; },
    snapshot(value) { ckdaBridge?.onSnapshot(value); },
    result(value) { ckdaBridge?.onResult(value); },
    botSnapshot(value) { botBridge.onSnapshot(value); },
    diagnostic(value) { botBridge.onDiagnostic(value); },
    load() { storageCallback(stored); },
    throwCanvas() { canvasThrows = true; }
  };
}

function snapshot(timestamp = 1000) {
  return { timestamp, clientVersion: "1.9.0.052", connectionState: "connected",
    mapId: 17, premiumState: "inactive", players: [] };
}

function playerSnapshot(timestamp = 1000) {
  return { ...snapshot(timestamp), players: [{
    id: 8, screenX: 100, screenY: 100, relation: "enemy", cloaked: true,
    observedAt: timestamp, empEndsAt: null, ishEndsAt: null
  }] };
}

test("stale manifest dependency set exits without an uncaught startup error", () => {
  const window = eventTarget();
  const status = { textContent: "KDA loading…" };
  window.__SA_BOT_ISOLATED_V1__ = {
    createBridge() {
      return { start() {}, stop() {} };
    }
  };
  const chrome = { storage: { local: {} } };
  const document = { getElementById: () => status };

  assert.doesNotThrow(() => {
    vm.runInNewContext(
      fs.readFileSync(path.join(__dirname, "../src/content.js"), "utf8"),
      { window, chrome, document }
    );
  });
  assert.match(status.textContent, /createCkdaBridge/);
  assert.match(status.textContent, /createMonotonicEpochClock/);
});

test("C-KDA watchdog clears silent publisher data at 2000 ms and recovers without BOT restart", () => {
  const app = setup();
  app.snapshot(playerSnapshot());
  assert.equal(app.model().ckdaStatus.state, "ready");
  assert.equal(app.model().ckdaSnapshot.players.length, 1);
  app.setNow(2999);
  app.tick(250);
  assert.equal(app.model().ckdaStatus.state, "ready");
  app.setNow(3000);
  app.tick(250);
  assert.equal(app.model().ckdaSnapshot, null);
  assert.deepEqual(app.calls.canvas.at(-1), { clear: true });
  assert.equal(app.calls.statusText, "Waiting for game");
  app.snapshot(playerSnapshot(3000));
  assert.equal(app.model().ckdaStatus.state, "ready");
  app.snapshot(snapshot(3000));
  assert.equal(app.model().ckdaStatus.state, "no-player-data");
  assert.equal(app.calls.starts + app.calls.stops, 0);
});

test("C-KDA watchdog and canvas share performance epoch time through backward and forward Date jumps", (t) => {
  let wall = 1000;
  t.mock.method(Date, "now", () => wall);
  const app = setup();
  app.snapshot(playerSnapshot());
  wall += 60000;
  app.setNow(1500);
  app.tick(250);
  assert.equal(app.model().ckdaStatus.state, "ready");
  wall -= 120000;
  app.setNow(3000);
  app.tick(250);
  assert.equal(app.model().ckdaSnapshot, null);
  assert.equal(app.calls.statusText, "Waiting for game");
  assert.equal(typeof app.calls.canvasOptions.now, "function");
  assert.equal(app.calls.canvasOptions.now(), 3000);
});

test("malformed, stale, and future C-KDA snapshots cannot renew UI readiness", () => {
  const app = setup();
  app.snapshot(playerSnapshot());
  const previous = app.model().ckdaSnapshot;
  app.setNow(2999);
  app.snapshot({ ...playerSnapshot(2999), mapId: -1 });
  app.snapshot(playerSnapshot(0));
  app.snapshot(playerSnapshot(4000));
  assert.equal(app.model().ckdaSnapshot, previous);
  app.setNow(3000);
  app.tick(250);
  assert.equal(app.model().ckdaSnapshot, null);
  app.snapshot(playerSnapshot(1000));
  assert.equal(app.calls.statusText, "Waiting for game");
});

test("disconnected C-KDA snapshot clears UI and canvas immediately, then fresh connection recovers", () => {
  const app = setup();
  app.snapshot(playerSnapshot());
  app.snapshot({ ...playerSnapshot(), connectionState: "disconnected" });
  assert.equal(app.model().ckdaSnapshot, null);
  assert.deepEqual(app.calls.canvas.at(-1), { clear: true });
  assert.equal(app.calls.statusText, "Waiting for game");
  app.setNow(3000);
  app.tick(250);
  app.snapshot(playerSnapshot(3000));
  assert.equal(app.model().ckdaStatus.state, "ready");
  assert.equal(app.calls.starts + app.calls.stops, 0);
});

for (const state of ["unsupported-client", "error", "save-failed"]) {
  test(`C-KDA silence clears data while preserving higher-priority ${state} status`, async () => {
    const app = setup({}, false, false, () => Promise.reject(new Error("storage unavailable")));
    app.snapshot(playerSnapshot());
    if (state === "save-failed") await app.options().onSaveCkda({ sizePx: 11 });
    else app.result({ state });
    app.setNow(3000);
    app.tick(250);
    assert.equal(app.model().ckdaSnapshot, null);
    assert.equal(app.model().ckdaStatus.state, state);
    app.window.emit("pagehide");
    assert.equal(app.timers.size, 0);
  });
}

test("C-KDA lease send failure reports an error without releasing BOT resources", () => {
  const app = setup();
  app.failCommand("renew-lease");
  app.tick(15000);
  assert.equal(app.model().ckdaStatus.state, "error");
  assert.equal(app.calls.destroyed.includes("runtime"), false);
  assert.equal(app.calls.destroyed.includes("bridge"), false);
  assert.equal(app.calls.starts + app.calls.stops, 0);
  app.window.emit("pagehide");
});

test("content loads independent C-KDA defaults and initializes MAIN settings", () => {
  const app = setup();
  assert.deepEqual(Array.from(app.calls.keys), ["settings", "ckdaSettings", "designSettings"]);
  assert.equal(app.model().ckdaSettings.empCooldownMs, 28000);
  assert.equal(app.model().ckdaSettings.premiumOverride, false);
  assert.deepEqual(app.calls.commands.map(value => value.type), ["renew-lease", "configure-effects", "set-premium", "set-design-rank", "refresh"]);
});

test("Design Mode persists normalized rank and applies it without BOT lifecycle", async () => {
  const app = setup({ designSettings: { rankId: 4, shipDesign: "default" } });
  assert.equal(app.model().designSettings.rankId, 4);
  assert.equal(app.calls.commands.find(value => value.type === "set-design-rank").payload.rankId, 4);
  assert.equal(await app.options().onSaveDesign({ rankId: 19, extra: "discard" }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls.saves.at(-1))), {
    designSettings: { rankId: 19, shipDesign: "default" }
  });
  assert.equal(app.calls.commands.filter(value => value.type === "set-design-rank").at(-1).payload.rankId, 19);
  assert.equal(app.calls.starts + app.calls.stops, 0);
  assert.equal(await app.options().onSaveDesign({ rankId: 21 }), false);
  assert.equal(app.model().designSettings.rankId, 19);
});

test("Design Mode persists Bastion ship choice without BOT lifecycle", async () => {
  const app = setup();
  assert.equal(await app.options().onSaveDesign({ rankId: 0, shipDesign: "bastion" }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls.saves.at(-1))), {
    designSettings: { rankId: 0, shipDesign: "bastion" }
  });
  assert.equal(app.model().designSettings.shipDesign, "bastion");
  assert.equal(app.calls.starts + app.calls.stops, 0);
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
  assert.equal(app.model().ckdaStatus.state, "save-failed");
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

test("isolated content renews its lease every 15000 ms and sends teardown before releasing its bridge", () => {
  const app = setup();
  assert.equal(app.calls.commands[0].type, "renew-lease");
  assert.ok([...app.timers.values()].some(timer => timer.delay === 15000));
  app.calls.commands.length = 0;
  app.tick(15000);
  assert.deepEqual(app.calls.commands.map(command => command.type), ["renew-lease"]);
  app.window.emit("pagehide");
  assert.equal(app.calls.commands.at(-1).type, "teardown");
  assert.equal(app.calls.commands.filter(command => command.type === "teardown").length, 1);
  assert.equal(app.timers.size, 0);
  app.tick();
  app.window.emit("beforeunload");
  assert.equal(app.calls.commands.at(-1).type, "teardown");
});

test("isolated context invalidation stops lease renewal and sends teardown independently of BOT state", () => {
  const app = setup();
  app.chrome.runtime.id = undefined;
  app.tick(15000);
  assert.equal(app.calls.commands.at(-1).type, "teardown");
  assert.equal(app.timers.size, 0);
  assert.ok(app.calls.destroyed.includes("ckda-bridge"));
  assert.equal(app.calls.starts + app.calls.stops, 0);
});

test("pagehide before storage returns prevents late UI and runtime creation", () => {
  const app = setup({}, true);
  app.window.emit("pagehide");
  app.load();
  assert.equal(app.options(), undefined);
  assert.deepEqual(app.calls.destroyed.sort(), ["bridge", "ckda-bridge"]);
  assert.equal(app.calls.commands.at(-1)?.type, "teardown");
  assert.equal(app.timers.size, 0);
});

test("late MAIN readiness resends persisted C-KDA configuration without BOT lifecycle changes", () => {
  const app = setup({ ckdaSettings: { premiumOverride: true, empCooldownMs: 15000, sizePx: -1 } });
  assert.equal(app.model().ckdaSettings.sizePx, 8);
  app.calls.commands.length = 0;
  app.result({ type: "ready" });
  assert.deepEqual(app.calls.commands.map(value => value.type), ["configure-effects", "set-premium", "set-design-rank", "refresh"]);
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
  app.diagnostic({ patchStatus: "patched", clientVersion: "1.9.0.053" });
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
  assert.equal(app.calls.commands.length, commandCount + 1);
  assert.equal(app.calls.commands.at(-1).type, "teardown");
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
