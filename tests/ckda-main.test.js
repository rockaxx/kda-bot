const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createCkdaBridge, MAX_CKDA_PAYLOAD_BYTES } = require("../src/ckda-bridge.js");
const {
  createPremiumOverride,
  createCkdaSnapshot,
  findUniquePrototypeMethod,
  installEffectHooks,
  startCkdaPublisher,
  installCkda
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

test("Premium override reapplies absent descriptor after updater assigns isPremium", () => {
  const calls = [];
  const user = Object.create({ isPremium: false });
  user.updatePremium = function updatePremium(value) {
    calls.push(value);
    this.isPremium = value;
  };
  const controller = createPremiumOverride(premiumRoots(user), {});

  assert.equal(controller.enable(), true);
  assert.equal(controller.disable(), true);
  assert.equal(Object.getOwnPropertyDescriptor(user, "isPremium"), undefined);
  assert.equal(user.isPremium, false);
  assert.deepEqual(calls, [true, false]);
});

test("Premium override retains unsupported cleanup state when restore update throws", () => {
  const calls = [];
  let failRestore = true;
  const user = {
    isPremium: false,
    updatePremium(value) {
      calls.push(value);
      if (!value && failRestore) {
        failRestore = false;
        throw new Error("restore failed");
      }
    }
  };
  const original = Object.getOwnPropertyDescriptor(user, "isPremium");
  const controller = createPremiumOverride(premiumRoots(user), {});

  assert.equal(controller.enable(), true);
  assert.equal(controller.disable(), false);
  assert.equal(controller.state(), "unsupported");
  assert.deepEqual(Object.getOwnPropertyDescriptor(user, "isPremium"), original);
  assert.equal(controller.disable(), true);
  assert.equal(controller.state(), "inactive");
  assert.deepEqual(calls, [true, false, false]);
});

for (const ownProperty of [true, false]) {
  test(`failed Premium enable rolls back presentation and exact ${ownProperty ? "own descriptor" : "property absence"}`, () => {
    let presentation = false;
    const calls = [];
    const user = Object.create({ isPremium: false });
    if (ownProperty) Object.defineProperty(user, "isPremium", {
      configurable: true, enumerable: false, writable: true, value: false
    });
    user.updatePremium = function (value) {
      calls.push(value);
      this.isPremium = value;
      presentation = this.isPremium;
      if (value) throw new Error("shop updater failed after body mutation");
    };
    const original = Object.getOwnPropertyDescriptor(user, "isPremium");
    const controller = createPremiumOverride(premiumRoots(user), {});

    assert.equal(controller.enable(), false);
    assert.equal(presentation, false, "failed enable must undo presentation side effects");
    assert.equal(user.isPremium, false);
    assert.deepEqual(Object.getOwnPropertyDescriptor(user, "isPremium"), original);
    assert.deepEqual(calls, [true, false]);
    assert.equal(controller.state(), "unsupported");
  });
}

test("failed Premium enable retains restoration record when rollback updater fails, then disable retries", () => {
  let presentation = false;
  let failRollback = true;
  const calls = [];
  const user = {
    isPremium: false,
    updatePremium(value) {
      calls.push(value);
      this.isPremium = value;
      if (!value && failRollback) throw new Error("rollback updater temporarily unavailable");
      presentation = this.isPremium;
      if (value) throw new Error("shop updater failed after body mutation");
    }
  };
  const original = Object.getOwnPropertyDescriptor(user, "isPremium");
  const controller = createPremiumOverride(premiumRoots(user), {});
  assert.equal(controller.enable(), false);
  assert.equal(presentation, true);
  assert.equal(controller.state(), "unsupported");
  assert.deepEqual(calls, [true, false]);
  assert.deepEqual(Object.getOwnPropertyDescriptor(user, "isPremium"), original);
  failRollback = false;
  assert.equal(controller.disable(), true, "pending rollback must survive failed enable");
  assert.equal(presentation, false);
  assert.equal(controller.state(), "inactive");
  assert.deepEqual(calls, [true, false, false]);
});

test("failed Premium enable retains rollback when effective accessor value was not restored, then refresh retries", () => {
  let value = false;
  let ignoreRestore = true;
  const user = { updatePremium(enabled) {
    if (enabled) {
      value = true;
      throw new Error("shop update failed");
    }
    if (!ignoreRestore) value = false;
  } };
  Object.defineProperty(user, "isPremium", {
    configurable: true, enumerable: true, get() { return value; }
  });
  const roots = premiumRoots(user);
  const controller = createPremiumOverride(roots, {});
  assert.equal(controller.enable(), false);
  assert.equal(controller.state(), "unsupported");
  roots.user = { isPremium: false, updatePremium() {} };
  assert.equal(controller.refresh(), false, "old effective state must be restored before another user is overridden");
  assert.equal(roots.user.isPremium, false);
  ignoreRestore = false;
  assert.equal(controller.refresh(), true);
  assert.equal(value, false);
  assert.equal(controller.state(), "active");
  controller.disable();
});

test("Premium override refresh retains failed old-root cleanup for retry", () => {
  let failRestore = true;
  const first = {
    isPremium: false,
    updatePremium(value) {
      if (!value && failRestore) {
        failRestore = false;
        throw new Error("restore failed");
      }
    }
  };
  const second = { isPremium: false, updatePremium() {} };
  const roots = premiumRoots(first);
  const controller = createPremiumOverride(roots, {});

  assert.equal(controller.enable(), true);
  roots.user = second;
  assert.equal(controller.refresh(), false);
  assert.equal(controller.state(), "unsupported");
  assert.equal(controller.refresh(), true);
  assert.equal(controller.state(), "active");
  assert.equal(controller.disable(), true);
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
  assert.equal(messages.length, 5);
  assert.equal(messages[3].payload.connectionState, "disconnected");
  assert.deepEqual(events.slice(-3), ["clear", "post", "post"]);

  publisher.stop();
  assert.equal(clearedTimer, 9);
  scheduled.callback();
  assert.equal(messages.length, 5);
});

function installerWindow(roots) {
  const listeners = new Map();
  const timers = new Map();
  const messages = [];
  const delays = new Map();
  let timerId = 0;
  return {
    __SA_BOT_ROOTS__: roots, document: {}, timers, delays, messages,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, value = {}) { for (const fn of [...(listeners.get(type) || [])]) fn(value); },
    count(type) { return listeners.get(type)?.size || 0; },
    setInterval(fn, delay) { timers.set(++timerId, fn); delays.set(timerId, delay); return timerId; },
    clearInterval(id) { timers.delete(id); delays.delete(id); },
    tick() { for (const fn of [...timers.values()]) fn(); },
    postMessage(message) { messages.push(message); },
    command(payload, overrides = {}) {
      this.emit("message", { source: this, data: {
        channel: "sa-ckda-v1", direction: "command", payload: { requestId: 1, ...payload }
      }, ...overrides });
    },
    snapshot() { return messages.filter(value => value.direction === "snapshot").at(-1)?.payload; }
  };
}

