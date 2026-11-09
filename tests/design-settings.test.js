const test = require("node:test");
const assert = require("node:assert/strict");

let designApi = null;
try {
  designApi = require("../src/design-settings.js");
} catch (_) {
  // RED until the Design Mode settings module exists.
}

test("Design Mode defaults to the original game rank", () => {
  assert.ok(designApi, "design settings module must exist");
  assert.deepEqual(designApi.DESIGN_DEFAULT_SETTINGS, { rankId: 0, shipDesign: "default" });
});
test("Design Mode accepts only integer rank IDs from 0 through 20", () => {
  assert.ok(designApi, "design settings module must exist");
  for (const rankId of [0, 1, 7, 20]) {
    const result = designApi.normalizeDesignSettings({ rankId, ignored: true });
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, { rankId, shipDesign: "default" });
    assert.equal(Object.isFrozen(result.value), true);
  }
  for (const rankId of [-1, 21, 1.5, "20", null]) {
    const result = designApi.normalizeDesignSettings({ rankId });
    assert.equal(result.ok, false);
    assert.deepEqual(result.value, { rankId: 0, shipDesign: "default" });
    assert.deepEqual(result.errors, ["rankId must be an integer from 0 to 20"]);
  }
});
test("Design Mode accepts only default and Bastion ship designs", () => {
  assert.deepEqual(designApi.normalizeDesignSettings({ shipDesign: "bastion" }).value,
    { rankId: 0, shipDesign: "bastion" });
  const invalid = designApi.normalizeDesignSettings({ shipDesign: "surgeon" });
  assert.equal(invalid.ok, false);
  assert.deepEqual(invalid.value, { rankId: 0, shipDesign: "default" });
});
