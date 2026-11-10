(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    Object.assign(root.__SA_BOT_ISOLATED_V1__ || root.__SA_BOT_MAIN_V1__, api);
  }
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  function createMonotonicEpochClock(performanceRef, dateNow = Date.now) {
    if (performanceRef && Number.isFinite(performanceRef.timeOrigin) &&
        typeof performanceRef.now === "function") {
      return () => performanceRef.timeOrigin + performanceRef.now();
    }
    let last = Number(dateNow());
    return () => (last = Math.max(last, Number(dateNow())));
  }

  function isCanonicalId(value) {
    return (
      (typeof value === "string" && value.length > 0) ||
      (Number.isFinite(value) && Number.isInteger(value))
    );
  }

  function hasAllyRelation(value) {
    if (typeof value !== "string") return false;
    const normalized = value.trim().toLowerCase();
    return /\b(?:ally|alliance|friend|own|pact)\b/.test(normalized);
  }

  function hasEnemyRelation(value) {
    if (typeof value !== "string") return false;
    return /\b(?:war|enemy|hostile)\b/.test(value.trim().toLowerCase());
  }

  function gameRelation(world, method, value) {
    if (!world || typeof world[method] !== "function") return false;
    try {
      return world[method](value) === true;
    } catch (_) {
      return false;
    }
  }

  function classifyPlayer(entity, roots) {
    const user = roots && roots.user;
    if (
      !entity ||
      !user ||
      !isCanonicalId(entity.ID) ||
      entity.isNpc === true ||
      entity.isPal === true ||
      entity.isHero === true ||
      entity === user.ship ||
      entity.ID === user.userID
    ) {
      return null;
    }

    const world = roots && roots.world;
    if (hasEnemyRelation(entity.clanRelation)) return "enemy";
    if (hasAllyRelation(entity.clanRelation)) return "ally";
    if (
      gameRelation(world, "isHeroGroupMember", entity.ID) ||
      gameRelation(world, "isHeroClanMember", entity.clanId) ||
      gameRelation(world, "isFactionIdHeroAlly", entity.faction) ||
      entity.clanId !== null &&
      entity.clanId !== undefined &&
      user.clanId !== null &&
      user.clanId !== undefined &&
      entity.clanId === user.clanId
    ) {
      return "ally";
    }
    return "enemy";
  }

  function toCanvasCssPoint(point, roots) {
    let x = point.x;
    let y = point.y;
    try {
      const renderer = roots?.renderer;
      const pixi = renderer?.core?.renderer;
      const canvas = renderer?.canvas || pixi?.canvas || pixi?.view;
      const rect = canvas?.getBoundingClientRect?.();
      const resolution = Number(pixi?.resolution);
      const width = Number(pixi?.screen?.width) ||
        (resolution > 0 ? Number(pixi?.width || canvas?.width) / resolution : 0);
      const height = Number(pixi?.screen?.height) ||
        (resolution > 0 ? Number(pixi?.height || canvas?.height) / resolution : 0);
      const zoom = renderer?.zoomLevel;
      // The alternate engine applies setZoom after the world transform. PIXI's
      // container-zoom path already includes it, so only the former needs this.
      if (typeof pixi?.setZoom === "function" && Number.isFinite(zoom) && zoom > 0 &&
          Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
        x = width / 2 + (x - width / 2) * zoom;
        y = height / 2 + (y - height / 2) * zoom;
      }
      if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0 &&
          Number.isFinite(rect?.width) && rect.width > 0 &&
          Number.isFinite(rect?.height) && rect.height > 0) {
        return {screenX: x * rect.width / width, screenY: y * rect.height / height};
      }
    } catch (_) {
      // PIXI global coordinates are already logical pixels when layout metadata is absent.
    }
    return {screenX: x, screenY: y};
  }

  function projectPlayer(entity, roots) {
    try {
      const worldTransform = roots && roots.world && roots.world.world &&
        roots.world.world.worldTransform;
      const worldX = Number(entity && entity.x);
      const worldY = Number(entity && entity.y);
      if (worldTransform && Number.isFinite(worldX) && Number.isFinite(worldY)) {
        let point = null;
        if (typeof worldTransform.apply === "function") {
          point = worldTransform.apply({ x: worldX, y: worldY });
        } else if (
          Number.isFinite(worldTransform.a) &&
          Number.isFinite(worldTransform.b) &&
          Number.isFinite(worldTransform.c) &&
          Number.isFinite(worldTransform.d) &&
          Number.isFinite(worldTransform.tx) &&
          Number.isFinite(worldTransform.ty)
        ) {
          point = {
            x: worldTransform.a * worldX + worldTransform.c * worldY + worldTransform.tx,
            y: worldTransform.b * worldX + worldTransform.d * worldY + worldTransform.ty
          };
        }
        if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
          return toCanvasCssPoint(point, roots);
        }
      }
    } catch (_) {
      // Fall back to compatible display-object projection paths.
    }

    const displayObjects = [
      entity && entity.uiWrapper,
      entity && entity.wrapper,
      entity && entity.renderer && entity.renderer.wrapper
    ];

    for (const displayObject of displayObjects) {
      if (!displayObject) continue;
      try {
        let point = null;
        if (typeof displayObject.toGlobal === "function") {
          point = displayObject.toGlobal({ x: 0, y: 0 });
        } else if (typeof displayObject.getGlobalPosition === "function") {
          point = displayObject.getGlobalPosition();
        } else if (
          displayObject.worldTransform &&
          Number.isFinite(displayObject.worldTransform.tx) &&
          Number.isFinite(displayObject.worldTransform.ty)
        ) {
          point = {
            x: displayObject.worldTransform.tx,
            y: displayObject.worldTransform.ty
          };
        }
        if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
          return toCanvasCssPoint(point, roots);
        }
      } catch (_) {
        // Try the next compatible PIXI display-object path.
      }
    }
    return null;
  }

  function filterVisiblePlayers(
    players,
    settings,
    now,
    viewport,
    staleAfterMs = 750
  ) {
    if (
      !Array.isArray(players) ||
      !settings ||
      settings.overlayEnabled !== true ||
      (settings.displayMode !== "masked-only" && settings.displayMode !== "all") ||
      !Number.isFinite(now) ||
      !viewport ||
      !Number.isFinite(viewport.width) ||
      !Number.isFinite(viewport.height) ||
      viewport.width < 0 ||
      viewport.height < 0 ||
      !Number.isFinite(staleAfterMs) ||
      staleAfterMs < 0
    ) {
      return [];
    }

    const viewportMargin = 32;
    return players.filter((player) => {
      if (
        !player ||
        !Number.isFinite(player.screenX) ||
        !Number.isFinite(player.screenY) ||
        !Number.isFinite(player.observedAt) ||
        player.observedAt < 0 ||
        player.observedAt > now ||
        now - player.observedAt > staleAfterMs
      ) {
        return false;
      }
      if (settings.displayMode === "masked-only" && player.cloaked !== true) {
        return false;
      }
      return (
        player.screenX >= -viewportMargin &&
        player.screenX <= viewport.width + viewportMargin &&
        player.screenY >= -viewportMargin &&
        player.screenY <= viewport.height + viewportMargin
      );
    });
  }

  function createCooldownRegistry(now) {
    const entries = new Map();
    const clock = typeof now === "function" ? now : () => Number.NaN;
    let lastTimestamp = null;

    function keyFor(kind, id) {
      return `${kind}:${typeof id}:${String(id)}`;
    }

    function currentTime() {
      const value = clock();
      if (!Number.isFinite(value) || value < 0) return null;
      if (lastTimestamp === null || value > lastTimestamp) {
        lastTimestamp = value;
      }
      return lastTimestamp;
    }

    function validKind(kind) {
      return kind === "emp" || kind === "ish";
    }

    function readEnd(kind, id, timestamp) {
      const key = keyFor(kind, id);
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.endsAt <= timestamp) {
        entries.delete(key);
        return null;
      }
      return entry.endsAt;
    }

    function activate(kind, id, duration) {
      const timestamp = currentTime();
      if (
        !validKind(kind) ||
        !isCanonicalId(id) ||
        timestamp === null ||
        !Number.isFinite(duration) ||
        duration < 0 ||
        !Number.isFinite(timestamp + duration)
      ) {
        return null;
      }

      const key = keyFor(kind, id);
      const existing = entries.get(key);
      if (
        existing &&
        existing.endsAt > timestamp &&
        timestamp >= existing.activatedAt &&
        timestamp - existing.activatedAt <= 250
      ) {
        return existing.endsAt;
      }

      const endsAt = timestamp + duration;
      entries.set(key, { activatedAt: timestamp, endsAt });
      return endsAt;
    }

    function read(id) {
      const timestamp = currentTime();
      if (!isCanonicalId(id) || timestamp === null) {
        return { empEndsAt: null, ishEndsAt: null };
      }
      return {
        empEndsAt: readEnd("emp", id, timestamp),
        ishEndsAt: readEnd("ish", id, timestamp)
      };
    }

    function clear(kind, id) {
      if (!validKind(kind) || !isCanonicalId(id)) return false;
      return entries.delete(keyFor(kind, id));
    }

    function clearAll() {
      entries.clear();
    }

    return { activate, read, clear, clearAll };
  }

  return {
    createMonotonicEpochClock,
    classifyPlayer,
    projectPlayer,
    filterVisiblePlayers,
    createCooldownRegistry
  };
});
