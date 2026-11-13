const test = require("node:test");
const assert = require("node:assert/strict");

let designApi = null;
try {
  designApi = require("../src/design-settings.js");
} catch (_) {
  // RED until the Design Mode settings module exists.
}
const models = require("../assets/Models.steam.json").ships;

test("Design Mode defaults to the original game rank", () => {
  assert.ok(designApi, "design settings module must exist");
  assert.deepEqual(designApi.DESIGN_DEFAULT_SETTINGS, {
    rankId: 0, ringLevel: 0, shipDesign: "default", titleText: "", titleColor: "#ffd700"
  });
});
test("Design Mode accepts only integer rank IDs from 0 through 20", () => {
  assert.ok(designApi, "design settings module must exist");
  for (const rankId of [0, 1, 7, 20]) {
    const result = designApi.normalizeDesignSettings({ rankId, ignored: true });
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, { ...designApi.DESIGN_DEFAULT_SETTINGS, rankId });
    assert.equal(Object.isFrozen(result.value), true);
  }
  for (const rankId of [-1, 21, 1.5, "20", null]) {
    const result = designApi.normalizeDesignSettings({ rankId });
    assert.equal(result.ok, false);
    assert.deepEqual(result.value, designApi.DESIGN_DEFAULT_SETTINGS);
    assert.deepEqual(result.errors, ["rankId must be an integer from 0 to 20"]);
  }
});
test("every UNS model ID is selectable and legacy ship settings migrate", () => {
  const catalog = designApi.createShipCatalog(models);
  assert.deepEqual(new Set(catalog.map(entry => entry.value)),
    new Set(Object.keys(models).map(id => "model:" + id)));
  for (const [id, category] of [[12, "Nostromo"], [214, "N-Starhawk"], [223, "N-Starhawk"], [219, "Sentinel"],
    [220, "Spectrum"], [250, "Goliath"], [32, "Other"]]) {
    assert.equal(catalog.find(entry => entry.value === "model:" + id).category, category);
  }
  for (const [legacy, value] of [["bastion", "model:2"], ["regalia", "model:218"]]) {
    assert.equal(designApi.normalizeDesignSettings({ shipDesign: legacy }, catalog).value.shipDesign, value);
  }
  assert.equal(designApi.normalizeDesignSettings({ shipDesign: "model:999" }, catalog).ok, false);
});