function assertInstallationReleased(windowRef, roots, original, installation) {
  assert.equal(roots.world.addEmpNew, original.emp);
  assert.equal(roots.world.hiddenIsh, original.ish);
  assert.deepEqual(Object.getOwnPropertyDescriptor(roots.user, "isPremium"), original.premium);
  for (const type of ["message", "pagehide", "beforeunload"]) assert.equal(windowRef.count(type), 0);
  assert.equal(windowRef.timers.size, 0);
  assert.equal(windowRef[Symbol.for("sa-ckda-installation-v1")], undefined);
  assert.equal(installation.cleanup(), false);
  const count = windowRef.messages.length;
  windowRef.tick();
  windowRef.command({ type: "set-premium", enabled: true });
  assert.equal(windowRef.messages.length, count);
}

function originalInstallationState(roots) {
  return { emp: roots.world.addEmpNew, ish: roots.world.hiddenIsh,
    premium: Object.getOwnPropertyDescriptor(roots.user, "isPremium") };
}

test("explicit teardown restores MAIN mutations, clears its guard, and permits fresh installation", () => {
  const roots = installerRoots();
  const original = originalInstallationState(roots);
  const windowRef = installerWindow(roots);
  const installation = installCkda(windowRef);
  windowRef.command({ type: "set-premium", enabled: true });
  windowRef.command({ type: "teardown", targetId: 8 });
  assert.equal(roots.user.isPremium, true, "malformed teardown must be ignored");
  windowRef.command({ type: "teardown" });
  assertInstallationReleased(windowRef, roots, original, installation);
  const next = installCkda(windowRef);
  assert.notEqual(next, installation);
  next.cleanup();
});

