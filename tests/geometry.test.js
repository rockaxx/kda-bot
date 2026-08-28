const test = require("node:test");
const assert = require("node:assert/strict");
const {
  distance,
  isPathClear,
  pointOnCircle,
  segmentDistance
} = require("../src/geometry.js");

test("calculates Euclidean distance", () => {
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test("creates a point at the requested circle angle", () => {
  const point = pointOnCircle({ x: 10, y: 20 }, 5, Math.PI / 2);

  assert.ok(Math.abs(point.x - 10) < 1e-10);
  assert.ok(Math.abs(point.y - 25) < 1e-10);
});

test("detects a hazard intersecting a route", () => {
  const hazards = [{ id: "n2", x: 5, y: 1 }];

  assert.equal(
    isPathClear({ x: 0, y: 0 }, { x: 10, y: 0 }, hazards, 2),
    false
  );
  assert.equal(
    segmentDistance(
      hazards[0],
      { x: 0, y: 0 },
      { x: 10, y: 0 }
    ),
    1
  );
});

test("accepts a route outside every hazard radius", () => {
  const hazards = [{ id: "n2", x: 5, y: 3 }];

  assert.equal(
    isPathClear({ x: 0, y: 0 }, { x: 10, y: 0 }, hazards, 2),
    true
  );
});
