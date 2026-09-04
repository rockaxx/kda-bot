const test = require("node:test");
const assert = require("node:assert/strict");
const { createController } = require("../src/controller.js");

function snapshot(overrides = {}) {
  return {
    timestamp: 1000,
    clientVersion: "1.9.0.049",
    connectionState: "connected",
    mapId: 7,
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
    entities: [],
    ...overrides
  };
}

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

test("selects NPCs on whichever map is currently active", () => {
  const controller = createController({ settings, now: () => 1000 });
  controller.start();
  controller.update(snapshot({
    mapId: 8,
    entities: [{
      id: "map-8-npc",
      type: "npc",
      x: 900,
      y: 0,
      hpPercent: 100,
      alive: true
    }]
  }));

  assert.equal(controller.getState().name, "SELECTING_TARGET");
  const actions = controller.drainActions();
  assert.deepEqual(actions[0], {
    type: "selectNpc",
    entityId: "map-8-npc"
  });
  assert.equal(actions[1].type, "moveTo");
  assert.equal(actions[1].entityId, "map-8-npc");
});

test("accepts the current client version", () => {
  const controller = createController({ settings, now: () => 1000 });
  controller.start();
  controller.update(snapshot({ clientVersion: "1.9.0.049" }));

  assert.equal(controller.getState().name, "SEARCHING");
  assert.notEqual(controller.getState().reason, "unsupported-client-version");
});

test("selects an NPC and requests ammo only after target confirmation", () => {
  const controller = createController({ settings, now: () => 1000 });
  const npc = {
    id: "n1",
    type: "npc",
    x: 900,
    y: 0,
    hpPercent: 100,
    alive: true
  };
  controller.start();
  controller.update(snapshot({ entities: [npc] }));

  const initialActions = controller.drainActions();
  assert.deepEqual(initialActions[0], {
    type: "selectNpc",
    entityId: "n1"
  });
  assert.equal(initialActions[1].type, "moveTo");
  assert.equal(initialActions[1].entityId, "n1");
  assert.ok(
    Math.abs(Math.hypot(initialActions[1].x - npc.x, initialActions[1].y - npc.y) - 700) < 0.001
  );

  controller.update(
    snapshot({
      target: { id: "n1", type: "npc", alive: true },
      entities: [npc]
    })
  );

  assert.deepEqual(controller.drainActions()[0], {
    type: "pressAmmoKey",
    key: "1"
  });
});

test("retries target selection instead of waiting forever", () => {
  let clock = 1000;
  const controller = createController({ settings, now: () => clock });
  const npc = {
    id: "n1",
    type: "npc",
    x: 900,
    y: 0,
    hpPercent: 100,
    alive: true
  };
  controller.start();
  controller.update(snapshot({ entities: [npc] }));
  controller.drainActions();
  clock = 2100;

  controller.update(snapshot({ timestamp: 2100, entities: [npc] }));

  const retryActions = controller.drainActions();
  assert.deepEqual(retryActions[0], { type: "selectNpc", entityId: "n1" });
  assert.equal(retryActions[1].type, "moveTo");
  assert.equal(retryActions[1].entityId, "n1");
});

test("selection retry cancels movement when locked NPC vanished", () => {
  let clock = 1000;
  const controller = createController({ settings, now: () => clock });
  const npc = {
    id: "n1", type: "npc", x: 900, y: 0,
    hpPercent: 100, alive: true
  };
  controller.start();
  controller.update(snapshot({ entities: [npc] }));
  controller.drainActions();
  clock = 2100;

  controller.update(snapshot({ timestamp: 2100, entities: [] }));

  assert.equal(controller.getState().name, "SEARCHING");
  assert.deepEqual(controller.drainActions(), [
    { type: "clearTarget" },
    { type: "cancelMovement" }
  ]);

  clock = 4400;
  controller.update(snapshot({ timestamp: 4400, entities: [npc] }));

  assert.equal(controller.getState().name, "SEARCHING");
  assert.deepEqual(controller.drainActions(), []);
});

test("selection timeout cancels old approach movement", () => {
  let clock = 1000;
  const controller = createController({ settings, now: () => clock });
  const npc = {
    id: "n1", type: "npc", x: 900, y: 0,
    hpPercent: 100, alive: true
  };
  controller.start();
  controller.update(snapshot({ entities: [npc] }));
  controller.drainActions();
  for (const time of [2100, 3200]) {
    clock = time;
    controller.update(snapshot({ timestamp: time, entities: [npc] }));
    controller.drainActions();
  }
  clock = 4300;

  controller.update(snapshot({ timestamp: 4300, entities: [npc] }));

  assert.equal(controller.getState().name, "SEARCHING");
  assert.deepEqual(controller.drainActions(), [
    { type: "clearTarget" },
    { type: "cancelMovement" }
  ]);
});

