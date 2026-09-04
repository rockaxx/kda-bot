(function expose(root, factory) {
  const geometry =
    typeof module === "object" && module.exports
      ? require("./geometry.js")
      : root.__SA_BOT_ISOLATED_V1__;
  const api = factory(geometry);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_ISOLATED_V1__, api);
})(typeof window === "object" ? window : null, function createApi(geometry) {
  "use strict";

  const { distance, isPathClear, pointOnCircle, segmentDistance } = geometry;

  function isBlacklisted(blacklist, id, now) {
    return (blacklist.get(id) || 0) > now;
  }

  function approachPoint(player, target, kiteDistance) {
    const targetDistance = distance(player, target);
    if (targetDistance === 0) return { x: target.x, y: target.y };
    return {
      x: target.x + ((player.x - target.x) / targetDistance) * kiteDistance,
      y: target.y + ((player.y - target.y) / targetDistance) * kiteDistance
    };
  }

  function selectEdgeNpc(player, entities, settings, blacklist, now) {
    const aliveNpcs = entities.filter(
      (entity) => entity.type === "npc" && entity.alive
    );
    const candidates = aliveNpcs.filter(
      (entity) => !isBlacklisted(blacklist, entity.id, now)
    );
    const scored = [];

    for (const candidate of candidates) {
      const others = aliveNpcs.filter((entity) => entity.id !== candidate.id);
      const approach = approachPoint(
        player,
        candidate,
        settings.kiteDistance
      );
      if (
        !isPathClear(
          player,
          approach,
          others,
          settings.dangerRadius
        )
      ) {
        continue;
      }

      const neighborDistances = others.map((entity) =>
        distance(candidate, entity)
      );
      const localDensity = neighborDistances.filter(
        (value) => value <= 2 * settings.dangerRadius
      ).length;
      const nearestNeighbor = neighborDistances.length
        ? Math.min(...neighborDistances)
        : Number.POSITIVE_INFINITY;
      const travelDistance = distance(player, candidate);
      const score =
        localDensity * 1_000_000 +
        travelDistance -
        Math.min(nearestNeighbor, 100000);
      scored.push({ candidate, score });
    }

    scored.sort(
      (left, right) =>
        left.score - right.score ||
        String(left.candidate.id).localeCompare(String(right.candidate.id))
    );
    return scored.length ? scored[0].candidate : null;
  }

  function isInsideBounds(point, bounds) {
    return (
      !bounds ||
      (point.x >= bounds.minX &&
        point.x <= bounds.maxX &&
        point.y >= bounds.minY &&
        point.y <= bounds.maxY)
    );
  }

  function clampToBounds(point, bounds) {
    if (!bounds) return point;
    return {
      x: Math.max(bounds.minX, Math.min(bounds.maxX, point.x)),
      y: Math.max(bounds.minY, Math.min(bounds.maxY, point.y))
    };
  }

  function planKitePoint(
    player,
    target,
    entities,
    settings,
    previousPoint,
    bounds
  ) {
    const hazards = entities.filter(
      (entity) =>
        entity.type === "npc" && entity.alive && entity.id !== target.id
    );
    const candidates = [];

    for (let index = 0; index < 32; index += 1) {
      const point = pointOnCircle(
        target,
        settings.kiteDistance,
        (index * 2 * Math.PI) / 32
      );
      if (!isInsideBounds(point, bounds)) continue;
      if (!isPathClear(player, point, hazards, settings.dangerRadius)) {
        continue;
      }
      const distances = hazards.map((hazard) => distance(point, hazard));
      if (distances.some((value) => value <= settings.dangerRadius)) {
        continue;
      }
      const minimumDistance = distances.length
        ? Math.min(...distances)
        : 100000;
      const score =
        minimumDistance -
        0.25 * distance(player, point) -
        (previousPoint ? 0.1 * distance(previousPoint, point) : 0);
      candidates.push({ index, point, score });
    }

    candidates.sort(
      (left, right) => right.score - left.score || left.index - right.index
    );
    if (!candidates.length) {
      return { status: "unsafe", reason: "no-safe-kite-point" };
    }
    return {
      status: "safe",
      point: candidates[0].point,
      reason: "safe-kite-point",
      score: candidates[0].score
    };
  }

  function planFleePoint(player, entities, settings, bounds) {
    const nearby = entities.filter(
      (entity) =>
        entity.type === "npc" &&
        entity.alive &&
        distance(player, entity) <= 3 * settings.dangerRadius
    );
    if (!nearby.length) {
      return { status: "unsafe", reason: "no-nearby-npc-direction" };
    }

    const centroid = nearby.reduce(
      (sum, entity) => ({
        x: sum.x + entity.x / nearby.length,
        y: sum.y + entity.y / nearby.length
      }),
      { x: 0, y: 0 }
    );
    let dx = player.x - centroid.x;
    let dy = player.y - centroid.y;
    let magnitude = Math.hypot(dx, dy);
    if (magnitude === 0) {
      dx = -1;
      dy = 0;
      magnitude = 1;
    }
    const point = clampToBounds(
      {
        x: player.x + (dx / magnitude) * 2 * settings.kiteDistance,
        y: player.y + (dy / magnitude) * 2 * settings.kiteDistance
      },
      bounds
    );
    if (
      nearby.some(
        (entity) => distance(point, entity) <= settings.dangerRadius
      )
    ) {
      return { status: "unsafe", reason: "flee-point-still-dangerous" };
    }
    return { status: "safe", point, reason: "away-from-npc-centroid" };
  }

  function planEmergencyEscape(player, entities, settings, bounds) {
    const hazards = entities.filter(
      (entity) => entity.type === "npc" && entity.alive
    );
    if (!hazards.length) {
      return { status: "unsafe", reason: "no-live-npc-to-escape" };
    }
    const escapeDistance = 2 * settings.kiteDistance;
    const candidates = [];
    for (let index = 0; index < 32; index += 1) {
      const angle = (index * 2 * Math.PI) / 32;
      const point = pointOnCircle(player, escapeDistance, angle);
      if (!isInsideBounds(point, bounds)) continue;
      const corridorStart = pointOnCircle(player, escapeDistance * 0.25, angle);
      const routeClearance = Math.min(
        ...hazards.map((hazard) =>
          segmentDistance(hazard, corridorStart, point)
        )
      );
      const endpointClearance = Math.min(
        ...hazards.map((hazard) => distance(hazard, point))
      );
      candidates.push({
        index,
        point,
        score: 3 * routeClearance + endpointClearance
      });
    }
    candidates.sort(
      (left, right) => right.score - left.score || left.index - right.index
    );
    if (!candidates.length) {
      return { status: "unsafe", reason: "no-emergency-escape-point" };
    }
    return {
      status: "escape",
      point: candidates[0].point,
      reason: "widest-cluster-gap",
      score: candidates[0].score
    };
  }

  return {
    planEmergencyEscape,
    planFleePoint,
    planKitePoint,
    selectEdgeNpc
  };
});