test("MAIN lease expires at 120000 monotonic ms and checks every 5000 ms", (t) => {
  let wall = 1_700_000_000_000;
  let elapsed = 0;
  t.mock.method(Date, "now", () => wall);
  const roots = installerRoots();
  const original = originalInstallationState(roots);
  const windowRef = installerWindow(roots);
  windowRef.performance = { timeOrigin: 1_700_000_000_000, now: () => elapsed };
  const installation = installCkda(windowRef);
  windowRef.command({ type: "set-premium", enabled: true });
  assert.ok([...windowRef.delays.values()].includes(5000));
  elapsed = 119999;
  wall += 600000;
  windowRef.tick();
  assert.equal(roots.user.isPremium, true);
  elapsed = 120000;
  wall -= 1200000;
  windowRef.tick();
  assertInstallationReleased(windowRef, roots, original, installation);
});

test("active isolated lease renewal prevents expiry until 120000 ms after final renewal", () => {
  let current = 1000;
  const roots = installerRoots();
  const original = originalInstallationState(roots);
  const windowRef = installerWindow(roots);
  const installation = installCkda(windowRef, { now: () => current });
  windowRef.command({ type: "set-premium", enabled: true });
  for (let count = 0; count < 12; count++) {
    current += 15000;
    windowRef.command({ type: "renew-lease" });
    windowRef.tick();
    assert.equal(roots.user.isPremium, true);
  }
  current += 119999;
  windowRef.tick();
  assert.equal(roots.user.isPremium, true);
  current++;
  windowRef.tick();
  assertInstallationReleased(windowRef, roots, original, installation);
});

test("teardown and expired lease stop waiting-for-roots polling", () => {
  for (const action of ["teardown", "expiry"]) {
    let current = 1000;
    const windowRef = installerWindow();
    installCkda(windowRef, { now: () => current });
    if (action === "teardown") windowRef.command({ type: "teardown" });
    else { current += 120000; windowRef.tick(); }
    assert.equal(windowRef.timers.size, 0);
    assert.equal(windowRef.count("message"), 0);
    assert.equal(windowRef[Symbol.for("sa-ckda-installation-v1")], undefined);
  }
});

function installerRoots() {
  const roots = liveRoots();
  roots.user.isPremium = false;
  roots.user.updatePremium = function () {};
  Object.setPrototypeOf(roots.world, {
    addEmpNew(target) { return target; },
    hiddenIsh(target) { return "instaShield tshield" + target.ID; }
  });
  return roots;
}

test("MAIN publisher and effect cooldowns use performance epoch time despite wall-clock jumps", (t) => {
  let wall = 1_700_000_000_000;
  let elapsed = 0;
  t.mock.method(Date, "now", () => wall);
  const roots = installerRoots();
  const windowRef = installerWindow(roots);
  windowRef.performance = { timeOrigin: 1_700_000_000_000, now: () => elapsed };
  const installation = installCkda(windowRef);
  roots.world.addEmpNew({ ID: 8 });
  wall -= 60_000;
  elapsed = 250;
  windowRef.tick();
  assert.equal(windowRef.snapshot().timestamp, 1_700_000_000_250);
  assert.equal(windowRef.snapshot().players[0].observedAt, 1_700_000_000_250);
  wall += 120_000;
  elapsed = 1000;
  windowRef.tick();
  assert.equal(windowRef.snapshot().timestamp, 1_700_000_001_000);
  assert.equal(windowRef.snapshot().players[0].empEndsAt, 1_700_000_028_000);
  elapsed = 28_000;
  windowRef.tick();
  assert.equal(windowRef.snapshot().players[0].empEndsAt, null);
  installation.cleanup();
});

