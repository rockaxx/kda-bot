const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyPlayer,
  projectPlayer,
  filterVisiblePlayers,
  createCooldownRegistry,
  createMonotonicEpochClock
} = require("../src/ckda-core.js");

test("shared monotonic epoch clock uses performance delta despite wall-clock jumps", () => {
  assert.equal(typeof createMonotonicEpochClock, "function");
  let elapsed = 0;
  let wall = 1_700_000_000_000;
  const performanceRef = { timeOrigin: 1_700_000_000_000, now() { return elapsed; } };
  const mainNow = createMonotonicEpochClock(performanceRef, () => wall);
  const isolatedNow = createMonotonicEpochClock(performanceRef, () => wall);
  const cooldowns = createCooldownRegistry(mainNow);
  assert.equal(cooldowns.activate("emp", 7, 1000), 1_700_000_001_000);
  wall -= 60_000;
  elapsed = 250;
  assert.equal(mainNow(), 1_700_000_000_250);
  assert.equal(isolatedNow(), mainNow());
  wall += 120_000;
  elapsed = 999;
  assert.equal(cooldowns.read(7).empEndsAt, 1_700_000_001_000);
  elapsed = 1000;
  assert.equal(cooldowns.read(7).empEndsAt, null);
});

test("shared monotonic epoch fallback clamps backward wall-clock movement", () => {
  assert.equal(typeof createMonotonicEpochClock, "function");
  let wall = 1000;
  const now = createMonotonicEpochClock(null, () => wall);
  wall = 900;
  assert.equal(now(), 1000);
  wall = 1200;
  assert.equal(now(), 1200);
});

function playerRoots() {
  const ship = { ID: 77, clanId: 99 };
  return {
    user: {
      userID: 77,
      clanId: 99,
      ship
    }
  };
}

test("classifies only eligible remote players", () => {
  const roots = playerRoots();

  assert.equal(classifyPlayer({ ID: 7, isNpc: true }, roots), null);
  assert.equal(classifyPlayer({ ID: 70, isNpc: false, isPal: true }, roots), null);
  assert.equal(classifyPlayer(roots.user.ship, roots), null);
  assert.equal(
    classifyPlayer({ ID: roots.user.userID, isNpc: false, clanId: 99 }, roots),
    null
  );
  assert.equal(
    classifyPlayer({ ID: 8, isNpc: false, clanId: 99 }, roots),
    "ally"
  );
  assert.equal(
    classifyPlayer({ ID: 9, isNpc: false, clanId: 15 }, roots),
    "enemy"
  );
});

test("self exclusion wins over player relation", () => {
  const roots = playerRoots();
  roots.user.ship.clanRelation = "friend";

  assert.equal(classifyPlayer(roots.user.ship, roots), null);
});

test("normalizes textual ally relations", () => {
  const roots = playerRoots();

  assert.equal(
    classifyPlayer({ ID: 8, isNpc: false, clanRelation: " Own Clan " }, roots),
    "ally"
  );
  assert.equal(
    classifyPlayer({ ID: 9, isNpc: false, clanRelation: "hostile" }, roots),
    "enemy"
  );
  assert.equal(
    classifyPlayer({ ID: 10, isNpc: false, clanRelation: "unknown" }, roots),
    "enemy"
  );
  assert.equal(
    classifyPlayer({ ID: 11, isNpc: false, clanRelation: "alliance" }, roots),
    "ally"
  );
});

test("matches current-client faction, group, clan, and war relations", () => {
  const roots = playerRoots();
  roots.world = {
    isHeroGroupMember(id) { return id === 8; },
    isHeroClanMember(clanId) { return clanId === 123; },
    isFactionIdHeroAlly(faction) { return faction === 2; }
  };

  assert.equal(classifyPlayer({ ID: 8, isNpc: false }, roots), "ally");
  assert.equal(classifyPlayer({ ID: 9, isNpc: false, clanId: 123 }, roots), "ally");
  assert.equal(classifyPlayer({ ID: 10, isNpc: false, faction: 2 }, roots), "ally");
  assert.equal(
    classifyPlayer({ ID: 8, isNpc: false, faction: 2, clanRelation: "war" }, roots),
    "enemy"
  );
});

