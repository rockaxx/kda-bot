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
  const EFFECT_HOOK_MARK = Symbol("ckda-effect-hook");

  function normalizedClientVersion(value) {
    return String(value || "").replace(/^n/, "");
  }

  function validCooldownEndpoint(value) {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  function hasCanonicalId(value) {
    return (
      (typeof value === "string" && value.length > 0) ||
      (Number.isFinite(value) && Number.isInteger(value))
    );
  }

  function matchedPrototypeMethods(target, markers) {
    if (
      !target ||
      (typeof target !== "object" && typeof target !== "function") ||
      !Array.isArray(markers) ||
      markers.length === 0 ||
      markers.some((marker) => typeof marker !== "string" || marker.length === 0)
    ) {
      return [];
    }

    const matches = [];
    try {
      for (
        let prototype = Object.getPrototypeOf(target);
        prototype && prototype !== Object.prototype;
        prototype = Object.getPrototypeOf(prototype)
      ) {
        for (const name of Object.getOwnPropertyNames(prototype)) {
          const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
          if (!descriptor || typeof descriptor.value !== "function") continue;
          const source = Function.prototype.toString.call(descriptor.value);
          if (markers.every((marker) => source.includes(marker))) {
            matches.push({ owner: prototype, name, descriptor });
          }
        }
      }
    } catch (_) {
      return [];
    }
    return matches;
  }

  function findUniquePrototypeMethod(target, markers) {
    const matches = matchedPrototypeMethods(target, markers);
    return matches.length === 1 ? matches[0].name : null;
  }

  function findPrototypeMethod(target, name) {
    if (typeof name !== "string" || name.length === 0) return null;
    try {
      for (
        let prototype = Object.getPrototypeOf(target);
        prototype && prototype !== Object.prototype;
        prototype = Object.getPrototypeOf(prototype)
      ) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
        if (descriptor && typeof descriptor.value === "function") {
          return { owner: prototype, name, descriptor };
        }
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  function unsupportedEffectHooks() {
    return { supported: false, cleanup() { return false; } };
  }

  function validEffectTargetId(target) {
    if (!target || (typeof target !== "object" && typeof target !== "function")) {
      return null;
    }
    try {
      return hasCanonicalId(target.ID) ? target.ID : null;
    } catch (_) {
      return null;
    }
  }

  function installEffectHooks(world, cooldowns, settings) {
    if (!cooldowns || typeof cooldowns.activate !== "function") {
      return unsupportedEffectHooks();
    }

    const emp = findPrototypeMethod(world, "addEmpNew");
    const ishMatches = matchedPrototypeMethods(world, ["instaShield", "tshield"]);
    if (
      !emp ||
      ishMatches.length !== 1 ||
      (emp.owner === ishMatches[0].owner && emp.name === ishMatches[0].name) ||
      emp.descriptor.configurable !== true ||
      ishMatches[0].descriptor.configurable !== true ||
      emp.descriptor.value[EFFECT_HOOK_MARK] === true ||
      ishMatches[0].descriptor.value[EFFECT_HOOK_MARK] === true
    ) {
      return unsupportedEffectHooks();
    }

    const ish = ishMatches[0];
    function wrap(original, kind, duration) {
      const wrapper = function effectHook(...args) {
        const result = Reflect.apply(original, this, args);
        const targetId = validEffectTargetId(args[0]);
        if (targetId !== null) {
          try {
            cooldowns.activate(kind, targetId, duration);
          } catch (_) {
            // Tracking must not alter game method return or error behavior.
          }
        }
        return result;
      };
      wrapper[EFFECT_HOOK_MARK] = true;
      return wrapper;
    }

    const empWrapper = wrap(emp.descriptor.value, "emp", settings && settings.empCooldownMs);
    const ishWrapper = wrap(ish.descriptor.value, "ish", settings && settings.ishCooldownMs);
    try {
      Object.defineProperty(emp.owner, emp.name, {
        ...emp.descriptor,
        value: empWrapper
      });
      Object.defineProperty(ish.owner, ish.name, {
        ...ish.descriptor,
        value: ishWrapper
      });
    } catch (_) {
      try {
        Object.defineProperty(emp.owner, emp.name, emp.descriptor);
      } catch (_) {
        // Preserve original error-free contract when an exotic target rejects cleanup.
      }
      return unsupportedEffectHooks();
    }

    let installed = true;
    return {
      supported: true,
      cleanup() {
        if (!installed) return false;
        installed = false;
        try {
          Object.defineProperty(emp.owner, emp.name, emp.descriptor);
          Object.defineProperty(ish.owner, ish.name, ish.descriptor);
          return true;
        } catch (_) {
          return false;
        }
      }
    };
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

  return {
    createCkdaSnapshot,
    findUniquePrototypeMethod,
    installEffectHooks,
    startCkdaPublisher
  };
});