test("standalone publisher defaults to its window performance epoch clock", (t) => {
  t.mock.method(Date, "now", () => 9999);
  const windowRef = installerWindow(liveRoots());
  windowRef.performance = { timeOrigin: 1000, now: () => 250 };
  const publisher = startCkdaPublisher(windowRef, windowRef.__SA_BOT_ROOTS__);
  assert.equal(windowRef.snapshot().timestamp, 1250);
  publisher.stop();
});

test("MAIN installer waits for supported roots, installs once, and announces ready", () => {
  assert.equal(typeof installCkda, "function");
  const windowRef = installerWindow();
  const installation = installCkda(windowRef);
  assert.equal(installCkda(windowRef), installation);
  assert.equal(windowRef.timers.size, 2);
  windowRef.__SA_BOT_ROOTS__ = installerRoots();
  windowRef.tick();
  assert.equal(windowRef.timers.size, 2);
  assert.equal(windowRef.count("message"), 1);
  assert.equal(windowRef.snapshot().mapId, 17);
  assert.equal(windowRef.messages.some(value => value.direction === "result" && value.payload.type === "ready"), true);
  installation.cleanup();
});

test("MAIN commands reject foreign sources, wrong channels, and malformed command fields", () => {
  assert.equal(typeof installCkda, "function");
  const roots = installerRoots();
  const windowRef = installerWindow(roots);
  const installation = installCkda(windowRef);
  const before = windowRef.messages.length;
  windowRef.command({ type: "set-premium", enabled: true }, { source: {} });
  for (const payload of [
    { type: "set-premium", enabled: "yes" },
    { type: "set-premium", enabled: true, extra: true },
    { type: "set-premium", enabled: true, requestId: -1 },
    { type: "configure-effects", empCooldownMs: 0, ishCooldownMs: 28000 },
    { type: "configure-effects", empCooldownMs: 28000, ishCooldownMs: Infinity },
    { type: "refresh", extra: true }, { type: "attack", targetId: 8 }
  ]) windowRef.command(payload);
  windowRef.command({}, { data: { channel: "sa-bot-v1", direction: "command", payload: { requestId: 1, type: "set-premium", enabled: true } } });
  windowRef.command({}, { data: { channel: "sa-ckda-v1", direction: "snapshot", payload: { requestId: 1, type: "set-premium", enabled: true } } });
  assert.equal(roots.user.isPremium, false);
  assert.equal(windowRef.messages.length, before);
  installation.cleanup();
});

test("MAIN commands update Premium state, configure effects, clear cooldowns, and publish immediately", () => {
  assert.equal(typeof installCkda, "function");
  const roots = installerRoots();
  const windowRef = installerWindow(roots);
  const installation = installCkda(windowRef);
  windowRef.command({ type: "set-premium", enabled: true });
  assert.equal(roots.user.isPremium, true);
  assert.equal(windowRef.snapshot().premiumState, "active");
  windowRef.command({ type: "configure-effects", empCooldownMs: 1000, ishCooldownMs: 120000 });
  const before = Date.now();
  roots.world.addEmpNew({ ID: 8 });
  roots.world.hiddenIsh({ ID: 8 });
  const count = windowRef.messages.length;
  windowRef.command({ type: "refresh" });
  assert.ok(windowRef.messages.length > count);
  const player = windowRef.snapshot().players.find(value => value.id === 8);
  assert.ok(player.empEndsAt >= before + 1000 && player.empEndsAt <= Date.now() + 1000);
  assert.ok(player.ishEndsAt >= before + 120000 && player.ishEndsAt <= Date.now() + 120000);
  windowRef.command({ type: "clear" });
  assert.equal(windowRef.snapshot().players.find(value => value.id === 8).empEndsAt, null);
  assert.equal(windowRef.snapshot().players.find(value => value.id === 8).ishEndsAt, null);
  windowRef.command({ type: "set-premium", enabled: false });
  assert.equal(roots.user.isPremium, false);
  assert.equal(windowRef.snapshot().premiumState, "inactive");
  installation.cleanup();
});

