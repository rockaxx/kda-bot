const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateEnvelope,
  validateSnapshot
} = require("../src/schemas.js");

const validSnapshot = {
  timestamp: 1000,
  clientVersion: "1.9.0.045",
  connectionState: "connected",
  mapId: 7,
  player: {
    id: "hero",
    x: 10,
    y: 20,
    hpPercent: 88,
    alive: true,
    moving: false,
    inCombat: false
  },
  target: null,
  entities: []
};

test("accepts and copies the minimal normalized snapshot", () => {
  const result = validateSnapshot(validSnapshot);

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, validSnapshot);
  assert.notEqual(result.value, validSnapshot);
  assert.notEqual(result.value.player, validSnapshot.player);
});

test("rejects unknown entity types", () => {
  const snapshot = {
    ...validSnapshot,
    entities: [
      {
        id: "x",
        type: "mystery",
        x: 1,
        y: 2,
        hpPercent: 100,
        alive: true
      }
    ]
  };

  assert.equal(validateSnapshot(snapshot).ok, false);
});

test("rejects invalid percentages and coordinates", () => {
  const badHp = {
    ...validSnapshot,
    player: { ...validSnapshot.player, hpPercent: 101 }
  };
  const badCoordinate = {
    ...validSnapshot,
    player: { ...validSnapshot.player, x: Number.NaN }
  };

  assert.equal(validateSnapshot(badHp).ok, false);
  assert.equal(validateSnapshot(badCoordinate).ok, false);
});

test("rejects envelopes with the wrong channel or direction", () => {
  assert.equal(
    validateEnvelope(
      { channel: "other", direction: "snapshot", payload: validSnapshot },
      "snapshot"
    ).ok,
    false
  );
  assert.equal(
    validateEnvelope(
      {
        channel: "sa-bot-v1",
        direction: "action",
        payload: validSnapshot
      },
      "snapshot"
    ).ok,
    false
  );
});
