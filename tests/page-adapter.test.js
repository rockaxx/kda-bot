const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSnapshot,
  createActionExecutor,
  createPatchedBlobConstructor,
  resolveSafeMovementPoint,
  publishDiagnostic,
  startSnapshotPublisher
} = require("../src/page-adapter.js");
const { patchGameSource } = require("../src/source-patch.js");

class FakeBlob {
  constructor(parts, options) {
    this.parts = parts;
    this.options = options;
  }
}

const recognizedSource =
  "const _0x416562='1.9.0.045';" +
  "_0x429744['mapId'];_0x22a0bf['ship'];" +
  "_0x607b9['gamepadTargeter'];_0x229c50['initListeners'];";

test("Blob proxy patches only recognized JavaScript source", () => {
  const statuses = [];
  const PatchedBlob = createPatchedBlobConstructor(
    FakeBlob,
    patchGameSource,
    (status) => statuses.push(status)
  );

  const blob = new PatchedBlob([recognizedSource], {
    type: "application/javascript"
  });

  assert.match(blob.parts[0], /__SA_BOT_ROOTS__/);
  assert.equal(statuses[0].status, "patched");
});

test("Blob proxy preserves non-JavaScript parts", () => {
  const parts = ["plain text"];
  const PatchedBlob = createPatchedBlobConstructor(
    FakeBlob,
    patchGameSource,
    () => {
      throw new Error("status callback must not run");
    }
  );

  const blob = new PatchedBlob(parts, { type: "text/plain" });

  assert.equal(blob.parts, parts);
  assert.deepEqual(blob.options, { type: "text/plain" });
});

test("diagnostic publisher includes captured client source separately", () => {
  const messages = [];
  const windowRef = {
    postMessage(message, target) {
      assert.equal(target, "*");
      messages.push(message);
    }
  };

  publishDiagnostic(
    windowRef,
    { patchStatus: "unsupported", reason: "root-fingerprint-mismatch" },
    "const liveClient = true;"
  );

  assert.deepEqual(messages.map((message) => message.direction), [
    "diagnostic",
    "source"
  ]);
  assert.equal(messages[1].payload.source, "const liveClient = true;");
});

function liveRoots(overrides = {}) {
  const npc = {
    ID: 200,
    isNpc: true,
    x: 900,
    y: 200,
    HP: 120,
    maxHp: { 1: 100 },
    config: 1,
    destroyed: false
  };
  const player = {
    ID: 300,
    isNpc: false,
    x: 400,
    y: 300,
    HP: 100,
    maxHp: { 1: 100 },
    config: 1,
    destroyed: false
  };
  return {
    version: "n1.9.0.052",
    network: { connected: true },
    ui: {
      ACTION_BAR: {
        handleCheckKeypress() { return true; }
      }
    },
    user: {
      userID: 77,
      ship: {
        x: 10,
        y: 20,
        HP: 75,
        maxHp: { 1: 100 },
        config: 1,
        destroyed: false,
        speed: { x: 2, y: 0 },
        isAttacking: true,
        targetID: 200,
        setDestination() {},
        stopFlying() {}
      }
    },
    world: {
      mapId: "5",
      MAP_SHIPS: new Map([[200, npc], [300, player]]),
      checkShipWillHitBarrier() { return false; }
    },
    ...overrides
  };
}

test("normalizes current live roots into an NPC-only snapshot", () => {
  const snapshot = createSnapshot(liveRoots(), 1234);

  assert.deepEqual(snapshot, {
    timestamp: 1234,
    clientVersion: "1.9.0.052",
    connectionState: "connected",
    mapId: 5,
    player: {
      id: 77,
      x: 10,
      y: 20,
      hpPercent: 75,
      alive: true,
      moving: true,
      inCombat: true
    },
    target: { id: 200, type: "npc", alive: true },
    entities: [
      {
        id: 200,
        type: "npc",
        x: 900,
        y: 200,
        hpPercent: 100,
        alive: true
      }
    ]
  });
});

test("snapshot remains NPC-only when live roots also contain players", () => {
  const snapshot = createSnapshot(liveRoots(), 1234);

  assert.deepEqual(snapshot.entities.map((entity) => entity.type), ["npc"]);
  assert.equal(snapshot.entities.some((entity) => entity.id === 300), false);
});

test("rejects incomplete roots instead of publishing guessed state", () => {
  assert.equal(createSnapshot({}, 1234), null);
  assert.equal(
    createSnapshot(liveRoots({ world: { mapId: 5, MAP_SHIPS: {} } }), 1234),
    null
  );
});

test("snapshot reports the live client connection state", () => {
  assert.equal(
    createSnapshot(liveRoots({ network: { connected: false } }), 1234)
      .connectionState,
    "disconnected"
  );
});