test("low HP disengages and waits for full repair", () => {
  const controller = createController({ settings, now: () => 1000 });
  controller.start();
  controller.update(
    snapshot({
      player: {
        id: "hero",
        x: 0,
        y: 0,
        hpPercent: 35,
        alive: true,
        moving: false,
        inCombat: true
      },
      target: { id: "n1", type: "npc", alive: true },
      entities: [
        {
          id: "n1",
          type: "npc",
          x: 500,
          y: 0,
          hpPercent: 100,
          alive: true
        }
      ]
    })
  );

  assert.equal(controller.getState().name, "FLEEING");
  assert.equal(
    controller.drainActions().some((action) => action.type === "clearTarget"),
    true
  );

  controller.update(
    snapshot({
      player: {
        id: "hero",
        x: -1000,
        y: 0,
        hpPercent: 99,
        alive: true,
        moving: false,
        inCombat: false
      }
    })
  );
  assert.equal(controller.getState().name, "REPAIR_WAIT");

  controller.update(snapshot());
  assert.equal(controller.getState().name, "SEARCHING");
});

test("disconnect, stale snapshot, death, and unknown version fail closed", () => {
  const badSnapshots = [
    snapshot({ connectionState: "disconnected", timestamp: 10000 }),
    snapshot({ timestamp: 1 }),
    snapshot({
      timestamp: 10000,
      player: {
        id: "hero",
        x: 0,
        y: 0,
        hpPercent: 0,
        alive: false,
        moving: false,
        inCombat: false
      }
    }),
    snapshot({ clientVersion: "other", timestamp: 10000 })
  ];

  for (const badSnapshot of badSnapshots) {
    const controller = createController({ settings, now: () => 10000 });
    controller.start();
    controller.update(badSnapshot);
    assert.equal(controller.getState().name, "FAULT");
    assert.deepEqual(controller.drainActions(), []);
  }
});

test("emergency stop clears queued actions and locked state", () => {
  const controller = createController({ settings, now: () => 1000 });
  controller.start();
  controller.update(
    snapshot({
      entities: [
        {
          id: "n1",
          type: "npc",
          x: 900,
          y: 0,
          hpPercent: 100,
          alive: true
        }
      ]
    })
  );
  controller.stop("emergency-stop");

  assert.equal(controller.getState().name, "STOPPED");
  assert.equal(controller.getState().reason, "emergency-stop");
  assert.deepEqual(controller.drainActions(), []);
});

test("dense NPC ring triggers continuous cluster escape instead of stopping", () => {
  let clock = 1000;
  const controller = createController({ settings, now: () => clock });
  const target = {
    id: "target", type: "npc", x: 900, y: 0,
    hpPercent: 100, alive: true
  };
  controller.start();
  controller.update(snapshot({ entities: [target] }));
  controller.drainActions();
  controller.update(snapshot({
    target: { id: "target", type: "npc", alive: true },
    entities: [target]
  }));
  controller.drainActions();
  const ring = Array.from({ length: 16 }, (_, index) => ({
    id: `ring-${index}`,
    type: "npc",
    x: 300 * Math.cos((index * Math.PI) / 8),
    y: 300 * Math.sin((index * Math.PI) / 8),
    hpPercent: 100,
    alive: true
  }));
  clock = 1300;

  controller.update(snapshot({
    timestamp: 1300,
    target: { id: "target", type: "npc", alive: true },
    entities: [target, ...ring]
  }));

  assert.equal(controller.getState().name, "ESCAPING_CLUSTER");
  const firstEscape = controller.drainActions();
  assert.equal(firstEscape[0].type, "clearTarget");
  assert.equal(firstEscape.some((action) => action.type === "cancelMovement"), false);
  assert.equal(firstEscape.some((action) => action.type === "moveTo"), true);

  clock = 1600;
  controller.update(snapshot({ timestamp: 1600, entities: ring }));
  assert.equal(controller.getState().name, "ESCAPING_CLUSTER");
  assert.equal(
    controller.drainActions().some((action) => action.type === "moveTo"),
    true
  );
});
