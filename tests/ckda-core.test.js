const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyPlayer,
  projectPlayer,
  filterVisiblePlayers,
  createCooldownRegistry
} = require("../src/ckda-core.js");

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
