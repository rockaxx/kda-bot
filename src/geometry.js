(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.SABot, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  function distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function pointOnCircle(center, radius, angle) {
    return {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle)
    };
  }

  function segmentDistance(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return distance(point, start);
    const projection =
      ((point.x - start.x) * dx + (point.y - start.y) * dy) /
      lengthSquared;
    const clamped = Math.max(0, Math.min(1, projection));
    return distance(point, {
      x: start.x + clamped * dx,
      y: start.y + clamped * dy
    });
  }

  function isPathClear(start, end, hazards, radius) {
    return hazards.every(
      (hazard) => segmentDistance(hazard, start, end) > radius
    );
  }

  return { distance, isPathClear, pointOnCircle, segmentDistance };
});
