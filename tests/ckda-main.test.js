const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCkdaSnapshot,
  startCkdaPublisher
} = require("../src/ckda-main.js");

function mapShip(id, fields = {}) {
  return {
    ID: id,
    isNpc: false,
    clanId: 20,
    isCloaked: false,
    renderer: {
      wrapper: {
        toGlobal() {
          return { x: 140.5, y: 260 };
        }
      }
    },
    name: "private player name",
    inventory: { secret: true },
    ...fields
  };
}

function liveRoots(overrides = {}) {
  const localShip = mapShip(77, { clanId: 10 });
  const npc = mapShip(50, { isNpc: true });
  const enemy = mapShip(8, { isCloaked: "yes" });
  const ally = mapShip(9, { clanId: 10 });
  const malformed = mapShip(undefined);
  return {
    version: "n1.9.0.051",
    network: { connected: true },
    user: { userID: 77, clanId: 10, ship: localShip },
    world: {
      mapId: "17",
      MAP_SHIPS: new Map([
        [77, localShip],
        [50, npc],
        [8, enemy],
        [9, ally],
        [10, malformed]
      ])
    },
    ...overrides
  };
}

test("publishes only projected remote players in a sanitized C-KDA snapshot", () => {
  const cooldowns = {
    read(id) {
      return id === 8
        ? { empEndsAt: 29000, ishEndsAt: null }
        : { empEndsAt: null, ishEndsAt: 30000 };
    }
  };

  const snapshot = createCkdaSnapshot(
    liveRoots(),
    cooldowns,
    "active",
    1234
  );

  assert.deepEqual(snapshot, {
    timestamp: 1234,
    clientVersion: "1.9.0.051",
    connectionState: "connected",
    mapId: 17,
    premiumState: "active",
    players: [
      {
        id: 8,
        screenX: 140.5,
        screenY: 260,
        relation: "enemy",
        cloaked: true,
        observedAt: 1234,
        empEndsAt: 29000,
        ishEndsAt: null
      },
      {
        id: 9,
        screenX: 140.5,
        screenY: 260,
        relation: "ally",
        cloaked: false,
        observedAt: 1234,
        empEndsAt: null,
        ishEndsAt: 30000
      }
    ]
  });
});

test("fails closed for unsupported client, disconnected network, and invalid roots", () => {
  const cooldowns = { read() { return { empEndsAt: null, ishEndsAt: null }; } };

  assert.equal(
    createCkdaSnapshot(liveRoots({ version: "1.9.0.052" }), cooldowns, "inactive", 1),
    null
  );
  assert.equal(
    createCkdaSnapshot(liveRoots({ network: { connected: false } }), cooldowns, "inactive", 1),
    null
  );
  assert.equal(
    createCkdaSnapshot(liveRoots({ world: { mapId: 17, MAP_SHIPS: {} } }), cooldowns, "inactive", 1),
    null
  );
});

test("publisher sends on cadence, clears cooldowns on world change, and stops", () => {
  const messages = [];
  const events = [];
  let scheduled;
  let clearedTimer = null;
  const cooldowns = {
    read() { return { empEndsAt: null, ishEndsAt: null }; },
    clearAll() { events.push("clear"); }
  };
  const windowRef = {
    postMessage(message, target) {
      assert.equal(target, "*");
      events.push("post");
      messages.push(message);
    },
    setInterval(callback, delay) {
      scheduled = { callback, delay };
      return 9;
    },
    clearInterval(timer) { clearedTimer = timer; }
  };
  const roots = liveRoots();

  const publisher = startCkdaPublisher(windowRef, roots, {
    cooldowns,
    premiumState: "inactive",
    now: () => 1234
  });

  assert.equal(scheduled.delay, 100);
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0], {
    channel: "sa-ckda-v1",
    direction: "snapshot",
    payload: createCkdaSnapshot(roots, cooldowns, "inactive", 1234)
  });
  scheduled.callback();
  assert.equal(messages.length, 2);
  publisher.refresh();
  assert.equal(messages.length, 3);

  roots.world = { ...roots.world, mapId: 18 };
  publisher.refresh();
  assert.equal(messages.length, 4);
  assert.deepEqual(events.slice(-2), ["clear", "post"]);

  publisher.stop();
  assert.equal(clearedTimer, 9);
  scheduled.callback();
  assert.equal(messages.length, 4);
});