test("projects player origin through renderer wrapper", () => {
  const entity = {
    renderer: { wrapper: { toGlobal: () => ({ x: 12.5, y: 44 }) } }
  };

  assert.deepEqual(projectPlayer(entity), { screenX: 12.5, screenY: 44 });
  assert.equal(
    projectPlayer({
      renderer: { wrapper: { toGlobal: () => ({ x: Number.NaN, y: 1 }) } }
    }),
    null
  );
  assert.equal(projectPlayer({ renderer: { wrapper: { toGlobal() { throw new Error("lost renderer"); } } } }), null);
});

test("projects 1.9.0.052 ships through their root wrapper", () => {
  const entity = {
    wrapper: { toGlobal: () => ({ x: 321.25, y: 654.5 }) },
    renderer: { wrapper: {} }
  };

  assert.deepEqual(projectPlayer(entity), { screenX: 321.25, screenY: 654.5 });
});

test("projects current-client world coordinates through the live world transform", () => {
  const entity = {
    x: 10599,
    y: 6500,
    wrapper: { toGlobal: () => ({ x: 10599, y: 6500 }) }
  };
  const roots = {
    world: {
      world: {
        worldTransform: { a: 0.5, b: 0, c: 0, d: 0.5, tx: -4300, ty: -2800 }
      }
    }
  };

  assert.deepEqual(projectPlayer(entity, roots), { screenX: 999.5, screenY: 450 });
});

test("filters visible cloaked players without changing input records", () => {
  const players = [
    { id: 1, screenX: 20, screenY: 20, cloaked: true, observedAt: 900 },
    { id: 2, screenX: 30, screenY: 30, cloaked: false, observedAt: 900 },
    { id: 3, screenX: 40, screenY: 40, cloaked: true, observedAt: 1 },
    { id: 4, screenX: 133, screenY: 20, cloaked: true, observedAt: 900 }
  ];
  Object.freeze(players);
  for (const player of players) Object.freeze(player);

  const filtered = filterVisiblePlayers(
    players,
    { overlayEnabled: true, displayMode: "masked-only" },
    1000,
    { width: 100, height: 100 }
  );

  assert.deepEqual(filtered.map((item) => item.id), [1]);
  assert.notEqual(filtered, players);
  assert.deepEqual(players.map((item) => item.id), [1, 2, 3, 4]);
});

test("fails closed for negative viewport dimensions", () => {
  const players = [
    { id: 1, screenX: 20, screenY: 20, cloaked: true, observedAt: 900 }
  ];
  const settings = { overlayEnabled: true, displayMode: "masked-only" };

  assert.deepEqual(
    filterVisiblePlayers(players, settings, 1000, { width: -1, height: 100 }),
    []
  );
  assert.deepEqual(
    filterVisiblePlayers(players, settings, 1000, { width: 100, height: -1 }),
    []
  );
});

test("keeps original cooldown end for duplicate activations within 250 ms", () => {
  let current = 1000;
  const registry = createCooldownRegistry(() => current);

  registry.activate("emp", 7, 28000);
  current = 1250;
  registry.activate("emp", 7, 28000);

  assert.equal(registry.read(7).empEndsAt, 29000);
  current = 1251;
  registry.activate("emp", 7, 28000);
  assert.equal(registry.read(7).empEndsAt, 29251);
});

test("removes expired cooldowns and supports targeted and global clearing", () => {
  let current = 1000;
  const registry = createCooldownRegistry(() => current);

  registry.activate("emp", 7, 28000);
  registry.activate("emp", 7, 28000);
  assert.equal(registry.read(7).empEndsAt, 29000);
  current = 29001;
  assert.equal(registry.read(7).empEndsAt, null);
  registry.activate("ish", 7, 28000);
  registry.clear("ish", 7);
  assert.equal(registry.read(7).ishEndsAt, null);
  registry.activate("ish", 7, 28000);
  registry.clearAll();
  assert.deepEqual(registry.read(7), { empEndsAt: null, ishEndsAt: null });
});

test("does not shorten cooldowns when monotonic clock source rolls backward", () => {
  let current = 1000;
  const registry = createCooldownRegistry(() => current);

  registry.activate("emp", 7, 28000);
  current = 900;
  registry.activate("emp", 7, 28000);

  assert.equal(registry.read(7).empEndsAt, 29000);
});
