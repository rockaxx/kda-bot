const test = require("node:test");
const assert = require("node:assert/strict");
const {
  planFleePoint,
  planKitePoint,
  selectEdgeNpc
} = require("../src/planner.js");

const settings = { kiteDistance: 700, dangerRadius: 550 };
const player = { x: 0, y: 0 };

test("excludes players from NPC targeting", () => {
  const entities = [
    {
      id: "p",
      type: "player",
      x: 100,
      y: 0,
      alive: true,
      hpPercent: 100
    },
    {
      id: "n",
      type: "npc",
      x: 900,
      y: 0,
      alive: true,
      hpPercent: 100
    }
  ];

  assert.equal(
    selectEdgeNpc(player, entities, settings, new Map(), 1000).id,
    "n"
  );
});

test("selects the outside NPC instead of the cluster center", () => {
  const entities = [
    {
      id: "left",
      type: "npc",
      x: 1000,
      y: 0,
      alive: true,
      hpPercent: 100
    },
    {
      id: "center",
      type: "npc",
      x: 1500,
      y: 0,
      alive: true,
      hpPercent: 100
    },
    {
      id: "right",
      type: "npc",
      x: 2000,
      y: 0,
      alive: true,
      hpPercent: 100
    },
    {
      id: "upper",
      type: "npc",
      x: 1500,
      y: 300,
      alive: true,
      hpPercent: 100
    }
  ];

  assert.equal(
    selectEdgeNpc(player, entities, settings, new Map(), 1000).id,
    "left"
  );
});

test("ignores temporarily blacklisted NPCs", () => {
  const entities = [
    {
      id: "a",
      type: "npc",
      x: 1000,
      y: 0,
      alive: true,
      hpPercent: 100
    },
    {
      id: "b",
      type: "npc",
      x: 0,
      y: 1200,
      alive: true,
      hpPercent: 100
    }
  ];

  assert.equal(
    selectEdgeNpc(
      player,
      entities,
      settings,
      new Map([["a", 2000]]),
      1000
    ).id,
    "b"
  );
});

test("returns null when no live NPC has a safe direct route", () => {
  const entities = [
    {
      id: "blocker",
      type: "npc",
      x: 500,
      y: 0,
      alive: true,
      hpPercent: 100
    },
    {
      id: "rear",
      type: "npc",
      x: 1000,
      y: 0,
      alive: true,
      hpPercent: 100
    }
  ];
  const blacklist = new Map([["blocker", 2000]]);

  assert.equal(
    selectEdgeNpc(player, entities, settings, blacklist, 1000),
    null
  );
});

test("rejects kite points endangered by a second NPC", () => {
  const target = {
    id: "target",
    type: "npc",
    x: 1000,
    y: 0,
    alive: true,
    hpPercent: 100
  };
  const blocker = {
    id: "blocker",
    type: "npc",
    x: 1000,
    y: 700,
    alive: true,
    hpPercent: 100
  };
  const result = planKitePoint(
    { x: 0, y: 0 },
    target,
    [target, blocker],
    settings,
    null,
    { minX: -5000, maxX: 5000, minY: -5000, maxY: 5000 }
  );

  assert.equal(result.status, "safe");
  assert.ok(
    Math.hypot(result.point.x - blocker.x, result.point.y - blocker.y) >
      settings.dangerRadius
  );
});

test("returns unsafe when every sampled kite point is blocked", () => {
  const target = {
    id: "t",
    type: "npc",
    x: 0,
    y: 0,
    alive: true,
    hpPercent: 100
  };
  const blockers = Array.from({ length: 16 }, (_, index) => ({
    id: `b${index}`,
    type: "npc",
    x: 700 * Math.cos((index * Math.PI) / 8),
    y: 700 * Math.sin((index * Math.PI) / 8),
    alive: true,
    hpPercent: 100
  }));

  assert.equal(
    planKitePoint(
      { x: -1400, y: 0 },
      target,
      [target, ...blockers],
      settings,
      null,
      null
    ).status,
    "unsafe"
  );
});

test("flee point moves away from the nearby NPC centroid", () => {
  const result = planFleePoint(
    { x: 0, y: 0 },
    [
      {
        id: "a",
        type: "npc",
        x: 100,
        y: 0,
        alive: true,
        hpPercent: 100
      },
      {
        id: "b",
        type: "npc",
        x: 200,
        y: 0,
        alive: true,
        hpPercent: 100
      }
    ],
    settings,
    null
  );

  assert.equal(result.status, "safe");
  assert.ok(result.point.x < 0);
});
