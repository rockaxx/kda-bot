(function expose(root, factory) {
  const dependency =
    typeof module === "object" && module.exports
      ? {
          ...require("./ckda-schema.js"),
          ...require("./ckda-core.js")
        }
      : root.__SA_BOT_MAIN_V1__;
  const api = factory(dependency);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_MAIN_V1__, api);
})(typeof window === "object" ? window : null, function createApi(dependency) {
  "use strict";

  const CLIENT_VERSION = "1.9.0.051";

  function normalizedClientVersion(value) {
    return String(value || "").replace(/^n/, "");
  }

  function validCooldownEndpoint(value) {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  function createCkdaSnapshot(roots, cooldowns, premiumState, timestamp) {
    try {
      const world = roots && roots.world;
      const user = roots && roots.user;
      const ships = world && world.MAP_SHIPS;
      const mapId = Number(world && world.mapId);
      if (
        !dependency ||
        typeof dependency.classifyPlayer !== "function" ||
        typeof dependency.projectPlayer !== "function" ||
        typeof dependency.validateCkdaSnapshot !== "function" ||
        !user ||
        !user.ship ||
        !roots.network ||
        roots.network.connected !== true ||
        normalizedClientVersion(roots.version) !== CLIENT_VERSION ||
        !Number.isInteger(mapId) ||
        mapId < 1 ||
        typeof ships.forEach !== "function" ||
        !cooldowns ||
        typeof cooldowns.read !== "function" ||
        !Number.isFinite(timestamp) ||
        timestamp < 0
      ) {
        return null;
      }

      const players = [];
      ships.forEach((entity) => {
        const relation = dependency.classifyPlayer(entity, roots);
        const projection = relation && dependency.projectPlayer(entity);
        if (!projection) return;
        const cooldown = cooldowns.read(entity.ID) || {};
        players.push({
          id: entity.ID,
          screenX: projection.screenX,
          screenY: projection.screenY,
          relation,
          cloaked: Boolean(entity.isCloaked),
          observedAt: timestamp,
          empEndsAt: validCooldownEndpoint(cooldown.empEndsAt),
          ishEndsAt: validCooldownEndpoint(cooldown.ishEndsAt)
        });
      });

      const result = dependency.validateCkdaSnapshot({
        timestamp,
        clientVersion: CLIENT_VERSION,
        connectionState: "connected",
        mapId,
        premiumState,
        players
      });
      return result.ok ? result.value : null;
    } catch (_) {
      return null;
    }
  }

  function startCkdaPublisher(windowRef, roots, options = {}) {
    const now = typeof options.now === "function" ? options.now : Date.now;
    const cooldowns =
      options.cooldowns &&
      typeof options.cooldowns.read === "function" &&
      typeof options.cooldowns.clearAll === "function"
        ? options.cooldowns
        : dependency.createCooldownRegistry(now);
    const premiumState =
      typeof options.premiumState === "string" ? options.premiumState : "inactive";
    let stopped = false;
    let timer = null;
    let lastWorld = roots && roots.world;
    let lastMapId = Number(lastWorld && lastWorld.mapId);

    function refresh() {
      if (stopped) return null;
      const world = roots && roots.world;
      const mapId = Number(world && world.mapId);
      if (world !== lastWorld || !Object.is(mapId, lastMapId)) {
        cooldowns.clearAll();
        lastWorld = world;
        lastMapId = mapId;
      }
      const snapshot = createCkdaSnapshot(roots, cooldowns, premiumState, now());
      if (!snapshot || !windowRef || typeof windowRef.postMessage !== "function") {
        return null;
      }
      windowRef.postMessage(
        {
          channel: dependency.CKDA_CHANNEL,
          direction: "snapshot",
          payload: snapshot
        },
        "*"
      );
      return snapshot;
    }

    refresh();
    if (windowRef && typeof windowRef.setInterval === "function") {
      timer = windowRef.setInterval(refresh, 100);
    }

    function stop() {
      if (stopped) return false;
      stopped = true;
      if (
        timer !== null &&
        windowRef &&
        typeof windowRef.clearInterval === "function"
      ) {
        windowRef.clearInterval(timer);
      }
      return true;
    }

    return { stop, refresh };
  }

  return { createCkdaSnapshot, startCkdaPublisher };
});
