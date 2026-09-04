const test = require("node:test");
const assert = require("node:assert/strict");
const { createController } = require("../src/controller.js");
const { createRuntime, installEmergencyStop } = require("../src/runtime.js");

const settings = {
  kiteDistance: 700,
  dangerRadius: 550,
  fleeHpPercent: 35,
  resumeHpPercent: 100,
  ammoKey: "1",
  planningIntervalMs: 100,
  movementIntervalMs: 250,
  targetBlacklistMs: 5000
};

function snapshot(overrides = {}) {
  return {
    timestamp: 1000,
    clientVersion: "1.9.0.049",
    connectionState: "connected",
    mapId: 17,
    player: {
      id: "hero",
      x: 0,
      y: 0,
      hpPercent: 100,
      alive: true,
      moving: false,
      inCombat: false
    },
    target: null,
    entities: [{
      id: "npc-1",
      type: "npc",
      x: 900,
      y: 0,
      hpPercent: 100,
      alive: true
    }],
    ...overrides
  };
}

function fixture() {
  let clock = 1000;
  let watchdog;
  const sent = [];
  const logs = [];
  const controller = createController({ settings, now: () => clock });
  const runtime = createRuntime({
    controller,
    bridge: { sendAction(action) { sent.push(action); return sent.length; } },
    logger: { add(type, data) { logs.push({ type, data }); } },
    now: () => clock,
    staleAfterMs: 2000,
    setIntervalRef(callback) { watchdog = callback; return 5; },
    clearIntervalRef() {}
  });
  return {
    controller,
    logs,
    runtime,
    sent,
    setClock(value) { clock = value; },
    watchdog() { watchdog(); }
  };
}

test("runtime arms before dispatching controller NPC actions", () => {
  const item = fixture();

  assert.equal(item.runtime.start(snapshot()), true);

  assert.deepEqual(item.sent.slice(0, 2), [
    { type: "arm" },
    { type: "selectNpc", entityId: "npc-1" }
  ]);
  assert.equal(item.sent[2].type, "moveTo");
  assert.equal(item.runtime.isActive(), true);
});

test("runtime Stop immediately disarms and clears controller state", () => {
  const item = fixture();
  item.runtime.start(snapshot());

  item.runtime.stop("user-stop");

  assert.equal(item.runtime.isActive(), false);
  assert.equal(item.controller.getState().name, "STOPPED");
  assert.deepEqual(item.sent.at(-1), { type: "disarm" });
});

test("controller fault disarms active runtime", () => {
  const item = fixture();
  item.runtime.start(snapshot());

  item.runtime.receiveSnapshot(snapshot({ clientVersion: "unknown" }));

  assert.equal(item.runtime.isActive(), false);
  assert.equal(item.controller.getState().name, "FAULT");
  assert.deepEqual(item.sent.at(-1), { type: "disarm" });
});

test("watchdog disarms when no fresh snapshot arrives", () => {
  const item = fixture();
  item.runtime.start(snapshot());
  item.setClock(3001);

  item.watchdog();

  assert.equal(item.runtime.isActive(), false);
  assert.equal(item.controller.getState().reason, "stale-snapshot-watchdog");
  assert.deepEqual(item.sent.at(-1), { type: "disarm" });
});

test("failed MAIN-world action disarms runtime", () => {
  const item = fixture();
  item.runtime.start(snapshot());

  item.runtime.receiveActionResult({
    requestId: 1,
    type: "arm",
    ok: false,
    reason: "adapter-not-ready"
  });

  assert.equal(item.runtime.isActive(), false);
  assert.equal(item.controller.getState().reason, "action-failed:adapter-not-ready");
  assert.deepEqual(item.sent.at(-1), { type: "disarm" });
});

test("runtime disarms when controller processing throws", () => {
  const sent = [];
  const controller = {
    start() {},
    stop(reason) { this.state = { name: "STOPPED", reason }; },
    update() { throw new Error("planner failure"); },
    drainActions() { return []; },
    getState() { return this.state || { name: "SEARCHING", reason: "started" }; }
  };
  const runtime = createRuntime({
    controller,
    bridge: { sendAction(action) { sent.push(action); } },
    logger: { add() {} },
    now: () => 1000,
    setIntervalRef() { return 1; },
    clearIntervalRef() {}
  });

  assert.equal(runtime.start(snapshot()), false);
  assert.equal(runtime.isActive(), false);
  assert.equal(controller.getState().reason, "runtime-exception");
  assert.deepEqual(sent.at(-1), { type: "disarm" });
});

test("watchdog detects scheduler suspension even after a fresh snapshot", () => {
  const item = fixture();
  item.runtime.start(snapshot());
  item.setClock(4000);
  item.runtime.receiveSnapshot(snapshot({ timestamp: 4000 }));

  item.watchdog();

  assert.equal(item.runtime.isActive(), false);
  assert.equal(item.controller.getState().reason, "watchdog-scheduler-delay");
});

test("Shift+Escape performs emergency stop and detaches cleanly", () => {
  const listeners = {};
  const calls = [];
  const windowRef = {
    addEventListener(name, callback) { listeners[name] = callback; },
    removeEventListener(name, callback) {
      if (listeners[name] === callback) delete listeners[name];
    }
  };
  const remove = installEmergencyStop(windowRef, () => calls.push("stop"));

  listeners.keydown({ code: "Escape", shiftKey: true });
  assert.deepEqual(calls, ["stop"]);
  remove();
  assert.equal(listeners.keydown, undefined);
});

test("runtime disarms when a render callback throws", () => {
  const sent = [];
  let changes = 0;
  const controller = createController({ settings, now: () => 1000 });
  const runtime = createRuntime({
    controller,
    bridge: { sendAction(action) { sent.push(action); } },
    logger: { add() {} },
    now: () => 1000,
    setIntervalRef() { return 1; },
    clearIntervalRef() {},
    onChange() {
      changes += 1;
      if (changes === 2) throw new Error("render failure");
    }
  });
  runtime.start(snapshot());

  runtime.receiveSnapshot(snapshot({ entities: [] }));

  assert.equal(runtime.isActive(), false);
  assert.equal(controller.getState().reason, "runtime-callback-exception");
  assert.deepEqual(sent.at(-1), { type: "disarm" });
});

test("runtime disarms when result logging throws", () => {
  const sent = [];
  let failLogging = false;
  const controller = createController({ settings, now: () => 1000 });
  const runtime = createRuntime({
    controller,
    bridge: { sendAction(action) { sent.push(action); } },
    logger: {
      add() {
        if (failLogging) throw new Error("log failure");
      }
    },
    now: () => 1000,
    setIntervalRef() { return 1; },
    clearIntervalRef() {}
  });
  runtime.start(snapshot());
  failLogging = true;

  runtime.receiveActionResult({
    requestId: 1,
    type: "arm",
    ok: true,
    reason: "armed"
  });

  assert.equal(runtime.isActive(), false);
  assert.equal(controller.getState().reason, "runtime-callback-exception");
  assert.deepEqual(sent.at(-1), { type: "disarm" });
});