test("snapshot and actions use the ship server ID instead of a map storage key", () => {
  const roots = liveRoots();
  const npc = roots.world.MAP_SHIPS.get(200);
  npc.ID = 444;
  roots.world.MAP_SHIPS = new Map([["render-key", npc]]);
  roots.user.ship.targetID = null;
  const calls = [];
  const messages = [];
  roots.user.requestTarget = (id) => calls.push(id);
  roots.user.forceMovement = () => {};
  roots.user.processDestMinimap = () => {};
  roots.input = { keyLookupObj: { Digit1() {} } };
  const windowRef = { postMessage(message) { messages.push(message); } };
  const executor = createActionExecutor(windowRef, roots);

  assert.equal(createSnapshot(roots, 1234).entities[0].id, 444);
  executor.handleMessage(actionEvent(windowRef, { requestId: 1, type: "arm" }));
  executor.handleMessage(actionEvent(windowRef, {
    requestId: 2,
    type: "selectNpc",
    entityId: 444
  }));

  assert.deepEqual(calls, [444]);
  assert.equal(messages.at(-1).payload.ok, true);
});

test("never exposes or selects a render key when server ID is missing", () => {
  const roots = liveRoots();
  const npc = roots.world.MAP_SHIPS.get(200);
  delete npc.ID;
  roots.world.MAP_SHIPS = new Map([["render-key", npc]]);
  roots.user.ship.targetID = null;
  const calls = [];
  const messages = [];
  roots.user.requestTarget = (id) => calls.push(id);
  roots.user.forceMovement = () => {};
  roots.user.processDestMinimap = () => {};
  roots.input = { keyLookupObj: { Digit1() {} } };
  const windowRef = { postMessage(message) { messages.push(message); } };
  const executor = createActionExecutor(windowRef, roots);

  assert.deepEqual(createSnapshot(roots, 1234).entities, []);
  executor.handleMessage(actionEvent(windowRef, { requestId: 1, type: "arm" }));
  executor.handleMessage(actionEvent(windowRef, {
    requestId: 2,
    type: "selectNpc",
    entityId: "render-key"
  }));

  assert.deepEqual(calls, []);
  assert.equal(messages.at(-1).payload.reason, "target-not-live-npc");
});

test("snapshot publisher emits immediately and on its 100 ms timer", () => {
  const messages = [];
  let scheduled;
  const windowRef = {
    postMessage(message) { messages.push(message); },
    setInterval(callback, delay) {
      scheduled = { callback, delay };
      return 9;
    }
  };

  const timerId = startSnapshotPublisher(
    windowRef,
    liveRoots(),
    100,
    () => 1234
  );

  assert.equal(timerId, 9);
  assert.equal(scheduled.delay, 100);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].direction, "snapshot");
  scheduled.callback();
  assert.equal(messages.length, 2);
});

test("movement resolver keeps a 300-unit margin before map danger barrier", () => {
  const world = {
    checkShipWillHitBarrier(x, y, dx) {
      return x + dx > 1000;
    }
  };

  assert.deepEqual(
    resolveSafeMovementPoint(
      world,
      { x: 500, y: 200 },
      { x: 1500, y: 200 }
    ),
    {
      status: "adjusted",
      point: { x: 700, y: 200 },
      reason: "map-boundary-margin"
    }
  );
});

test("movement resolver preserves a fully safe route", () => {
  const world = { checkShipWillHitBarrier() { return false; } };

  assert.deepEqual(
    resolveSafeMovementPoint(world, { x: 500, y: 200 }, { x: 900, y: 300 }),
    {
      status: "safe",
      point: { x: 900, y: 300 },
      reason: "safe-map-route"
    }
  );
});

function actionFixture() {
  const messages = [];
  const calls = [];
  const localStops = [];
  const roots = liveRoots();
  roots.user.ship.stopFlying = (stopPal, zeroSpeed) => {
    localStops.push([stopPal, zeroSpeed]);
  };
  roots.user.requestTarget = (id) => calls.push(["target", id]);
  roots.user.forceMovement = (x, y) => calls.push(["move", x, y]);
  roots.user.processDestMinimap = (point) => calls.push(["navigate", point]);
  roots.input = {
    keyLookupObj: {
      Digit1() { calls.push(["key", "Digit1"]); }
    }
  };
  roots.ui.ACTION_BAR.handleCheckKeypress = (code) => {
    calls.push(["action-bar", code]);
    return true;
  };
  const windowRef = {
    postMessage(message) { messages.push(message); }
  };
  return {
    calls,
    localStops,
    messages,
    roots,
    windowRef,
    executor: createActionExecutor(windowRef, roots)
  };
}

function actionEvent(windowRef, payload) {
  return {
    source: windowRef,
    data: { channel: "sa-bot-v1", direction: "action", payload }
  };
}