test("MAIN pagehide restores hooks and Premium, stops publisher, and removes command listener once", () => {
  assert.equal(typeof installCkda, "function");
  const roots = installerRoots();
  const emp = roots.world.addEmpNew;
  const descriptor = Object.getOwnPropertyDescriptor(roots.user, "isPremium");
  const windowRef = installerWindow(roots);
  const installation = installCkda(windowRef);
  windowRef.command({ type: "set-premium", enabled: true });
  assert.notEqual(roots.world.addEmpNew, emp);
  windowRef.emit("pagehide");
  assert.equal(roots.world.addEmpNew, emp);
  assert.deepEqual(Object.getOwnPropertyDescriptor(roots.user, "isPremium"), descriptor);
  assert.equal(windowRef.count("message"), 0);
  assert.equal(windowRef.timers.size, 0);
  assert.equal(installation.cleanup(), false);
  const count = windowRef.messages.length;
  windowRef.tick();
  windowRef.command({ type: "set-premium", enabled: true });
  assert.equal(windowRef.messages.length, count);
});

test("MAIN pagehide cancels roots polling and unknown clients never install mutations", () => {
  assert.equal(typeof installCkda, "function");
  const roots = installerRoots();
  roots.version = "1.9.0.052";
  const emp = roots.world.addEmpNew;
  const windowRef = installerWindow(roots);
  installCkda(windowRef);
  windowRef.command({ type: "set-premium", enabled: true });
  assert.equal(roots.world.addEmpNew, emp);
  assert.equal(roots.user.isPremium, false);
  assert.equal(windowRef.snapshot(), undefined);
  windowRef.emit("pagehide");
  assert.equal(windowRef.timers.size, 0);
  windowRef.__SA_BOT_ROOTS__ = installerRoots();
  windowRef.tick();
  assert.equal(windowRef.snapshot(), undefined);
});

test("MAIN refresh follows live user/world replacement and clears disconnected cooldowns", () => {
  assert.equal(typeof installCkda, "function");
  const roots = installerRoots();
  const firstWorld = roots.world;
  const firstEmp = firstWorld.addEmpNew;
  const firstUser = roots.user;
  const windowRef = installerWindow(roots);
  const installation = installCkda(windowRef);
  windowRef.command({ type: "set-premium", enabled: true });
  firstWorld.addEmpNew({ ID: 8 });
  roots.network.connected = false;
  windowRef.tick();
  roots.network.connected = true;
  windowRef.tick();
  assert.equal(windowRef.snapshot().players.find(value => value.id === 8).empEndsAt, null);
  const replacement = installerRoots();
  roots.world = replacement.world;
  roots.user = replacement.user;
  windowRef.tick();
  assert.equal(firstUser.isPremium, false);
  assert.equal(roots.user.isPremium, true);
  assert.equal(firstWorld.addEmpNew, firstEmp);
  roots.world.addEmpNew({ ID: 8 });
  windowRef.tick();
  assert.ok(windowRef.snapshot().players.find(value => value.id === 8).empEndsAt > Date.now());
  installation.cleanup();
});

test("effect configuration preserves active cooldown endpoints until an explicit clear", () => {
  const roots = installerRoots();
  const windowRef = installerWindow(roots);
  const installation = installCkda(windowRef);
  roots.world.addEmpNew({ ID: 8 });
  windowRef.command({ type: "refresh" });
  const endpoint = windowRef.snapshot().players.find(value => value.id === 8).empEndsAt;
  windowRef.command({ type: "configure-effects", empCooldownMs: 1000, ishCooldownMs: 1000 });
  assert.equal(windowRef.snapshot().players.find(value => value.id === 8).empEndsAt, endpoint);
  installation.cleanup();
});

