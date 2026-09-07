const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  createPremiumOverride,
  createCkdaSnapshot,
  findUniquePrototypeMethod,
  installEffectHooks,
  startCkdaPublisher
} = require("../src/ckda-main.js");

function premiumRoots(user, version = "n1.9.0.051") {
  return { version, user };
}

test("Premium override restores writable data descriptor and leaves platform globals native", () => {
  const nativeJsonParse = JSON.parse;
  const nativeResponseJson = Response.prototype.json;
  const calls = [];
  const user = {
    updatePremium(value) { calls.push(value); }
  };
  Object.defineProperty(user, "isPremium", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: false
  });
  const original = Object.getOwnPropertyDescriptor(user, "isPremium");
  const controller = createPremiumOverride(premiumRoots(user), {});

  assert.equal(controller.state(), "inactive");
  assert.equal(controller.enable(), true);
  assert.equal(controller.state(), "active");
  assert.equal(user.isPremium, true);
  assert.deepEqual(calls, [true]);
  assert.equal(controller.disable(), true);
  assert.equal(controller.state(), "inactive");
  assert.deepEqual(Object.getOwnPropertyDescriptor(user, "isPremium"), original);
  assert.deepEqual(calls, [true, false]);
  assert.equal(JSON.parse, nativeJsonParse);
  assert.equal(Response.prototype.json, nativeResponseJson);
});

test("Premium override restores accessor descriptor and masks active server writes", () => {
  const calls = [];
  let stored = false;
  const user = {
    updatePremium(value) {
      calls.push(value);
      this.isPremium = value;
    }
  };
  Object.defineProperty(user, "isPremium", {
    configurable: true,
    enumerable: true,
    get() { return stored; },
    set(value) { stored = value; }
  });
  const original = Object.getOwnPropertyDescriptor(user, "isPremium");
  const controller = createPremiumOverride(premiumRoots(user), {});

  assert.equal(controller.enable(), true);
  user.isPremium = false;
  assert.equal(user.isPremium, true);
  assert.equal(stored, false);
  assert.equal(controller.disable(), true);
  assert.deepEqual(Object.getOwnPropertyDescriptor(user, "isPremium"), original);
  assert.equal(user.isPremium, false);
  assert.deepEqual(calls, [true, false]);
});

test("Premium override deletes temporary property when original property is absent", () => {
  const calls = [];
  const user = {
    updatePremium(value) { calls.push(value); }
  };
  const controller = createPremiumOverride(premiumRoots(user), {});

  assert.equal(controller.enable(), true);
  assert.equal(user.isPremium, true);
  assert.equal(controller.disable(), true);
  assert.equal(Object.hasOwn(user, "isPremium"), false);
  assert.deepEqual(calls, [true]);
});

test("Premium override restores inherited effective boolean after deleting its temporary property", () => {
  const calls = [];
  const user = Object.create({ isPremium: false });
  user.updatePremium = function updatePremium(value) { calls.push(value); };
  const controller = createPremiumOverride(premiumRoots(user), {});

  assert.equal(controller.enable(), true);
  assert.equal(user.isPremium, true);
  assert.equal(controller.disable(), true);
  assert.equal(Object.hasOwn(user, "isPremium"), false);
  assert.equal(user.isPremium, false);
  assert.deepEqual(calls, [true, false]);
});

test("Premium override rejects non-configurable and throwing user transactions", () => {
  const fixed = {
    updatePremium() { throw new Error("must not call"); }
  };
  Object.defineProperty(fixed, "isPremium", {
    configurable: false,
    enumerable: true,
    writable: true,
    value: false
  });
  const fixedOriginal = Object.getOwnPropertyDescriptor(fixed, "isPremium");
  const fixedController = createPremiumOverride(premiumRoots(fixed), {});
  assert.equal(fixedController.enable(), false);
  assert.equal(fixedController.state(), "unsupported");
  assert.deepEqual(Object.getOwnPropertyDescriptor(fixed, "isPremium"), fixedOriginal);

  const throwing = {
    updatePremium() { throw new Error("server failed"); }
  };
  Object.defineProperty(throwing, "isPremium", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: false
  });
  const throwingOriginal = Object.getOwnPropertyDescriptor(throwing, "isPremium");
  const throwingController = createPremiumOverride(premiumRoots(throwing), {});
  assert.equal(throwingController.enable(), false);
  assert.equal(throwingController.state(), "unsupported");
  assert.deepEqual(Object.getOwnPropertyDescriptor(throwing, "isPremium"), throwingOriginal);
});

test("Premium override refresh restores replaced user root and supports repeated cycles", () => {
  const firstCalls = [];
  const secondCalls = [];
  const first = {
    isPremium: false,
    updatePremium(value) { firstCalls.push(value); }
  };
  const second = {
    isPremium: false,
    updatePremium(value) { secondCalls.push(value); }
  };
  const firstOriginal = Object.getOwnPropertyDescriptor(first, "isPremium");
  const secondOriginal = Object.getOwnPropertyDescriptor(second, "isPremium");
  const roots = premiumRoots(first);
  const controller = createPremiumOverride(roots, {});

  assert.equal(controller.enable(), true);
  assert.equal(controller.enable(), true);
  assert.deepEqual(firstCalls, [true]);
  roots.user = second;
  assert.equal(controller.refresh(), true);
  assert.deepEqual(Object.getOwnPropertyDescriptor(first, "isPremium"), firstOriginal);
  assert.deepEqual(firstCalls, [true, false]);
  assert.equal(second.isPremium, true);
  assert.deepEqual(secondCalls, [true]);
  assert.equal(controller.disable(), true);
  assert.deepEqual(Object.getOwnPropertyDescriptor(second, "isPremium"), secondOriginal);
  assert.deepEqual(secondCalls, [true, false]);
  assert.equal(controller.disable(), false);
  assert.equal(controller.enable(), true);
  assert.equal(controller.disable(), true);
  assert.deepEqual(secondCalls, [true, false, true, false]);
});

test("Premium override refuses incompatible roots without mutation", () => {
  const user = { isPremium: false, updatePremium() {} };
  const original = Object.getOwnPropertyDescriptor(user, "isPremium");
  const controller = createPremiumOverride(premiumRoots(user, "1.9.0.052"), {});

  assert.equal(controller.enable(), false);
  assert.equal(controller.state(), "unsupported");
  assert.deepEqual(Object.getOwnPropertyDescriptor(user, "isPremium"), original);
});

test("Premium override source never patches platform globals", () => {
  const sourceDir = path.join(__dirname, "..", "src");
  const source = fs.readdirSync(sourceDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => fs.readFileSync(path.join(sourceDir, name), "utf8"))
    .join("\n");
  const forbiddenTargets = [
    /JSON\.parse\s*=/,
    /Response\.prototype\.json\s*=/,
    /Object\.defineProperty\s*=/,
    /Reflect\.defineProperty\s*=/,
    /window\.Function\s*=/,
    /Object\.defineProperty\s*\(\s*JSON\s*,\s*["']parse["']/,
    /Object\.defineProperty\s*\(\s*Response\.prototype\s*,\s*["']json["']/,
    /Object\.defineProperty\s*\(\s*Object\s*,\s*["']defineProperty["']/,
    /Object\.defineProperty\s*\(\s*Reflect\s*,\s*["']defineProperty["']/,
    /Object\.defineProperty\s*\(\s*window\s*,\s*["']Function["']/
  ];

  for (const pattern of forbiddenTargets) {
    assert.equal(pattern.test(source), false, `forbidden platform patch: ${pattern}`);
  }
});

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
