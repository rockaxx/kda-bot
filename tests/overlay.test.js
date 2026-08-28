const test = require("node:test");
const assert = require("node:assert/strict");
const { canStartDryRun } = require("../src/overlay.js");

test("Dry Run starts only with valid settings, supported adapter, and snapshot", () => {
  assert.equal(canStartDryRun({ settingsValid: true, adapterSupported: true, hasSnapshot: true }), true);
  assert.equal(canStartDryRun({ settingsValid: false, adapterSupported: true, hasSnapshot: true }), false);
  assert.equal(canStartDryRun({ settingsValid: true, adapterSupported: false, hasSnapshot: true }), false);
  assert.equal(canStartDryRun({ settingsValid: true, adapterSupported: true, hasSnapshot: false }), false);
});