test("action executor stays disarmed until an explicit arm request", () => {
  const fixture = actionFixture();

  fixture.executor.handleMessage(actionEvent(fixture.windowRef, {
    requestId: 1,
    type: "selectNpc",
    entityId: 200
  }));

  assert.deepEqual(fixture.calls, []);
  assert.equal(fixture.messages.at(-1).payload.reason, "not-armed");
});

test("action executor refuses to arm an unsupported client version", () => {
  const fixture = actionFixture();
  fixture.roots.version = "1.9.0.045";

  fixture.executor.handleMessage(actionEvent(fixture.windowRef, {
    requestId: 1,
    type: "arm"
  }));

  assert.equal(fixture.executor.isArmed(), false);
  assert.equal(fixture.messages.at(-1).payload.reason, "unsupported-client-version");
});

test("action executor refuses to arm without normal client navigation", () => {
  const fixture = actionFixture();
  delete fixture.roots.user.processDestMinimap;

  fixture.executor.handleMessage(actionEvent(fixture.windowRef, {
    requestId: 1,
    type: "arm"
  }));

  assert.equal(fixture.executor.isArmed(), false);
  assert.equal(fixture.messages.at(-1).payload.reason, "adapter-not-ready");
});

test("action executor refuses to arm without immediate local stop", () => {
  const fixture = actionFixture();
  delete fixture.roots.user.ship.stopFlying;

  fixture.executor.handleMessage(actionEvent(fixture.windowRef, {
    requestId: 1,
    type: "arm"
  }));

  assert.equal(fixture.executor.isArmed(), false);
  assert.equal(fixture.messages.at(-1).payload.reason, "adapter-not-ready");
});

test("armed executor selects NPCs but rejects player entities", () => {
  const fixture = actionFixture();
  fixture.executor.handleMessage(actionEvent(fixture.windowRef, { requestId: 1, type: "arm" }));
  fixture.executor.handleMessage(actionEvent(fixture.windowRef, {
    requestId: 2,
    type: "selectNpc",
    entityId: 300
  }));
  fixture.executor.handleMessage(actionEvent(fixture.windowRef, {
    requestId: 3,
    type: "selectNpc",
    entityId: 200
  }));

  assert.deepEqual(fixture.calls, [["target", 200]]);
  assert.equal(fixture.messages[1].payload.reason, "target-not-live-npc");
  assert.equal(fixture.messages[2].payload.ok, true);
});

test("armed executor moves and activates bound action-bar ammo for a live NPC target", () => {
  const fixture = actionFixture();
  fixture.executor.handleMessage(actionEvent(fixture.windowRef, { requestId: 1, type: "arm" }));
  fixture.executor.handleMessage(actionEvent(fixture.windowRef, {
    requestId: 2,
    type: "moveTo",
    x: 111,
    y: 222
  }));
  fixture.executor.handleMessage(actionEvent(fixture.windowRef, {
    requestId: 3,
    type: "pressAmmoKey",
    key: "1"
  }));
  fixture.roots.user.ship.targetID = 300;
  fixture.executor.handleMessage(actionEvent(fixture.windowRef, {
    requestId: 4,
    type: "pressAmmoKey",
    key: "1"
  }));

  assert.deepEqual(fixture.calls, [
    ["navigate", { x: 111, y: 222 }],
    ["action-bar", "Digit1"]
  ]);
  assert.equal(fixture.messages.at(-1).payload.reason, "target-not-live-npc");
});

test("ammo action reports unavailable when action bar has no matching bind", () => {
  const fixture = actionFixture();
  fixture.roots.ui.ACTION_BAR.handleCheckKeypress = () => false;
  fixture.executor.handleMessage(actionEvent(fixture.windowRef, { requestId: 1, type: "arm" }));
  fixture.executor.handleMessage(actionEvent(fixture.windowRef, {
    requestId: 2,
    type: "pressAmmoKey",
    key: "1"
  }));

  assert.equal(fixture.messages.at(-1).payload.ok, false);
  assert.equal(fixture.messages.at(-1).payload.reason, "ammo-bind-unavailable");
});

test("target-bound movement is rejected when NPC vanished", () => {
  const fixture = actionFixture();
  fixture.executor.handleMessage(actionEvent(fixture.windowRef, { requestId: 1, type: "arm" }));
  fixture.roots.world.MAP_SHIPS.delete(200);
  fixture.executor.handleMessage(actionEvent(fixture.windowRef, {
    requestId: 2,
    type: "moveTo",
    entityId: 200,
    x: 111,
    y: 222
  }));

  assert.equal(fixture.messages.at(-1).payload.reason, "target-not-live-npc");
  assert.equal(fixture.calls.some((call) => call[0] === "move"), false);
});

