const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CKDA_DEFAULT_SETTINGS,
  normalizeCkdaSettings
} = require("../src/ckda-settings.js");

test("C-KDA defaults keep Premium off", () => {
  assert.deepEqual(CKDA_DEFAULT_SETTINGS, {
    overlayEnabled: true,
    displayMode: "masked-only",
    shape: "circle",
    allyColor: "#45d483",
    enemyColor: "#ff394f",
    sizePx: 8,
    refreshFps: 60,
    opacity: 0.9,
    showEmpCooldown: true,
    showIshCooldown: true,
    empCooldownMs: 28000,
    ishCooldownMs: 28000,
    premiumOverride: false
  });
});

test("invalid C-KDA values fall back field by field", () => {
  const result = normalizeCkdaSettings({
    shape: "hex",
    sizePx: 500,
    refreshFps: 20,
    premiumOverride: "yes"
  });

  assert.equal(result.value.shape, "circle");
  assert.equal(result.value.sizePx, 8);
  assert.equal(result.value.refreshFps, 60);
  assert.equal(result.value.premiumOverride, false);
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    "shape is invalid",
    "sizePx must be from 3 to 200",
    "refreshFps must be 30 or 60",
    "premiumOverride must be a boolean"
  ]);
});

test("normalizes every documented valid setting and drops unknown keys", () => {
  const result = normalizeCkdaSettings({
    overlayEnabled: false,
    displayMode: "all",
    shape: "star",
    allyColor: "#ABCDEF",
    enemyColor: "#123456",
    sizePx: 200,
    refreshFps: 30,
    opacity: 0.1,
    showEmpCooldown: false,
    showIshCooldown: false,
    empCooldownMs: 1000,
    ishCooldownMs: 120000,
    premiumOverride: true,
    ignored: "value"
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.displayMode, "all");
  assert.equal(result.value.shape, "star");
  assert.equal(result.value.allyColor, "#ABCDEF");
  assert.equal(result.value.sizePx, 200);
  assert.equal(result.value.refreshFps, 30);
  assert.equal(result.value.opacity, 0.1);
  assert.equal(result.value.premiumOverride, true);
  assert.equal(Object.hasOwn(result.value, "ignored"), false);
  assert.equal(Object.isFrozen(result.value), true);
});

test("rejects truthy booleans and invalid numeric, colour, and enum values", () => {
  const result = normalizeCkdaSettings({
    overlayEnabled: 1,
    displayMode: "masked",
    allyColor: "red",
    enemyColor: "#abcd",
    sizePx: 2,
    opacity: 1.1,
    showEmpCooldown: "true",
    showIshCooldown: null,
    empCooldownMs: 999,
    ishCooldownMs: Infinity
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.value, CKDA_DEFAULT_SETTINGS);
  assert.deepEqual(result.errors, [
    "overlayEnabled must be a boolean",
    "displayMode is invalid",
    "allyColor is invalid",
    "enemyColor is invalid",
    "sizePx must be from 3 to 200",
    "opacity must be from 0.1 to 1",
    "showEmpCooldown must be a boolean",
    "showIshCooldown must be a boolean",
    "empCooldownMs must be from 1000 to 120000",
    "ishCooldownMs must be from 1000 to 120000"
  ]);
});
