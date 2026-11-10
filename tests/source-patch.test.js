const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeRoot } = require("../src/source-patch.js");

test("sanitizes sensitive keys and limits depth", () => {
  const summary = summarizeRoot(
    {
      mapId: 7,
      token: "secret",
      child: { hp: 50, deep: { x: 1 } }
    },
    { maxDepth: 1, maxKeys: 20 }
  );

  assert.equal(summary.mapId, 7);
  assert.equal(Object.hasOwn(summary, "token"), false);
  assert.deepEqual(summary.child, { hp: 50, deep: "[depth-limit]" });
});

test("diagnostic summary never calls functions and catches throwing getters", () => {
  let called = false;
  const value = {
    action() {
      called = true;
    }
  };
  Object.defineProperty(value, "broken", {
    enumerable: true,
    get() {
      throw new Error("blocked");
    }
  });

  const summary = summarizeRoot(value, { maxDepth: 2, maxKeys: 20 });

  assert.equal(called, false);
  assert.equal(summary.action, "[function]");
  assert.equal(summary.broken, "[unavailable]");
});

test("diagnostic summary always produces JSON-safe primitive values", () => {
  const summary = summarizeRoot({
    missing: undefined,
    large: 123n,
    marker: Symbol("x"),
    invalidNumber: Number.NaN
  });

  assert.doesNotThrow(() => JSON.stringify(summary));
  assert.deepEqual(summary, {
    missing: "[undefined]",
    large: "[bigint]",
    marker: "[symbol]",
    invalidNumber: "[invalid-number]"
  });
});
