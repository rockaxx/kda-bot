const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_SETTINGS,
  normalizeSettings
} = require("../src/settings.js");

test("provides conservative defaults", () => {
  assert.deepEqual(DEFAULT_SETTINGS, {
    requiredMap: null,
    kiteDistance: 700,
    dangerRadius: 550,
    fleeHpPercent: 35,
    resumeHpPercent: 100,
    ammoKey: "1",
    planningIntervalMs: 100,
    movementIntervalMs: 250,
    targetBlacklistMs: 5000
  });
});

test("normalizes a partial settings object without unknown keys", () => {
  const result = normalizeSettings({
    requiredMap: 7,
    fleeHpPercent: 40,
    ignored: "value"
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.requiredMap, 7);
  assert.equal(result.value.fleeHpPercent, 40);
  assert.equal(Object.hasOwn(result.value, "ignored"), false);
  assert.equal(Object.isFrozen(result.value), true);
});

test("rejects resume threshold below flee threshold", () => {
  const result = normalizeSettings({
    fleeHpPercent: 60,
    resumeHpPercent: 50
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /resumeHpPercent/);
});

test("rejects non-numeric map and unsupported ammo bind", () => {
  const result = normalizeSettings({
    requiredMap: "sector",
    ammoKey: "F12"
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /requiredMap/);
  assert.match(result.errors.join(" "), /ammoKey/);
});

test("rejects values outside every documented numeric range", () => {
  const result = normalizeSettings({
    requiredMap: 0,
    kiteDistance: 99,
    dangerRadius: 5001,
    fleeHpPercent: 0,
    resumeHpPercent: 101,
    planningIntervalMs: 49,
    movementIntervalMs: 2001,
    targetBlacklistMs: 999
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 8);
});