test("manifest MAIN scripts auto-install once even when the entry point is evaluated twice", () => {
  const windowRef = installerWindow(installerRoots());
  const context = vm.createContext({ window: windowRef, TextEncoder });
  for (const name of ["namespace-main.js", "ckda-schema.js", "ckda-core.js", "ckda-main.js", "ckda-main.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", name), "utf8"), context);
  }
  assert.equal(windowRef.count("message"), 1);
  assert.equal(windowRef.timers.size, 2);
  assert.equal(windowRef.snapshot().mapId, 17);
  // Build message data in the page realm, as browser-delivered events do.
  vm.runInContext('window.emit("message", { source: window, data: { channel: "sa-ckda-v1", direction: "command", payload: { requestId: 1, type: "set-premium", enabled: true } } })', context);
  assert.equal(windowRef.__SA_BOT_ROOTS__.user.isPremium, true);
  windowRef.emit("pagehide");
  assert.equal(windowRef.__SA_BOT_ROOTS__.user.isPremium, false);
  assert.equal(windowRef.timers.size, 0);
});

test("real publisher rotates all 32 players through the bounded bridge within two publications", () => {
  const roots = liveRoots();
  roots.world.MAP_SHIPS = new Map(Array.from({ length: 32 }, (_, index) => {
    const ship = mapShip(`player-${index}-é`, { isCloaked: index === 31 });
    return [ship.ID, ship];
  }));
  const windowRef = installerWindow(roots);
  const received = [];
  windowRef.postMessage = function (message) {
    this.messages.push(message);
    this.emit("message", { source: this, data: structuredClone(message) });
  };
  const bridge = createCkdaBridge({ windowRef, onSnapshot: value => received.push(value) });
  const publisher = startCkdaPublisher(windowRef, roots, { now: () => 1788788333437 });
  assert.equal(received.length, 1);
  assert.ok(received[0].players.length > 0);
  assert.ok(received[0].players.length < 32);
  assert.ok(new TextEncoder().encode(JSON.stringify(windowRef.messages[0])).byteLength <= MAX_CKDA_PAYLOAD_BYTES);
  assert.deepEqual(received[0].players.map(player => player.id),
    Array.from({ length: received[0].players.length }, (_, index) => `player-${index}-é`));
  publisher.refresh();
  assert.equal(new Set(received.flatMap(value => value.players.map(player => player.id))).size, 32);
  assert.equal(received[1].players.some(player => player.id === "player-31-é" && player.cloaked), true);
  for (const message of windowRef.messages) {
    assert.ok(new TextEncoder().encode(JSON.stringify(message)).byteLength <= 4096);
  }
  publisher.stop();
  bridge.destroy();
});

for (const reason of ["world", "map", "disconnect", "unsupported", "clear"]) {
  test(`publisher resets rotating cursor and clears remote observations on ${reason}`, () => {
    const roots = liveRoots();
    roots.world.MAP_SHIPS = new Map(Array.from({ length: 32 }, (_, id) => [id, mapShip(`player-${id}`)]));
    const windowRef = installerWindow(roots);
    const publisher = startCkdaPublisher(windowRef, roots, { now: () => 1000 });
    const firstId = windowRef.snapshot().players[0].id;
    if (reason === "world") roots.world = { ...roots.world };
    else if (reason === "map") roots.world.mapId = 18;
    else if (reason === "disconnect") roots.network.connected = false;
    else if (reason === "unsupported") roots.version = "1.9.0.052";
    else {
      assert.equal(typeof publisher.clear, "function");
      publisher.clear();
    }
    publisher.refresh();
    assert.equal(windowRef.messages.some(message => message.payload.connectionState === "disconnected"), true);
    roots.network.connected = true;
    roots.version = "n1.9.0.051";
    if (reason === "disconnect" || reason === "unsupported") publisher.refresh();
    assert.equal(windowRef.snapshot().players[0].id, firstId);
    publisher.stop();
  });
}

test("one untransportable player record cannot starve valid records behind it", () => {
  const roots = liveRoots();
  roots.world.MAP_SHIPS = new Map([
    [1, mapShip("é".repeat(4096))], [2, mapShip("visible", { isCloaked: true })]
  ]);
  const windowRef = installerWindow(roots);
  const publisher = startCkdaPublisher(windowRef, roots, { now: () => 1000 });
  assert.deepEqual(windowRef.snapshot().players.map(player => player.id), ["visible"]);
  assert.ok(new TextEncoder().encode(JSON.stringify(windowRef.messages[0])).byteLength <= 4096);
  publisher.stop();
});
