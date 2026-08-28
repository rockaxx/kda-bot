(function expose(root, factory) {
  const geometry =
    typeof module === "object" && module.exports
      ? require("./geometry.js")
      : root.SABot;
  const api = factory(geometry);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.SABot, api);
})(typeof window === "object" ? window : null, function createApi(geometry) {
  "use strict";

  const { distance, isPathClear } = geometry;

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

  return { selectEdgeNpc };
});
