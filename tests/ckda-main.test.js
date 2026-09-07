const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCkdaSnapshot,
  findUniquePrototypeMethod,
  installEffectHooks,
  startCkdaPublisher
} = require("../src/ckda-main.js");

test("finds exactly one semantic ISH prototype method without invoking it", () => {
  let candidateCalled = false;
  const proto = {
    hiddenIsh(target) {
      candidateCalled = true;
      return "instaShield tshield" + target.ID;
    },
    unrelated() { return "instaShield"; }
  };
  const world = Object.create(proto);

  assert.equal(
    findUniquePrototypeMethod(world, ["instaShield", "tshield"]),
    "hiddenIsh"
  );
  assert.equal(candidateCalled, false);

  proto.second = function () { return "instaShield tshield"; };
  assert.equal(
    findUniquePrototypeMethod(world, ["instaShield", "tshield"]),
    null
  );
});

test("effect hooks preserve calls and restore original world prototype descriptors", () => {
  const calls = [];
  const cooldowns = {
    activate(kind, id, duration) { calls.push({ kind, id, duration }); }
  };
  const prototype = {};
  function addEmpNew(target, ...rest) {
    return { receiver: this, args: [target, ...rest], kind: "emp" };
  }
  function hiddenIsh(target, ...rest) {
    return { receiver: this, args: [target, ...rest], kind: "ish", text: "instaShield tshield" };
  }
  Object.defineProperty(prototype, "addEmpNew", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: addEmpNew
  });
  Object.defineProperty(prototype, "hiddenIsh", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: hiddenIsh
  });
  const world = Object.create(prototype);
  const beforeEmp = Object.getOwnPropertyDescriptor(prototype, "addEmpNew");
  const beforeIsh = Object.getOwnPropertyDescriptor(prototype, "hiddenIsh");
  const target = { ID: 88 };

  const hooks = installEffectHooks(world, cooldowns, {
    empCooldownMs: 28000,
    ishCooldownMs: 19000
  });

  assert.equal(hooks.supported, true);
  assert.deepEqual(world.addEmpNew(target, "emp-arg"), {
    receiver: world,
    args: [target, "emp-arg"],
    kind: "emp"
  });
  assert.deepEqual(world.hiddenIsh(target, "ish-arg"), {
    receiver: world,
    args: [target, "ish-arg"],
    kind: "ish",
    text: "instaShield tshield"
  });
  assert.deepEqual(calls, [
    { kind: "emp", id: 88, duration: 28000 },
    { kind: "ish", id: 88, duration: 19000 }
  ]);
  assert.equal(
    installEffectHooks(world, cooldowns, { empCooldownMs: 1, ishCooldownMs: 1 }).supported,
    false
  );

  assert.equal(hooks.cleanup(), true);
  assert.deepEqual(Object.getOwnPropertyDescriptor(prototype, "addEmpNew"), beforeEmp);
  assert.deepEqual(Object.getOwnPropertyDescriptor(prototype, "hiddenIsh"), beforeIsh);
  assert.equal(hooks.cleanup(), false);
});

test("effect hooks skip malformed targets and reject missing or ambiguous ISH methods", () => {
  const calls = [];
  const cooldowns = { activate(...args) { calls.push(args); } };
  const noIshWorld = Object.create({ addEmpNew() { return "emp"; } });
  assert.equal(
    installEffectHooks(noIshWorld, cooldowns, { empCooldownMs: 1, ishCooldownMs: 1 }).supported,
    false
  );

  const ambiguousProto = {
    addEmpNew() { return "emp"; },
    one() { return "instaShield tshield"; },
    two() { return "instaShield tshield"; }
  };
  const ambiguousWorld = Object.create(ambiguousProto);
  assert.equal(
    installEffectHooks(ambiguousWorld, cooldowns, { empCooldownMs: 1, ishCooldownMs: 1 }).supported,
    false
  );

  const proto = {
    addEmpNew(target) { return target; },
    hiddenIsh(target) { return "instaShield tshield" + String(target); }
  };
  const world = Object.create(proto);
  const hooks = installEffectHooks(world, cooldowns, {
    empCooldownMs: 1,
    ishCooldownMs: 1
  });
  const malformed = { ID: null };
  assert.equal(world.addEmpNew(malformed), malformed);
  assert.equal(world.hiddenIsh(malformed), "instaShield tshield[object Object]");
  assert.deepEqual(calls, []);
  hooks.cleanup();
});

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
