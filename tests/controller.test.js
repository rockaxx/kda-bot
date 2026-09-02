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
  requiredMap: 7,
  kiteDistance: 700,
  dangerRadius: 550,
  fleeHpPercent: 35,
  resumeHpPercent: 100,
  ammoKey: "1",
  planningIntervalMs: 100,
  movementIntervalMs: 250,
  targetBlacklistMs: 5000
};

test("waits without actions on the wrong map", () => {
  const controller = createController({ settings, now: () => 1000 });
  controller.start();
  controller.update(snapshot({ mapId: 8 }));

  assert.equal(controller.getState().name, "WAITING_FOR_MAP");
  assert.deepEqual(controller.drainActions(), []);
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

  assert.deepEqual(controller.drainActions(), [
    { type: "selectNpc", entityId: "n1" }
  ]);

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
