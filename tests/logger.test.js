const test = require("node:test");
const assert = require("node:assert/strict");
const { createLogger } = require("../src/logger.js");

test("logger bounds entries and removes sensitive fields recursively", () => {
  const logger = createLogger(2, () => "2026-08-28T00:00:00.000Z");
  const original = { token: "secret", nested: { authHeader: "hidden", state: "SEARCHING" } };
  logger.add("state", original);
  original.nested.state = "MUTATED";
  logger.add("state", { state: "KITING" });
  logger.add("state", { state: "REPAIR_WAIT" });
  const entries = logger.list();
  assert.equal(entries.length, 2);
  assert.equal(JSON.stringify(entries).includes("secret"), false);
  assert.equal(JSON.stringify(entries).includes("hidden"), false);
  assert.equal(entries[0].at, "2026-08-28T00:00:00.000Z");
});

test("logger returns copies and rejects invalid limits", () => {
  assert.throws(() => createLogger(0), /limit/);
  const logger = createLogger(1, () => "now");
  logger.add("event", { state: "SEARCHING" });
  const first = logger.list();
  first[0].data.state = "changed";
  assert.equal(logger.list()[0].data.state, "SEARCHING");
});
