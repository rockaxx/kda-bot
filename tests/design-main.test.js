const test = require("node:test");
const assert = require("node:assert/strict");

const { createRankOverride, createShipOverride } = require("../src/design-main.js");

function harness(initialRank = 4) {
  const frames = new Map();
  let nextFrame = 0;
  function ship(rank) {
    return { rank, calls: [], setRank(value) { this.calls.push(value); this.rank = value; } };
  }
  const roots = { user: { ship: ship(initialRank) } };
  const windowRef = {
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); }
  };
  return {
    frames, roots, windowRef, ship,
    tick() {
      const pending = [...frames.values()];
      frames.clear();
      for (const fn of pending) fn();
    }
  };
}

test("rank override uses the game's native ship.setRank and restores native rank", () => {
  const value = harness(4);
  const controller = createRankOverride({ windowRef: value.windowRef, getRoots: () => value.roots });
  assert.equal(controller.setRank(20), true);
  assert.deepEqual(value.roots.user.ship.calls, [20]);
  value.tick();
  assert.deepEqual(value.roots.user.ship.calls, [20]);
  controller.cleanup();
  assert.deepEqual(value.roots.user.ship.calls, [20, 4]);
  assert.equal(value.roots.user.ship.rank, 4);
});

test("rank override follows hero ship replacement and restores both native ranks", () => {
  const value = harness(4);
  const first = value.roots.user.ship;
  const controller = createRankOverride({ windowRef: value.windowRef, getRoots: () => value.roots });
  controller.setRank(19);
  const replacement = value.ship(7);
  value.roots.user.ship = replacement;
  value.tick();
  assert.deepEqual(first.calls, [19, 4]);
  assert.deepEqual(replacement.calls, [19]);
  controller.setRank(0);
  assert.deepEqual(replacement.calls, [19, 7]);
  assert.equal(value.frames.size, 0);
  controller.cleanup();
});

test("rank override remembers a live native-rank update while active", () => {
  const value = harness(4);
  const ship = value.roots.user.ship;
  const controller = createRankOverride({ windowRef: value.windowRef, getRoots: () => value.roots });
  controller.setRank(12);
  ship.rank = 6;
  value.tick();
  assert.deepEqual(ship.calls, [12, 12]);
  controller.setRank(0);
  assert.equal(ship.rank, 6);
});

test("rank override rejects invalid IDs and retries until game ship exists", () => {
  const value = harness();
  value.roots.user.ship = null;
  const controller = createRankOverride({ windowRef: value.windowRef, getRoots: () => value.roots });
  for (const invalid of [-1, 21, 1.5, "2", null]) assert.equal(controller.setRank(invalid), false);
  assert.equal(controller.setRank(8), true);
  const lateShip = value.ship(3);
  value.roots.user.ship = lateShip;
  value.tick();
  assert.deepEqual(lateShip.calls, [8]);
  controller.cleanup();
  assert.equal(lateShip.rank, 3);
});

test("ship override changes the active hero model immediately and restores it", () => {
  const value = harness();
  const ship = value.roots.user.ship;
  ship.modelId = 55;
  ship.spriteCalls = [];
  ship.setShipSprite = function setShipSprite() { this.spriteCalls.push(this.modelId); };
  const controller = createShipOverride({ windowRef: value.windowRef, getRoots: () => value.roots });
  assert.equal(controller.setDesign("bastion"), true);
  assert.equal(ship.modelId, 2);
  assert.deepEqual(ship.spriteCalls, [2]);
  assert.equal(controller.setDesign("surgeon"), true);
  assert.equal(ship.modelId, 31);
  assert.deepEqual(ship.spriteCalls, [2, 31]);
  assert.equal(controller.setDesign("default"), true);
  assert.equal(ship.modelId, 55);
  assert.deepEqual(ship.spriteCalls, [2, 31, 55]);
  controller.cleanup();
});

test("ship override follows hero replacement without reload", () => {
  const value = harness();
  const first = value.roots.user.ship;
  first.modelId = 70;
  first.setShipSprite = function setShipSprite() {};
  const controller = createShipOverride({ windowRef: value.windowRef, getRoots: () => value.roots });
  controller.setDesign("regalia");
  const second = value.ship(1);
  second.modelId = 80;
  second.calls = [];
  second.setShipSprite = function setShipSprite() { this.calls.push(this.modelId); };
  value.roots.user.ship = second;
  value.tick();
  assert.equal(first.modelId, 70);
  assert.equal(second.modelId, 218);
  assert.deepEqual(second.calls, [218]);
  controller.cleanup();
  assert.equal(second.modelId, 80);
});