test("armed executor clamps movement before the map danger zone", () => {
  const fixture = actionFixture();
  fixture.roots.world.checkShipWillHitBarrier = (x, y, dx) => x + dx > 1000;
  fixture.roots.user.ship.x = 500;
  fixture.roots.user.ship.y = 200;
  fixture.executor.handleMessage(actionEvent(fixture.windowRef, { requestId: 1, type: "arm" }));
  fixture.executor.handleMessage(actionEvent(fixture.windowRef, {
    requestId: 2,
    type: "moveTo",
    x: 1500,
    y: 200
  }));

  assert.deepEqual(fixture.calls.at(-1), ["navigate", { x: 700, y: 200 }]);
  assert.equal(fixture.messages.at(-1).payload.ok, true);
  assert.equal(fixture.messages.at(-1).payload.reason, "map-boundary-margin");
});

test("armed executor stops actions immediately after client disconnect", () => {
  const fixture = actionFixture();
  fixture.executor.handleMessage(actionEvent(fixture.windowRef, { requestId: 1, type: "arm" }));
  fixture.roots.network.connected = false;

  fixture.executor.handleMessage(actionEvent(fixture.windowRef, {
    requestId: 2,
    type: "moveTo",
    x: 111,
    y: 222
  }));

  assert.equal(fixture.executor.isArmed(), false);
  assert.equal(fixture.messages.at(-1).payload.reason, "connection-not-ready");
  assert.equal(
    fixture.calls.some((call) => call[0] === "move" && call[1] === 111),
    false
  );
});

test("player failure performs cleanup before disarming", () => {
  const fixture = actionFixture();
  fixture.executor.handleMessage(actionEvent(fixture.windowRef, { requestId: 1, type: "arm" }));
  fixture.roots.user.ship.HP = 0;

  fixture.executor.handleMessage(actionEvent(fixture.windowRef, {
    requestId: 2,
    type: "moveTo",
    x: 111,
    y: 222
  }));

  assert.equal(fixture.executor.isArmed(), false);
  assert.equal(fixture.messages.at(-1).payload.reason, "player-not-ready");
  assert.deepEqual(fixture.calls.slice(-2), [
    ["target", null],
    ["move", 10, 20]
  ]);
});

test("disarm immediately clears target and cancels movement", () => {
  const fixture = actionFixture();
  fixture.executor.handleMessage(actionEvent(fixture.windowRef, { requestId: 1, type: "arm" }));
  fixture.executor.handleMessage(actionEvent(fixture.windowRef, { requestId: 2, type: "disarm" }));

  assert.equal(fixture.executor.isArmed(), false);
  assert.deepEqual(fixture.calls, [
    ["target", null],
    ["move", 10, 20]
  ]);
  assert.deepEqual(fixture.localStops, [[false, true]]);
  assert.equal(fixture.messages.at(-1).payload.ok, true);
});

test("cleanup still dispatches server stop when local stop throws", () => {
  const fixture = actionFixture();
  fixture.executor.handleMessage(actionEvent(fixture.windowRef, { requestId: 1, type: "arm" }));
  fixture.roots.user.ship.stopFlying = () => {
    throw new Error("local stop failure");
  };

  fixture.executor.handleMessage(actionEvent(fixture.windowRef, {
    requestId: 2,
    type: "disarm"
  }));

  assert.deepEqual(fixture.calls.slice(-2), [
    ["target", null],
    ["move", 10, 20]
  ]);
  assert.equal(fixture.messages.at(-1).payload.reason, "cleanup-exception");
});

test("cleanup still cancels movement when target clearing throws", () => {
  const fixture = actionFixture();
  fixture.executor.handleMessage(actionEvent(fixture.windowRef, { requestId: 1, type: "arm" }));
  fixture.roots.user.requestTarget = () => { throw new Error("target failure"); };

  fixture.executor.handleMessage(actionEvent(fixture.windowRef, { requestId: 2, type: "disarm" }));

  assert.deepEqual(fixture.calls.at(-1), ["move", 10, 20]);
  assert.equal(fixture.executor.isArmed(), false);
  assert.equal(fixture.messages.at(-1).payload.ok, false);
});

test("MAIN pagehide cleanup disarms synchronously", () => {
  const fixture = actionFixture();
  const listeners = {};
  fixture.windowRef.addEventListener = (name, callback) => { listeners[name] = callback; };
  const { installActionExecutor } = require("../src/page-adapter.js");
  const executor = installActionExecutor(fixture.windowRef, fixture.roots);
  executor.handleMessage(actionEvent(fixture.windowRef, { requestId: 1, type: "arm" }));

  listeners.pagehide();

  assert.equal(executor.isArmed(), false);
  assert.deepEqual(fixture.calls.slice(-2), [
    ["target", null],
    ["move", 10, 20]
  ]);
});
